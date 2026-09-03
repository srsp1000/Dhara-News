"use client";
// components/auth/UserMenu.js
// Shows in the header: avatar + dropdown with profile/saves/signout

import { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";

export default function UserMenu() {
  const { user, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--border)" }} />;

  if (!user) {
    return (
      <div className="header-auth-buttons" style={{ display: "flex", gap: 6 }}>
        <a href="/login" className="header-auth-signin"
          style={{ padding: "6px 13px", borderRadius: 8, border: "1px solid var(--border)",
            fontSize: 13, fontWeight: 500, color: "var(--text2)", textDecoration: "none",
            background: "var(--bg2)", whiteSpace: "nowrap" }}>
          Sign in
        </a>
        <a href="/signup" className="header-auth-signup"
          style={{ padding: "6px 13px", borderRadius: 8, border: "none",
            fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none",
            background: "var(--accent)", whiteSpace: "nowrap" }}>
          Sign up
        </a>
      </div>
    );
  }

  const initials = (user.user_metadata?.full_name || user.email || "U")
    .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatar = user.user_metadata?.avatar_url;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
          border: "1px solid var(--border)", borderRadius: 20, background: "var(--bg2)",
          cursor: "pointer", transition: "border-color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>

        {/* Avatar */}
        {avatar ? (
          <img src={avatar} alt="" width={24} height={24}
            style={{ borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: "50%",
            background: "var(--accent)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700 }}>
            {initials}
          </div>
        )}

        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", maxWidth: 100,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0]}
        </span>
        <span style={{ fontSize: 10, color: "var(--text3)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)",
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 8px 24px var(--shadow-md)", minWidth: 200, zIndex: 300,
          overflow: "hidden" }}>

          {/* User info */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border2)" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
              {user.user_metadata?.full_name || "User"}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text3)" }}>
              {user.email}
            </p>
          </div>

          {/* Menu items */}
          {[
            { href: "/profile",        icon: "⚙️", label: "Preferences" },
            { href: "/saves",          icon: "🔖", label: "Saved articles" },
            { href: "/morning-brief",  icon: "☀️", label: "Morning brief" },
          ].map(item => (
            <a key={item.href} href={item.href}
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", textDecoration: "none",
                fontSize: 13, color: "var(--text2)", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
            </a>
          ))}

          <div style={{ borderTop: "1px solid var(--border2)" }}>
            <button
              onClick={async () => {
                setOpen(false);
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  window.location.href = "/";
                }
              }}
              disabled={signingOut}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", border: "none", background: "transparent",
                fontSize: 13, color: "#ef4444", cursor: "pointer", textAlign: "left",
                transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.15)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize: 14 }}>🚪</span>
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
