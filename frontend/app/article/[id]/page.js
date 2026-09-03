// frontend/app/article/[id]/page.js
// Server component — uses CSS classes (not inline styles) for full dark mode support

import { sanitizeDisplayText } from "../../../lib/textSanitizer";
import SaveArticleButton from "../../../components/news/SaveArticleButton";
import PageState from "../../../components/ui/PageState";
import {
  formatTruthScorePercent,
  normalizeTruthScore,
  statusLabel,
  truthScoreBg,
  truthScoreColor,
} from "../../../lib/truthScore";

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function hasMeaningfulPlatformBody(value, briefValue = "", deepValue = "") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return false;

  const normalizedRaw = raw.toLowerCase();
  if (["null", '"null"', '""', "{}", "[]"].includes(normalizedRaw)) {
    return false;
  }

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return false;
      }
    } catch {}
  }

  const cleaned = sanitizeDisplayText(raw);
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  if (cleaned.length < 600 || words < 110) {
    return false;
  }

  const briefText = sanitizeDisplayText(briefValue || "");
  const deepText = sanitizeDisplayText(deepValue || "");
  if ((briefText && cleaned === briefText) || (deepText && cleaned === deepText)) {
    return false;
  }

  return true;
}

async function fetchArticle(id) {
  const res = await fetch(`${API}/api/article/${id}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status}`);
  return res.json();
}

function parseDeepSections(summaryDeep) {
  if (!summaryDeep) return null;
  const raw = typeof summaryDeep === "string" ? summaryDeep.trim() : "";
  let data = null;
  if (raw.startsWith("{")) {
    try { data = JSON.parse(raw); } catch {}
  }
  if (!data) {
    const extract = (key) => {
      const m = raw.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([\\s\\S]*?)["']\\s*(,|})`, "i"));
      return m ? m[1].replace(/\\n/g, "\n").trim() : "";
    };
    const lead = extract("lead");
    if (lead) data = { lead, background: extract("background"), development: extract("development"), reactions: extract("reactions"), impact: extract("impact") };
  }
  if (!data || typeof data !== "object") return null;
  const sections = [
    { key: "lead",        label: "Overview",     icon: "📌", accent: true  },
    { key: "background",  label: "Background",   icon: "📖", accent: false },
    { key: "development", label: "What happened", icon: "🔍", accent: false },
    { key: "reactions",   label: "Reactions",    icon: "💬", accent: false },
    { key: "impact",      label: "Impact",       icon: "📊", accent: false },
  ].filter(s => data[s.key]?.trim()).map(s => ({ ...s, text: data[s.key].trim() }));
  return sections.length >= 2 ? sections : null;
}

// Reading time: word count ÷ 200 wpm
function readingTime(text) {
  const words = (text || "").split(/\s+/).filter(Boolean).length;
  const mins  = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

const DOMAIN_COLORS = {
  politics:"#d4000f", economy:"#007a3d", health:"#0075b2",
  technology:"#6b21a8", judiciary:"#92400e", environment:"#166534",
  sports:"#c2410c", science:"#0e7490", international:"#be185d",
  business:"#1d4ed8", agriculture:"#65a30d", defence:"#374151",
  education:"#5b21b6", social:"#b45309", general:"#1e3a5f",
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const a = await fetchArticle(id);
    const brief = sanitizeDisplayText(a.summary_brief || "").slice(0, 155);
    return {
      title: `${a.headline} | धारा News`,
      description: brief,
      openGraph: { title: a.headline, description: brief.slice(0, 200), images: a.image_url ? [{ url: a.image_url }] : [], type: "article", publishedTime: a.published_at || a.first_seen, section: a.domain || "general" },
      twitter: { card: "summary_large_image", title: a.headline, description: brief, images: a.image_url ? [a.image_url] : [] },
      alternates: { canonical: `https://dhara.news/article/${id}` },
    };
  } catch { return { title: "धारा News" }; }
}

export default async function ArticlePage({ params }) {
  const { id } = await params;
  let article = null;
  try { article = await fetchArticle(id); } catch {}
  if (!article) return <NotFound />;

  const score    = normalizeTruthScore(article.truth_score);
  const catColor = DOMAIN_COLORS[article.domain] || "#1e3a5f";
  const scoreColor = truthScoreColor(score);
  const scoreBg = truthScoreBg(score);

  const deepSections = parseDeepSections(article.summary_deep);
  const briefText    = sanitizeDisplayText(article.summary_brief || "");
  const hasPlatformText = hasMeaningfulPlatformBody(
    article.platform_body,
    article.summary_brief,
    article.summary_deep
  );
  const platformText = hasPlatformText ? sanitizeDisplayText(article.platform_body || "") : "";
  const articleText  = platformText || (!deepSections ? briefText : "");
  const sources      = article.sources || [];
  const storyConnections = article.story_connections || [];
  // Inline images between sections
  const images       = article.media || [];

  // Full reading text for time estimate
  const fullText = platformText || [
    briefText,
    deepSections ? deepSections.map(s => s.text).join(" ") : ""
  ].join(" ");

  const pubDate    = article.published_at || article.first_seen;
  const pubDateStr = pubDate ? new Date(pubDate).toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) : "";

  const jsonLd = {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: article.headline, description: briefText.slice(0, 200),
    image: article.image_url ? [article.image_url] : [],
    datePublished: article.published_at || article.first_seen,
    dateModified:  article.last_updated  || article.first_seen,
    url: `https://dhara.news/article/${id}`,
    publisher: { "@type": "Organization", name: "धारा News", url: "https://dhara.news", logo: { "@type": "ImageObject", url: "https://dhara.news/icons/icon-512.svg" } },
    articleSection: article.domain || "general",
    keywords: (article.exam_tags || []).join(", "),
    reviewedBy: { "@type": "Organization", name: "धारा Verification" },
    claimReviewed: article.headline,
    reviewRating: { "@type": "Rating", ratingValue: score, bestRating: 100, worstRating: 0, alternateName: score >= 50 ? "Verified" : "Unverified" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="art-page">

        {/* ── Nav ──────────────────────────────────────────────── */}
        <nav className="art-nav">
          <div className="art-nav-inner">
            <a href="/" style={{ textDecoration:"none", display:"flex", alignItems:"baseline", gap:6 }}>
              <span style={{ fontFamily:"'Georgia',serif", fontSize:22, fontWeight:700, color:"#fff" }}>धारा</span>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:600, letterSpacing:2 }}>NEWS</span>
            </a>
            <span style={{ color:"rgba(255,255,255,0.3)", fontSize:14 }}>›</span>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:0.8, padding:"2px 8px", background:"rgba(255,255,255,0.1)", borderRadius:2 }}>
              {article.domain || "news"}
            </span>
            <a href="/" style={{ marginLeft:"auto", fontSize:12, color:"rgba(255,255,255,0.5)", textDecoration:"none" }}>← Feed</a>
          </div>
        </nav>

        {/* ── Category accent bar ───────────────────────────── */}
        <div style={{ height:4, background:catColor }} />

        {/* ── Hero image ────────────────────────────────────── */}
        {article.image_url && (
          <div style={{ width:"100%", maxHeight:520, overflow:"hidden", background:"#0f172a" }}>
            <img src={article.image_url} alt={article.headline}
              style={{ width:"100%", height:520, objectFit:"cover", display:"block" }} />
          </div>
        )}

        <div className="art-body-wrap">

          {/* ── Metadata strip ──────────────────────────────── */}
          <div className="art-meta-strip" style={{ borderTop:`3px solid ${catColor}` }}>
            <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:2, background:scoreBg, color:scoreColor, letterSpacing:0.3 }}>
              {statusLabel(article.status || (score >= 50 ? "verified" : "quarantine"))} · {formatTruthScorePercent(score)}
            </span>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:80, height:4, background:"var(--border)", borderRadius:2 }}>
                <div style={{ width:`${score}%`, height:"100%", background:scoreColor, borderRadius:2 }} />
              </div>
            </div>
            <span className="art-reading-time">⏱ {readingTime(fullText)}</span>
            <span style={{ fontSize:12, color:"var(--text3)" }}>{sources.length || 1} source{sources.length !== 1 ? "s" : ""}</span>
            {(article.exam_tags || []).slice(0,3).map(tag => (
              <span key={tag} style={{ fontSize:10, padding:"2px 8px", borderRadius:2, background:"#eff6ff", color:"#1e3a5f", fontWeight:700, letterSpacing:0.4, textTransform:"uppercase" }}>
                {tag.replace(/_/g," ")}
              </span>
            ))}
            {pubDateStr && <span style={{ marginLeft:"auto", fontSize:12, color:"var(--text3)" }}>{pubDateStr}</span>}
          </div>

          <div className="art-grid">

            {/* ── Main article ──────────────────────────────── */}
            <article>

              {/* Headline */}
              <h1 className="art-headline">{article.headline}</h1>

              {/* Source byline */}
              {sources[0]?.source_domain && (
                <div className="art-byline">
                  <span style={{ width:8, height:8, borderRadius:"50%", background: sources[0]?.source_tier === 1 ? "#166534" : "#2563eb", display:"inline-block", flexShrink:0 }} />
                  First reported by <strong>{sources[0].source_domain}</strong>
                  {sources.length > 1 && ` + ${sources.length - 1} more`}
                  {article.published_at && (
                    <span style={{ color:"var(--text3)" }}>
                      · {new Date(article.published_at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}
                    </span>
                  )}
                </div>
              )}

              {/* Conflict warning */}
              {article.conflict && (
                <div className="art-conflict">
                  <strong style={{ fontSize:13, color:"#92400e" }}>⚠ Sources conflict on this story</strong>
                  <p style={{ margin:"3px 0 0", fontSize:12, color:"#92400e" }}>
                    Different credible sources report different details. Verify from originals before sharing.
                  </p>
                </div>
              )}

              {/* Brief lede */}
              {briefText && (
                <p className="art-lede" style={{ borderLeft:`3px solid ${catColor}` }}>
                  {briefText}
                </p>
              )}

              {/* AI disclaimer */}
              <div className="art-disclaimer" style={{ borderLeft:`2px solid ${catColor}` }}>
                🤖 AI-synthesised from {sources.length || 1} source{sources.length !== 1 ? "s" : ""}
                {sources[0]?.original_url && (
                  <> — <a href={sources[0].original_url} target="_blank" rel="noopener noreferrer"
                    style={{ color:"var(--accent)", fontWeight:600, textDecoration:"none" }}>
                    Read original ↗
                  </a></>
                )}
              </div>

              {/* Deep structured summary */}
              {deepSections ? (
                <div className="art-deep-card" style={{ borderTop:`3px solid ${catColor}` }}>
                  {platformText && (
                    <div className="art-section-label" style={{ color:"var(--text3)", marginBottom:14 }}>
                      At a glance
                    </div>
                  )}
                  {deepSections.map((s, i) => (
                    <div key={s.key}>
                      <div className={`art-deep-section${s.accent ? " accent" : ""}`}>
                        <div className="art-section-label" style={{ color: s.accent ? catColor : "var(--text3)" }}>
                          <span>{s.icon}</span> {s.label}
                        </div>
                        <p className={`art-section-body${s.accent ? " accent" : ""}`}>{s.text}</p>
                      </div>
                      {/* Inject inline images only when the summary is fallback content */}
                      {!platformText && images[i] && (
                        <div className="art-image-inline">
                          <img src={images[i].url} alt={images[i].caption || ""} loading="lazy"
                            style={{ width:"100%", display:"block", maxHeight:400, objectFit:"cover" }} />
                          {images[i].caption && <p className="art-image-caption">{images[i].caption}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {articleText ? (
                <div className="art-platform-card" style={{ borderTop:`3px solid ${catColor}` }}>
                  {articleText.split(/\n{2,}/).filter(Boolean).map((para, i) => (
                    <p key={i} className={`art-platform-para${i === 0 ? " first" : ""}`}>{para}</p>
                  ))}
                  {/* Inline images after paragraphs */}
                  {platformText && images.map((img, i) => (
                    <div key={i} className="art-image-inline">
                      <img src={img.url} alt={img.caption || ""} loading="lazy"
                        style={{ width:"100%", display:"block", maxHeight:400, objectFit:"cover" }} />
                      {img.caption && <p className="art-image-caption">{img.caption}</p>}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Timeline */}
              {(article.timeline || []).length > 0 && (
                <div className="art-timeline-card" style={{ borderTop:`3px solid ${catColor}` }}>
                  <h3 className="art-timeline-h3">📅 Story Timeline</h3>
                  <div style={{ position:"relative", paddingLeft:20 }}>
                    <div className="art-timeline-line" />
                    {article.timeline.map((ev, i) => (
                      <div key={i} style={{ position:"relative", marginBottom:18, paddingLeft:18 }}>
                        <div style={{ position:"absolute", left:-9, top:5, width:10, height:10, borderRadius:"50%", background:catColor, border:"2px solid var(--bg2)", boxShadow:`0 0 0 2px ${catColor}` }} />
                        <div className="art-timeline-date">
                          {ev.event_date ? new Date(ev.event_date).toLocaleDateString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : ""}
                          {ev.source_name && <span style={{ marginLeft:8, color:"var(--text3)" }}>· {ev.source_name}</span>}
                        </div>
                        <p className="art-timeline-text">{ev.event_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Story connections */}
              {storyConnections.length > 0 && (
                <div className="art-sources-card" style={{ borderTop:`3px solid ${catColor}`, marginTop: 16 }}>
                  <h3 className="art-sources-h3">🔗 Story Connections</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text3)" }}>
                    Follow-ups and closely related updates across separate clusters.
                  </p>
                  {storyConnections.map((c, i) => (
                    <a key={c.id || i} href={`/article/${c.id}`} className="art-source-row" style={{ textDecoration: "none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: c.relation === "follow_up" ? "#166534" : "#2563eb" }} />
                        <div>
                          <div className="art-source-name" style={{ color: "var(--text1)" }}>
                            {c.relation === "follow_up" ? "Follow-up" : "Background"}
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>
                              Similarity {Math.round((c.similarity || 0) * 100)}%
                            </span>
                          </div>
                          <div className="art-source-title">{c.headline}</div>
                          {c.summary_brief && (
                            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                              {sanitizeDisplayText(c.summary_brief).slice(0, 120)}{sanitizeDisplayText(c.summary_brief).length > 120 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                        {c.first_seen && <div className="art-source-time">{new Date(c.first_seen).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</div>}
                        <div style={{ fontSize:12, color:catColor, fontWeight:600 }}>Open ↗</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Sources */}
              {sources.length > 0 && (
                <div className="art-sources-card">
                  <h3 className="art-sources-h3">🔗 Sources ({sources.length})</h3>
                  {sources.slice().sort((a,b) => new Date(a.published_at||0) - new Date(b.published_at||0)).map((s, i) => (
                    <a key={i} href={s.original_url} target="_blank" rel="noopener noreferrer" className="art-source-row">
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: s.source_tier===1 ? "#166534" : s.source_tier===2 ? "#2563eb" : "#9ca3af" }} />
                        <div>
                          <div className="art-source-name">
                            {i === 0 && <span style={{ fontSize:10, background:"#dcfce7", color:"#166534", padding:"1px 5px", borderRadius:2, marginRight:6, fontWeight:700 }}>FIRST</span>}
                            {s.source_domain}
                          </div>
                          {s.original_title && (
                            <div className="art-source-title">{s.original_title.slice(0,80)}{s.original_title.length > 80 ? "…" : ""}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                        {s.published_at && <div className="art-source-time">{new Date(s.published_at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}</div>}
                        <div style={{ fontSize:12, color:catColor, fontWeight:600 }}>Read ↗</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </article>

            {/* ── Sidebar ───────────────────────────────────── */}
            <aside style={{ position:"sticky", top:64 }}>
              {/* Truth score */}
              <div className="art-sidebar-card" style={{ borderTop:`4px solid ${scoreColor}` }}>
                <div className="art-score-label">Truth Score</div>
                <div className="art-score-num" style={{ color:scoreColor }}>
                  {formatTruthScorePercent(score)}
                </div>
                <div className="art-score-bar-bg">
                  <div style={{ width:`${score}%`, height:"100%", background:scoreColor, borderRadius:3, transition:"width .5s" }} />
                </div>
                <div className="art-score-text" style={{ color:scoreColor }}>
                  {score >= 75 ? "✓ Verified by multiple credible sources"
                   : score >= 50 ? "✓ Verified — needs more confirmation"
                   : "⚠ Unverified — treat with caution"}
                </div>
              </div>

              {/* Exam tags */}
              {(article.exam_tags || []).length > 0 && (
                <div className="art-exam-card">
                  <div className="art-exam-label">Exam Relevance</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {(article.exam_tags || []).map(tag => (
                      <a key={tag} href={`/search?exam_tag=${tag}`}
                        style={{ fontSize:10, padding:"3px 8px", borderRadius:2, background:"#1e3a5f", color:"#fff", fontWeight:700, letterSpacing:0.3, textDecoration:"none", textTransform:"uppercase" }}>
                        {tag.replace(/_/g," ")}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Save button — client component handles localStorage interactivity */}
              <SaveArticleButton articleId={id} headline={article.headline} />

              {/* Language availability */}
              {article.translations && Object.keys(article.translations).length > 0 && (
                <div className="art-sidebar-card" style={{ marginBottom:12 }}>
                  <div className="art-score-label">Available in</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:4 }}>
                    {Object.entries({hi:"हिन्दी",ta:"தமிழ்",te:"తెలుగు",bn:"বাংলা",mr:"मराठी"})
                      .filter(([code]) => article.translations?.[code])
                      .map(([code, name]) => (
                        <a key={code} href={`/article/${id}?lang=${code}`}
                          style={{ fontSize:12, padding:"3px 9px", borderRadius:12,
                            background:"var(--bg3)", color:"var(--accent)",
                            textDecoration:"none", border:"1px solid var(--border)",
                            fontWeight:600 }}>
                          {name}
                        </a>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Back to feed */}
              <a href="/" style={{ display:"block", textAlign:"center", padding:"10px", background:"var(--accent)", color:"#fff", textDecoration:"none", fontSize:13, fontWeight:600, borderRadius:2, marginBottom:12, letterSpacing:0.3 }}>
                ← Back to feed
              </a>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

function NotFound() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1rem" }}>
      <PageState
        tone="empty"
        icon="📭"
        title="Article not found"
        message="This story may have been removed or is no longer available."
        actionLabel="Back to feed"
        actionHref="/"
      />
    </div>
  );
}
