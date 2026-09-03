"use client";
import React from "react";

const LANGUAGES = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi",   native: "हिन्दी",   flag: "🇮🇳" },
  { code: "ta", label: "Tamil",   native: "தமிழ்",    flag: "🇮🇳" },
  { code: "te", label: "Telugu",  native: "తెలుగు",   flag: "🇮🇳" },
  { code: "bn", label: "Bengali", native: "বাংলা",    flag: "🇮🇳" },
  { code: "mr", label: "Marathi", native: "मराठी",    flag: "🇮🇳" },
];
const READY_LANGS = new Set(["en", "hi"]);

const LangCtx = React.createContext({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = React.useState("en");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("dhara_lang") || "en";
      setLangState(saved);
    } catch {}
  }, []);

  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem("dhara_lang", l); } catch {}
  };

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() { return React.useContext(LangCtx); }

export function LanguageSelector() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    // suppressHydrationWarning: current.flag/native may differ after lang loads from localStorage
    <div ref={ref} suppressHydrationWarning style={{ position: "relative", flexShrink: 0 }}>
      <button suppressHydrationWarning
        onClick={() => setOpen(o => !o)}
        title="Change language"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "5px 9px", border: "1px solid var(--border)",
          borderRadius: 8, background: "var(--bg2)",
          fontSize: 12, color: "var(--text2)",
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        <span>{current.flag}</span>
        <span style={{ fontSize: 9, color: "var(--text3)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)",
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 8px 24px var(--shadow-md)",
          minWidth: 160, zIndex: 300, overflow: "hidden",
        }}>
          {LANGUAGES.map(l => (
            <button key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", border: "none",
                background: lang === l.code ? "var(--bg3)" : "transparent",
                color: "var(--text1)", fontSize: 13,
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
              onMouseLeave={e => e.currentTarget.style.background = lang === l.code ? "var(--bg3)" : "transparent"}>
              <span style={{ fontSize: 16 }}>{l.flag}</span>
              <div>
                <div style={{ fontWeight: lang === l.code ? 600 : 400 }}>{l.native}</div>
                {!READY_LANGS.has(l.code) && (
                  <div style={{ fontSize: 10, color: "var(--text3)" }}>Limited translations</div>
                )}
              </div>
              {lang === l.code && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
            </button>
          ))}
          <div style={{
            padding: "8px 14px", borderTop: "1px solid var(--border)",
            fontSize: 11, color: "var(--text3)", lineHeight: 1.4,
          }}>
            Regional translations may be limited
          </div>
        </div>
      )}
    </div>
  );
}

export function useTranslation(article, field) {
  const { lang } = useLang();
  if (!article) return "";
  if (lang === "en") {
    if (field === "headline") return article.headline || "";
    if (field === "brief")    return article.summary_brief || "";
    if (field === "deep")     return article.summary_deep || "";
    return "";
  }
  const t = article.translations?.[lang];
  if (!t) {
    if (field === "headline") return article.headline || "";
    if (field === "brief")    return article.summary_brief || "";
    if (field === "deep")     return article.summary_deep || "";
    return "";
  }
  if (field === "headline") return t.headline || article.headline || "";
  if (field === "brief")    return t.summary  || article.summary_brief || "";
  if (field === "deep")     return t.deep     || article.summary_deep  || "";
  return "";
}
