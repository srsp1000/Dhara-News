"use client";
// useThemeValues — SSR-safe theme values hook
// Returns static hex values on server (before mount), CSS vars on client (after mount)
// Use this in any component that needs theme-aware inline styles

import { useState, useEffect } from "react";

const LIGHT = {
  bg:      "#f1f5f9",
  bg2:     "#ffffff",
  bg3:     "#f8fafc",
  text1:   "#1e293b",
  text2:   "#475569",
  text3:   "#94a3b8",
  border:  "#e2e8f0",
  border2: "#f1f5f9",
  accent:  "#1e3a5f",
  shadow:  "rgba(0,0,0,0.06)",
  shadowMd:"rgba(0,0,0,0.10)",
};

const CSS_VARS = {
  bg:      "var(--bg)",
  bg2:     "var(--bg2)",
  bg3:     "var(--bg3)",
  text1:   "var(--text1)",
  text2:   "var(--text2)",
  text3:   "var(--text3)",
  border:  "var(--border)",
  border2: "var(--border2)",
  accent:  "var(--accent)",
  shadow:  "var(--shadow)",
  shadowMd:"var(--shadow-md)",
};

export function useThemeValues() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted ? CSS_VARS : LIGHT;
}
