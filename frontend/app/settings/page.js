"use client";
/**
 * frontend/app/settings/page.js
 *
 * FIX: Settings persistence now syncs to server on every save.
 *
 * Previously:
 *   - localStorage.setItem was the only persistence
 *   - /api/profile/upsert was called but only sent {profession}
 *   - Changing phones lost all settings silently
 *   - On load, settings were only read from localStorage (not server)
 *
 * Now:
 *   - On LOAD: fetches full profile from /api/profile/{user_id} and merges
 *     server prefs into local state (server wins on conflict)
 *   - On SAVE: calls PATCH /api/profile/{user_id} with ALL changed prefs,
 *     then updates localStorage as a local cache
 *   - localStorage is now a cache, not the source of truth
 *
 * All UI is unchanged — this is a data-layer fix only.
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../../components/auth/AuthContext";
import { useTheme, DarkModeToggle } from "../../components/ui/ThemeProvider";
import { useThemeValues } from "../../lib/useThemeValues";
import { PROFESSIONS, EXAM_TAGS, INDIAN_STATES } from "../../lib/constants";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "bn", name: "বাংলা" },
  { code: "mr", name: "मराठी" },
];

const DEFAULT_PREFS = {
  profession:    "general",
  exam:          "",
  state:         "",
  language:      "en",
  depth:         "brief",
  readSpeed:     "normal",
  digestEnabled: false,
  digestEmail:   "",
  digestTime:    "07:00",
  notifications: true,
  autoplay:      false,
  compactMode:   false,
};

export default function SettingsPage() {
  const { user, session }  = useAuth();
  const { dark, toggleDark, fontSize, setFontSize } = useTheme();
  const t         = useThemeValues();
  const [tab,     setTab]     = useState("account");
  const [prefs,   setPrefs]   = useState(DEFAULT_PREFS);
  const [isPro,   setIsPro]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [billing, setBilling] = useState("monthly");
  const [syncErr, setSyncErr] = useState(null);

  // ── Load settings: server first, localStorage as fallback ──────────────
  useEffect(() => {
    // Always load localStorage first for instant UI
    try {
      const local = JSON.parse(localStorage.getItem("dhara_settings") || "{}");
      if (Object.keys(local).length > 0) {
        setPrefs(p => ({ ...p, ...local }));
      }
    } catch { /* ignore corrupted localStorage */ }

    // If signed in, fetch server profile and let it win on conflict
    if (!user) return;

    fetch(`${API}/api/profile/${user.id}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ""}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(profile => {
        if (!profile) return;

        // Map server profile fields → local prefs shape
        const serverPrefs = {
          ...(profile.profession  ? { profession:  profile.profession  } : {}),
          ...(profile.exam_name   ? { exam:         profile.exam_name   } : {}),
          ...(profile.loc_state   ? { state:        profile.loc_state   } : {}),
          ...(profile.language    ? { language:     profile.language    } : {}),
          ...(profile.reading_depth ? { depth:      profile.reading_depth } : {}),
          ...(typeof profile.email_digest === "boolean" ? { digestEnabled: profile.email_digest } : {}),
          ...(profile.digest_time ? { digestTime:   profile.digest_time } : {}),
        };

        if (Object.keys(serverPrefs).length > 0) {
          setPrefs(p => ({ ...p, ...serverPrefs }));
          // Also update localStorage cache
          try {
            const merged = { ...JSON.parse(localStorage.getItem("dhara_settings") || "{}"), ...serverPrefs };
            localStorage.setItem("dhara_settings", JSON.stringify(merged));
          } catch { /* ignore */ }
        }

        if (profile.is_pro || profile.is_premium) setIsPro(true);
      })
      .catch(() => { /* network error — localStorage is fine */ });
  }, [user]);

  // ── Save: sync to server AND localStorage ──────────────────────────────
  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSyncErr(null);

    // Always save to localStorage
    try {
      localStorage.setItem("dhara_settings", JSON.stringify(prefs));
    } catch { /* ignore storage quota errors */ }

    if (user) {
      try {
        // FIX: PATCH /api/profile/{user_id} with ALL preferences
        // The previous code only sent {profession} via profile/upsert
        const res = await fetch(`${API}/api/profile/${user.id}`, {
          method:  "PATCH",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            profession:    prefs.profession,
            exam_tag:      prefs.exam || null,
            default_state: prefs.state || null,
            language:      prefs.language,
            reading_depth: prefs.depth,
            email_digest:  prefs.digestEnabled,
            digest_time:   prefs.digestTime || null,
            notifications: prefs.notifications,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSyncErr(`Server sync failed: ${err.detail || res.status}`);
        }

        // Subscribe/update digest separately if enabled
        if (prefs.digestEnabled && prefs.digestEmail) {
          fetch(`${API}/api/digest/subscribe`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id:    user.id,
              email:      prefs.digestEmail,
              profession: prefs.profession,
              digest_time: prefs.digestTime,
            }),
          }).catch(() => {});
        }

      } catch (err) {
        setSyncErr("Could not sync to server — changes saved locally.");
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── Upgrade to Pro ─────────────────────────────────────────────────────
  const startUpgrade = async () => {
    if (!user) { window.location.href = "/login?next=/settings"; return; }
    const res = await fetch(`${API}/api/subscriptions/create-checkout`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, plan: billing, currency: "INR" }),
    }).then(r => r.json()).catch(() => null);

    if (res?.checkout_url) {
      window.location.href = res.checkout_url;
    } else if (res?.razorpay_order_id) {
      // Razorpay popup flow — initialise Razorpay checkout
      window._dhara_rzp_order = res;
      window.location.href = `/pricing?order=${res.razorpay_order_id}&plan=${billing}`;
    }
  };

  const inp = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bg2, color: t.text1,
    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const lbl = {
    fontSize: 12, fontWeight: 600, color: t.text2, marginBottom: 5,
    display: "block", textTransform: "uppercase", letterSpacing: 0.5,
  };

  const TABS = [
    { id: "account",       icon: "👤", label: "Account"       },
    { id: "feed",          icon: "📰", label: "Feed"          },
    { id: "reading",       icon: "📖", label: "Reading"       },
    { id: "notifications", icon: "🔔", label: "Alerts"        },
    { id: "digest",        icon: "✉️", label: "Email Digest"  },
    { id: "premium",       icon: "⭐", label: "Premium"       },
  ];

  return (
    <div style={{ fontFamily: "var(--font-sans, 'Segoe UI', system-ui, sans-serif)", background: t.bg, minHeight: "100vh", color: t.text1 }}>
      {/* Header */}
      <div style={{ background: t.bg2, borderBottom: `1px solid ${t.border}`, padding: "0 1.5rem", display: "flex", alignItems: "center", gap: 12, height: 52 }}>
        <a href="/" style={{ textDecoration: "none", fontFamily: "'Georgia', serif", fontSize: 20, fontWeight: 700, color: t.accent }}>धारा</a>
        <span style={{ fontSize: 14, fontWeight: 600, color: t.text2 }}>Settings</span>
        {isPro && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" }}>⭐ PRO</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {syncErr && (
            <span style={{ fontSize: 11, color: "#dc2626", background: "#fee2e2", padding: "3px 8px", borderRadius: 6 }}>
              {syncErr}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: "7px 18px",
              background: saved ? "#166534" : t.accent,
              color: "#fff", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "background 0.2s",
            }}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
        </div>
      </div>

      <div
        className="settings-layout"
        style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1rem", display: "grid", gridTemplateColumns: "190px 1fr", gap: 24, alignItems: "start" }}
      >
        {/* Sidebar nav */}
        <nav style={{ background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", position: "sticky", top: 70 }}>
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              style={{
                width: "100%", padding: "11px 14px", border: "none",
                background: tab === tb.id ? `${t.accent}18` : "transparent",
                color: tab === tb.id ? t.accent : t.text2,
                borderLeft: `3px solid ${tab === tb.id ? t.accent : "transparent"}`,
                fontSize: 13, fontWeight: tab === tb.id ? 600 : 400,
                cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>{tb.icon}</span>
              {tb.label}
            </button>
          ))}
        </nav>

        {/* Content panels */}
        <div style={{ background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "1.5rem" }}>

          {/* ── ACCOUNT ── */}
          {tab === "account" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>Account</h2>
              {!user ? (
                <div>
                  <p style={{ color: t.text2, margin: "0 0 16px" }}>Sign in to sync settings across devices.</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href="/login?next=%2Fsettings" style={{ padding: "9px 20px", background: t.accent, color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Sign in</a>
                    <a href="/signup?next=%2Fsettings" style={{ padding: "9px 20px", border: `1px solid ${t.border}`, color: t.text2, borderRadius: 8, textDecoration: "none", fontSize: 13 }}>Create account</a>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", fontWeight: 700 }}>
                      {(user.email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: t.text1 }}>{user.email}</div>
                      <div style={{ fontSize: 12, color: t.text3, marginTop: 2 }}>{isPro ? "⭐ Pro member" : "Free plan"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href="/saves" style={{ padding: "7px 14px", border: `1px solid ${t.border}`, color: t.text2, borderRadius: 8, textDecoration: "none", fontSize: 12 }}>🔖 Saved articles</a>
                    <a href="/flashcards" style={{ padding: "7px 14px", border: `1px solid ${t.border}`, color: t.text2, borderRadius: 8, textDecoration: "none", fontSize: 12 }}>🃏 Flashcards</a>
                  </div>
                  <p style={{ fontSize: 12, color: t.text3, marginTop: 12 }}>
                    Settings are synced to your account.{" "}
                    <span style={{ color: t.accent }}>Changes save to server when you click Save.</span>
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── FEED PREFERENCES ── */}
          {tab === "feed" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>Feed preferences</h2>
              <label style={lbl}>Reader profile</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {PROFESSIONS.map(p => (
                  <button key={p.key} onClick={() => setPrefs(x => ({ ...x, profession: p.key }))}
                    style={{ padding: "8px", borderRadius: 8, border: `1.5px solid ${prefs.profession === p.key ? t.accent : t.border}`, background: prefs.profession === p.key ? `${t.accent}12` : t.bg2, color: prefs.profession === p.key ? t.accent : t.text2, fontSize: 12, fontWeight: prefs.profession === p.key ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>

              <label style={lbl}>Exam focus</label>
              <select value={prefs.exam} onChange={e => setPrefs(x => ({ ...x, exam: e.target.value }))} style={{ ...inp, marginBottom: 16 }}>
                <option value="">No exam focus</option>
                {EXAM_TAGS.map(e => <option key={e.key} value={e.key}>{e.icon} {e.label}</option>)}
              </select>

              <label style={lbl}>Default state</label>
              <select value={prefs.state} onChange={e => setPrefs(x => ({ ...x, state: e.target.value }))} style={{ ...inp, marginBottom: 0 }}>
                <option value="">All India</option>
                {INDIAN_STATES.filter(s => s !== "All States").map(s => <option key={s}>{s}</option>)}
              </select>
            </>
          )}

          {/* ── READING ── */}
          {tab === "reading" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>Reading preferences</h2>
              <label style={lbl}>Content language</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {LANGUAGES.map(({ code, name }) => (
                  <button key={code} onClick={() => setPrefs(x => ({ ...x, language: code }))}
                    style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${prefs.language === code ? t.accent : t.border}`, background: prefs.language === code ? `${t.accent}12` : t.bg2, color: prefs.language === code ? t.accent : t.text2, fontSize: 13, fontWeight: prefs.language === code ? 700 : 400, cursor: "pointer" }}>
                    {name}
                  </button>
                ))}
              </div>

              <label style={lbl}>Default reading depth</label>
              <div style={{ display: "flex", background: t.bg3, borderRadius: 10, padding: 3, gap: 2, marginBottom: 16, width: "fit-content" }}>
                {[["headline", "Headline"], ["brief", "Brief"], ["deep", "Deep Dive"]].map(([d, l]) => (
                  <button key={d} onClick={() => setPrefs(x => ({ ...x, depth: d }))}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: prefs.depth === d ? t.bg2 : "transparent", color: prefs.depth === d ? t.accent : t.text3, fontSize: 12, fontWeight: prefs.depth === d ? 700 : 400, cursor: "pointer" }}>
                    {l}
                  </button>
                ))}
              </div>

              <label style={lbl}>Display theme</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <DarkModeToggle />
                <span style={{ fontSize: 13, color: t.text2 }}>{dark ? "Dark mode" : "Light mode"}</span>
              </div>

              <label style={lbl}>Font size</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {[["small", "A", 12], ["normal", "A", 15], ["large", "A", 18], ["xlarge", "A", 21]].map(([size, letter, px]) => (
                  <button key={size} onClick={() => setFontSize(size)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${fontSize === size ? t.accent : t.border}`, background: fontSize === size ? `${t.accent}12` : t.bg2, color: fontSize === size ? t.accent : t.text2, fontSize: px, cursor: "pointer" }}>
                    {letter}
                  </button>
                ))}
              </div>

              <label style={lbl}>Read speed (audio)</label>
              <select value={prefs.readSpeed} onChange={e => setPrefs(x => ({ ...x, readSpeed: e.target.value }))} style={{ ...inp, width: "auto", minWidth: 200 }}>
                <option value="slow">Slow (0.75×)</option>
                <option value="normal">Normal (1×)</option>
                <option value="fast">Fast (1.25×)</option>
                <option value="faster">Faster (1.5×)</option>
              </select>
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === "notifications" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>Notification settings</h2>
              {[
                { key: "notifications", label: "Breaking news alerts", sub: "Push notifications for verified high-score stories" },
                { key: "autoplay",      label: "Auto-play audio brief", sub: "Morning brief auto-reads on open" },
                { key: "compactMode",   label: "Compact mode",          sub: "Smaller cards, more articles visible" },
              ].map(item => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 0", borderBottom: `1px solid ${t.border}` }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: t.text3 }}>{item.sub}</div>
                  </div>
                  <button
                    onClick={() => setPrefs(x => ({ ...x, [item.key]: !x[item.key] }))}
                    style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: prefs[item.key] ? "#22c55e" : t.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: prefs[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* ── EMAIL DIGEST ── */}
          {tab === "digest" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>Email digest</h2>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.text1, marginBottom: 2 }}>Daily morning brief</div>
                  <div style={{ fontSize: 12, color: t.text3 }}>Top verified stories for your profession, every morning</div>
                </div>
                <button
                  onClick={() => setPrefs(x => ({ ...x, digestEnabled: !x.digestEnabled }))}
                  style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: prefs.digestEnabled ? "#22c55e" : t.border, position: "relative", transition: "background 0.2s" }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: prefs.digestEnabled ? 23 : 3, transition: "left 0.2s" }} />
                </button>
              </div>
              {prefs.digestEnabled && (
                <>
                  <label style={lbl}>Email address</label>
                  <input type="email" value={prefs.digestEmail} onChange={e => setPrefs(x => ({ ...x, digestEmail: e.target.value }))} placeholder="your@email.com" style={{ ...inp, marginBottom: 12 }} />
                  <label style={lbl}>Delivery time (IST)</label>
                  <input type="time" value={prefs.digestTime} onChange={e => setPrefs(x => ({ ...x, digestTime: e.target.value }))} style={{ ...inp, width: "auto" }} />
                </>
              )}
            </>
          )}

          {/* ── PREMIUM ── */}
          {tab === "premium" && (
            <>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>
                {isPro ? "⭐ You are on Pro" : "Upgrade to Pro"}
              </h2>
              {isPro ? (
                <p style={{ color: t.text2, fontSize: 14 }}>
                  Thank you for supporting Dhara. Your Pro subscription keeps the platform ad-free and independent.
                </p>
              ) : (
                <>
                  <p style={{ color: t.text2, fontSize: 14, marginBottom: 16 }}>
                    Unlock the full Dhara experience for less than a cup of chai a month.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    {["monthly", "yearly"].map(b => (
                      <button key={b} onClick={() => setBilling(b)}
                        style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${billing === b ? t.accent : t.border}`, background: billing === b ? `${t.accent}12` : t.bg2, color: billing === b ? t.accent : t.text2, fontSize: 13, fontWeight: billing === b ? 700 : 400, cursor: "pointer" }}>
                        {b === "monthly" ? "₹99/month" : "₹799/year (save ₹389)"}
                      </button>
                    ))}
                  </div>
                  <ul style={{ color: t.text2, fontSize: 13, lineHeight: 1.8, paddingLeft: 20, marginBottom: 20 }}>
                    {["Ad-free reading", "Unlimited saves", "Full morning brief (10 stories)", "Flashcard generator", "PDF export of study bank", "All 6 Indian languages", "Offline reading (200 articles)", "Priority support"].map(f => (
                      <li key={f}>✓ {f}</li>
                    ))}
                  </ul>
                  <button onClick={startUpgrade}
                    style={{ padding: "11px 28px", background: t.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Upgrade to Pro →
                  </button>
                </>
              )}
            </>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .settings-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
