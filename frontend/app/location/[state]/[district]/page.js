// frontend/app/location/[state]/[district]/page.js
// District-level news page — drills down from /location/[state]
// Server Component: uses loc_state + loc_district filter on /api/feed

import { sanitizeDisplayText } from "../../../../lib/textSanitizer";
import { INDIA_DISTRICTS, districtSlug, districtFromSlug } from "../../../../lib/districts";
import PageState from "../../../../components/ui/PageState";

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Generate static params for all state/district combinations
export async function generateStaticParams() {
  const pairs = [];
  for (const [state, districts] of Object.entries(INDIA_DISTRICTS)) {
    const stateSlug = state.toLowerCase().replace(/ /g, "-");
    for (const district of districts) {
      pairs.push({ state: stateSlug, district: districtSlug(district) });
    }
  }
  return pairs;
}

export async function generateMetadata({ params }) {
  const { state: stateParam, district: districtParam } = await params;
  const stateName    = stateParam.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const districtName = districtFromSlug(districtParam);
  return {
    title: `${districtName}, ${stateName} News — Dhara`,
    description: `Latest verified news from ${districtName} district, ${stateName}. Updated every 15 minutes.`,
  };
}

export default async function DistrictNewsPage({ params }) {
  const { state: stateSlug, district: distSlug } = await params;

  const state    = stateSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const district = districtFromSlug(distSlug);

  // Other districts in same state for quick navigation
  const stateDistricts = (INDIA_DISTRICTS[state] || []).filter(
    d => d.toLowerCase() !== district.toLowerCase()
  );

  let articles = [];
  let usedFallback = false;
  let fetchError = false;

  // Try district-specific feed first (requires loc_district column from migration)
  try {
    const res = await fetch(
      `${API}/api/feed?loc_state=${encodeURIComponent(state)}&loc_district=${encodeURIComponent(district)}&limit=30&status=verified&require_fully_generated=true`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error(`District feed request failed (${res.status})`);
    const data = await res.json();
    articles = Array.isArray(data) ? data : [];
  } catch { articles = []; }

  // Fallback: state-level feed (graceful — loc_district column may not exist yet)
  if (articles.length === 0) {
    usedFallback = true;
    try {
      const res = await fetch(
        `${API}/api/feed?loc_state=${encodeURIComponent(state)}&limit=20&status=verified&require_fully_generated=true`,
        { next: { revalidate: 300 } }
      );
      if (!res.ok) throw new Error(`State fallback request failed (${res.status})`);
      const data = await res.json();
      articles = Array.isArray(data) ? data : [];
    } catch {
      articles = [];
      fetchError = true;
    }
  }

  const scoreColor = s => s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b";
  const scoreBg    = s => s >= 75 ? "#dcfce7"  : s >= 50 ? "#fef3c7"  : "#fee2e2";

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
          alignItems: "center", gap: 8, height: 52, flexWrap: "wrap",
        }}>
          <a href="/" style={{
            textDecoration: "none", fontSize: 20, fontWeight: 800,
            color: "var(--accent)",
          }}>धारा</a>
          <span style={{ color: "var(--text3)" }}>›</span>
          <a href={`/location/${stateSlug}`} style={{
            fontSize: 13, color: "var(--accent)", textDecoration: "none",
          }}>
            📍 {state}
          </a>
          <span style={{ color: "var(--text3)" }}>›</span>
          <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600 }}>
            {district}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: "var(--text1)", margin: "0 0 4px",
        }}>
          📌 {district} — Local News
        </h1>
        <p style={{ fontSize: 13, color: "var(--text2)", margin: "0 0 1rem" }}>
          {usedFallback
            ? `Showing ${state} state news · District-level tagging coming soon`
            : `${articles.length} verified stories from ${district} · Updated every 15 minutes`
          }
        </p>

        {/* ── Breadcrumb info ─────────────────────────────────────────────── */}
        {usedFallback && (
          <div style={{
            padding: "10px 14px", background: "#fef3c7",
            border: "1px solid #fde68a", borderRadius: 6,
            fontSize: 12, color: "#92400e", marginBottom: "1rem",
          }}>
            <strong>Note:</strong> District-level filtering will improve as more local sources
            are added and articles are tagged to {district}.
            Currently showing {state}-level verified news.
          </div>
        )}

        {/* ── Other districts in this state ───────────────────────────────── */}
        {stateDistricts.length > 0 && (
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 14px", marginBottom: "1.5rem",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--text3)",
              letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10,
            }}>
              Other districts in {state}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {stateDistricts.slice(0, 24).map(d => (
                <a
                  key={d}
                  href={`/location/${stateSlug}/${districtSlug(d)}`}
                  style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 20,
                    background: "var(--bg3)", color: "var(--text2)",
                    textDecoration: "none", border: "1px solid var(--border)",
                  }}>
                  {d}
                </a>
              ))}
              {stateDistricts.length > 24 && (
                <a href={`/location/${stateSlug}`} style={{
                  fontSize: 11, padding: "3px 9px", borderRadius: 20,
                  background: "var(--bg3)", color: "var(--accent)",
                  textDecoration: "none", border: "1px solid var(--border)",
                }}>
                  +{stateDistricts.length - 24} more →
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Article list ────────────────────────────────────────────────── */}
        {articles.length === 0 ? (
          fetchError ? (
            <PageState
              tone="error"
              icon="⚠️"
              title="District news is unavailable"
              message={`We could not load stories for ${district} right now.`}
              actionLabel={`Browse ${state} news`}
              actionHref={`/location/${stateSlug}`}
            />
          ) : (
            <PageState
              tone="empty"
              icon="📰"
              title={`No news found for ${district} yet`}
              message="Try nearby districts or browse all state stories."
              actionLabel={`Browse ${state} news`}
              actionHref={`/location/${stateSlug}`}
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
                  <span style={{
                    marginLeft: "auto", fontSize: 11, color: "var(--text3)",
                  }}>
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
