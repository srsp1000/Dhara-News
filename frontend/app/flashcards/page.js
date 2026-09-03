"use client";
// Flashcard system with SM-2 spaced repetition + daily streaks
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../components/auth/AuthContext";
import { useThemeValues } from "../../lib/useThemeValues";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const EXAM_TAGS = ["upsc_prelims","upsc_mains_gs1","upsc_mains_gs2","upsc_mains_gs3","neet","jee","clat","gate"];

// SM-2 spaced repetition: quality 0-5
function sm2(card, quality) {
  let { ease = 2.5, interval = 1, reps = 0 } = card;
  if (quality >= 3) {
    interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease);
    reps += 1;
  } else {
    reps = 0; interval = 1;
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const due = new Date(); due.setDate(due.getDate() + interval);
  return { ease, interval, reps, due: due.toISOString(), lastQuality: quality };
}

export default function FlashcardsPage() {
  const { user } = useAuth();
  const t = useThemeValues();
  const [cards,      setCards]    = useState([]);
  const [current,    setCurrent]  = useState(0);
  const [flipped,    setFlipped]  = useState(false);
  const [loading,    setLoading]  = useState(false);
  const [filter,     setFilter]   = useState("all");
  const [streak,     setStreak]   = useState({ current: 0, longest: 0 });
  const [todayDone,  setTodayDone]= useState(0);
  const [showShare,  setShowShare]= useState(false);
  const [mode,       setMode]     = useState("study"); // study | browse

  // Load cards + streak
  useEffect(() => {
    if (!user) return;
    // Load streak
    fetch(`${API}/api/streaks/${user.id}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStreak({ current: d.current || 0, longest: d.longest || 0 }); })
      .catch(() => {});
    // Load due cards from server, fall back to localStorage
    fetch(`${API}/api/flashcards/${user.id}?limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.cards?.length) {
          setCards(d.cards);
        } else {
          const saved = localStorage.getItem(`dhara_fc_${user.id}`);
          if (saved) try { setCards(JSON.parse(saved)); } catch {}
        }
      }).catch(() => {
        const saved = localStorage.getItem(`dhara_fc_${user.id}`);
        if (saved) try { setCards(JSON.parse(saved)); } catch {}
      });
  }, [user]);

  // Generate cards from exam-tagged articles
  // Generate exam-quality Q&A using AI
  const makeExamQuestion = (article) => {
    const h = article.headline || "";
    const b = article.summary_brief || "";
    const tags = article.exam_tags || [];
    const domain = article.domain || "general";

    // Build context-aware exam question based on domain and exam tags
    let q = "", a = "";
    const isUpsc = tags.some(t => t.includes("upsc"));
    const isNeet = tags.some(t => t.includes("neet"));
    const isJee  = tags.some(t => t.includes("jee"));
    const isLaw  = tags.some(t => t.includes("clat") || t.includes("law"));

    if (domain === "judiciary" || isLaw) {
      q = `What was the Supreme Court / High Court ruling in the case: "${h}"?`;
      a = b || h;
    } else if (domain === "economy" || domain === "finance") {
      q = `What are the key economic implications of: "${h}"?`;
      a = b || h;
    } else if (domain === "environment" || domain === "science") {
      q = `Explain the significance of: "${h}" from an environmental/scientific perspective.`;
      a = b || h;
    } else if (domain === "international") {
      q = `What are India's foreign policy implications from: "${h}"?`;
      a = b || h;
    } else if (domain === "politics" || domain === "governance") {
      q = `What constitutional/governance issues are raised by: "${h}"?`;
      a = b || h;
    } else if (domain === "health" && isNeet) {
      q = `From a public health perspective, what does this news signify: "${h}"?`;
      a = b || h;
    } else if (isUpsc) {
      q = `(GS Paper ${tags.includes("upsc_mains_gs1") ? "1" : tags.includes("upsc_mains_gs2") ? "2" : tags.includes("upsc_mains_gs3") ? "3" : "2"}) Discuss the significance of: "${h}"`;
      a = b || h;
    } else {
      // Generic but better than raw headline
      q = `What happened regarding: "${h}"? What are the key facts?`;
      a = b || h;
    }
    return { q, a };
  };

  const generate = useCallback(async (examFilter = "all") => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30", status: "verified" });
      if (examFilter !== "all") params.set("exam_tag", examFilter);
      const feed = await fetch(`${API}/api/feed?${params}`).then(r => r.json()).catch(() => []);
      const articles = Array.isArray(feed) ? feed.filter(a => a.summary_brief && a.headline) : [];

      // Try AI-generated questions first
      let newCards = [];
      try {
        const aiRes = await fetch(`${API}/api/flashcards/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            articles: articles.slice(0, 15).map(a => ({
              id: a.id, headline: a.headline, brief: a.summary_brief,
              domain: a.domain, exam_tags: a.exam_tags,
            })),
            exam_filter: examFilter,
          }),
        }).then(r => r.ok ? r.json() : null);

        if (aiRes?.cards?.length) {
          newCards = aiRes.cards;
        }
      } catch {}

      // Fallback: local smart question generation
      if (!newCards.length) {
        newCards = articles.map(a => {
          const { q, a: ans } = makeExamQuestion(a);
          return {
            id: a.id, q, a: ans,
            domain: a.domain, tags: a.exam_tags || [],
            score: a.truth_score, ease: 2.5, interval: 1, reps: 0,
            due: new Date().toISOString(), lastQuality: -1,
          };
        });
      }

      setCards(newCards);
      setCurrent(0); setFlipped(false);
      localStorage.setItem(`dhara_fc_${user.id}`, JSON.stringify(newCards));
      await fetch(`${API}/api/flashcards/${user.id}/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: newCards }),
      }).catch(() => {});
    } finally { setLoading(false); }
  }, [user]);

  // Rate current card (0-5)
  const rate = (quality) => {
    const updated = cards.map((c, i) => i === current ? { ...c, ...sm2(c, quality) } : c);
    setCards(updated);
    localStorage.setItem(`dhara_fc_${user?.id}`, JSON.stringify(updated));
    // Save progress to server
    if (user) {
      fetch(`${API}/api/flashcards/${user.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster_id: cards[current].id, quality }),
      }).catch(() => {});
    }
    setTodayDone(d => d + 1);
    setFlipped(false);
    // Move to next card
    const nextDue = updated.findIndex((c, i) => i !== current && new Date(c.due) <= new Date());
    setCurrent(nextDue >= 0 ? nextDue : (current + 1) % updated.length);
    // Check streak milestone
    if (todayDone + 1 === 10) { setShowShare(true); }
  };

  const card = cards[current];
  const dueCount = cards.filter(c => new Date(c.due) <= new Date()).length;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: t.bg, minHeight: "100vh", color: t.text1 }}>

      {/* Header */}
      <div style={{ background: t.bg2, borderBottom: `1px solid ${t.border}`, padding: "0 1rem", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, height: 52 }}>
          <a href="/" style={{ textDecoration: "none", fontFamily: "'Georgia',serif", fontSize: 20, fontWeight: 700, color: t.accent }}>धारा</a>
          <span style={{ color: t.text3 }}>›</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.text2 }}>🃏 Study Flashcards</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {/* Streak badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20,
              background: streak.current > 0 ? "#fef3c7" : t.bg3, border: `1px solid ${streak.current > 0 ? "#f59e0b" : t.border}` }}>
              <span style={{ fontSize: 14 }}>🔥</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: streak.current > 0 ? "#92400e" : t.text3 }}>
                {streak.current} day streak
              </span>
            </div>
            <span style={{ fontSize: 12, color: t.text3 }}>{todayDone} done today</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          {/* Exam filter */}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ padding: "7px 12px", border: `1px solid ${t.border}`, borderRadius: 6,
              background: t.bg2, color: t.text1, fontSize: 13, cursor: "pointer" }}>
            <option value="all">All exam tags</option>
            {EXAM_TAGS.map(tag => (
              <option key={tag} value={tag}>{tag.replace(/_/g," ").toUpperCase()}</option>
            ))}
          </select>
          <button onClick={() => generate(filter)} disabled={loading}
            style={{ padding: "7px 16px", background: t.accent, color: "#fff", border: "none",
              borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Generating…" : cards.length ? "Refresh cards" : "Generate flashcards"}
          </button>
          {cards.length > 0 && (
            <>
              <span style={{ fontSize: 12, color: t.text3, marginLeft: 4 }}>
                {dueCount} due · {cards.length} total
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => setMode(m => m === "study" ? "browse" : "study")}
                  style={{ padding: "5px 12px", border: `1px solid ${t.border}`, borderRadius: 6,
                    background: t.bg2, color: t.text2, fontSize: 12, cursor: "pointer" }}>
                  {mode === "study" ? "📋 Browse" : "📖 Study"}
                </button>
                <button onClick={() => { setCards([]); localStorage.removeItem(`dhara_fc_${user?.id}`); }}
                  style={{ padding: "5px 12px", border: `1px solid ${t.border}`, borderRadius: 6,
                    background: t.bg2, color: "#dc2626", fontSize: 12, cursor: "pointer" }}>
                  Clear
                </button>
              </div>
            </>
          )}
        </div>

        {/* Not logged in */}
        {!user && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🃏</div>
            <h2 style={{ fontFamily: "'Georgia',serif", color: t.text1, margin: "0 0 8px" }}>UPSC & Exam Flashcards</h2>
            <p style={{ color: t.text2, marginBottom: 24 }}>Spaced repetition powered by AI-verified news. Master current affairs for UPSC, NEET, JEE.</p>
            <a href="/login" style={{ padding: "11px 28px", background: t.accent, color: "#fff",
              borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
              Sign in to start studying
            </a>
          </div>
        )}

        {/* No cards */}
        {user && cards.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📚</div>
            <h2 style={{ fontFamily: "'Georgia',serif", color: t.text1, margin: "0 0 8px" }}>
              Ready to study?
            </h2>
            <p style={{ color: t.text2, margin: "0 0 8px" }}>
              We generate flashcards from AI-verified news articles tagged for your exam.
            </p>
            <p style={{ color: t.text3, fontSize: 13, margin: "0 0 24px" }}>
              Questions are automatically reviewed using <strong>spaced repetition</strong> — cards you find harder appear more often.
            </p>
          </div>
        )}

        {/* Study mode */}
        {user && cards.length > 0 && mode === "study" && card && (
          <>
            {/* Progress bar */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.text3, marginBottom: 6 }}>
              <span>Card {current + 1} / {cards.length}</span>
              <span>{Math.round(((current) / cards.length) * 100)}% through deck</span>
            </div>
            <div style={{ height: 4, background: t.border, borderRadius: 2, marginBottom: 24 }}>
              <div style={{ height: "100%", width: `${((current + 1) / cards.length) * 100}%`,
                background: t.accent, borderRadius: 2, transition: "width 0.3s" }} />
            </div>

            {/* Card */}
            <div onClick={() => setFlipped(f => !f)}
              style={{
                background: t.bg2, border: `2px solid ${flipped ? t.accent : t.border}`,
                borderRadius: 16, padding: "2.5rem 2rem",
                cursor: "pointer", minHeight: 220,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                textAlign: "center", userSelect: "none",
                transition: "border-color 0.15s, transform 0.1s",
                boxShadow: `0 4px 16px ${t.shadow}`,
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "none"}>

              {/* Tags */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
                {(card.tags || []).slice(0,3).map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10,
                    background: "#eff6ff", color: "#1e3a5f", fontWeight: 700, letterSpacing: 0.3 }}>
                    {tag.replace(/_/g," ").toUpperCase()}
                  </span>
                ))}
                {card.domain && (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10,
                    background: t.bg3, color: t.text3 }}>
                    {card.domain}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                color: t.text3, marginBottom: 14 }}>
                {flipped ? "📖 Answer" : "❓ Question"}
              </div>

              <div style={{ fontSize: 18, color: t.text1, lineHeight: 1.6,
                fontWeight: flipped ? 400 : 600, fontFamily: flipped ? "inherit" : "'Georgia',serif" }}>
                {flipped ? card.a : card.q}
              </div>

              {card.score && (
                <div style={{ marginTop: 16, fontSize: 11, color: t.text3 }}>
                  ✓ Truth Score {card.score}/100
                </div>
              )}

              {!flipped && (
                <div style={{ marginTop: 20, fontSize: 12, color: t.text3, opacity: 0.7 }}>
                  Tap to reveal answer
                </div>
              )}
            </div>

            {/* Rating buttons (show after flip) */}
            {flipped && (
              <div style={{ marginTop: 20 }}>
                <p style={{ textAlign: "center", fontSize: 13, color: t.text2, marginBottom: 12 }}>
                  How well did you know this?
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { q: 0, label: "Blackout",  bg: "#fee2e2", color: "#991b1b" },
                    { q: 2, label: "Hard",      bg: "#fef3c7", color: "#92400e" },
                    { q: 4, label: "Good",      bg: "#dcfce7", color: "#166534" },
                    { q: 5, label: "Easy",      bg: "#eff6ff", color: "#1e3a5f" },
                  ].map(({ q, label, bg, color }) => (
                    <button key={q} onClick={() => rate(q)}
                      style={{ padding: "10px 6px", borderRadius: 8, border: "none",
                        background: bg, color, fontSize: 13, fontWeight: 700, cursor: "pointer",
                        transition: "transform 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!flipped && (
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
                <button onClick={() => { setCurrent(c => (c - 1 + cards.length) % cards.length); setFlipped(false); }}
                  style={{ padding: "9px 20px", border: `1px solid ${t.border}`, borderRadius: 8,
                    background: t.bg2, color: t.text2, fontSize: 13, cursor: "pointer" }}>
                  ← Prev
                </button>
                <button onClick={() => setFlipped(true)}
                  style={{ padding: "9px 24px", background: t.accent, color: "#fff",
                    border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Flip card ↵
                </button>
                <button onClick={() => { setCurrent(c => (c + 1) % cards.length); setFlipped(false); }}
                  style={{ padding: "9px 20px", border: `1px solid ${t.border}`, borderRadius: 8,
                    background: t.bg2, color: t.text2, fontSize: 13, cursor: "pointer" }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {/* Browse mode */}
        {user && cards.length > 0 && mode === "browse" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cards.map((c, i) => (
              <div key={c.id || i}
                style={{ background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px",
                  display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}
                onClick={() => { setCurrent(i); setMode("study"); setFlipped(false); }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 3 }}>{c.q}</div>
                  <div style={{ fontSize: 11, color: t.text3 }}>
                    {(c.tags || []).slice(0,2).map(t2 => t2.replace(/_/g," ").toUpperCase()).join(" · ")}
                    {c.reps > 0 && ` · ${c.reps} review${c.reps !== 1 ? "s" : ""}`}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {c.lastQuality >= 4 ? "🟢" : c.lastQuality >= 2 ? "🟡" : c.lastQuality >= 0 ? "🔴" : "⚪"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Streak milestone share */}
        {showShare && (
          <div style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "#1e3a5f", color: "#fff", borderRadius: 16, padding: "1rem 1.5rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 500, textAlign: "center", maxWidth: 300,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔥🔥🔥</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>10 cards done today!</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>Share your streak on WhatsApp</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(`I just studied 10 UPSC flashcards on धारा News! 🔥 ${streak.current + 1} day streak. Join me at dhara.news`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: "8px 16px", background: "#25D366", color: "#fff",
                  borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                Share on WhatsApp
              </a>
              <button onClick={() => setShowShare(false)}
                style={{ padding: "8px 12px", background: "rgba(255,255,255,0.15)", border: "none",
                  borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
