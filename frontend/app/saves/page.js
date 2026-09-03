"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../components/auth/AuthContext";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function scoreColor(s) { return s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b"; }
function scoreBg(s)    { return s >= 75 ? "#dcfce7" : s >= 50 ? "#fef3c7" : "#fee2e2"; }

export default function SavesPage() {
  const { user, session, loading: authLoading } = useAuth();
  const [saves,   setSaves]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("all");
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    setError("");
    fetch(`${API}/api/saves/${user.id}?limit=100`, {
      headers: {
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
    })
      .then(r => { if (!r.ok) throw new Error(`Saved articles request failed (${r.status})`); return r.json(); })
      .then(d => { setSaves(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setError("We could not load your saved articles."); setLoading(false); });
  }, [user, session?.access_token, authLoading]);

  const unsave = async (clusterId) => {
    if (!user) return;
    await fetch(`${API}/api/save/${user.id}/${clusterId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
    });
    setSaves(prev => prev.filter(a => a.id !== clusterId));
  };

  const domains = [...new Set(saves.map(a => a.domain).filter(Boolean))];

  const filtered = saves.filter(a => {
    const matchSearch = !search ||
      a.headline?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || a.domain === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 1rem" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex",
          alignItems: "center", gap: "1rem", height: 52 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>धारा</a>
          <span style={{ color: "#94a3b8" }}>›</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>🔖 Saved Articles</span>
          {saves.length > 0 && (
            <span style={{ fontSize: 12, background: "#1e3a5f", color: "#fff",
              borderRadius: 12, padding: "1px 8px", fontWeight: 600 }}>
              {saves.length}
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* Not logged in */}
        {!authLoading && !user && (
          <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔖</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>
              Sign in to save articles
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>
              Save articles to read later, build a study bank, and export to PDF.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <a href="/login"
                style={{ padding: "10px 24px", background: "#1e3a5f", color: "#fff",
                  borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
                Sign in
              </a>
              <a href="/signup"
                style={{ padding: "10px 24px", background: "#fff", color: "#1e3a5f",
                  border: "1px solid #1e3a5f", borderRadius: 10, textDecoration: "none",
                  fontSize: 14, fontWeight: 600 }}>
                Create account
              </a>
            </div>
          </div>
        )}

        {/* Loading */}
        {(loading || authLoading) && user && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 12, padding: "1rem", animation: "pulse 1.5s ease-in-out infinite" }}>
                <div style={{ height: 14, background: "#e2e8f0", borderRadius: 4, marginBottom: 8, width: "70%" }} />
                <div style={{ height: 18, background: "#e2e8f0", borderRadius: 4, width: "90%" }} />
              </div>
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
          </div>
        )}

        {/* Saves */}
        {!loading && !authLoading && user && (
          <>
            {error ? (
              <PageState
                tone="error"
                icon="⚠️"
                title="Saved articles are unavailable"
                message={error + " Please reload this page."}
              />
            ) : saves.length === 0 ? (
              <PageState
                tone="empty"
                icon="📭"
                title="No saved articles yet"
                message="Tap the bookmark icon on any article to save it here."
                actionLabel="Browse news"
                actionHref="/"
              />
            ) : (
              <>
                {/* Search + filter bar */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search saved articles..."
                    style={{ flex: 1, minWidth: 200, padding: "8px 12px",
                      border: "1px solid #e2e8f0", borderRadius: 10,
                      fontSize: 14, outline: "none", background: "#fff" }}
                  />
                  <select value={filter} onChange={e => setFilter(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid #e2e8f0",
                      borderRadius: 10, fontSize: 13, background: "#fff", outline: "none" }}>
                    <option value="all">All domains</option>
                    {domains.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  {/* Export PDF button */}
                  <button
                    onClick={() => exportPDF(filtered)}
                    style={{ padding: "8px 16px", background: "#fff",
                      border: "1px solid #e2e8f0", borderRadius: 10,
                      fontSize: 13, cursor: "pointer", color: "#475569",
                      display: "flex", alignItems: "center", gap: 5 }}>
                    📄 Export PDF
                  </button>
                </div>

                <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
                  {filtered.length} of {saves.length} saved articles
                  {search && ` matching "${search}"`}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.map(a => (
                    <SavedCard key={a.id} article={a} onUnsave={unsave} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SavedCard({ article: a, onUnsave }) {
  const [removing, setRemoving] = useState(false);
  const articleHref = `/article/${a.id}`;

  const handleUnsave = async () => {
    setRemoving(true);
    await onUnsave(a.id);
  };

  return (
    <div style={{ background: removing ? "#fef2f2" : "#fff",
      border: `1px solid ${removing ? "#fca5a5" : "#e2e8f0"}`,
      borderRadius: 12, padding: "1rem 1.1rem",
      transition: "all 0.2s", opacity: removing ? 0.6 : 1 }}>

      <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap", alignItems: "center" }}>
        {a.domain && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px",
            borderRadius: 10, background: "#f1f5f9", color: "#475569" }}>
            {a.domain}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px",
          borderRadius: 10, background: scoreBg(a.truth_score), color: scoreColor(a.truth_score) }}>
          Score {a.truth_score}
        </span>
        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>
          Saved {new Date(a.saved_at).toLocaleDateString("en-IN",
            { day: "numeric", month: "short" })}
        </span>
        <button onClick={handleUnsave} disabled={removing}
          title="Remove from saves"
          style={{ padding: "3px 8px", border: "1px solid #e2e8f0",
            background: "#fff", borderRadius: 8, cursor: removing ? "not-allowed" : "pointer",
            fontSize: 11, color: "#ef4444", transition: "all 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"}
          onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
          {removing ? "Removing..." : "✕ Remove"}
        </button>
      </div>

      <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
        <a href={articleHref}
          style={{ color: "#1e293b", textDecoration: "none" }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
          {a.headline}
        </a>
      </h3>

      {a.summary_brief && (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
          {sanitizeDisplayText(a.summary_brief)}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <a href={articleHref}
          style={{ fontSize: 12, fontWeight: 600, color: "#1e3a5f", textDecoration: "none" }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
          Read full article →
        </a>
      </div>
    </div>
  );
}

function exportPDF(articles) {
  // Simple print-to-PDF using browser's built-in print dialog
  const content = articles.map((a, i) =>
    `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="font-size:10px;color:#888;margin-bottom:4px">${i+1}. ${a.domain?.toUpperCase() || ''} · Score ${a.truth_score}</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:6px">${a.headline}</div>
      <div style="font-size:13px;color:#444;line-height:1.6">${sanitizeDisplayText(a.summary_brief || '')}</div>
    </div>`
  ).join("");

  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>Dhara News — Saved Articles</title>
    <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#222}
    h1{font-size:22px;margin-bottom:8px} p{font-size:12px;color:#888;margin-bottom:32px}
    @media print{button{display:none}}</style>
    </head><body>
    <h1>धारा News — Saved Articles</h1>
    <p>Exported ${new Date().toLocaleDateString("en-IN")} · ${articles.length} articles</p>
    <button onclick="window.print()" style="padding:8px 16px;margin-bottom:24px;cursor:pointer">
      Print / Save PDF
    </button>
    ${content}
    </body></html>
  `);
  win.document.close();
}
