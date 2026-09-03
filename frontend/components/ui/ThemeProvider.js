"use client";
import { createContext, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext({
  dark: false, toggleDark: () => {},
  fontSize: "md", setFontSize: () => {},
});

export function ThemeProvider({ children }) {
  const [dark,     setDark]     = useState(false);
  const [fontSize, setFontSize] = useState("md");
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("dhara_theme");
      if (saved) {
        const p = JSON.parse(saved);
        setDark(p.dark ?? false);
        setFontSize(p.fontSize ?? "md");
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setDark(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    if (dark) {
      root.style.setProperty("--bg",      "#121212");
      root.style.setProperty("--bg2",     "#1a1a1a");
      root.style.setProperty("--bg3",     "#232323");
      root.style.setProperty("--text1",   "#f2f2f2");
      root.style.setProperty("--text2",   "#c9c9c9");
      root.style.setProperty("--text3",   "#9b9b9b");
      root.style.setProperty("--border",  "#303030");
      root.style.setProperty("--border2", "#262626");
      root.style.setProperty("--accent",  "#bb1919");
      root.style.setProperty("--accent2", "#e04b4b");
      root.style.setProperty("--shadow",  "rgba(0,0,0,0.45)");
      root.style.setProperty("--shadow-md","rgba(0,0,0,0.55)");
      document.body.style.background = "#121212";
      document.body.style.color      = "#f2f2f2";
    } else {
      root.style.setProperty("--bg",      "#f1f5f9");
      root.style.setProperty("--bg2",     "#ffffff");
      root.style.setProperty("--bg3",     "#f8fafc");
      root.style.setProperty("--text1",   "#1e293b");
      root.style.setProperty("--text2",   "#475569");
      root.style.setProperty("--text3",   "#94a3b8");
      root.style.setProperty("--border",  "#e2e8f0");
      root.style.setProperty("--border2", "#f1f5f9");
      root.style.setProperty("--accent",  "#1e3a5f");
      root.style.setProperty("--accent2", "#0f7b6c");
      root.style.setProperty("--shadow",  "rgba(0,0,0,0.06)");
      root.style.setProperty("--shadow-md","rgba(0,0,0,0.10)");
      document.body.style.background = "#f1f5f9";
      document.body.style.color      = "#1e293b";
    }
    const sizes = { sm: "13px", md: "15px", lg: "17px", xl: "19px" };
    root.style.setProperty("--reader-size", sizes[fontSize] || "15px");
    try {
      localStorage.setItem("dhara_theme", JSON.stringify({ dark, fontSize }));
    } catch {}
  }, [dark, fontSize, mounted]);

  return (
    <ThemeCtx.Provider value={{ dark, toggleDark: () => setDark(d => !d), fontSize, setFontSize }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() { return useContext(ThemeCtx); }

// suppressHydrationWarning: icon changes after mount (🌙 → ☀️), that's intentional.
export function DarkModeToggle() {
  const { dark, toggleDark } = useTheme();
  return (
    <button suppressHydrationWarning
      onClick={toggleDark}
      title="Toggle dark mode"
      style={{
        width: 34, height: 34, borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg2)",
        color: "var(--text1)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      }}>
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

// suppressHydrationWarning: active button styles change after mount. Intentional.
export function FontSizeControls() {
  const { fontSize, setFontSize } = useTheme();
  return (
    <div suppressHydrationWarning style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {["sm","md","lg","xl"].map(s => (
        <button key={s} suppressHydrationWarning onClick={() => setFontSize(s)}
          style={{
            padding: "3px 7px", borderRadius: 6,
            border: "1px solid var(--border)",
            fontSize: s==="sm"?11:s==="md"?13:s==="lg"?15:17,
            cursor: "pointer",
            fontWeight: fontSize===s ? 600 : 400,
            background: fontSize===s ? "var(--accent)" : "var(--bg2)",
            color:      fontSize===s ? "#ffffff" : "var(--text2)",
          }}>A</button>
      ))}
    </div>
  );
}
