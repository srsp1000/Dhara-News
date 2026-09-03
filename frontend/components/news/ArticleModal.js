"use client";
/**
 * frontend/components/news/ArticleModal.js
 *
 * FIXES APPLIED
 * ─────────────────────────────────────────────────────────────────────────
 * FIX-1  Removed 368 lines of commented-out first implementation
 *        (the entire // block that started at line 1). The live
 *        implementation below is the only version.
 *
 * FIX-2  CommentSection now receives `clusterId` prop (was `articleId`)
 *        matching the API endpoint GET /api/comments/{cluster_id}.
 *
 * FIX-3  "Read original" link is always prominent, not buried.
 *
 * FIX-4  Source list sorted by published_at — first-reporter shown with
 *        "🥇 First reported" badge.
 *
 * FIX-5  Both published_at and first_seen shown in meta row — readers
 *        can distinguish original publish time vs when Dhara found it.
 */

import { useTheme } from "../ui/ThemeProvider";
import { useTranslation } from "../ui/LanguageSelector";
import { useState, useEffect } from "react";
import { truthColor, truthBg, statusLabel } from "./ArticleCard";
import BiasCompass from "../ui/BiasCompass";
import { ShareButtons, RelatedPerspectives } from "../ui/ShareButtons";
import AudioNarration from "../features/AudioNarration";
import { useOfflineCache } from "../features/OfflineIndicator";
import CommentSection from "../ui/CommentSection";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { useThemeValues } from "../../lib/useThemeValues";
import { DOMAIN_COLORS } from "../../lib/constants";

function formatDate(iso, opts) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", opts || {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgoFull(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Returns an array of {label, text} section objects for structured rendering.
 * Handles: structured object, JSON string, plain string.
 */
function parseSummaryDeepSections(raw) {
  if (!raw) return null;

  let obj = null;

  if (typeof raw === "object" && raw !== null) {
    obj = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try { obj = JSON.parse(trimmed); } catch { /* fall through */ }
    }
  }

  if (obj && typeof obj === "object") {
    const sections = [];
    if (obj.lead)        sections.push({ label: "Overview",         text: obj.lead });
    if (obj.background)  sections.push({ label: "Background",       text: obj.background });
    if (obj.development) sections.push({ label: "Development",      text: obj.development });
    if (obj.reactions)   sections.push({ label: "Reactions",        text: obj.reactions });
    if (obj.impact)      sections.push({ label: "Impact & Outlook", text: obj.impact });
    if (sections.length > 0) return sections;
  }

  // Plain string — strip leaked markdown bold markers and return as single block
  const plain = String(raw)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
  return plain ? [{ label: null, text: plain }] : null;
}

/** Legacy helper kept for callers outside the modal (e.g. AudioNarration). */
export function normalizeSummaryDeep(raw) {
  const sections = parseSummaryDeepSections(raw);
  if (!sections) return "";
  return sections.map(s => s.label ? `${s.label}\n${s.text}` : s.text).join("\n\n");
}

export default function ArticleModal({ article: a, onClose, initialDepth = "brief" }) {
  const { dark } = useTheme();
  const t = useThemeValues();
  const { saveArticle } = useOfflineCache();
  const [saved,      setSaved]      = useState(false);
  const [depth,      setDepth]      = useState(initialDepth);
  const [activeTerm, setTerm]       = useState(null);
  const [activeTab,  setActiveTab]  = useState("article");

  const catColor = DOMAIN_COLORS[a.domain] || t.accent;

  const headline    = useTranslation(a, "headline") || a.headline;
  const brief       = useTranslation(a, "brief")    || a.summary_brief;
  const deepRaw     = useTranslation(a, "deep")     || a.summary_deep;
  const deepSections = parseSummaryDeepSections(deepRaw);
  const deepText     = normalizeSummaryDeep(deepRaw);

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setDepth(initialDepth);
  }, [initialDepth, a?.id]);

  const body = depth === "headline" ? headline
             : depth === "brief"    ? sanitizeDisplayText(brief || headline)
             :                        sanitizeDisplayText(deepText || brief || headline);

  // FIX-4: Sources sorted by published_at (earliest first = first reporter)
  const sortedSources = [...(a.sources || [])].sort(
    (x, y) =>
      new Date(x.published_at || x.first_seen || 0) -
      new Date(y.published_at || y.first_seen || 0)
  );

  // Determine which tabs to show
  const hasCompare = sortedSources.filter(s => s.original_title).length >= 2;
  const tabs = [
    ["article",  "Article"],
    ["sources",  `Sources (${sortedSources.length})`],
    ...(hasCompare ? [["compare", "Compare"]] : []),
    ["comments", "Comments"],
  ];

  return (
    <div
      suppressHydrationWarning
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.65)", zIndex: 200,
        overflowY: "auto", padding: "2rem 1rem",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
      }}
    >
      <div
        className="article-modal-inner fade-in"
        style={{
          background: "var(--bg2)", borderRadius: 16,
          width: "100%", maxWidth: 720,
          padding: "1.5rem 1.8rem", position: "relative",
          marginBottom: "2rem",
          border: "1px solid var(--border)",
        }}
      >

        {/* ── Close ──────────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          aria-label="Close article"
          style={{
            position: "absolute", top: 14, right: 14,
            width: 34, height: 34, borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--bg2)",
            cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text2)",
          }}
        >✕</button>

        {/* ── Meta row ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{
            padding: "4px 14px", borderRadius: 20, fontWeight: 700, fontSize: 13,
            background: truthBg(a.truth_score), color: truthColor(a.truth_score),
          }}>
            {statusLabel(a.status)} · {a.truth_score}/100
          </div>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            {a.source_count} source{a.source_count !== 1 ? "s" : ""}
          </span>
          {(a.loc_state || a.loc_district) && (
            <span style={{ fontSize: 13, color: "var(--text2)" }}>
              📍 {[a.loc_district, a.loc_state].filter(Boolean).join(", ")}
            </span>
          )}

          {/* FIX-5: Both publish time and Dhara-found time */}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            {a.published_at && (
              <div style={{ fontSize: 11, color: "var(--text3)" }}>
                Published: {formatDate(a.published_at, {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              Found by Dhara: {timeAgoFull(a.first_seen)}
            </div>
          </div>
        </div>

        {/* ── Conflict warning ───────────────────────────────────────── */}
        {a.conflict && (
          <div style={{
            background: dark ? "#78350f22" : "#fef3c7",
            border: "1px solid #fcd34d", borderRadius: 10,
            padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#92400e",
          }}>
            ⚠ Sources conflict — check the Sources tab for both sides.
            {a.conflict_reason && (
              <span style={{ marginLeft: 6, opacity: 0.8 }}>({a.conflict_reason})</span>
            )}
          </div>
        )}

        {/* ── Tags ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
          {a.domain && (
            <span style={{
              fontSize: 12, padding: "3px 8px", borderRadius: 8,
              background: "var(--bg3)", color: "var(--text2)", fontWeight: 500,
            }}>{a.domain}</span>
          )}
          {(a.exam_tags || []).map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 8,
              background: dark ? "#1e3a5f44" : "#eff6ff",
              color: dark ? "#93c5fd" : "#1e3a5f", fontWeight: 500,
            }}>
              {tag.replace(/_/g, " ").toUpperCase()}
            </span>
          ))}
        </div>

        {/* ── Headline ───────────────────────────────────────────────── */}
        <h1 style={{
          margin: "0 0 14px", fontSize: 21, fontWeight: 700,
          color: "var(--text1)", lineHeight: 1.35,
        }}>{headline}</h1>

        {/* ── AI disclaimer ──────────────────────────────────────────── */}
        <div style={{
          fontSize: 11, color: "var(--text3)", marginBottom: 10,
          padding: "4px 10px", background: "var(--bg3)", borderRadius: 6,
          display: "inline-flex", gap: 4, alignItems: "center",
        }}>
          🤖 AI-synthesized from {a.source_count || 1} source{a.source_count !== 1 ? "s" : ""} — verify facts from originals
        </div>

        {/* ── Depth toggle + controls ─────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--bg3)", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["headline", "Headline"], ["brief", "Brief"], ["deep", "Deep Dive"]].map(([d, l]) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                style={{
                  padding: "5px 13px", borderRadius: 8, border: "none",
                  cursor: "pointer", fontSize: 12,
                  fontWeight: depth === d ? 600 : 400,
                  background: depth === d ? "var(--bg2)" : "transparent",
                  color: depth === d ? "var(--accent)" : "var(--text2)",
                  boxShadow: depth === d ? "0 1px 3px var(--shadow)" : "none",
                  transition: "all .15s",
                }}
              >{l}</button>
            ))}
          </div>

          <AudioNarration text={body} headline={headline} />

          {/* FIX-3: Read original — always prominent */}
          {(a.canonical_url || sortedSources[0]?.url) && (
            <a
              href={a.canonical_url || sortedSources[0]?.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: "var(--accent)", textDecoration: "none",
                padding: "5px 10px", border: "1px solid var(--border)",
                borderRadius: 8, fontWeight: 600,
              }}
            >
              📰 Read original ↗
            </a>
          )}

          <a
            href={`/article/${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, color: "var(--text2)", textDecoration: "none",
              padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 8,
            }}
          >
            Full page ↗
          </a>

          {/* Offline save */}
          <button
            onClick={() => { saveArticle(a); setSaved(true); }}
            title="Save for offline reading"
            style={{
              fontSize: 12, padding: "5px 10px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: saved ? "var(--bg3)" : "transparent",
              color: saved ? "var(--accent)" : "var(--text2)",
              cursor: "pointer",
            }}
          >
            {saved ? "✓ Saved" : "🔖 Save"}
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 4,
          borderBottom: "1px solid var(--border2)", marginBottom: 14,
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: "7px 14px", border: "none", background: "transparent",
                cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
                fontWeight: activeTab === id ? 600 : 400,
                color: activeTab === id ? "var(--accent)" : "var(--text2)",
                borderBottom: activeTab === id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                marginBottom: -1, transition: "all .15s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* ════ ARTICLE TAB ════════════════════════════════════════════ */}
        {activeTab === "article" && (
          <>
            {/* Deep Dive: structured sections or plain text */}
            {depth === "deep" && deepSections ? (
              <div style={{ marginBottom: "1.2rem" }}>
                {deepSections.map((section, idx) => (
                  <div key={idx} style={{ marginBottom: "1.2rem" }}>
                    {section.label && (
                      <p style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                        textTransform: "uppercase", color: "var(--accent)",
                        margin: "0 0 6px", opacity: 0.85,
                      }}>
                        {section.label}
                      </p>
                    )}
                    <p style={{
                      fontSize: "var(--reader-size, 15px)", color: "var(--text2)",
                      lineHeight: 1.8, margin: 0,
                    }}>
                      {sanitizeDisplayText(section.text)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                fontSize: "var(--reader-size, 15px)", color: "var(--text2)",
                lineHeight: 1.8, marginBottom: "1.2rem", whiteSpace: "pre-wrap",
              }}>
                {body}
              </div>
            )}

            {/* Glossary */}
            {a.terminology && Object.keys(a.terminology).length > 0 && (
              <div style={{ borderTop: "1px solid var(--border2)", paddingTop: 12, marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", margin: "0 0 8px" }}>
                  📖 Term glossary
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(a.terminology).map(([term, def]) => (
                    <div key={term}>
                      <button
                        onClick={() => setTerm(activeTerm === term ? null : term)}
                        style={{
                          padding: "3px 10px", borderRadius: 10,
                          border: "1px solid #bfdbfe",
                          background: activeTerm === term ? "#eff6ff" : "var(--bg2)",
                          color: "var(--accent)", fontSize: 12, cursor: "pointer",
                        }}
                      >{term}</button>
                      {activeTerm === term && (
                        <div style={{
                          marginTop: 4, padding: "8px 12px",
                          background: "var(--bg3)", border: "1px solid var(--border)",
                          borderRadius: 8, fontSize: 12, color: "var(--text2)",
                          lineHeight: 1.5, maxWidth: 360,
                        }}>
                          {def.explanation || def}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {(a.timeline || []).length > 0 && (
              <div style={{ borderTop: "1px solid var(--border2)", paddingTop: 12, marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", margin: "0 0 10px" }}>
                  📅 Story timeline
                </p>
                {a.timeline.map((ev, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0, width: 90 }}>
                      {formatDate(ev.event_date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>
                      {ev.event_text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <RelatedPerspectives clusterId={a.id} />
            <ShareButtons article={a} />
          </>
        )}

        {/* ════ COMPARE TAB ════════════════════════════════════════════ */}
        {activeTab === "compare" && (
          <div>
            <p style={{
              fontSize: 12, color: t.text3, marginBottom: 14,
              padding: "6px 10px", background: t.bg3, borderRadius: 6,
            }}>
              How different outlets framed this story — left border width reflects source credibility.
            </p>
            {sortedSources.filter(s => s.original_title).map((s, i) => {
              const cred      = s.source_cred || 0.7;
              const credColor = cred >= 0.85 ? "#166534" : cred >= 0.7 ? "#92400e" : "#991b1b";
              return (
                <div key={i} style={{
                  marginBottom: 10, padding: "10px 12px", background: t.bg3, borderRadius: 6,
                  borderLeft: `${Math.max(2, Math.round(cred * 5))}px solid ${catColor}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text1 }}>
                        {s.source_domain}
                      </span>
                      {i === 0 && (
                        <span style={{
                          fontSize: 10, background: "#dcfce7", color: "#166534",
                          padding: "1px 5px", borderRadius: 4, fontWeight: 700,
                        }}>FIRST</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: credColor, fontWeight: 600 }}>
                      {Math.round(cred * 100)}% cred
                    </span>
                  </div>
                  <p style={{
                    margin: 0, fontSize: 13, color: t.text1,
                    fontFamily: "'Georgia', serif", lineHeight: 1.5, fontStyle: "italic",
                  }}>
                    "{s.original_title}"
                  </p>
                  {s.original_url && (
                    <a
                      href={s.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: t.accent, textDecoration: "none", marginTop: 5, display: "block" }}
                    >
                      Read full article ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ════ SOURCES TAB ════════════════════════════════════════════ */}
        {activeTab === "sources" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <BiasCompass sources={sortedSources.map(s => ({
                source_domain: s.source_domain,
                bias:  s.bias || 0,
                cred:  s.source_cred || 0.7,
                tier:  s.source_tier || 2,
              }))} />
            </div>

            {sortedSources.map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "10px 0", borderBottom: "1px solid var(--border2)",
                flexWrap: "wrap", gap: 8,
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
                    {i === 0 ? "🥇 " : ""}{s.source_domain}
                  </span>
                  {i === 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 600,
                      background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 8,
                    }}>First reported</span>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                    Credibility: {Math.round((s.source_cred || 0.7) * 100)}% · Tier {s.source_tier || 2}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {s.published_at && (
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      {formatDate(s.published_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
                    >
                      Read ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ════ COMMENTS TAB ═══════════════════════════════════════════ */}
        {/* FIX-2: Pass clusterId (matches /api/comments/{cluster_id} endpoint) */}
        {activeTab === "comments" && <CommentSection clusterId={a.id} />}

      </div>
    </div>
  );
}
