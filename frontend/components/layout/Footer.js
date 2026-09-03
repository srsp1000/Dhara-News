"use client";
// Footer.js — BBC-quality site footer
import { useThemeValues } from "../../lib/useThemeValues";

const FOOTER_LINKS = [
  {
    heading: "Dhara",
    links: [
      { href:"/about",     label:"About us" },
      { href:"/pricing",   label:"Pricing" },
      { href:"/contact",   label:"Contact us" },
      { href:"/settings",  label:"Settings" },
      { href:"/live",      label:"Live Blog" },
      { href:"/parliament",label:"Parliament Tracker" },
    ],
  },
  {
    heading: "Study",
    links: [
      { href:"/flashcards",    label:"Flashcards" },
      { href:"/morning-brief", label:"Morning Brief" },
      { href:"/saves",         label:"Saved Articles" },
      { href:"/archive",       label:"Date Archive" },
      { href:"/search",        label:"Advanced Search" },
    ],
  },
  {
    heading: "Sections",
    links: [
      { href:"/section/politics",     label:"Politics" },
      { href:"/section/economy",      label:"Economy" },
      { href:"/section/judiciary",    label:"Courts" },
      { href:"/section/technology",   label:"Technology" },
      { href:"/section/international",label:"World" },
      { href:"/section/health",       label:"Health" },
      { href:"/section/sports",       label:"Sports" },
      { href:"/section/science",      label:"Science" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href:"/privacy", label:"Privacy policy" },
      { href:"/terms",   label:"Terms of use" },
      { href:"/about",   label:"About & standards" },
      { href:"/contact", label:"Contact us" },
      { href:"/settings?tab=premium", label:"Upgrade to Pro" },
    ],
  },
];

export default function Footer() {
  const t = useThemeValues();

  return (
    <footer suppressHydrationWarning style={{
      background: t.bg2,
      borderTop: `3px solid var(--accent, #1e3a5f)`,
      marginTop: "auto",
    }}>
      {/* Main footer body */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "3rem 1.5rem 2rem",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
          gap: "2.5rem",
        }}>
          {/* Brand column */}
          <div>
            <a href="/" style={{
              textDecoration: "none",
              display: "flex", alignItems: "baseline", gap: 8,
              marginBottom: 16,
            }}>
              <span style={{
                fontFamily: "'Georgia','Times New Roman',serif",
                fontSize: 28, fontWeight: 700, color: t.accent,
                letterSpacing: -0.5,
              }}>धारा</span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 2,
                color: t.text3, textTransform: "uppercase",
              }}>NEWS</span>
            </a>
            <p style={{
              fontSize: 13, color: t.text2, lineHeight: 1.7, margin: "0 0 16px",
              maxWidth: 240,
            }}>
              India's most intelligent news platform. AI-verified news with Truth Scores, personalised for 12 professions.
            </p>
            <div style={{ fontSize: 12, color: t.text3, marginBottom: 8 }}>
              🔍 Verified · 🏛️ Parliament · 🃏 Study
            </div>
            {/* Social links */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {[
                { href: "https://twitter.com/dharanews", label: "𝕏" },
                { href: "https://wa.me/dharanews",       label: "W" },
                { href: "https://t.me/dharanews",        label: "✈" },
              ].map(s => (
                <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, color: t.text2, textDecoration: "none",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.text2; }}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.slice(0).map(col => (
            <div key={col.heading}>
              <h4 style={{
                fontSize: 11, fontWeight: 700, color: t.text1,
                textTransform: "uppercase", letterSpacing: 1,
                margin: "0 0 14px",
              }}>{col.heading}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map(link => (
                  <a key={link.href} href={link.href}
                    style={{
                      fontSize: 13, color: t.text2, textDecoration: "none",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = t.accent}
                    onMouseLeave={e => e.currentTarget.style.color = t.text2}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        borderTop: `1px solid ${t.border}`,
        padding: "1rem 1.5rem",
        background: t.bg,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontSize: 12, color: t.text3 }}>
            © {new Date().getFullYear()} Dhara News. All rights reserved. AI-synthesised from verified public sources.
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: t.text3 }}>
            <a href="/privacy" style={{ color: t.text3, textDecoration: "none" }}>Privacy</a>
            <a href="/terms"   style={{ color: t.text3, textDecoration: "none" }}>Terms</a>
            <span>Built in India 🇮🇳</span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          footer > div:first-child > div {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 500px) {
          footer > div:first-child > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
