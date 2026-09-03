"use client";
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Dhara ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div suppressHydrationWarning style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter',system-ui,sans-serif",
          background: "var(--bg, #f1f5f9)",
          color: "var(--text1, #1e293b)",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "var(--text2, #64748b)", margin: "0 0 20px", maxWidth: 360 }}>
            An unexpected error occurred. Your saved preferences and data are safe.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: "9px 18px", background: "var(--accent, #1e3a5f)", color: "#fff",
                border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
              Try again
            </button>
            <a href="/"
              style={{
                padding: "9px 18px", background: "var(--bg2, #fff)", color: "var(--text2, #475569)",
                border: "1px solid var(--border, #e2e8f0)", borderRadius: 9, fontSize: 13,
                textDecoration: "none", fontWeight: 500,
              }}>
              Go home
            </a>
          </div>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <pre style={{
              marginTop: 20, padding: "1rem", background: "#fee2e2", borderRadius: 8,
              fontSize: 11, color: "#991b1b", textAlign: "left", maxWidth: 600,
              overflow: "auto", whiteSpace: "pre-wrap",
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
