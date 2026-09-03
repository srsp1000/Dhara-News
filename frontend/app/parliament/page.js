"use client";
// /parliament — Parliament & Courts Tracker
// Enhanced: Central/State tabs, government-sources-only, date-wise grouping
// All existing UI components (CivicArticleRow, SkeletonRow, etc.) preserved.

import { useState, useEffect, useCallback } from "react";
import { useThemeValues } from "../../lib/useThemeValues";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { INDIAN_STATES } from "../../lib/constants";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Section (type) tabs ───────────────────────────────────────────────────────
const SECTIONS = [
  { key: "parliament", label: "Parliament",    icon: "🏛️" },
  { key: "court",      label: "Supreme Court", icon: "⚖️" },
  { key: "bills",      label: "Bills Tracker", icon: "📜" },
];

// ── Gov level tabs ────────────────────────────────────────────────────────────
const GOV_LEVELS = [
  { key: "central", label: "Central Govt",  icon: "🇮🇳" },
  { key: "state",   label: "State Govt",    icon: "🏙️" },
];

// Source badges per section + gov_level
const SOURCE_BADGES = {
  parliament: { central: ["sansad.in","PIB","prsindia.org"], state: ["Vidhan Sabha portals","State PIB"] },
  court:      { central: ["sci.gov.in","doj.gov.in"],        state: ["High Court portals"] },
  bills:      { central: ["prsindia.org","sansad.in"],       state: ["State legislatures"] },
};

function scoreColor(s) { return s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b"; }
function scoreBg(s)    { return s >= 75 ? "#dcfce7"  : s >= 50 ? "#fef3c7"  : "#fee2e2"; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDateHeading(dateStr) {
  if (!dateStr) return "Unknown date";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function groupByDate(articles) {
  const groups = {};
  for (const a of articles) {
    const raw = a.first_seen || a.published_at || a.last_updated || "";
    const day = raw ? raw.split("T")[0] : "unknown";
    if (!groups[day]) groups[day] = [];
    groups[day].push(a);
  }
  // Sort dates newest first
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function sevenDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ParliamentPage() {
  const t = useThemeValues();

  // Section (parliament / court / bills)
  const [tab, setTab] = useState("parliament");

  // Gov level (central / state) + state selector
  const [govLevel,    setGovLevel]    = useState("central");
  const [govState,    setGovState]    = useState("");
  const [showStates,  setShowStates]  = useState(false);

  // Date range
  const [dateFrom, setDateFrom] = useState(sevenDaysAgoISO());
  const [dateTo,   setDateTo]   = useState(todayISO());

  // Results
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [isFallback,  setIsFallback]  = useState(false);
  const [selected,    setSelected]    = useState(null);

  // Collapsed date sections (key = date string, value = true → collapsed)
  const [collapsed, setCollapsed] = useState({});

  const catColor = tab === "court" ? "#92400e" : "#1e3a5f";

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchCivic = useCallback(async () => {
    setLoading(true);
    setArticles([]);
    setSelected(null);
    setIsFallback(false);
    setCollapsed({});

    try {
      const params = new URLSearchParams({
        type:      tab,
        gov_level: govLevel,
        limit:     "40",
      });
      if (govLevel === "state" && govState) params.set("gov_state", govState);
      if (dateFrom)                         params.set("from_date", dateFrom);
      if (dateTo)                           params.set("to_date",   dateTo);

      const res = await fetch(`${API}/api/civic?${params}`);
      if (!res.ok) throw new Error("civic api error");
      const data = await res.json();

      const items = data.results || [];
      setArticles(items);
      setIsFallback(!!data.is_fallback);
    } catch {
      // Hard fallback: use existing search endpoint (preserves original behaviour)
      try {
        const keyMap = {
          parliament: "parliament OR lok sabha OR rajya sabha",
          court:      "supreme court OR high court OR judgment",
          bills:      "bill passed OR amendment OR legislation",
        };
        const domainParam = tab === "court" ? "&domain=judiciary" : "&domain=politics";
        const res = await fetch(
          `${API}/api/search?q=${encodeURIComponent(keyMap[tab])}&limit=30${domainParam}`
        );
        const data = res.ok ? await res.json() : { results: [] };
        setArticles(data.results || []);
        setIsFallback(true);
      } catch {
        setArticles([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, govLevel, govState, dateFrom, dateTo]);

  useEffect(() => {
    fetchCivic();
  }, [fetchCivic]);

  // When gov_level switches to state, auto-show state picker if no state selected
  useEffect(() => {
    if (govLevel === "state" && !govState) setShowStates(true);
    else                                    setShowStates(false);
  }, [govLevel, govState]);

  // ── Group articles by date ──────────────────────────────────────────────────
  const groupedDates = groupByDate(articles);

  const toggleCollapse = (day) =>
    setCollapsed(prev => ({ ...prev, [day]: !prev[day] }));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div suppressHydrationWarning style={{
      fontFamily: "'Segoe UI',-apple-system,system-ui,sans-serif",
      background: t.bg, minHeight: "100vh", color: t.text1,
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: "#1e3a5f", padding: "0 1rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex",
          alignItems: "center", height: 48, gap: 12 }}>
          <a href="/" style={{ textDecoration: "none", display: "flex",
            alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'Georgia',serif", fontSize: 20,
              fontWeight: 700, color: "#fff" }}>धारा</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)",
              fontWeight: 600, letterSpacing: 2 }}>NEWS</span>
          </a>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>›</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)",
            fontWeight: 600 }}>Civic Intelligence</span>
        </div>
      </div>

      <div style={{ height: 4, background: catColor }} />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{
            fontFamily: "'Georgia','Times New Roman',serif",
            fontSize: "clamp(1.4rem,4vw,2rem)",
            fontWeight: 700, color: t.text1,
            margin: "0 0 6px", letterSpacing: -0.3,
          }}>
            🏛️ Parliament & Courts Tracker
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: t.text3 }}>
            Government-sources-only tracking of bills, sessions, and court proceedings.
          </p>
        </div>

        {/* ── Row 1: Section tabs ─────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 0,
          borderBottom: `2px solid ${t.border}`,
          marginBottom: "0.75rem",
        }}>
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              style={{
                padding: "10px 20px", border: "none", background: "transparent",
                cursor: "pointer", fontSize: 14,
                fontWeight: tab === s.key ? 700 : 400,
                color: tab === s.key ? catColor : t.text3,
                borderBottom: tab === s.key
                  ? `3px solid ${catColor}` : "3px solid transparent",
                marginBottom: -2,
                display: "flex", alignItems: "center", gap: 6,
                flexShrink: 0, letterSpacing: 0.2,
              }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ── Row 2: Gov level + date filter ─────────────────────────────── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          padding: "10px 0", marginBottom: "0.75rem",
          borderBottom: `1px solid ${t.border}`,
        }}>
          {/* Gov level pills */}
          <div style={{ display: "flex", gap: 0, border: `1px solid ${t.border}`, borderRadius: 4 }}>
            {GOV_LEVELS.map(gl => (
              <button key={gl.key}
                onClick={() => { setGovLevel(gl.key); if (gl.key === "central") setGovState(""); }}
                style={{
                  padding: "6px 14px", border: "none",
                  borderRight: gl.key === "central" ? `1px solid ${t.border}` : "none",
                  background: govLevel === gl.key ? catColor : t.bg2,
                  color: govLevel === gl.key ? "#fff" : t.text2,
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                  borderRadius: gl.key === "central" ? "3px 0 0 3px" : "0 3px 3px 0",
                  letterSpacing: 0.3,
                }}>
                {gl.icon} {gl.label}
              </button>
            ))}
          </div>

          {/* State selector (only when gov_level = state) */}
          {govLevel === "state" && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowStates(p => !p)}
                style={{
                  padding: "6px 14px", border: `1px solid ${t.border}`,
                  borderRadius: 4, background: govState ? catColor : t.bg2,
                  color: govState ? "#fff" : t.text2,
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>
                📍 {govState || "Select State ▾"}
              </button>
              {showStates && (
                <div style={{
                  position: "absolute", top: "110%", left: 0, zIndex: 200,
                  background: t.bg2, border: `1px solid ${t.border}`,
                  borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  maxHeight: 240, overflowY: "auto", minWidth: 200,
                }}>
                  {INDIAN_STATES.filter(s => s !== "All States").map(s => (
                    <div key={s}
                      onClick={() => { setGovState(s); setShowStates(false); }}
                      style={{
                        padding: "8px 14px", cursor: "pointer", fontSize: 13,
                        background: s === govState ? `${catColor}18` : "transparent",
                        color: s === govState ? catColor : t.text1,
                        fontWeight: s === govState ? 600 : 400,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = t.bg3}
                      onMouseLeave={e => e.currentTarget.style.background =
                        s === govState ? `${catColor}18` : "transparent"}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date range */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: t.text3, fontWeight: 600 }}>From</span>
            <input
              type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                fontSize: 12, padding: "5px 8px",
                border: `1px solid ${t.border}`, borderRadius: 3,
                background: t.bg2, color: t.text1, cursor: "pointer",
              }}
            />
            <span style={{ fontSize: 11, color: t.text3, fontWeight: 600 }}>To</span>
            <input
              type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                fontSize: 12, padding: "5px 8px",
                border: `1px solid ${t.border}`, borderRadius: 3,
                background: t.bg2, color: t.text1, cursor: "pointer",
              }}
            />
          </div>
        </div>

        {/* ── Source badges ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
          {(SOURCE_BADGES[tab]?.[govLevel] || []).map(name => (
            <SourceBadge key={name} name={name} t={t} />
          ))}
          {isFallback && (
            <span style={{
              padding: "2px 8px", borderRadius: 2, fontSize: 10,
              background: "#fef3c7", color: "#92400e", fontWeight: 600,
              border: "1px solid #fde68a",
            }}>
              ⚠ Showing all sources (no gov-only results yet)
            </span>
          )}
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[1,2,3,4].map(i => <SkeletonRow key={i} t={t} />)}
          </div>
        ) : articles.length === 0 ? (
          <EmptyState t={t} tab={tab} govLevel={govLevel} govState={govState} catColor={catColor} />
        ) : (
          <div>
            {groupedDates.map(([day, dayArticles]) => (
              <DateSection
                key={day}
                day={day}
                articles={dayArticles}
                collapsed={!!collapsed[day]}
                onToggle={() => toggleCollapse(day)}
                selected={selected}
                onSelect={a => setSelected(selected?.id === a.id ? null : a)}
                t={t}
                catColor={catColor}
              />
            ))}
          </div>
        )}

        {/* ── Expanded article ────────────────────────────────────────────── */}
        {selected && (
          <ExpandedArticle
            article={selected}
            catColor={catColor}
            t={t}
            scoreColor={scoreColor}
            scoreBg={scoreBg}
            onClose={() => setSelected(null)}
          />
        )}

        {/* ── Data disclaimer ─────────────────────────────────────────────── */}
        <div style={{
          marginTop: "2rem", padding: "12px 14px",
          background: t.bg2, border: `1px solid ${t.border}`,
          borderRadius: 2, fontSize: 11, color: t.text3, lineHeight: 1.6,
        }}>
          <strong>Government sources only.</strong> Parliament data:{" "}
          <a href="https://sansad.in" target="_blank" rel="noopener noreferrer"
            style={{ color: t.accent }}>sansad.in</a>,{" "}
          <a href="https://prsindia.org" target="_blank" rel="noopener noreferrer"
            style={{ color: t.accent }}>PRS India</a>,{" "}
          <a href="https://pib.gov.in" target="_blank" rel="noopener noreferrer"
            style={{ color: t.accent }}>pib.gov.in</a>.{" "}
          Court data:{" "}
          <a href="https://main.sci.gov.in" target="_blank" rel="noopener noreferrer"
            style={{ color: t.accent }}>sci.gov.in</a>.{" "}
          Dhara AI summarises for readability. No media sources mixed in.
        </div>
      </div>
    </div>
  );
}

// ── Date section with collapse ────────────────────────────────────────────────
function DateSection({ day, articles, collapsed, onToggle, selected, onSelect, t, catColor }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {/* Date heading */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          padding: "8px 14px",
          background: `${catColor}12`,
          border: `1px solid ${catColor}30`,
          borderRadius: collapsed ? 4 : "4px 4px 0 0",
          cursor: "pointer",
          color: catColor, fontWeight: 700, fontSize: 13,
        }}>
        <span>📅 {formatDateHeading(day)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: `${catColor}20`, color: catColor,
            padding: "2px 8px", borderRadius: 10,
          }}>
            {articles.length} {articles.length === 1 ? "item" : "items"}
          </span>
          <span style={{ fontSize: 12 }}>{collapsed ? "▶" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <div style={{
          background: t.bg2,
          border: `1px solid ${t.border}`,
          borderTop: `3px solid ${catColor}`,
        }}>
          {articles.map((a, i) => (
            <CivicArticleRow
              key={a.id} article={a} t={t}
              catColor={catColor}
              isLast={i === articles.length - 1}
              isSelected={selected?.id === a.id}
              onClick={() => onSelect(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SourceBadge({ name, t }) {
  return (
    <span style={{
      padding: "3px 8px", borderRadius: 2, fontSize: 10,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4", color: "#166534", fontWeight: 600,
    }}>
      ● {name}
    </span>
  );
}

function CivicArticleRow({ article: a, t, catColor, isLast, isSelected, onClick }) {
  const pubDate = a.first_seen || a.published_at;
  const timeStr = pubDate
    ? new Date(pubDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const srcBadge = a.primary_source || a.source_domain;

  return (
    <div onClick={onClick}
      style={{
        padding: "14px 18px",
        borderBottom: isLast ? "none" : `1px solid ${t.border}`,
        cursor: "pointer",
        background: isSelected ? `${catColor}08` : "transparent",
        transition: "background 0.1s",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.bg3; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>

      <div style={{
        width: 3, flexShrink: 0, alignSelf: "stretch",
        background: catColor, borderRadius: 2, minHeight: 40,
      }} />

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap",
          alignItems: "center", marginBottom: 5 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 2,
            background: scoreBg(a.truth_score), color: scoreColor(a.truth_score),
          }}>
            ✓ {a.truth_score}
          </span>
          {srcBadge && (
            <span style={{
              fontSize: 10, padding: "1px 5px", borderRadius: 2,
              background: "#f0fdf4", color: "#166534",
              fontWeight: 700, border: "1px solid #bbf7d0",
            }}>
              🏛 {srcBadge}
            </span>
          )}
          {(a.exam_tags || []).slice(0, 2).map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: "1px 5px", borderRadius: 2,
              background: "#eff6ff", color: "#1e3a5f",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3,
            }}>
              {tag.replace(/_/g, " ")}
            </span>
          ))}
          <span style={{ fontSize: 11, color: t.text3, marginLeft: "auto" }}>
            {timeStr}
          </span>
        </div>

        <h3 style={{
          margin: "0 0 4px",
          fontFamily: "'Georgia','Times New Roman',serif",
          fontSize: 15, fontWeight: 700, color: t.text1, lineHeight: 1.35,
        }}>
          {a.headline}
        </h3>

        {a.summary_brief && (
          <p style={{
            margin: 0, fontSize: 13, color: t.text2, lineHeight: 1.55,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {sanitizeDisplayText(a.summary_brief)}
          </p>
        )}
      </div>
    </div>
  );
}

function ExpandedArticle({ article: a, catColor, t, scoreColor, scoreBg, onClose }) {
  return (
    <div style={{
      marginTop: "1.5rem",
      background: t.bg2, border: `1px solid ${t.border}`,
      borderTop: `3px solid ${catColor}`, padding: "1.5rem",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 12, marginBottom: 12,
      }}>
        <h2 style={{
          fontFamily: "'Georgia',serif", fontSize: 20, fontWeight: 700,
          color: t.text1, margin: 0, lineHeight: 1.3,
        }}>
          {a.headline}
        </h2>
        <button onClick={onClose} style={{
          padding: "4px 10px", border: `1px solid ${t.border}`,
          borderRadius: 2, background: t.bg2, color: t.text3,
          cursor: "pointer", flexShrink: 0, fontSize: 13,
        }}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{
          padding: "3px 10px", borderRadius: 2, fontSize: 11, fontWeight: 700,
          background: scoreBg(a.truth_score), color: scoreColor(a.truth_score),
        }}>
          ✓ {a.truth_score}/100
        </span>
        {a.primary_source && (
          <span style={{
            fontSize: 11, padding: "2px 7px", borderRadius: 2,
            background: "#f0fdf4", color: "#166534",
            fontWeight: 700, border: "1px solid #bbf7d0",
          }}>
            🏛 {a.primary_source}
          </span>
        )}
        {(a.exam_tags || []).slice(0, 3).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 2,
            background: "#eff6ff", color: "#1e3a5f",
            fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
          }}>
            {tag.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      <p style={{
        fontFamily: "'Georgia',serif",
        fontSize: 17, fontWeight: 500, color: t.text1,
        lineHeight: 1.75, margin: "0 0 14px",
        paddingLeft: 14, borderLeft: `3px solid ${catColor}`,
      }}>
        {sanitizeDisplayText(a.summary_brief || "")}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href={`/article/${a.id}`} target="_blank" rel="noopener noreferrer"
          style={{
            padding: "8px 16px", background: catColor, color: "#fff",
            borderRadius: 2, textDecoration: "none", fontSize: 13,
            fontWeight: 600, letterSpacing: 0.3,
          }}>
          Full article ↗
        </a>
        {(a.sources || []).slice(0, 2).map((s, i) => s.original_url && (
          <a key={i} href={s.original_url} target="_blank" rel="noopener noreferrer"
            style={{
              padding: "8px 14px", border: `1px solid ${t.border}`,
              borderRadius: 2, textDecoration: "none", fontSize: 12, color: t.text2,
            }}>
            {s.source_domain} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

function SkeletonRow({ t }) {
  return (
    <div style={{
      padding: "14px 18px", display: "flex", gap: 12,
      borderBottom: `1px solid ${t.border}`,
    }}>
      <div className="skeleton" style={{ width: 3, alignSelf: "stretch", minHeight: 60 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 11, width: "50%", marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 17, width: "85%", marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 13, width: "70%" }} />
      </div>
    </div>
  );
}

function EmptyState({ t, tab, govLevel, govState, catColor }) {
  return (
    <div style={{
      textAlign: "center", padding: "3rem 1rem",
      color: t.text3,
      background: t.bg2, border: `1px solid ${t.border}`,
    }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🏛️</div>
      <div style={{
        fontSize: 15, fontWeight: 600, color: t.text2,
        fontFamily: "'Georgia',serif",
      }}>
        No {govLevel === "state" ? (govState ? `${govState} ` : "state ") : "central "}
        {tab === "court" ? "court" : tab === "bills" ? "bill" : "parliament"} updates found
      </div>
      <div style={{ fontSize: 13, marginTop: 6, maxWidth: 400, margin: "6px auto 0" }}>
        {govLevel === "state" && !govState
          ? "Select a state above to view state legislature and government news."
          : "Parliament may be in recess, or government sources haven't published recently. Try a wider date range."}
      </div>
      {govLevel === "state" && !govState && (
        <div style={{ marginTop: 12 }}>
          <span style={{
            padding: "4px 12px", background: catColor, color: "#fff",
            borderRadius: 4, fontSize: 12, fontWeight: 600,
          }}>
            ↑ Select a state above
          </span>
        </div>
      )}
    </div>
  );
}
