"use client";
// /government — Dedicated Government Press & Announcements Portal
// Central: Ministry category tabs + date-wise press releases
// States & UTs: State grid → state-specific government news

import { useState, useEffect, useCallback } from "react";
import { useThemeValues } from "../../lib/useThemeValues";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import {
  MINISTRY_CATEGORIES,
  STATES_LIST,
  UTS_LIST,
} from "../../lib/gov_sources";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Color palette ─────────────────────────────────────────────────────────────
const GOV_NAVY = "#0d2137";
const GOV_SAFFRON = "#FF6B00";
const GOV_GREEN = "#138808";

function scoreColor(s) { return s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b"; }
function scoreBg(s)    { return s >= 75 ? "#dcfce7"  : s >= 50 ? "#fef3c7"  : "#fee2e2"; }

function groupByDate(articles) {
  const groups = {};
  for (const a of articles) {
    const raw = a.first_seen || "";
    const day = raw.split("T")[0] || "unknown";
    if (!groups[day]) groups[day] = [];
    groups[day].push(a);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function formatDateHeading(dateStr) {
  if (!dateStr || dateStr === "unknown") return "Undated";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GovernmentPage() {
  const t = useThemeValues();

  // Top-level tabs: central | states
  const [topTab,       setTopTab]       = useState("central");

  // Central: selected ministry category
  const [ministry,     setMinistry]     = useState("all");

  // States & UTs: selected state/UT
  const [selectedState, setSelectedState] = useState(null);
  const [stateTab,      setStateTab]      = useState("states"); // "states" | "uts"

  // Articles + loading
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Collapsed date groups
  const [collapsed, setCollapsed] = useState({});

  // Selected article (expanded)
  const [selected, setSelected] = useState(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchGov = useCallback(async () => {
    setLoading(true);
    setArticles([]);
    setSelected(null);
    setCollapsed({});
    setIsFallback(false);

    try {
      const params = new URLSearchParams({ limit: "50" });

      if (topTab === "central") {
        params.set("gov_level", "central");
        params.set("ministry",  ministry);
      } else {
        params.set("gov_level", "state");
        if (selectedState) params.set("gov_state", selectedState);
        else {
          setLoading(false);
          return; // Wait for state selection
        }
      }

      const res = await fetch(`${API}/api/government?${params}`);
      if (!res.ok) throw new Error("gov api error");
      const data = await res.json();
      setArticles(data.results || []);
      setIsFallback(!!(data.results || []).find(r => r._fallback));
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [topTab, ministry, selectedState]);

  useEffect(() => {
    if (topTab === "central" || (topTab === "states" && selectedState)) {
      fetchGov();
    } else {
      setArticles([]);
      setLoading(false);
    }
  }, [fetchGov, topTab, selectedState]);

  const groupedDates = groupByDate(articles);
  const toggleCollapse = day => setCollapsed(p => ({ ...p, [day]: !p[day] }));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div suppressHydrationWarning style={{
      fontFamily: "'Segoe UI',-apple-system,system-ui,sans-serif",
      background: t.bg, minHeight: "100vh", color: t.text1,
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: GOV_NAVY, padding: "0 1rem" }}>
        <div style={{
          maxWidth: 1000, margin: "0 auto",
          display: "flex", alignItems: "center", height: 52, gap: 12,
        }}>
          <a href="/" style={{ textDecoration: "none", display: "flex",
            alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'Georgia',serif", fontSize: 20,
              fontWeight: 700, color: "#fff" }}>धारा</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)",
              fontWeight: 600, letterSpacing: 2 }}>NEWS</span>
          </a>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>›</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
            🏛️ Government Press
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 10,
              background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)",
              fontWeight: 600,
            }}>
              Official Sources Only
            </span>
          </div>
        </div>
      </div>

      {/* Tricolor accent bar */}
      <div style={{ height: 5, background: `linear-gradient(to right, ${GOV_SAFFRON} 33%, #fff 33% 66%, ${GOV_GREEN} 66%)` }} />

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{
            fontFamily: "'Georgia','Times New Roman',serif",
            fontSize: "clamp(1.3rem,4vw,1.9rem)",
            fontWeight: 700, color: t.text1, margin: "0 0 6px",
          }}>
            Government Press Releases & Announcements
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: t.text3 }}>
            Official press releases from Central Ministries and State Governments.
            No media sources — government primary sources only.
          </p>
        </div>

        {/* ── Top tabs: Central | States & UTs ───────────────────────────── */}
        <div style={{
          display: "flex", gap: 0, marginBottom: "1.25rem",
          borderBottom: `2px solid ${t.border}`,
        }}>
          {[
            { key: "central", label: "🇮🇳 Central Government" },
            { key: "states",  label: "🗺️ States & UTs"       },
          ].map(tb => (
            <button key={tb.key}
              onClick={() => { setTopTab(tb.key); setSelected(null); }}
              style={{
                padding: "10px 22px", border: "none", background: "transparent",
                cursor: "pointer", fontSize: 14,
                fontWeight: topTab === tb.key ? 700 : 400,
                color: topTab === tb.key ? GOV_NAVY : t.text3,
                borderBottom: topTab === tb.key
                  ? `3px solid ${GOV_NAVY}` : "3px solid transparent",
                marginBottom: -2, flexShrink: 0,
              }}>
              {tb.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            CENTRAL GOVERNMENT PANEL
        ═══════════════════════════════════════════════════════════════ */}
        {topTab === "central" && (
          <>
            {/* Ministry category tabs (scrollable on mobile) */}
            <div style={{
              display: "flex", gap: 6, flexWrap: "wrap",
              marginBottom: "1.25rem",
            }}>
              {MINISTRY_CATEGORIES.map(m => (
                <button key={m.key}
                  onClick={() => setMinistry(m.key)}
                  style={{
                    padding: "6px 13px",
                    border: `1px solid ${ministry === m.key ? GOV_NAVY : t.border}`,
                    borderRadius: 20, background: ministry === m.key ? GOV_NAVY : t.bg2,
                    color: ministry === m.key ? "#fff" : t.text2,
                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                    transition: "all 0.1s",
                  }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {/* Source legend */}
            <div style={{
              fontSize: 11, color: t.text3, marginBottom: "1rem",
              display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
            }}>
              <span style={{ fontWeight: 700 }}>Sources:</span>
              {(MINISTRY_CATEGORIES.find(m => m.key === ministry)?.domains || [])
                .slice(0, 6).map(d => (
                  <span key={d} style={{
                    padding: "2px 7px", borderRadius: 2,
                    background: "#f0fdf4", color: "#166534",
                    fontWeight: 600, border: "1px solid #bbf7d0",
                  }}>
                    ● {d}
                  </span>
                ))}
            </div>

            {/* Articles */}
            <GovArticleList
              groupedDates={groupedDates}
              loading={loading}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              selected={selected}
              onSelect={a => setSelected(selected?.id === a.id ? null : a)}
              isFallback={isFallback}
              emptyLabel={`No press releases from ${
                MINISTRY_CATEGORIES.find(m => m.key === ministry)?.label || "ministries"
              } yet.`}
              accentColor={GOV_NAVY}
              t={t}
              scoreColor={scoreColor}
              scoreBg={scoreBg}
            />
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STATES & UTs PANEL
        ═══════════════════════════════════════════════════════════════ */}
        {topTab === "states" && (
          <>
            {/* States / UTs toggle */}
            <div style={{ display: "flex", gap: 0, marginBottom: "1rem",
              border: `1px solid ${t.border}`, borderRadius: 6,
              width: "fit-content" }}>
              {["states","uts"].map(k => (
                <button key={k}
                  onClick={() => { setStateTab(k); setSelectedState(null); }}
                  style={{
                    padding: "6px 16px", border: "none",
                    background: stateTab === k ? GOV_NAVY : t.bg2,
                    color: stateTab === k ? "#fff" : t.text2,
                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                    borderRadius: k === "states" ? "5px 0 0 5px" : "0 5px 5px 0",
                    borderRight: k === "states" ? `1px solid ${t.border}` : "none",
                  }}>
                  {k === "states" ? "🗺️ States (28)" : "🏙️ Union Territories (8)"}
                </button>
              ))}
            </div>

            {/* State/UT grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: 8, marginBottom: "1.5rem",
            }}>
              {(stateTab === "states" ? STATES_LIST : UTS_LIST).map(s => (
                <button key={s}
                  onClick={() => setSelectedState(selectedState === s ? null : s)}
                  style={{
                    padding: "10px 8px", borderRadius: 8,
                    border: `2px solid ${selectedState === s ? GOV_NAVY : t.border}`,
                    background: selectedState === s ? `${GOV_NAVY}10` : t.bg2,
                    color: selectedState === s ? GOV_NAVY : t.text2,
                    cursor: "pointer", fontSize: 12,
                    fontWeight: selectedState === s ? 700 : 400,
                    textAlign: "center", transition: "all 0.1s",
                    lineHeight: 1.3,
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* State articles */}
            {selectedState ? (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  marginBottom: "1rem", paddingBottom: "0.75rem",
                  borderBottom: `2px solid ${t.border}`,
                }}>
                  <h2 style={{
                    fontFamily: "'Georgia',serif",
                    fontSize: 18, fontWeight: 700, color: t.text1, margin: 0,
                  }}>
                    🏙️ {selectedState} Government
                  </h2>
                  <a href={`/location/${selectedState.toLowerCase().replace(/ /g, "-")}`}
                    style={{
                      marginLeft: "auto", fontSize: 12, color: t.accent,
                      textDecoration: "none",
                    }}>
                    All {selectedState} news →
                  </a>
                </div>
                {isFallback && (
                  <div style={{
                    padding: "8px 12px", background: "#fef3c7",
                    border: "1px solid #fde68a", borderRadius: 6,
                    fontSize: 11, color: "#92400e", marginBottom: "1rem",
                  }}>
                    Showing state-tagged news. Dedicated state information portals
                    will be indexed as sources are added.
                  </div>
                )}
                <GovArticleList
                  groupedDates={groupedDates}
                  loading={loading}
                  collapsed={collapsed}
                  onToggle={toggleCollapse}
                  selected={selected}
                  onSelect={a => setSelected(selected?.id === a.id ? null : a)}
                  isFallback={false}
                  emptyLabel={`No government news from ${selectedState} yet.`}
                  accentColor={GOV_GREEN}
                  t={t}
                  scoreColor={scoreColor}
                  scoreBg={scoreBg}
                />
              </>
            ) : (
              <div style={{
                textAlign: "center", padding: "2.5rem 1rem",
                color: t.text3, background: t.bg2,
                border: `1px solid ${t.border}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.text2 }}>
                  Select a {stateTab === "states" ? "state" : "union territory"} above
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  View official press releases and government announcements
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Article list with date grouping ──────────────────────────────────────────
function GovArticleList({
  groupedDates, loading, collapsed, onToggle,
  selected, onSelect, isFallback, emptyLabel, accentColor, t, scoreColor, scoreBg,
}) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {[1,2,3,4,5].map(i => <GovSkeletonRow key={i} t={t} />)}
      </div>
    );
  }

  if (groupedDates.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "3rem 1rem",
        background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 4,
        color: t.text3,
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
        <div style={{ fontSize: 14, color: t.text2, fontWeight: 600 }}>{emptyLabel}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Government sources are being indexed and will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Expanded article */}
      {selected && (
        <GovExpandedArticle
          article={selected}
          accentColor={accentColor}
          t={t}
          scoreColor={scoreColor}
          scoreBg={scoreBg}
          onClose={() => onSelect(selected)}
        />
      )}

      {groupedDates.map(([day, dayArticles]) => (
        <div key={day} style={{ marginBottom: "1rem" }}>
          <button
            onClick={() => onToggle(day)}
            style={{
              width: "100%", textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px",
              background: `${accentColor}10`,
              border: `1px solid ${accentColor}30`,
              borderRadius: collapsed[day] ? 4 : "4px 4px 0 0",
              cursor: "pointer",
              color: accentColor, fontWeight: 700, fontSize: 13,
            }}>
            <span>📅 {formatDateHeading(day)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: `${accentColor}20`, color: accentColor,
                padding: "2px 8px", borderRadius: 10,
              }}>
                {dayArticles.length} {dayArticles.length === 1 ? "release" : "releases"}
              </span>
              <span>{collapsed[day] ? "▶" : "▼"}</span>
            </span>
          </button>

          {!collapsed[day] && (
            <div style={{
              background: t.bg2, border: `1px solid ${t.border}`,
              borderTop: `3px solid ${accentColor}`,
            }}>
              {dayArticles.map((a, i) => (
                <GovArticleRow
                  key={a.id} article={a} t={t}
                  accentColor={accentColor}
                  isLast={i === dayArticles.length - 1}
                  isSelected={selected?.id === a.id}
                  onClick={() => onSelect(a)}
                  scoreColor={scoreColor}
                  scoreBg={scoreBg}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GovArticleRow({ article: a, t, accentColor, isLast, isSelected, onClick, scoreColor, scoreBg }) {
  const timeStr = a.first_seen
    ? new Date(a.first_seen).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const src = a.primary_source || a.source_domain || "";

  return (
    <div onClick={onClick}
      style={{
        padding: "14px 18px",
        borderBottom: isLast ? "none" : `1px solid ${t.border}`,
        background: isSelected ? `${accentColor}08` : "transparent",
        cursor: "pointer", transition: "background 0.1s",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.bg3; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>

      <div style={{
        width: 3, flexShrink: 0, alignSelf: "stretch",
        background: accentColor, borderRadius: 2, minHeight: 40,
      }} />

      <div style={{ flex: 1 }}>
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap",
          alignItems: "center", marginBottom: 5,
        }}>
          {src && (
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 2,
              background: "#f0fdf4", color: "#166534",
              fontWeight: 700, border: "1px solid #bbf7d0",
            }}>
              🏛 {src}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 2,
            background: scoreBg(a.truth_score), color: scoreColor(a.truth_score),
          }}>
            ✓ {a.truth_score}
          </span>
          {a.loc_state && (
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 2,
              background: "#eff6ff", color: "#1e3a5f", fontWeight: 600,
            }}>
              📍 {a.loc_state}
            </span>
          )}
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

function GovExpandedArticle({ article: a, accentColor, t, scoreColor, scoreBg, onClose }) {
  return (
    <div style={{
      marginBottom: "1.5rem",
      background: t.bg2, border: `1px solid ${t.border}`,
      borderTop: `3px solid ${accentColor}`, padding: "1.5rem",
      borderRadius: "0 0 4px 4px",
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
            fontSize: 11, padding: "2px 8px", borderRadius: 2,
            background: "#f0fdf4", color: "#166534",
            fontWeight: 700, border: "1px solid #bbf7d0",
          }}>
            🏛 {a.primary_source}
          </span>
        )}
      </div>

      <p style={{
        fontFamily: "'Georgia',serif",
        fontSize: 17, fontWeight: 500, color: t.text1,
        lineHeight: 1.75, margin: "0 0 14px",
        paddingLeft: 14, borderLeft: `3px solid ${accentColor}`,
      }}>
        {sanitizeDisplayText(a.summary_brief || "")}
      </p>

      <a href={`/article/${a.id}`} target="_blank" rel="noopener noreferrer"
        style={{
          padding: "8px 16px", background: accentColor, color: "#fff",
          borderRadius: 2, textDecoration: "none", fontSize: 13,
          fontWeight: 600, display: "inline-block",
        }}>
        Read full release ↗
      </a>
    </div>
  );
}

function GovSkeletonRow({ t }) {
  return (
    <div style={{
      padding: "14px 18px", display: "flex", gap: 12,
      borderBottom: `1px solid ${t.border}`,
    }}>
      <div className="skeleton" style={{ width: 3, alignSelf: "stretch", minHeight: 60 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 10, width: "40%", marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: "80%", marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 12, width: "60%" }} />
      </div>
    </div>
  );
}
