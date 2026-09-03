"use client";
import { useThemeValues } from "../../lib/useThemeValues";
import { WeatherWidget, OnThisDayWidget, MarketsWidget, FactCheckRequest } from "../features/TodayWidgets";

const PROFESSION_CORNERS = {
  upsc: {
    bg: "#eff6ff", border: "#bfdbfe", titleColor: "#1e3a5f",
    title: "🏛️ UPSC Corner",
    content: "Today's stories tagged for:",
    tags: ["PRELIMS", "MAINS GS2", "MAINS GS3"],
    tagBg: "#1e3a5f", tagColor: "#fff",
    tip: "Focus on governance, environment, and international relations.",
  },
  medical: {
    bg: "#f0fdf4", border: "#bbf7d0", titleColor: "#166534",
    title: "🩺 Medical Corner",
    content: "Tap underlined terms in articles for clinical explanations.",
    tags: [],
    tip: "Health ministry updates and ICMR research are high-value.",
  },
  law: {
    bg: "#fefce8", border: "#fde047", titleColor: "#854d0e",
    title: "⚖️ Law Corner",
    content: "Supreme Court verdicts and legislative updates.",
    tags: ["CLAT", "AIBE"],
    tagBg: "#854d0e", tagColor: "#fff",
    tip: "Constitutional bench decisions are directly CLAT-relevant.",
  },
  technology: {
    bg: "#f5f3ff", border: "#ddd6fe", titleColor: "#6d28d9",
    title: "💻 Tech Corner",
    content: "Startup funding, ISRO launches & AI policy today.",
    tags: ["GATE", "UPSC GS3"],
    tagBg: "#6d28d9", tagColor: "#fff",
    tip: "India's semiconductor policy is a recurring exam topic.",
  },
  finance: {
    bg: "#fefce8", border: "#fde047", titleColor: "#854d0e",
    title: "📈 Finance Corner",
    content: "RBI policy, market movements & budget updates.",
    tags: ["CA Exam", "CFA"],
    tagBg: "#b45309", tagColor: "#fff",
    tip: "Note all RBI rate decisions and fiscal numbers precisely.",
  },
  defence: {
    bg: "#f1f5f9", border: "#cbd5e1", titleColor: "#334155",
    title: "🛡️ Defence Corner",
    content: "LAC & LoC updates, procurement, DRDO news.",
    tags: ["NDA", "CDS"],
    tagBg: "#334155", tagColor: "#fff",
    tip: "Know the names of newly acquired weapon systems.",
  },
  agriculture: {
    bg: "#f0fdf4", border: "#bbf7d0", titleColor: "#166534",
    title: "🌾 Agriculture Corner",
    content: "MSP updates, monsoon tracking, scheme announcements.",
    tags: ["ICAR", "UPSC GS3"],
    tagBg: "#15803d", tagColor: "#fff",
    tip: "Kharif/rabi season news is high-frequency exam material.",
  },
  environment: {
    bg: "#f0fdf4", border: "#bbf7d0", titleColor: "#166534",
    title: "🌱 Environment Corner",
    content: "Climate policy, biodiversity, and sustainability news.",
    tags: ["UPSC GS3", "NGT"],
    tagBg: "#166534", tagColor: "#fff",
    tip: "COP commitments and India's NDC targets are exam staples.",
  },
  research: {
    bg: "#fff7ed", border: "#fed7aa", titleColor: "#9a3412",
    title: "🔬 Research Corner",
    content: "Journal publications, ISRO missions, and R&D breakthroughs.",
    tags: ["GATE", "UGC NET"],
    tagBg: "#9a3412", tagColor: "#fff",
    tip: "Track Nature/Science India publications for upsc science.",
  },
  student: {
    bg: "#fdf4ff", border: "#e9d5ff", titleColor: "#7e22ce",
    title: "🎓 Student Corner",
    content: "Scholarship announcements, result updates, career news.",
    tags: ["JEE", "NEET", "UPSC"],
    tagBg: "#7e22ce", tagColor: "#fff",
    tip: "Education ministry's NEP implementation is ongoing.",
  },
};

export default function TrendingSidebar({ trending, profession, onOpen, onClick }) {
  const t = useThemeValues();
  const dark = false;
  const corner = PROFESSION_CORNERS[profession];

  return (
    <aside suppressHydrationWarning style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 80 }}>
      {/* Live blog link */}
      <a href="/live" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 0", textDecoration: "none",
        fontSize: 13, fontWeight: 700, color: "#bb1919",
        borderBottom: `1px solid ${t.border}`,
        marginBottom: 8,
      }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:"#bb1919",
          animation:"pulse-dot 1s ease-in-out infinite" }} />
        Live Breaking News
      </a>


      {/* Trending */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "1rem",
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, color: "var(--text3)",
          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 10px",
        }}>
          🔥 Trending Now
        </p>
        {trending.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: "flex", gap: 8 }}>
                <div className="skeleton" style={{ width: 20, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 12, marginBottom: 4 }} />
                  <div className="skeleton" style={{ height: 12, width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : trending.map((a, i) => (
          <div key={a.id} onClick={() => (onOpen || onClick)?.(a.id)}
            style={{
              display: "flex", gap: 10, padding: "8px 0", cursor: "pointer",
              borderBottom: i < trending.length - 1 ? "1px solid var(--border2)" : "none",
              transition: "opacity .1s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <span style={{
              fontSize: 16, fontWeight: 700,
              color: dark ? "#334155" : "#e2e8f0",
              lineHeight: 1.3, flexShrink: 0, width: 22,
            }}>{i + 1}</span>
            <div>
              <p style={{
                margin: 0, fontSize: 13, color: "var(--text1)",
                lineHeight: 1.4, fontWeight: 500,
              }}>{a.headline}</p>
              {a.domain && (
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{a.domain}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Profession corner */}
      {corner && (
        <div style={{
          background: dark ? "var(--bg2)" : corner.bg,
          border: `1px solid ${dark ? "var(--border)" : corner.border}`,
          borderRadius: 12, padding: "1rem",
        }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: corner.titleColor }}>
            {corner.title}
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text2)", lineHeight: 1.5 }}>
            {corner.content}
          </p>
          {corner.tags.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {corner.tags.map(tag => (
                <span key={tag} style={{
                  display: "inline-block", fontSize: 10,
                  background: corner.tagBg, color: corner.tagColor,
                  borderRadius: 10, padding: "2px 8px",
                  marginRight: 5, marginBottom: 4, fontWeight: 600,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p style={{
            margin: 0, fontSize: 11, color: "var(--text3)",
            lineHeight: 1.4, fontStyle: "italic",
          }}>
            💡 {corner.tip}
          </p>
        </div>
      )}

      <WeatherWidget />
      <OnThisDayWidget />
      <MarketsWidget />
      <FactCheckRequest />

      {/* Ad slot */}
      <div style={{
        background: "var(--bg2)", border: "1px dashed var(--border)",
        borderRadius: 12, minHeight: 250,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>Ad</span>
      </div>
    </aside>
  );
}

