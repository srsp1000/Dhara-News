 "use client";
import { useTheme } from "../ui/ThemeProvider";
import { useTranslation } from "../ui/LanguageSelector";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { DOMAIN_COLORS, getDomainIcon } from "../../lib/constants";

function readingTime(text) {
  const words = (text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function truthColor(s) {
  if (s >= 75) return "#166534";
  if (s >= 50) return "#92400e";
  if (s >= 35) return "#1e3a5f";
  return "#6b7280";
}
export function truthBg(s) {
  if (s >= 75) return "#dcfce7";
  if (s >= 50) return "#fef3c7";
  if (s >= 35) return "#eff6ff";
  return "#f1f5f9";
}
export function statusLabel(status) {
  if (status === "verified")   return "✓ Verified";
  if (status === "developing") return "✓ Verified";
  return "⚠ Unverified";
}

function formatPublishedAt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceName(domain) {
  if (!domain) return "";
  return domain.replace(/^www\./, "").replace(/\.com$|\.in$|\.org$|\.net$/, "").replace(/\./g, " ");
}

export default function ArticleCard({ article: a, depth, onClick }) {
  const { dark } = useTheme();

  // ── FIX: useTranslation is now CALLED here — language switching works ────
  const headline = useTranslation(a, "headline") || a.headline;
  const brief    = useTranslation(a, "brief")    || a.summary_brief;
  const deep     = useTranslation(a, "deep")     || a.summary_deep;

  const domainColor = DOMAIN_COLORS[a.domain] || "#475569";
  const scoreColor  = truthColor(a.truth_score);
  const scoreBg     = truthBg(a.truth_score);

  const briefText = sanitizeDisplayText(brief || deep || "");
  const deepText = sanitizeDisplayText(deep || brief || "");

  const text = depth === "headline"
    ? null
    : depth === "brief"
      ? (briefText || "Brief summary is not available yet. Open article for full context.")
      : (deepText || "Deep summary is not available yet. Open article for full context.");

  // Prefer source publication time from API; fallback is cluster first_seen.
  const displayTime = a.published_at || a.first_seen;

  return (
    <article suppressHydrationWarning
      onClick={() => onClick && onClick(a.id)}
      className="card fade-in"
      style={{
        background: "var(--bg2)",
        borderRadius: 12,
        border: "1px solid var(--border)",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
      }}>

      {/* Image area */}
      {a.image_url ? (
        <div style={{ position: "relative", height: 180, overflow: "hidden", flexShrink: 0, background: `${domainColor}22` }}>
          <img
            src={a.image_url}
            alt={headline}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => {
              // FIX: graceful fallback to colored domain strip instead of vanishing
              const parent = e.target.parentElement;
              e.target.style.display = "none";
              parent.style.height = "4px";
              parent.style.background = domainColor;
            }}
          />
          {/* Domain badge over image */}
          <div style={{
            position: "absolute", top: 8, left: 8,
            background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
            color: "#fff", fontSize: 10, padding: "3px 8px",
            borderRadius: 8, fontWeight: 600, letterSpacing: ".03em",
            textTransform: "uppercase",
          }}>
            {getDomainIcon(a.domain)} {a.domain || "news"}
          </div>
        </div>
      ) : (
        <div style={{ height: 4, flexShrink: 0, background: domainColor }} />
      )}

      {/* Content */}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Top meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
            background: scoreBg, color: scoreColor,
          }}>
            {statusLabel(a.status)} · {a.truth_score}
          </span>
          {a.source_count > 1 && (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              {a.source_count} sources
            </span>
          )}
          {Number.isFinite(Number(a.views_24h)) && (
            <span style={{ fontSize: 11, color: "var(--text3)" }} title="Views in last 24h">
              👁 {Number(a.views_24h).toLocaleString("en-IN")}
            </span>
          )}
          {!a.image_url && a.domain && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 8,
              background: `${domainColor}18`, color: domainColor, textTransform: "uppercase",
            }}>
              {getDomainIcon(a.domain)} {a.domain}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}
            title="Published by source">
            {formatPublishedAt(displayTime)}
          </span>
        </div>

        {/* Headline — translated */}
        <h2 style={{
          margin: 0, fontSize: 15, fontWeight: 650,
          color: "var(--text1)", lineHeight: 1.4, letterSpacing: "-.01em",
        }}>
          {headline}
        </h2>

        {/* Brief / deep body text */}
        {depth !== "headline" && text && (
          <p style={{
            margin: 0, fontSize: 13, color: "var(--text2)",
            lineHeight: 1.6, flex: 1,
            display: "-webkit-box",
            WebkitLineClamp: depth === "deep" ? 6 : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {text}
          </p>
        )}

        {/* Bottom: source + exam tags */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {a.sources?.[0]?.source_domain && (
            <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>
              {sourceName(a.sources[0].source_domain)}
            </span>
          )}
          {(a.exam_tags || []).slice(0, 2).map(t => (
            <span key={t} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 6,
              background: dark ? "#1e3a5f44" : "#eff6ff", color: dark ? "#93c5fd" : "#1e3a5f",
              fontWeight: 500,
            }}>
              {t.replace(/_/g," ").toUpperCase()}
            </span>
          ))}
          {(a.loc_state || a.loc_district) && (
            <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: "auto" }}>
              📍 {[a.loc_district, a.loc_state].filter(Boolean).join(", ")}
            </span>
          )}
          {a.has_hindi && (
            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 2,
              background: "#eff6ff", color: "#1e3a5f", fontWeight: 600 }}>
              हिं
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
