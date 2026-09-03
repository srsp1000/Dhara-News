// frontend/app/location/[state]/page.js
// State news page — updated to show district navigation chips
// Remains a Server Component (no "use client") — district links are plain <a> tags.

import { sanitizeDisplayText } from "../../../lib/textSanitizer";
import { INDIA_DISTRICTS, districtSlug } from "../../../lib/districts";
import PageState from "../../../components/ui/PageState";

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ALL_STATES = Object.keys(INDIA_DISTRICTS);

export async function generateStaticParams() {
  return ALL_STATES.map(s => ({ state: s.toLowerCase().replace(/ /g, "-") }));
}

export async function generateMetadata({ params }) {
  const { state: stateParam } = await params;
  const stateName = stateParam.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return {
    title: `${stateName} News Today — Verified | Dhara News`,
    description: `Latest verified news from ${stateName}. Filter by district. Truth-scored articles from credible sources. Updated every 15 minutes.`,
  };
}

export default async function StateNewsPage({ params }) {
  const { state: slug } = await params;
  const state = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const districts = INDIA_DISTRICTS[state] || [];

  let articles = [];
  let fetchError = false;
  try {
    const res = await fetch(
      `${API}/api/feed?loc_state=${encodeURIComponent(state)}&limit=30&status=verified&require_fully_generated=true`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error(`State feed request failed (${res.status})`);
    const data = await res.json();
    articles = Array.isArray(data) ? data : [];
  } catch {
    articles = [];
    fetchError = true;
  }

  const scoreColor = s => s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b";
  const scoreBg    = s => s >= 75 ? "#dcfce7"  : s >= 50 ? "#fef3c7"  : "#fee2e2";

  // Quick-nav states
  const QUICK_STATES = [
    "Delhi","Maharashtra","Karnataka","Tamil Nadu",
    "Gujarat","West Bengal","Kerala","Uttar Pradesh",
  ].filter(s => s !== state).slice(0, 6);

  return (
    <div style={{
      fontFamily: "'Inter',system-ui,sans-serif",
      background: "var(--bg)", color: "var(--text1)", minHeight: "100vh",
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg2)",
        borderBottom: "1px solid var(--border)", padding: "0 1rem",
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto", display: "flex",
          alignItems: "center", gap: "1rem", height: 52,
        }}>
          <a href="/" style={{
            textDecoration: "none", fontSize: 20, fontWeight: 800,
            color: "var(--accent)",
          }}>धारा</a>
          <span style={{ color: "var(--text3)" }}>›</span>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>📍 {state}</span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: "var(--text1)", margin: "0 0 4px",
        }}>
          📍 {state} — Latest Verified News
        </h1>
        <p style={{ fontSize: 13, color: "var(--text2)", margin: "0 0 1.25rem" }}>
          {articles.length} verified stories from {state} · Updated every 15 minutes
        </p>

        {/* ── Other states quick nav ──────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {QUICK_STATES.map(s => (
            <a key={s}
              href={`/location/${s.toLowerCase().replace(/ /g, "-")}`}
              style={{
                fontSize: 11, padding: "3px 9px", borderRadius: 12,
                background: "var(--bg2)", color: "var(--text2)",
                textDecoration: "none", border: "1px solid var(--border)",
              }}>
              {s}
            </a>
          ))}
        </div>

        {/* ── District navigation ─────────────────────────────────────────── */}
        {districts.length > 0 && (
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 14px", marginBottom: "1.5rem",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--text3)",
              letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10,
            }}>
              📌 Browse by District
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {districts.map(district => (
                <a
                  key={district}
                  href={`/location/${slug}/${districtSlug(district)}`}
                  style={{
                    fontSize: 12, padding: "4px 10px", borderRadius: 20,
                    background: "var(--bg3)",
                    color: "var(--text2)",
                    textDecoration: "none",
                    border: "1px solid var(--border)",
                    transition: "all 0.1s",
                    display: "inline-block",
                  }}>
                  {district}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Article list ────────────────────────────────────────────────── */}
        {articles.length === 0 ? (
          fetchError ? (
            <PageState
              tone="error"
              icon="⚠️"
              title="State news is unavailable"
              message={`We could not load stories for ${state} right now.`}
              actionLabel="Browse all news"
              actionHref="/"
            />
          ) : (
            <PageState
              tone="empty"
              icon="📭"
              title={`No stories yet from ${state}`}
              message="Check back soon or browse the national feed."
              actionLabel="Browse all news"
              actionHref="/"
            />
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {articles.map(a => (
              <a key={a.id} href={`/article/${a.id}`}
                style={{
                  background: "var(--bg2)", border: "1px solid var(--border)",
                  borderRadius: 12, padding: "1rem",
                  textDecoration: "none", display: "block",
                }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 10,
                    background: "var(--bg3)", color: "var(--text2)", fontWeight: 600,
                  }}>
                    {a.domain}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
                    background: scoreBg(a.truth_score), color: scoreColor(a.truth_score),
                  }}>
                    Score {a.truth_score}
                  </span>
                  {a.loc_district && (
                    <span style={{
                      fontSize: 11, padding: "2px 7px", borderRadius: 10,
                      background: "#eff6ff", color: "#1e3a5f", fontWeight: 600,
                    }}>
                      📌 {a.loc_district}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                    {new Date(a.first_seen).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short",
                    })}
                  </span>
                </div>
                <h2 style={{
                  margin: "0 0 5px", fontSize: 15, fontWeight: 600,
                  color: "var(--text1)", lineHeight: 1.4,
                }}>
                  {a.headline}
                </h2>
                {a.summary_brief && (
                  <p style={{
                    margin: 0, fontSize: 13, color: "var(--text2)", lineHeight: 1.5,
                  }}>
                    {sanitizeDisplayText(a.summary_brief)}
                  </p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
