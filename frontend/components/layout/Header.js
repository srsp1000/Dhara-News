"use client";
/**
 * frontend/components/layout/Header.js
 *
 * CHANGES
 * ───────────────────────────────────────────────────────────────────────────
 * MERGE   Left sidebar (Section / Location filters) folded into the header.
 *         On desktop the filter row sits directly below the top bar.
 *         On mobile a single hamburger drawer exposes everything.
 *
 * NEW     Exam-tag filter row — UPSC Prelims, UPSC GS1–4, NEET, JEE, CLAT,
 *         GATE, CAT, SSC — appears when profession is "upsc" or "student",
 *         or when the user clicks "📚 Exams" on the filter bar.
 *
 * REMOVE  Sidebar.js is no longer needed as a standalone component on the
 *         homepage. It is kept for pages that embed it directly (e.g. archive).
 */

import { useState, useEffect, useRef } from "react";
import UserMenu from "../auth/UserMenu";
import { DarkModeToggle, FontSizeControls, useTheme } from "../ui/ThemeProvider";
import { LanguageSelector } from "../ui/LanguageSelector";
import { DOMAINS, DOMAIN_LABELS, INDIAN_STATES, getDomainIcon } from "../../lib/constants";
import PushNotificationBell from "../features/PushNotifications";

const API = "";

export default function Header({
  profession, setProfession,
  depth, setDepth,
  domain, setDomain,
  state, setState,
  district, setDistrict,
  onSearch, searchActive, onClearSearch,
}) {
  const { dark } = useTheme();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [districtOptionsLive, setDistrictOptionsLive] = useState([]);
  const drawerRef = useRef(null);

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

  // Close mobile drawer on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  const handleSearch = (e) => { e.preventDefault(); onSearch(q); };

  const C = {
    bg:      "var(--bg)",
    bg2:     "var(--bg2)",
    bg3:     "var(--bg3)",
    border:  "var(--border)",
    border2: "var(--border2)",
    text1:   "var(--text1)",
    text2:   "var(--text2)",
    text3:   "var(--text3)",
    accent:  "var(--accent)",
    shadow:  "var(--shadow)",
    accentBg: dark ? "#1e3a5f33" : "#eff6ff",
  };

  // ── Reusable pill button ─────────────────────────────────────────────────
  const Pill = ({ active, onClick, children, title }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "5px 11px",
        borderRadius: 20,
        border: active ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
        background: active ? C.accentBg : "transparent",
        color: active ? C.accent : C.text2,
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all .15s",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );

  // ── Horizontal scroll strip ──────────────────────────────────────────────
  const Strip = ({ children, label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto",
                  scrollbarWidth: "none", paddingBottom: 1 }}>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                       letterSpacing: "0.08em", textTransform: "uppercase",
                       flexShrink: 0, paddingRight: 4 }}>
          {label}
        </span>
      )}
      {children}
    </div>
  );

  // ── Domain strip ─────────────────────────────────────────────────────────
  const DomainStrip = () => (
    <Strip label="Section">
      {DOMAINS.map(d => (
        <Pill key={d} active={domain === d} onClick={() => setDomain(d)}>
          <span>{getDomainIcon(d === "All" ? "general" : d)}</span>
          <span>{d === "All" ? "All" : (DOMAIN_LABELS[d]?.label || d)}</span>
        </Pill>
      ))}
    </Strip>
  );

  // ── Location pickers (compact inline) ───────────────────────────────────
  const LocationPickers = ({ compact = false }) => {
    const { INDIA_DISTRICTS } = require("../../lib/districts");
    const fallbackDistricts = state !== "All States" ? (INDIA_DISTRICTS[state] || []) : [];
    const districtOptions = districtOptionsLive.length > 0 ? districtOptionsLive : fallbackDistricts;
    const selectStyle = {
      padding: compact ? "5px 8px" : "7px 10px",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      fontSize: compact ? 12 : 13,
      background: C.bg2,
      color: C.text1,
      cursor: "pointer",
      outline: "none",
      flexShrink: 0,
    };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                       letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Location
        </span>
        <select value={state} onChange={e => { setState(e.target.value); setDistrict("All Districts"); }}
          style={selectStyle}>
          {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={district} onChange={e => setDistrict(e.target.value)}
          disabled={state === "All States"}
          style={{ ...selectStyle, opacity: state === "All States" ? 0.55 : 1,
                   cursor: state === "All States" ? "not-allowed" : "pointer" }}>
          <option>All Districts</option>
          {districtOptions.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>
    );
  };

  // ── Depth toggle ─────────────────────────────────────────────────────────
  const DepthToggle = () => (
    <div style={{ display: "flex", background: C.bg3, borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
      {[["headline","Headline"],["brief","Brief"],["deep","Deep"]].map(([d, l]) => (
        <button key={d} onClick={() => setDepth(d)} style={{
          padding: "5px 10px", borderRadius: 8, border: "none",
          cursor: "pointer", fontSize: 11,
          fontWeight: depth === d ? 600 : 400,
          background: depth === d ? C.bg2 : "transparent",
          color: depth === d ? C.accent : C.text2,
          boxShadow: depth === d ? `0 1px 3px ${C.shadow}` : "none",
          transition: "all .15s",
        }}>{l}</button>
      ))}
    </div>
  );

  // ── Quick nav links (shown in mobile drawer) ─────────────────────────────
  const QuickLinks = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {[
        { href: "/archive",       icon: "📅", label: "Date Archive" },
        { href: "/live",          icon: "🔴", label: "Live Blog" },
        { href: "/parliament",    icon: "🏛️", label: "Parliament Tracker" },
        { href: "/search",        icon: "🔍", label: "Advanced Search" },
        { href: "/morning-brief", icon: "☀️", label: "Morning Brief" },
        { href: "/trending",      icon: "🔥", label: "Trending" },
        { href: "/quarantine",    icon: "⚠️", label: "Quarantine" },
        { href: "/government",    icon: "🏦", label: "Government" },
        { href: "/flashcards",    icon: "🃏", label: "Flashcards" },
        { href: "/saves",         icon: "🔖", label: "Saved Articles" },
        { href: "/settings",      icon: "⚙️", label: "Settings" },
      ].map(item => (
        <a key={item.href} href={item.href} style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, color: C.text2,
          textDecoration: "none", padding: "7px 8px",
          borderRadius: 8, transition: "all .1s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bg3; e.currentTarget.style.color = C.text1; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.text2; }}>
          <span style={{ fontSize: 14 }}>{item.icon}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );

  // ── Truth score legend ───────────────────────────────────────────────────
  const TruthLegend = () => (
    <div style={{
      marginTop: 8, padding: "10px 12px",
      background: dark ? "#1e3a5f22" : "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: 10, fontSize: 12, color: C.text2, lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 700, color: C.accent, marginBottom: 6, fontSize: 12 }}>
        ℹ️ Truth Score
      </div>
      {[
        ["75+", "#dcfce7", "#166534", "Verified"],
        ["50–74", "#fef3c7", "#92400e", "Verified"],
        ["<50", "#fee2e2", "#991b1b", "Unverified"],
      ].map(([range, bg, color, label]) => (
        <div key={range} style={{ marginBottom: 3 }}>
          <span style={{ background: bg, color, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>
            {range}
          </span>{" "}{label}
        </div>
      ))}
    </div>
  );

  return (
    <header suppressHydrationWarning style={{
      background: C.bg2,
      borderBottom: `1px solid ${C.border}`,
      position: "sticky", top: 0, zIndex: 100,
      boxShadow: `0 1px 4px ${C.shadow}`,
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 1rem" }}>

        {/* ══ TOP BAR ════════════════════════════════════════════════════ */}
        <div style={{
          display: "flex", alignItems: "center",
          gap: "0.6rem", height: 56,
        }}>
          {/* Logo */}
          <a href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: C.accent, letterSpacing: -1 }}>धारा</span>
            <span style={{ fontSize: 13, color: "var(--accent2)", fontWeight: 600, marginLeft: 5 }}>NEWS</span>
          </a>

          {/* Desktop search */}
          <form onSubmit={handleSearch}
            className="header-search"
            style={{ flex: 1, maxWidth: 480, display: "flex", gap: 6 }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search news, topics, people..."
              style={{
                flex: 1, padding: "8px 14px",
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontSize: 14, outline: "none",
                background: C.bg3, color: C.text1,
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
            />
            <button type="submit" style={{
              padding: "8px 14px", background: C.accent, color: "#fff",
              border: "none", borderRadius: 10, fontSize: 13,
              cursor: "pointer", fontWeight: 500, flexShrink: 0,
            }}>Search</button>
            {searchActive && (
              <button type="button" onClick={() => { onClearSearch(); setQ(""); }}
                style={{
                  padding: "8px 10px", background: C.bg3,
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  fontSize: 13, cursor: "pointer", color: C.text2, flexShrink: 0,
                }}>✕</button>
            )}
          </form>

          {/* Right controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
            {/* Mobile search */}
            <button className="mobile-search-btn"
              onClick={() => setMobileSearch(s => !s)}
              title="Search"
              style={{
                display: "none",
                width: 34, height: 34, borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg2,
                cursor: "pointer", fontSize: 15,
                alignItems: "center", justifyContent: "center",
              }}>🔍</button>

            {/* Depth toggle (hidden on mobile) */}
            <div className="header-depth-toggle">
              <DepthToggle />
            </div>

            <PushNotificationBell profession={profession} />

            <button onClick={() => setShowControls(s => !s)} title="Display settings"
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg2,
                cursor: "pointer", fontSize: 15,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>⚙</button>

            <span suppressHydrationWarning style={{ display: "contents" }}>
              <DarkModeToggle />
              <LanguageSelector />
              <UserMenu />
            </span>

            {/* Hamburger (mobile) */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(s => !s)}
              title="Menu"
              aria-label="Open navigation menu"
              style={{
                display: "none",
                width: 34, height: 34, borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg2,
                cursor: "pointer", fontSize: 18,
                alignItems: "center", justifyContent: "center",
              }}>☰</button>
          </div>
        </div>

        {/* Mobile expanded search */}
        {mobileSearch && (
          <form onSubmit={e => { handleSearch(e); setMobileSearch(false); }}
            style={{ padding: "8px 0", display: "flex", gap: 6, borderTop: `1px solid ${C.border}` }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search news..."
              style={{
                flex: 1, padding: "9px 14px",
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontSize: 14, outline: "none",
                background: C.bg3, color: C.text1,
              }} />
            <button type="submit" style={{
              padding: "9px 14px", background: C.accent, color: "#fff",
              border: "none", borderRadius: 10, fontSize: 13,
              cursor: "pointer", fontWeight: 500,
            }}>Go</button>
          </form>
        )}

        {/* Display controls dropdown */}
        {showControls && (
          <div style={{
            padding: "10px 0 12px",
            borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <FontSizeControls />
          </div>
        )}

        {/* Top filter row removed: filters now live in sidebar/drawer only. */}
      </div>

      {/* ══ MOBILE DRAWER ═════════════════════════════════════════════════ */}
      {mobileOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.45)",
        }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            ref={drawerRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: 0,
              width: "min(320px, 88vw)",
              height: "100vh",
              background: C.bg2,
              boxShadow: "4px 0 24px rgba(0,0,0,0.18)",
              overflowY: "auto",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "slideInLeft 0.22s ease",
            }}
          >
            {/* Drawer header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <a href="/" style={{ textDecoration: "none" }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>धारा</span>
                <span style={{ fontSize: 12, color: "var(--accent2)", fontWeight: 600, marginLeft: 4 }}>NEWS</span>
              </a>
              <button onClick={() => setMobileOpen(false)}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.bg3,
                  cursor: "pointer", fontSize: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>✕</button>
            </div>

            {/* Depth */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px" }}>
                Reading Depth
              </p>
              <DepthToggle />
            </div>

            {/* Domain */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px" }}>
                Section
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {DOMAINS.map(d => (
                  <button key={d} onClick={() => { setDomain(d); setMobileOpen(false); }}
                    style={{
                      padding: "7px 10px", borderRadius: 8, border: "none",
                      cursor: "pointer", fontSize: 13, textAlign: "left",
                      fontWeight: domain === d ? 600 : 400,
                      background: domain === d ? C.accentBg : "transparent",
                      color: domain === d ? C.accent : C.text2,
                      display: "flex", alignItems: "center", gap: 7,
                      transition: "all .1s",
                    }}
                    onMouseEnter={e => { if (domain !== d) e.currentTarget.style.background = C.bg3; }}
                    onMouseLeave={e => { if (domain !== d) e.currentTarget.style.background = "transparent"; }}>
                    <span>{DOMAIN_ICONS[d] || "📰"}</span>
                    <span>{d === "All" ? "All Domains" : (DOMAIN_LABELS[d]?.label || d)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px" }}>
                Location
              </p>
              <LocationPickers />
            </div>

            {/* Quick links */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.text3,
                          letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px" }}>
                Navigate
              </p>
              <QuickLinks />
            </div>

            <TruthLegend />
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @media (max-width: 768px) {
          .header-search        { display: none !important; }
          .header-depth-toggle  { display: none !important; }
          .header-filter-row    { display: none !important; }
          .mobile-search-btn    { display: flex !important; }
          .mobile-menu-btn      { display: flex !important; }
        }
        .header-filter-row::-webkit-scrollbar { display: none; }
      `}</style>
    </header>
  );
}
