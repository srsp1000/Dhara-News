"use client";
import { useState } from "react";
import { useEffect } from "react";
import { useTheme } from "../ui/ThemeProvider";
import { DOMAINS, INDIAN_STATES, getDomainIcon } from "../../lib/constants";
import { INDIA_DISTRICTS } from "../../lib/districts";

const API = "";

const EXAM_TAGS = [
  { key: "upsc_prelims", label: "UPSC Prelims", icon: "🏛️" },
  { key: "upsc_mains_gs1", label: "GS1 · History", icon: "📜" },
  { key: "upsc_mains_gs2", label: "GS2 · Polity", icon: "⚖️" },
  { key: "upsc_mains_gs3", label: "GS3 · Economy", icon: "📊" },
  { key: "upsc_mains_gs4", label: "GS4 · Ethics", icon: "🧭" },
  { key: "neet", label: "NEET", icon: "🩺" },
  { key: "jee", label: "JEE", icon: "⚙️" },
  { key: "clat", label: "CLAT", icon: "📚" },
  { key: "gate", label: "GATE", icon: "🔬" },
  { key: "cat", label: "CAT", icon: "💼" },
  { key: "ssc", label: "SSC", icon: "📋" },
];

export default function Sidebar({
  domain,
  setDomain,
  state,
  setState,
  district,
  setDistrict,
  examTag = null,
  setExamTag = () => {},
  inDrawer = false,
}) {
  const { dark } = useTheme();
  const [showExams, setShowExams] = useState(false);
  const [districtOptionsLive, setDistrictOptionsLive] = useState([]);
  const canFilterExams = typeof setExamTag === "function";
  const fallbackDistricts = state !== "All States" ? (INDIA_DISTRICTS[state] || []) : [];
  const districtOptions = districtOptionsLive.length > 0 ? districtOptionsLive : fallbackDistricts;

  useEffect(() => {
    if (!state || state === "All States") {
      setDistrictOptionsLive([]);
      return;
    }
    let cancelled = false;
    fetch(`${API}/api/locations/districts?state=${encodeURIComponent(state)}&limit=300`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (cancelled) return;
        const opts = Array.isArray(data) ? data.map(x => x?.district).filter(Boolean) : [];
        setDistrictOptionsLive(opts);
      })
      .catch(() => {
        if (!cancelled) setDistrictOptionsLive([]);
      });
    return () => { cancelled = true; };
  }, [state]);

  return (
    <aside suppressHydrationWarning>
      <div style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 12, padding: "1rem",
        position: inDrawer ? "static" : "sticky", top: inDrawer ? "auto" : 80,
        maxHeight: inDrawer ? "none" : "calc(100vh - 100px)",
        overflowY: "auto",
        scrollbarWidth: "thin",
      }}>

        <p style={{
          fontSize: 10, fontWeight: 700, color: "var(--text3)",
          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 8px",
        }}>
          Section
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setDomain(d)}
              style={{
                padding: "6px 10px", borderRadius: 8, border: "none",
                cursor: "pointer", fontSize: 13, textAlign: "left",
                fontWeight: domain === d ? 600 : 400,
                background: domain === d ? (dark ? "#1e3a5f33" : "#eff6ff") : "transparent",
                color: domain === d ? "var(--accent)" : "var(--text2)",
                display: "flex", alignItems: "center", gap: 7,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => { if (domain !== d) e.currentTarget.style.background = "var(--bg3)"; }}
              onMouseLeave={e => { if (domain !== d) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 13 }}>{getDomainIcon(d === "All" ? "general" : d)}</span>
              <span>{d === "All" ? "All Domains" : d.charAt(0).toUpperCase() + d.slice(1)}</span>
            </button>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />

        <p style={{
          fontSize: 10, fontWeight: 700, color: "var(--text3)",
          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px",
        }}>
          Location
        </p>
        <select
          value={state} onChange={e => {
            const nextState = e.target.value;
            setState(nextState);
            setDistrict("All Districts");
          }}
          style={{
            width: "100%", padding: "7px 10px",
            border: "1px solid var(--border)", borderRadius: 8,
            fontSize: 13, background: "var(--bg2)",
            color: "var(--text1)", cursor: "pointer", outline: "none",
          }}>
          {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select
          value={district}
          onChange={e => setDistrict(e.target.value)}
          disabled={state === "All States"}
          style={{
            width: "100%", padding: "7px 10px", marginTop: 8,
            border: "1px solid var(--border)", borderRadius: 8,
            fontSize: 13, background: "var(--bg2)",
            color: "var(--text1)", cursor: state === "All States" ? "not-allowed" : "pointer",
            outline: "none", opacity: state === "All States" ? 0.65 : 1,
          }}>
          <option>All Districts</option>
          {districtOptions.map(d => <option key={d}>{d}</option>)}
        </select>

        {canFilterExams && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />

            <p style={{
              fontSize: 10, fontWeight: 700, color: "var(--text3)",
              letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px",
            }}>
              Exams
            </p>
            {!showExams ? (
              <button
                onClick={() => setShowExams(true)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text2)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                📚 Show Exam Filters
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button
                    onClick={() => setExamTag(null)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 16,
                      border: `1px solid ${!examTag ? "var(--accent)" : "var(--border)"}`,
                      background: !examTag ? (dark ? "#1e3a5f33" : "#eff6ff") : "transparent",
                      color: !examTag ? "var(--accent)" : "var(--text2)",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: !examTag ? 700 : 500,
                    }}
                  >
                    All
                  </button>
                  {EXAM_TAGS.map((ex) => (
                    <button
                      key={ex.key}
                      onClick={() => setExamTag(examTag === ex.key ? null : ex.key)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 16,
                        border: `1px solid ${examTag === ex.key ? "var(--accent)" : "var(--border)"}`,
                        background: examTag === ex.key ? (dark ? "#1e3a5f33" : "#eff6ff") : "transparent",
                        color: examTag === ex.key ? "var(--accent)" : "var(--text2)",
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: examTag === ex.key ? 700 : 500,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{ex.icon}</span>
                      <span>{ex.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setShowExams(false); setExamTag(null); }}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text3)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ✕ Hide Exam Filters
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />

        {/* Quick nav links */}
        {[
          { href: "/archive",       icon: "📅", label: "Date Archive" },
          { href: "/live",          icon: "🔴", label: "Live Blog" },
          { href: "/parliament",    icon: "🏛️", label: "Parliament Tracker" },
          { href: "/search",        icon: "🔍", label: "Advanced Search" },
          { href: "/morning-brief", icon: "☀️", label: "Morning Brief" },
          { href: "/trending",      icon: "🔥", label: "Trending" },
          { href: "/quarantine",    icon: "⚠️", label: "Quarantine" },
          { href:"/settings",      icon:"⚙️", label:"Settings" },
          { href:"/flashcards",    icon:"🃏", label:"Flashcards" },
        ].map(item => (
          <a key={item.href} href={item.href}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "var(--text2)",
              textDecoration: "none", padding: "6px 4px",
              borderRadius: 6, transition: "all .1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg3)"; e.currentTarget.style.color = "var(--text1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text2)"; }}>
            {item.icon} <span>{item.label}</span>
          </a>
        ))}

        {/* Truth Score explainer */}
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: dark ? "#1e3a5f22" : "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 10, fontSize: 12,
          color: "var(--text2)", lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: "var(--accent)", marginBottom: 6, fontSize: 12 }}>
            ℹ️ What is Truth Score?
          </div>
          <div style={{ marginBottom: 4 }}>
            <span style={{ background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>75+</span>
            {" "}Verified by multiple credible sources
          </div>
          <div style={{ marginBottom: 4 }}>
            <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>50–74</span>
            {" "}Verified — needs more confirmation
          </div>
          <div>
            <span style={{ background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>&lt;50</span>
            {" "}Unverified — treat with caution
          </div>
        </div>
      </div>
    </aside>
  );
}
