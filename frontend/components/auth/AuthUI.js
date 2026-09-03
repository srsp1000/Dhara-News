// components/auth/AuthUI.js
// Shared layout + small components used by login and signup pages

"use client";

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif",
      background: "#f1f5f9", minHeight: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "2rem 1rem" }}>

      {/* Logo */}
      <a href="/" style={{ textDecoration: "none", marginBottom: "1.5rem",
        display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "#1e3a5f" }}>धारा</span>
        <span style={{ fontSize: 13, color: "#0f7b6c", fontWeight: 600 }}>NEWS</span>
      </a>

      {/* Card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0",
        borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 420,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: "0 0 1.5rem", fontSize: 14, color: "#64748b" }}>
            {subtitle}
          </p>
        )}

        {children}
      </div>

      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 20, textAlign: "center",
        maxWidth: 340, lineHeight: 1.6 }}>
        By continuing, you agree to our{" "}
        <a href="/terms" style={{ color: "#64748b" }}>Terms</a> and{" "}
        <a href="/privacy" style={{ color: "#64748b" }}>Privacy Policy</a>.
        We never sell your data.
      </p>
    </div>
  );
}

export function OAuthButton({ onClick, loading, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: 10,
        background: "#fff", fontSize: 14, fontWeight: 500, color: "#374151",
        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
        transition: "background 0.15s", marginBottom: 4 }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#f8fafc"; }}
      onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
      {children}
    </button>
  );
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.17z" fill="#4285F4"/>
      <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853"/>
      <path d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05"/>
      <path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" fill="#EA4335"/>
    </svg>
  );
}

export function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12,
      margin: "16px 0", color: "#94a3b8", fontSize: 12 }}>
      <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      or continue with email
      <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
    </div>
  );
}

export function Field({ label, children, ...inputProps }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</label>
        {children}
      </div>
      <input
        {...inputProps}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0",
          borderRadius: 8, fontSize: 14, outline: "none", background: "#f8fafc",
          transition: "border-color 0.15s", boxSizing: "border-box" }}
        onFocus={e => e.target.style.borderColor = "#1e3a5f"}
        onBlur={e => e.target.style.borderColor = "#e2e8f0"}
      />
    </div>
  );
}

export function ErrorBox({ children }) {
  return (
    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5",
      borderRadius: 8, padding: "8px 12px", marginBottom: 14,
      fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

export function SubmitButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{ width: "100%", padding: "11px", background: "#1e3a5f", color: "#fff",
        border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
        transition: "background 0.15s" }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#1e4a7f"; }}
      onMouseLeave={e => e.currentTarget.style.background = "#1e3a5f"}>
      {loading ? "Please wait..." : children}
    </button>
  );
}

export function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "#f1f5f9" }}>
      <div style={{ fontSize: 14, color: "#94a3b8" }}>Loading...</div>
    </div>
  );
}
