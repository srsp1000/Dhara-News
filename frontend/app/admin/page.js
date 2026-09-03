"use client";
/**
 * frontend/app/admin/page.js  — Dhara Admin Control Centre v2
 *
 * TABS:
 *   Pipeline    — live queue depths, agent health, breaking news controls
 *   Articles    — browse/edit/promote/quarantine/delete articles
 *   Scoring     — live Bayesian scoring config, tune thresholds without deploy
 *   Sources     — add/pause/remove feeds, set credibility, ownership chains
 *   Breaking    — view active breaking stories, manually set/expire
 *   Trending    — current trending rankings, velocity inspector
 *   Users       — user list, disable, Pro grant
 *   Fact-checks — review community fact-check requests
 *   Analytics   — verification rate, domain distribution, source quality
 *   Write       — publish articles directly (bypasses pipeline)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── Auth ────────────────────────────────────────────────────────────────────
function useAdminKey() {
  const [key, setKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("dhara_admin_key") || "" : ""
  );
  const save = k => { localStorage.setItem("dhara_admin_key", k); setKey(k); };
  return [key, save];
}

async function api(path, method = "GET", body = null, adminKey = "") {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function normalizeList(payload, preferredKeys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of preferredKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  const commonKeys = ["items", "results", "data"];
  for (const key of commonKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.data && typeof payload.data === "object") {
    for (const key of preferredKeys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
    for (const key of commonKeys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }

  return [];
}

// ── Nav ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "pipeline",   icon: "⚡", label: "Pipeline"    },
  { id: "articles",   icon: "📋", label: "Articles"    },
  { id: "scoring",    icon: "🎯", label: "Scoring"     },
  { id: "sources",    icon: "🔗", label: "Sources"     },
  { id: "breaking",   icon: "🚨", label: "Breaking"    },
  { id: "trending",   icon: "🔥", label: "Trending"    },
  { id: "factchecks", icon: "🔍", label: "Fact-checks" },
  { id: "users",      icon: "👥", label: "Users"       },
  { id: "analytics",  icon: "📊", label: "Analytics"   },
  { id: "write",      icon: "✍️",  label: "Write"       },
];

const DOMAINS = ["general","politics","economy","health","technology","judiciary",
  "environment","sports","science","international","business","agriculture","defence","education","social","entertainment"];
const STATUSES = ["verified","developing","quarantine","satire"];

// ── Root ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [adminKey, setAdminKey] = useAdminKey();
  const [authed,   setAuthed]   = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [tab,      setTab]      = useState("pipeline");
  const [toast,    setToast]    = useState(null);
  const [navOpen,  setNavOpen]  = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const login = async () => {
    try {
      await api("/api/admin/stats", "GET", null, keyInput);
      setAdminKey(keyInput);
      setAuthed(true);
    } catch { showToast("Wrong admin key", "error"); }
  };

  useEffect(() => {
    if (adminKey) api("/api/admin/stats", "GET", null, adminKey)
      .then(() => setAuthed(true)).catch(() => {});
  }, [adminKey]);

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e293b", borderRadius: 14, padding: "2rem", width: 360, border: "1px solid #334155" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>धारा</div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>Admin Control Centre</div>
        <input
          type="password"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Admin key"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
          autoFocus
        />
        <button onClick={login} style={{ width: "100%", padding: "10px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Sign in
        </button>
      </div>
    </div>
  );

  const panels = {
    pipeline:   <PipelinePanel   adminKey={adminKey} showToast={showToast} />,
    articles:   <ArticlesPanel   adminKey={adminKey} showToast={showToast} />,
    scoring:    <ScoringPanel    adminKey={adminKey} showToast={showToast} />,
    sources:    <SourcesPanel    adminKey={adminKey} showToast={showToast} />,
    breaking:   <BreakingPanel   adminKey={adminKey} showToast={showToast} />,
    trending:   <TrendingPanel   adminKey={adminKey} showToast={showToast} />,
    factchecks: <FactChecksPanel adminKey={adminKey} showToast={showToast} />,
    users:      <UsersPanel      adminKey={adminKey} showToast={showToast} />,
    analytics:  <AnalyticsPanel  adminKey={adminKey} showToast={showToast} />,
    write:      <WritePanel      adminKey={adminKey} showToast={showToast} />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      {/* Sidebar nav */}
      <nav style={{ width: 200, background: "#1e293b", borderRight: "1px solid #334155", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 8px", fontSize: 18, fontWeight: 800, color: "#3b82f6" }}>धारा Admin</div>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{ width: "100%", padding: "10px 16px", border: "none", background: tab === n.id ? "#2563eb22" : "transparent", color: tab === n.id ? "#60a5fa" : "#94a3b8", borderLeft: `3px solid ${tab === n.id ? "#3b82f6" : "transparent"}`, fontSize: 13, fontWeight: tab === n.id ? 600 : 400, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "all .1s" }}>
              <span style={{ fontSize: 14 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #334155", fontSize: 11, color: "#475569" }}>
          <button onClick={() => { setAdminKey(""); setAuthed(false); }}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, padding: 0 }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
        {panels[tab]}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "10px 18px", borderRadius: 8, background: toast.type === "error" ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        .admin-card { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:16px; margin-bottom:14px; }
        .admin-stat-card { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:14px; }
        .admin-metric { font-size:28px; font-weight:700; }
        .admin-metric-label { font-size:12px; color:#64748b; margin-top:2px; }
        .admin-btn { padding:7px 14px; border-radius:7px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; font-size:12px; cursor:pointer; font-weight:500; transition:all .15s; }
        .admin-btn:hover { background:#334155; }
        .admin-btn-primary { padding:7px 14px; border-radius:7px; border:none; background:#3b82f6; color:#fff; font-size:12px; cursor:pointer; font-weight:600; }
        .admin-btn-danger  { padding:7px 14px; border-radius:7px; border:none; background:#dc2626; color:#fff; font-size:12px; cursor:pointer; font-weight:600; }
        .admin-input { padding:7px 10px; borderRadius:6px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; fontSize:13px; outline:none; }
        .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
        .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
        .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        @media(max-width:900px) { .grid4{grid-template-columns:repeat(2,1fr)} .grid3{grid-template-columns:1fr 1fr} .grid2{grid-template-columns:1fr} }
      `}</style>
    </div>
  );
}

// ── SHARED ───────────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, onRefresh }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{title}</h2>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{subtitle}</p>}
      </div>
      {onRefresh && <button className="admin-btn" onClick={onRefresh}>🔄 Refresh</button>}
    </div>
  );
}
function StatusBadge({ status }) {
  const c = { verified: ["#14532d","#86efac","✓"], developing: ["#78350f","#fcd34d","⏳"], quarantine: ["#7f1d1d","#fca5a5","🚫"], satire: ["#4c1d95","#c4b5fd","😄"] }[status] || ["#1e293b","#64748b","?"];
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: c[0], color: c[1] }}>{c[2]} {status}</span>;
}
function Spinner() { return <div style={{ textAlign: "center", padding: "3rem", color: "#334155" }}>Loading…</div>; }

// ── PIPELINE PANEL ───────────────────────────────────────────────────────────
function PipelinePanel({ adminKey, showToast }) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const timerRef            = useRef(null);

  const load = useCallback(async () => {
    try {
      const [stats, pipeline] = await Promise.all([
        api("/api/admin/stats", "GET", null, adminKey),
        fetchJson("/api/metrics/pipeline").catch(() => ({})),
      ]);
      setData({ stats, pipeline });
    } catch (e) { showToast(e.message, "error"); }
    setLoad(false);
  }, [adminKey]);

  useEffect(() => { load(); timerRef.current = setInterval(load, 15000); return () => clearInterval(timerRef.current); }, [load]);
  if (loading || !data) return <Spinner />;

  const { stats, pipeline } = data;
  const queues = pipeline.queue_depths || {};
  const AGENT_STATUSES = [
    ["rss-feed", "RSS Feed Crawler"],
    ["html-crawler", "HTML Crawler"],
    ["web-crawler", "Web Crawler"],
    ["fingerprint", "Fingerprint Dedup"],
    ["semantic-dedup", "Semantic Dedup"],
    ["story-cluster", "Story Cluster"],
    ["claim-extraction", "Claim Extraction"],
    ["cross-reference", "Cross-Reference"],
    ["source-credibility", "Credibility"],
    ["truth-score", "Truth Score"],
    ["topic-classifier", "Topic Classifier"],
    ["summarization", "Summarization"],
    ["publish-queue", "Publish Queue"],
    ["breaking-news-detector", "Breaking Detector"],
    ["truth-score-updater", "Score Updater"],
  ];

  const agentHeartbeats = pipeline.agent_heartbeats || {};
  const now = Date.now() / 1000;

  return (
    <div>
      <SectionHeader title="⚡ Pipeline Status" subtitle="Auto-refreshes every 15s" onRefresh={load} />

      <div className="grid4">
        {[
          ["Total", stats.total || 0, "#3b82f6"],
          ["Verified", stats.by_status?.verified || 0, "#22c55e"],
          ["Developing", stats.by_status?.developing || 0, "#f59e0b"],
          ["Quarantine", stats.by_status?.quarantine || 0, "#ef4444"],
        ].map(([l, v, c]) => (
          <div key={l} className="admin-stat-card" style={{ borderTop: `3px solid ${c}` }}>
            <div className="admin-metric" style={{ color: c }}>{v}</div>
            <div className="admin-metric-label">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        {/* Queue depths */}
        <div className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Queue Depths</h3>
          {Object.keys(queues).length === 0 ? (
            <p style={{ color: "#475569", fontSize: 12 }}>No data — agents may not be running.</p>
          ) : Object.entries(queues).map(([q, depth]) => {
            const d = parseInt(depth);
            const color = d > 100 ? "#ef4444" : d > 20 ? "#f59e0b" : "#22c55e";
            return (
              <div key={q} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: "#94a3b8", width: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q}</span>
                <div style={{ flex: 1, height: 5, background: "#0f172a", borderRadius: 3 }}>
                  <div style={{ width: `${Math.min(100, d / 2)}%`, height: "100%", background: color, borderRadius: 3, transition: "width .5s" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color, width: 36, textAlign: "right" }}>{d}</span>
                {d > 100 && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>BACKLOG</span>}
              </div>
            );
          })}
        </div>

        {/* Agent health */}
        <div className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Agent Health</h3>
          {AGENT_STATUSES.map(([id, label]) => {
            const lastSeen = agentHeartbeats[id];
            const age      = lastSeen ? now - parseFloat(lastSeen) : Infinity;
            const ok       = age < 120;
            const warn     = age < 300;
            const color    = ok ? "#22c55e" : warn ? "#f59e0b" : "#ef4444";
            const status   = ok ? "running" : warn ? "slow" : lastSeen ? "stale" : "unknown";
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color, padding: "1px 6px", background: `${color}22`, borderRadius: 4 }}>{status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="admin-card">
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Quick Actions</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="admin-btn" onClick={async () => {
            await fetchJson("/api/admin/cache/flush", { method: "POST", headers: { "X-Admin-Key": adminKey } });
            showToast("Feed cache flushed");
          }}>🗑 Flush Feed Cache</button>
          <button className="admin-btn" onClick={async () => {
            const r = await api("/api/admin/articles?status=developing&limit=200", "GET", null, adminKey);
            const devs = (r.articles || []).filter(a => (a.truth_score || 0) >= 70 && (a.source_count || 0) >= 2);
            for (const a of devs) await api(`/api/admin/articles/${a.id}/status?status=verified`, "POST", null, adminKey).catch(() => {});
            showToast(`Promoted ${devs.length} articles (score≥70)`);
            load();
          }}>✓ Promote developing (≥70)</button>
          <button className="admin-btn-danger" onClick={async () => {
            if (!confirm("Delete all quarantined articles older than 7 days?")) return;
            await api("/api/admin/articles/purge-quarantine", "POST", null, adminKey).catch(() => {});
            showToast("Quarantine purged");
            load();
          }}>🗑 Purge old quarantine</button>
          <button className="admin-btn" onClick={async () => {
            await api("/api/admin/rescore", "POST", null, adminKey).catch(() => {});
            showToast("Re-score triggered");
          }}>🔄 Trigger re-score</button>
        </div>
      </div>

      {/* Today stats */}
      <div className="admin-card">
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Today</h3>
        <div className="grid4">
          {[
            ["Articles ingested", pipeline.today || 0],
            ["Verified %", stats.verification_rate ? `${stats.verification_rate}%` : "—"],
            ["Breaking active", pipeline.breaking_active || 0],
            ["Cache hit rate", pipeline.cache_hit_rate || "—"],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#60a5fa" }}>{v}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SCORING CONFIG PANEL ──────────────────────────────────────────────────────
function ScoringPanel({ adminKey, showToast }) {
  const [config, setConfig] = useState(null);
  const [edited, setEdited] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/config", "GET", null, adminKey)
      .then(d => setConfig(d))
      .catch(e => showToast(e.message, "error"));
  }, [adminKey]);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/config", "PATCH", edited, adminKey);
      setConfig(c => ({ ...c, ...edited }));
      setEdited({});
      showToast("Config saved — takes effect in next pipeline cycle");
    } catch (e) { showToast(e.message, "error"); }
    setSaving(false);
  };

  if (!config) return <Spinner />;

  const groups = {
    "Bayesian Verification": [
      ["p_verified_default",     "Default verified threshold P(T)",    "0.85",  "Probability required for Verified label (non-high-stakes)"],
      ["p_verified_high_stakes", "High-stakes verified threshold",      "0.90",  "P(T) for health, judiciary, defence, security"],
      ["n_eff_verified_default", "Min N_eff (default domains)",         "2.0",   "Minimum effective independent sources for Verified"],
      ["n_eff_high_stakes",      "Min N_eff (high-stakes)",             "3.0",   "Stricter N_eff for high-stakes domains"],
      ["single_source_exception_min_p", "Single-source official exception P(T)", "0.95", "Only allowlisted official primary sources may verify at this probability floor"],
    ],
    "Breaking News": [
      ["breaking_velocity_mult", "Velocity multiplier threshold",       "3.0",   "View rate must be this × baseline to flag as breaking"],
      ["breaking_min_score",     "Min truth_score for breaking",        "85",    "Only high-confidence articles can be breaking"],
      ["breaking_min_sources",   "Min source_count for breaking",       "2",     "Must be corroborated"],
      ["breaking_ttl_hours",     "Breaking TTL (hours)",                "4",     "Auto-expires after this many hours"],
    ],
    "Trending": [
      ["trending_velocity_weight","1h view multiplier",                 "3.0",   "Weight for views in last 1h vs 24h average"],
      ["trending_window_hours",   "Trending window (hours)",            "24",    "How far back to look for views"],
    ],
    "Feed Cache": [
      ["feed_cache_ttl_secs",    "Feed cache TTL (seconds)",            "900",   "How long /api/feed results are cached"],
      ["max_quarantine_age_days","Quarantine auto-delete (days)",       "7",     "Delete quarantined articles older than this"],
    ],
  };

  return (
    <div>
      <SectionHeader title="🎯 Scoring Configuration" subtitle="Live-tunable Bayesian parameters — no deploy required" />
      {Object.entries(groups).map(([groupName, params]) => (
        <div key={groupName} className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{groupName}</h3>
          {params.map(([key, label, defaultVal, desc]) => {
            const current = edited[key] ?? config[key] ?? defaultVal;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{desc}</div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={current}
                  onChange={e => setEdited(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: `1px solid ${edited[key] !== undefined ? "#3b82f6" : "#334155"}`, background: "#0f172a", color: "#e2e8f0", fontSize: 13, textAlign: "right" }}
                />
                {edited[key] !== undefined && (
                  <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>CHANGED</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {Object.keys(edited).length > 0 && (
        <button className="admin-btn-primary" onClick={save} disabled={saving} style={{ padding: "10px 24px", fontSize: 14 }}>
          {saving ? "Saving…" : `Save ${Object.keys(edited).length} change${Object.keys(edited).length > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

// ── BREAKING NEWS PANEL ───────────────────────────────────────────────────────
function BreakingPanel({ adminKey, showToast }) {
  const [data, setData]    = useState([]);
  const [loading, setLoad] = useState(true);
  const articles           = normalizeList(data, ["articles", "items", "results", "data"]);

  const load = useCallback(async () => {
    try {
      const r = await api("/api/admin/breaking", "GET", null, adminKey);
      setData(normalizeList(r, ["articles", "items", "results", "data"]));
    } catch (e) { showToast(e.message, "error"); }
    setLoad(false);
  }, [adminKey]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const setBreaking = async (id, val) => {
    await api(`/api/admin/articles/${id}/breaking`, "POST", { is_breaking: val }, adminKey).catch(e => showToast(e.message, "error"));
    showToast(`Breaking ${val ? "set" : "cleared"}`);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionHeader title="🚨 Breaking News" subtitle="Active breaking stories + manual controls" onRefresh={load} />
      <div className="admin-card">
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
          Breaking is auto-set by BreakingNewsDetectorAgent (velocity ≥ 3× baseline, score ≥ 85, src ≥ 2).
          You can manually override here. Breaking status expires after 4h unless renewed.
        </p>
        {articles.length === 0 ? (
          <p style={{ color: "#475569", fontSize: 13 }}>No active breaking news.</p>
        ) : articles.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #0f172a" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: a.is_breaking ? "#ef4444" : "#e2e8f0", marginBottom: 3 }}>
                {a.is_breaking && <span style={{ fontSize: 10, background: "#7f1d1d", color: "#fca5a5", padding: "1px 6px", borderRadius: 4, marginRight: 6, fontWeight: 700 }}>BREAKING</span>}
                {a.headline}
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Score: {a.truth_score} · Sources: {a.source_count} · {a.domain}
                {a.breaking_at && ` · Breaking since: ${new Date(a.breaking_at).toLocaleTimeString("en-IN")}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {!a.is_breaking ? (
                <button className="admin-btn-danger" onClick={() => setBreaking(a.id, true)}>Set Breaking</button>
              ) : (
                <button className="admin-btn" onClick={() => setBreaking(a.id, false)}>Clear Breaking</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Manual flag */}
      <div className="admin-card">
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Manual Flag by Cluster ID</h3>
        <ManualBreakingForm adminKey={adminKey} showToast={showToast} onDone={load} />
      </div>
    </div>
  );
}

function ManualBreakingForm({ adminKey, showToast, onDone }) {
  const [id, setId]     = useState("");
  const [val, setVal]   = useState(true);
  const submit = async () => {
    if (!id.trim()) return;
    await api(`/api/admin/articles/${id.trim()}/breaking`, "POST", { is_breaking: val }, adminKey)
      .then(() => { showToast(`Breaking ${val ? "set" : "cleared"}`); setId(""); onDone(); })
      .catch(e => showToast(e.message, "error"));
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input value={id} onChange={e => setId(e.target.value)} placeholder="Cluster UUID"
        style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13 }} />
      <select value={String(val)} onChange={e => setVal(e.target.value === "true")}
        style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13 }}>
        <option value="true">Set Breaking</option>
        <option value="false">Clear Breaking</option>
      </select>
      <button className="admin-btn-primary" onClick={submit}>Apply</button>
    </div>
  );
}

// ── TRENDING PANEL ────────────────────────────────────────────────────────────
function TrendingPanel({ adminKey, showToast }) {
  const [data, setData]    = useState([]);
  const [prof, setProf]    = useState("general");
  const [loading, setLoad] = useState(true);
  const trending           = normalizeList(data, ["articles", "items", "results", "data"]);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const r = await fetch(`/api/trending?profession=${prof}&limit=20`);
      setData(normalizeList(await r.json(), ["articles", "items", "results", "data"]));
    } catch (e) { showToast(e.message, "error"); }
    setLoad(false);
  }, [prof]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader title="🔥 Trending" subtitle="View velocity × recency-weighted rank" onRefresh={load} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Profession filter:</span>
        <select value={prof} onChange={e => setProf(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13 }}>
          {["general","upsc","medical","law","technology","finance","student"].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="admin-card">
          {trending.map((a, i) => (
            <div key={a.id || i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #0f172a", alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, color: i < 3 ? "#f59e0b" : "#334155", fontWeight: 700, width: 28, flexShrink: 0 }}>#{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.4 }}>{a.headline}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                  {a.domain} · Score: {a.truth_score} · Sources: {a.source_count}
                  {a.views_1h !== undefined && ` · 1h views: ${a.views_1h}`}
                  {a.trend_score && ` · Trend: ${Math.round(a.trend_score)}`}
                </div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
          {trending.length === 0 && <p style={{ color: "#475569", fontSize: 13 }}>No trending data yet — need article views.</p>}
        </div>
      )}
      <div className="admin-card">
        <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Trending algorithm</h3>
        <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
          trend_score = (views_1h × velocity_weight) + (views_6h × 2.0) + (views_24h × 1.0) + (truth_score × 0.05) + (source_count × 0.5)<br/>
          <br/>
          velocity_weight and time windows are configurable in the Scoring tab.<br/>
          Only articles with status='verified' appear in trending by default.
        </p>
      </div>
    </div>
  );
}

// ── SOURCES PANEL ─────────────────────────────────────────────────────────────
function SourcesPanel({ adminKey, showToast }) {
  const [sourcesState, setSourcesState] = useState([]);
  const [adding,  setAdding]  = useState(false);
  const emptySourceForm = useMemo(() => ({ domain: "", name: "", tier: 2, cred_score: 0.75, crawl_type: "rss", feed_url: "", category: "national", wire_source: "", ownership_chain: "" }), []);
  const [form,    setForm]    = useState(emptySourceForm);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({});
  const sources = normalizeList(sourcesState, ["sources"]);
  const safeSources = Array.isArray(sources) ? sources : [];

  useEffect(() => {
    fetchJson("/api/admin/sources", { headers: { "X-Admin-Key": adminKey } })
      .then(r => setSourcesState(normalizeList(r, ["sources", "items", "results", "data"])))
      .catch(e => showToast(e.message, "error"));
  }, [adminKey]);

  const addSource = async () => {
    const payload = {
      ...form,
      domain: String(form.domain || "").trim().toLowerCase(),
      name: String(form.name || "").trim(),
      tier: Number(form.tier || 3),
      cred_score: Number(form.cred_score || 0.5),
      crawl_type: String(form.crawl_type || "rss").toLowerCase(),
      feed_url: String(form.feed_url || "").trim() || null,
      category: String(form.category || "").trim() || null,
      wire_source: String(form.wire_source || "").trim() || null,
      ownership_chain: String(form.ownership_chain || "").trim() || null,
    };

    if (!payload.domain) {
      showToast("Domain is required", "error");
      return;
    }

    await api("/api/admin/sources", "POST", payload, adminKey)
      .then(r => {
        const created = (r && typeof r === "object") ? (r.source || r.item || r) : null;
        if (created && typeof created === "object" && !Array.isArray(created)) {
          setSourcesState(s => [created, ...normalizeList(s, ["sources"])]);
        }
        setAdding(false);
        setForm(emptySourceForm);
        showToast("Source added");
      })
      .catch(e => showToast(e.message, "error"));
  };

  const beginEdit = src => {
    setEditingId(src.id);
    setEditForm({
      name: src.name || "",
      tier: Number(src.tier || 3),
      cred_score: Number(src.cred_score || 0.5),
      crawl_type: String(src.crawl_type || (src.feed_url ? "rss" : "html")).toLowerCase(),
      feed_url: src.feed_url || "",
      category: src.category || "",
      wire_source: src.wire_source || "",
      ownership_chain: src.ownership_chain || "",
      active: Boolean(src.active),
    });
  };

  const saveEdit = async id => {
    const payload = {
      name: String(editForm.name || "").trim(),
      tier: Number(editForm.tier || 3),
      cred_score: Number(editForm.cred_score || 0.5),
      crawl_type: String(editForm.crawl_type || "rss").toLowerCase(),
      feed_url: String(editForm.feed_url || "").trim() || null,
      category: String(editForm.category || "").trim() || null,
      wire_source: String(editForm.wire_source || "").trim() || null,
      ownership_chain: String(editForm.ownership_chain || "").trim() || null,
      active: Boolean(editForm.active),
    };

    await api(`/api/admin/sources/${id}`, "PATCH", payload, adminKey)
      .then(r => {
        const updated = (r && typeof r === "object") ? (r.source || r.item || r) : null;
        if (updated && typeof updated === "object") {
          setSourcesState(s => normalizeList(s, ["sources"]).map(x => x.id === id ? { ...x, ...updated } : x));
        } else {
          setSourcesState(s => normalizeList(s, ["sources"]).map(x => x.id === id ? { ...x, ...payload } : x));
        }
        setEditingId("");
        setEditForm({});
        showToast("Source updated");
      })
      .catch(e => showToast(e.message, "error"));
  };

  const togglePause = async (id, active) => {
    await api(`/api/admin/sources/${id}`, "PATCH", { active: !active }, adminKey).catch(e => showToast(e.message, "error"));
    setSourcesState(s => normalizeList(s, ["sources"]).map(x => x.id === id ? { ...x, active: !active } : x));
  };

  return (
    <div>
      <SectionHeader title="🔗 Sources" subtitle="Manage RSS feeds, credibility scores, and ownership chains" />
      <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
        <button className="admin-btn-primary" onClick={() => setAdding(a => !a)}>
          {adding ? "Cancel" : "+ Add Source"}
        </button>
      </div>

      {adding && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Add new source</h3>
          <div className="grid2">
            {[ ["domain","Domain (e.g. thehindu.com)"],["name","Display name"],["feed_url","Feed/List URL"],["wire_source","Wire source (pti/ani/reuters)"],["ownership_chain","Ownership chain ID"],["category","Category (national/economy/...)"]].map(([k, ph]) => (
              <div key={k}>
                <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>{ph}</label>
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Ingestion type</label>
              <select value={form.crawl_type} onChange={e => setForm(f => ({ ...f, crawl_type: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}>
                <option value="rss">RSS feed</option>
                <option value="html">HTML crawler</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Tier (1=govt/wire, 2=national, 3=unknown)</label>
              <input type="number" min={1} max={4} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: parseInt(e.target.value) }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Credibility (0.0 – 1.0)</label>
              <input type="number" min={0} max={1} step={0.01} value={form.cred_score} onChange={e => setForm(f => ({ ...f, cred_score: parseFloat(e.target.value) }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <button className="admin-btn-primary" onClick={addSource} style={{ marginTop: 14 }}>Save source</button>
        </div>
      )}

      <div className="admin-card">
        {safeSources.map(s => (
          <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.active ? "#e2e8f0" : "#475569" }}>{s.domain}</span>
                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>Tier {s.tier} · {Math.round((s.cred_score || 0) * 100)}% cred · {s.category || "uncategorized"}</span>
                <span style={{ fontSize: 10, color: "#38bdf8", marginLeft: 6, fontWeight: 700 }}>
                  {(s.crawl_type || (s.feed_url ? "rss" : "html")).toUpperCase()}
                </span>
                {s.wire_source && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>via {s.wire_source}</span>}
                {s.ownership_chain && <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6 }}>chain:{s.ownership_chain}</span>}
              </div>
              {!s.active && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>PAUSED</span>}
              <button className="admin-btn" onClick={() => beginEdit(s)} style={{ fontSize: 11, padding: "4px 10px" }}>
                Edit
              </button>
              <button className="admin-btn" onClick={() => togglePause(s.id, s.active)} style={{ fontSize: 11, padding: "4px 10px" }}>
                {s.active ? "Pause" : "Resume"}
              </button>
            </div>

            {editingId === s.id && (
              <div style={{ marginTop: 10, background: "#0b1220", border: "1px solid #243142", borderRadius: 8, padding: 10 }}>
                <div className="grid2" style={{ marginBottom: 10 }}>
                  {[ ["name", "Display name"], ["feed_url", "Feed/List URL"], ["category", "Category"], ["wire_source", "Wire source"], ["ownership_chain", "Ownership chain"] ].map(([k, label]) => (
                    <div key={k}>
                      <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>{label}</label>
                      <input
                        value={editForm[k] || ""}
                        onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Ingestion type</label>
                    <select
                      value={editForm.crawl_type || "rss"}
                      onChange={e => setEditForm(f => ({ ...f, crawl_type: e.target.value }))}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}
                    >
                      <option value="rss">RSS feed</option>
                      <option value="html">HTML crawler</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Tier</label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={editForm.tier ?? 3}
                      onChange={e => setEditForm(f => ({ ...f, tier: parseInt(e.target.value || "3", 10) }))}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Credibility (0.0 - 1.0)</label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={editForm.cred_score ?? 0.5}
                      onChange={e => setEditForm(f => ({ ...f, cred_score: parseFloat(e.target.value || "0.5") }))}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="admin-btn-primary" onClick={() => saveEdit(s.id)}>
                    Save
                  </button>
                  <button className="admin-btn" onClick={() => { setEditingId(""); setEditForm({}); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ARTICLES PANEL ────────────────────────────────────────────────────────────
function ArticlesPanel({ adminKey, showToast }) {
  const [data,    setData]    = useState({ articles: [], total: 0 });
  const [filters, setFilters] = useState({ status: "", domain: "", article_id: "", q: "", limit: 20, offset: 0 });
  const [loading, setLoad]    = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [articleDetail, setArticleDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editOriginal, setEditOriginal] = useState(null);
  const [sourceEdits, setSourceEdits] = useState([]);
  const [timelineEdits, setTimelineEdits] = useState([]);
  const [sourceOriginal, setSourceOriginal] = useState([]);
  const [timelineOriginal, setTimelineOriginal] = useState([]);
  const [savingSources, setSavingSources] = useState(false);
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [editForm, setEditForm] = useState({
    headline: "",
    summary_brief: "",
    summary_deep: "",
    platform_body: "",
    domain: "",
    status: "",
    truth_score: "",
    image_url: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const normalizeMain = useCallback(v => ({
    ...v,
    headline: (v.headline || "").trim(),
    summary_brief: (v.summary_brief || "").trim(),
    summary_deep: (v.summary_deep || "").trim(),
    platform_body: (v.platform_body || "").trim(),
    image_url: (v.image_url || "").trim(),
    truth_score: Number.isFinite(Number(v.truth_score)) ? Math.round(Number(v.truth_score)) : "",
  }), []);

  const normalizeSources = useCallback(rows => (
    (rows || [])
      .map(s => ({
        id: s.id || "",
        source_domain: (s.source_domain || "").trim(),
        original_url: (s.original_url || "").trim(),
        original_title: (s.original_title || "").trim(),
        published_at: s.published_at || "",
        source_tier: Number.isFinite(Number(s.source_tier)) ? Number(s.source_tier) : 3,
        source_cred: Number.isFinite(Number(s.source_cred)) ? Number(s.source_cred) : 0.5,
      }))
      .filter(s => s.source_domain || s.original_url || s.original_title || s.published_at)
  ), []);

  const normalizeTimeline = useCallback(rows => (
    (rows || [])
      .map(t => ({
        id: t.id || "",
        event_text: (t.event_text || "").trim(),
        event_date: t.event_date || "",
        source_name: (t.source_name || "").trim(),
      }))
      .filter(t => t.event_text || t.event_date || t.source_name)
  ), []);

  const hasMainDirty = useMemo(() => {
    if (!editOriginal) return false;
    return JSON.stringify(normalizeMain(editForm)) !== JSON.stringify(normalizeMain(editOriginal));
  }, [editForm, editOriginal, normalizeMain]);

  const hasSourcesDirty = useMemo(() => {
    return JSON.stringify(normalizeSources(sourceEdits)) !== JSON.stringify(normalizeSources(sourceOriginal));
  }, [sourceEdits, sourceOriginal, normalizeSources]);

  const hasTimelineDirty = useMemo(() => {
    return JSON.stringify(normalizeTimeline(timelineEdits)) !== JSON.stringify(normalizeTimeline(timelineOriginal));
  }, [timelineEdits, timelineOriginal, normalizeTimeline]);

  const hasAnyDirty = hasMainDirty || hasSourcesDirty || hasTimelineDirty;

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.domain) params.set("domain", filters.domain);
      if (filters.article_id) params.set("article_id", filters.article_id.trim());
      if (filters.q)      params.set("q", filters.q);
      params.set("limit", filters.limit);
      params.set("offset", filters.offset);
      const r = await api(`/api/admin/articles?${params}`, "GET", null, adminKey);
      setData(r);
    } catch (e) { showToast(e.message, "error"); }
    setLoad(false);
  }, [filters, adminKey]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    await api(`/api/admin/articles/${id}/status?status=${status}`, "POST", null, adminKey)
      .then(() => { showToast(`→ ${status}`); load(); })
      .catch(e => showToast(e.message, "error"));
  };
  const del = async id => {
    if (!confirm("Delete this article?")) return;
    await api(`/api/admin/articles/${id}`, "DELETE", null, adminKey)
      .then(() => { showToast("Deleted"); load(); })
      .catch(e => showToast(e.message, "error"));
  };

  const openEditor = async article => {
    setEditingArticle(article);
    setLoadingDetail(true);
    setArticleDetail(null);
    try {
      const detail = await fetchJson(`/api/article/${article.id}`);
      setArticleDetail(detail);
      setSourceEdits((detail.sources || []).map(s => ({
        id: s.id || "",
        source_domain: s.source_domain || "",
        original_url: s.original_url || "",
        original_title: s.original_title || "",
        published_at: s.published_at ? String(s.published_at).slice(0, 16) : "",
        source_tier: s.source_tier ?? 3,
        source_cred: s.source_cred ?? 0.5,
      })));
      setSourceOriginal((detail.sources || []).map(s => ({
        id: s.id || "",
        source_domain: s.source_domain || "",
        original_url: s.original_url || "",
        original_title: s.original_title || "",
        published_at: s.published_at ? String(s.published_at).slice(0, 16) : "",
        source_tier: s.source_tier ?? 3,
        source_cred: s.source_cred ?? 0.5,
      })));
      setTimelineEdits((detail.timeline || []).map(t => ({
        id: t.id || "",
        event_text: t.event_text || "",
        event_date: t.event_date ? String(t.event_date).slice(0, 16) : "",
        source_name: t.source_name || "",
      })));
      setTimelineOriginal((detail.timeline || []).map(t => ({
        id: t.id || "",
        event_text: t.event_text || "",
        event_date: t.event_date ? String(t.event_date).slice(0, 16) : "",
        source_name: t.source_name || "",
      })));
      const base = {
        headline: detail.headline || article.headline || "",
        summary_brief: detail.summary_brief || "",
        summary_deep: detail.summary_deep || "",
        platform_body: detail.platform_body || "",
        domain: detail.domain || article.domain || "",
        status: detail.status || article.status || "",
        truth_score: detail.truth_score ?? article.truth_score ?? "",
        image_url: detail.image_url || article.image_url || "",
      };
      setEditForm(base);
      setEditOriginal(base);
    } catch (e) {
      showToast(`Unable to load full article: ${e.message}`, "error");
      const fallback = {
        headline: article.headline || "",
        summary_brief: article.summary_brief || "",
        summary_deep: "",
        platform_body: "",
        domain: article.domain || "",
        status: article.status || "",
        truth_score: article.truth_score ?? "",
        image_url: article.image_url || "",
      };
      setEditForm(fallback);
      setEditOriginal(fallback);
      setSourceEdits([]);
      setSourceOriginal([]);
      setTimelineEdits([]);
      setTimelineOriginal([]);
    }
    setLoadingDetail(false);
  };

  const closeEditor = (force = false) => {
    if (!force && hasAnyDirty) {
      const shouldClose = confirm("You have unsaved changes. Close without saving?");
      if (!shouldClose) return;
    }
    setEditingArticle(null);
    setArticleDetail(null);
    setEditOriginal(null);
    setSourceEdits([]);
    setSourceOriginal([]);
    setTimelineEdits([]);
    setTimelineOriginal([]);
    setSavingEdit(false);
    setSavingSources(false);
    setSavingTimeline(false);
  };

  const saveEditor = async () => {
    if (!editingArticle || !editOriginal) {
      showToast("Editor is still loading article details", "error");
      return;
    }
    const score = Number(editForm.truth_score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      showToast("Score must be between 0 and 100", "error");
      return;
    }

    const payload = {};
    const normalized = {
      ...editForm,
      headline: editForm.headline.trim(),
      summary_brief: editForm.summary_brief.trim(),
      summary_deep: editForm.summary_deep.trim(),
      platform_body: editForm.platform_body.trim(),
      image_url: editForm.image_url.trim(),
      truth_score: Math.round(score),
    };

    Object.keys(normalized).forEach(k => {
      if (normalized[k] !== editOriginal[k]) payload[k] = normalized[k];
    });

    if (!Object.keys(payload).length) {
      showToast("No changes to save", "error");
      return;
    }

    setSavingEdit(true);
    await api(`/api/admin/articles/${editingArticle.id}`, "PATCH", payload, adminKey)
      .then(() => {
        showToast("Article updated and applied");
        closeEditor(true);
        load();
      })
      .catch(e => {
        setSavingEdit(false);
        showToast(e.message, "error");
      });
  };

  const saveSources = async () => {
    if (!editingArticle) return;
    const payloadSources = sourceEdits
      .map(s => ({
        id: s.id || undefined,
        source_domain: (s.source_domain || "").trim(),
        original_url: (s.original_url || "").trim(),
        original_title: (s.original_title || "").trim(),
        published_at: s.published_at ? new Date(s.published_at).toISOString() : null,
        source_tier: Number.isFinite(Number(s.source_tier)) ? Number(s.source_tier) : 3,
        source_cred: Number.isFinite(Number(s.source_cred)) ? Number(s.source_cred) : 0.5,
      }))
      .filter(s => s.source_domain || s.original_url || s.original_title);

    if (payloadSources.some(s => !s.source_domain || !s.original_url)) {
      showToast("Each source requires domain and URL", "error");
      return;
    }

    setSavingSources(true);
    await api(`/api/admin/articles/${editingArticle.id}/sources`, "PATCH", { sources: payloadSources }, adminKey)
      .then(async () => {
        showToast("Sources updated");
        const detail = await fetchJson(`/api/article/${editingArticle.id}`);
        setArticleDetail(detail);
        setSourceEdits((detail.sources || []).map(s => ({
          id: s.id || "",
          source_domain: s.source_domain || "",
          original_url: s.original_url || "",
          original_title: s.original_title || "",
          published_at: s.published_at ? String(s.published_at).slice(0, 16) : "",
          source_tier: s.source_tier ?? 3,
          source_cred: s.source_cred ?? 0.5,
        })));
        setSourceOriginal((detail.sources || []).map(s => ({
          id: s.id || "",
          source_domain: s.source_domain || "",
          original_url: s.original_url || "",
          original_title: s.original_title || "",
          published_at: s.published_at ? String(s.published_at).slice(0, 16) : "",
          source_tier: s.source_tier ?? 3,
          source_cred: s.source_cred ?? 0.5,
        })));
        load();
      })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setSavingSources(false));
  };

  const saveTimeline = async () => {
    if (!editingArticle) return;
    const payloadTimeline = timelineEdits
      .map(t => ({
        id: t.id || undefined,
        event_text: (t.event_text || "").trim(),
        event_date: t.event_date ? new Date(t.event_date).toISOString() : "",
        source_name: (t.source_name || "").trim() || null,
      }))
      .filter(t => t.event_text || t.event_date || t.source_name);

    if (payloadTimeline.some(t => !t.event_text || !t.event_date)) {
      showToast("Each timeline event requires text and date", "error");
      return;
    }

    setSavingTimeline(true);
    await api(`/api/admin/articles/${editingArticle.id}/timeline`, "PATCH", { timeline: payloadTimeline }, adminKey)
      .then(async () => {
        showToast("Timeline updated");
        const detail = await fetchJson(`/api/article/${editingArticle.id}`);
        setArticleDetail(detail);
        setTimelineEdits((detail.timeline || []).map(t => ({
          id: t.id || "",
          event_text: t.event_text || "",
          event_date: t.event_date ? String(t.event_date).slice(0, 16) : "",
          source_name: t.source_name || "",
        })));
        setTimelineOriginal((detail.timeline || []).map(t => ({
          id: t.id || "",
          event_text: t.event_text || "",
          event_date: t.event_date ? String(t.event_date).slice(0, 16) : "",
          source_name: t.source_name || "",
        })));
      })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setSavingTimeline(false));
  };

  return (
    <div>
      <SectionHeader title="📋 Articles" subtitle={`${data.total || 0} total`} onRefresh={load} />

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={filters.article_id} onChange={e => setFilters(f => ({ ...f, article_id: e.target.value, offset: 0 }))}
          placeholder="Article ID (UUID)"
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, width: 280 }} />
        <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value, offset: 0 }))}
          placeholder="Search headline, summary, or ID"
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, width: 200 }} />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, offset: 0 }))}
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13 }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.domain} onChange={e => setFilters(f => ({ ...f, domain: e.target.value, offset: 0 }))}
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13 }}>
          <option value="">All domains</option>
          {DOMAINS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      {editingArticle && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Edit Article</h3>
              {hasMainDirty && <span style={{ fontSize: 10, color: "#facc15", background: "#78350f33", border: "1px solid #78350f", borderRadius: 999, padding: "2px 6px", fontWeight: 700 }}>Unsaved</span>}
            </div>
            <span style={{ fontSize: 11, color: "#64748b" }}>{editingArticle.id}</span>
          </div>
          {loadingDetail && <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>Loading full article detail…</p>}
          <div className="grid2">
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Headline</label>
              <input value={editForm.headline} onChange={e => setEditForm(f => ({ ...f, headline: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Score</label>
              <input type="number" min={0} max={100} value={editForm.truth_score} onChange={e => setEditForm(f => ({ ...f, truth_score: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Domain</label>
              <select value={editForm.domain} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}>
                <option value="">Unknown</option>
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Status</label>
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Summary (Brief)</label>
              <textarea value={editForm.summary_brief} onChange={e => setEditForm(f => ({ ...f, summary_brief: e.target.value }))}
                rows={4}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Summary (Deep)</label>
              <textarea value={editForm.summary_deep} onChange={e => setEditForm(f => ({ ...f, summary_deep: e.target.value }))}
                rows={5}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Article Body</label>
              <textarea value={editForm.platform_body} onChange={e => setEditForm(f => ({ ...f, platform_body: e.target.value }))}
                rows={8}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Image URL</label>
              <input value={editForm.image_url} onChange={e => setEditForm(f => ({ ...f, image_url: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          {articleDetail && (
            <div style={{ marginTop: 14 }}>
              <div className="grid2">
                <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Sources ({sourceEdits.length})</div>
                      {hasSourcesDirty && <span style={{ fontSize: 10, color: "#facc15", background: "#78350f33", border: "1px solid #78350f", borderRadius: 999, padding: "1px 6px", fontWeight: 700 }}>Unsaved</span>}
                    </div>
                    <button className="admin-btn" onClick={() => setSourceEdits(s => ([...s, { id: "", source_domain: "", original_url: "", original_title: "", published_at: "", source_tier: 3, source_cred: 0.5 }]))} style={{ fontSize: 11, padding: "3px 8px" }}>+ Source</button>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {sourceEdits.map((s, i) => (
                      <div key={`${s.id || "new"}-${i}`} style={{ border: "1px solid #334155", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <input placeholder="domain" value={s.source_domain} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, source_domain: e.target.value } : x))}
                            style={{ padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <input placeholder="title" value={s.original_title} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, original_title: e.target.value } : x))}
                            style={{ padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <input placeholder="url" value={s.original_url} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, original_url: e.target.value } : x))}
                            style={{ gridColumn: "1 / -1", padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <input type="datetime-local" value={s.published_at} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, published_at: e.target.value } : x))}
                            style={{ padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <div style={{ display: "flex", gap: 6 }}>
                            <input type="number" min={1} max={4} value={s.source_tier} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, source_tier: e.target.value } : x))}
                              style={{ width: 56, padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                            <input type="number" min={0} max={1} step={0.01} value={s.source_cred} onChange={e => setSourceEdits(prev => prev.map((x, idx) => idx === i ? { ...x, source_cred: e.target.value } : x))}
                              style={{ width: 70, padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                            <button className="admin-btn-danger" onClick={() => setSourceEdits(prev => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 10, padding: "4px 7px" }}>Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="admin-btn-primary" onClick={saveSources} disabled={savingSources || !hasSourcesDirty} style={{ marginTop: 6 }}>
                    {savingSources ? "Saving sources..." : "Save Sources"}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Timeline ({timelineEdits.length})</div>
                      {hasTimelineDirty && <span style={{ fontSize: 10, color: "#facc15", background: "#78350f33", border: "1px solid #78350f", borderRadius: 999, padding: "1px 6px", fontWeight: 700 }}>Unsaved</span>}
                    </div>
                    <button className="admin-btn" onClick={() => setTimelineEdits(t => ([...t, { id: "", event_text: "", event_date: "", source_name: "" }]))} style={{ fontSize: 11, padding: "3px 8px" }}>+ Event</button>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {timelineEdits.map((t, i) => (
                      <div key={`${t.id || "new"}-${i}`} style={{ border: "1px solid #334155", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <textarea placeholder="event text" value={t.event_text} onChange={e => setTimelineEdits(prev => prev.map((x, idx) => idx === i ? { ...x, event_text: e.target.value } : x))}
                          rows={2}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11, boxSizing: "border-box", marginBottom: 6 }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="datetime-local" value={t.event_date} onChange={e => setTimelineEdits(prev => prev.map((x, idx) => idx === i ? { ...x, event_date: e.target.value } : x))}
                            style={{ flex: 1, padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <input placeholder="source name" value={t.source_name} onChange={e => setTimelineEdits(prev => prev.map((x, idx) => idx === i ? { ...x, source_name: e.target.value } : x))}
                            style={{ flex: 1, padding: "6px 8px", borderRadius: 5, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", fontSize: 11 }} />
                          <button className="admin-btn-danger" onClick={() => setTimelineEdits(prev => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 10, padding: "4px 7px" }}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="admin-btn-primary" onClick={saveTimeline} disabled={savingTimeline || !hasTimelineDirty} style={{ marginTop: 6 }}>
                    {savingTimeline ? "Saving timeline..." : "Save Timeline"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="admin-btn-primary" onClick={saveEditor} disabled={savingEdit || !hasMainDirty}>{savingEdit ? "Saving..." : "Save changes"}</button>
            <button className="admin-btn" onClick={closeEditor}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="admin-card" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0f172a" }}>
                {["ID","Headline","Domain","Score","P(T)","Sources","Status","Actions"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #334155", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.articles || []).map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "8px 12px", color: "#94a3b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.id}</td>
                  <td style={{ padding: "8px 12px", color: "#e2e8f0", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.headline}</td>
                  <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{a.domain}</td>
                  <td style={{ padding: "8px 12px", color: "#60a5fa", fontWeight: 700 }}>{a.truth_score}</td>
                  <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{a.article_probability ? `${Math.round(a.article_probability * 100)}%` : "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{a.source_count}</td>
                  <td style={{ padding: "8px 12px" }}><StatusBadge status={a.status} /></td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <select onChange={e => { if (e.target.value) { changeStatus(a.id, e.target.value); e.target.value = ""; } }}
                        style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", cursor: "pointer" }}>
                        <option value="">Move to…</option>
                        {STATUSES.filter(s => s !== a.status).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => openEditor(a)} style={{ fontSize: 11, padding: "3px 8px", border: "none", background: "#1d4ed822", color: "#93c5fd", borderRadius: 4, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => del(a.id)} style={{ fontSize: 11, padding: "3px 8px", border: "none", background: "#7f1d1d22", color: "#fca5a5", borderRadius: 4, cursor: "pointer" }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderTop: "1px solid #334155" }}>
            <button className="admin-btn" onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, f.offset - f.limit) }))} disabled={filters.offset === 0}>← Prev</button>
            <span style={{ fontSize: 12, color: "#64748b" }}>{filters.offset + 1}–{Math.min(filters.offset + filters.limit, data.total || 0)} of {data.total || 0}</span>
            <button className="admin-btn" onClick={() => setFilters(f => ({ ...f, offset: f.offset + f.limit }))} disabled={filters.offset + filters.limit >= (data.total || 0)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ANALYTICS PANEL ───────────────────────────────────────────────────────────
function AnalyticsPanel({ adminKey, showToast }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      api("/api/admin/stats", "GET", null, adminKey),
      fetchJson("/api/metrics/pipeline").catch(() => ({})),
      fetch("/api/bias-report/latest").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([stats, pipeline, bias]) => setData({ stats, pipeline, bias }))
      .catch(e => showToast(e.message, "error"));
  }, [adminKey]);

  if (!data) return <Spinner />;
  const { stats, pipeline, bias } = data;
  const total = stats.total || 0;
  const avgSourceTier = bias?.avg_source_tier ?? bias?.avg_bias;
  const avgTruthScore = bias?.avg_truth_score;
  const driftAlert = bias?.alert ?? bias?.alert_triggered;

  return (
    <div>
      <SectionHeader title="📊 Analytics" />
      <div className="grid4">
        {[
          ["Total articles", total, "#3b82f6"],
          ["Verified %", total > 0 ? `${Math.round((stats.by_status?.verified || 0) / total * 100)}%` : "—", "#22c55e"],
          ["Today", pipeline.today || 0, "#f59e0b"],
          ["Breaking active", pipeline.breaking_active || 0, "#ef4444"],
        ].map(([l, v, c]) => (
          <div key={l} className="admin-stat-card" style={{ borderTop: `3px solid ${c}` }}>
            <div className="admin-metric" style={{ color: c }}>{v}</div>
            <div className="admin-metric-label">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>By Domain</h3>
          {(stats.by_domain || []).map(({ domain, count }) => (
            <div key={domain} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "#94a3b8", textTransform: "capitalize" }}>{domain}</span>
                <span style={{ color: "#3b82f6", fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ height: 4, background: "#0f172a", borderRadius: 2 }}>
                <div style={{ width: `${total > 0 ? Math.round(count / total * 100) : 0}%`, height: "100%", background: "#3b82f6", borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="admin-card">
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Source Quality Bias Report</h3>
          {bias ? (
            <>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
                Week of {bias.week_start} · {bias.total_articles} articles
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Avg source tier: </span>
                <span style={{ fontWeight: 700, color: avgSourceTier !== undefined && avgSourceTier !== null && parseFloat(avgSourceTier) > 2.3 ? "#ef4444" : "#22c55e" }}>
                  {avgSourceTier ?? "â€”"}
                </span>
                <span style={{ fontSize: 11, color: "#475569", marginLeft: 8 }}>(lower = better quality)</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "#64748b" }}>Avg truth score: </span>
                <span style={{ fontWeight: 700, color: avgTruthScore !== undefined && avgTruthScore !== null && parseFloat(avgTruthScore) < 60 ? "#ef4444" : "#22c55e" }}>
                  {avgTruthScore ?? "â€”"}
                </span>
              </div>
              {driftAlert && (
                <div style={{ marginTop: 10, padding: "6px 10px", background: "#7f1d1d22", border: "1px solid #7f1d1d", borderRadius: 6, fontSize: 12, color: "#fca5a5" }}>
                  ⚠ Drift alert — editorial review recommended
                </div>
              )}
            </>
          ) : <p style={{ color: "#475569", fontSize: 12 }}>No bias report yet (runs weekly).</p>}
        </div>
      </div>
    </div>
  );
}

// ── FACT-CHECKS PANEL ─────────────────────────────────────────────────────────
function FactChecksPanel({ adminKey, showToast }) {
  const [itemsState, setItemsState] = useState([]);
  const [loading, setLoad]    = useState(true);
  const items                = normalizeList(itemsState, ["items", "factchecks"]);
  const safeItems            = Array.isArray(items) ? items : [];

  useEffect(() => {
    api("/api/admin/factchecks", "GET", null, adminKey)
      .then(r => setItemsState(normalizeList(r, ["items", "factchecks", "results", "data"])))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoad(false));
  }, [adminKey]);

  const update = async (id, verdict) => {
    await api(`/api/admin/factchecks/${id}`, "PATCH", { status: verdict }, adminKey)
      .then(() => {
        setItemsState(i => normalizeList(i, ["items", "factchecks"]).map(x => x.id === id ? { ...x, verdict, status: verdict } : x));
        showToast(`Verdict: ${verdict}`);
      })
      .catch(e => showToast(e.message, "error"));
  };

  return (
    <div>
      <SectionHeader title="🔍 Fact-check Requests" subtitle={`${safeItems.length} pending`} />
      {loading ? <Spinner /> : safeItems.length === 0 ? (
        <div className="admin-card"><p style={{ color: "#475569", fontSize: 13 }}>No pending fact-check requests.</p></div>
      ) : safeItems.map(fc => (
        <div key={fc.id} className="admin-card">
          <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, marginBottom: 6 }}>{fc.claim}</div>
          {fc.article_headline && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Article: {fc.article_headline}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            {["true","false","misleading","unverifiable"].map(v => (
              <button key={v} onClick={() => update(fc.id, v)}
                className={fc.verdict === v || fc.status === v ? "admin-btn-primary" : "admin-btn"}
                style={{ fontSize: 11, padding: "4px 10px" }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── USERS PANEL ───────────────────────────────────────────────────────────────
function UsersPanel({ adminKey, showToast }) {
  const [usersState, setUsersState] = useState([]);
  const [loading, setLoad]    = useState(true);
  const users                = normalizeList(usersState, ["users"]);
  const safeUsers            = Array.isArray(users) ? users : [];

  useEffect(() => {
    api("/api/admin/users", "GET", null, adminKey)
      .then(r => setUsersState(normalizeList(r, ["users", "items", "results", "data"])))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoad(false));
  }, [adminKey]);

  const disable = async id => {
    await api(`/api/admin/users/${id}/disable`, "POST", null, adminKey)
      .then(() => {
        setUsersState(u => normalizeList(u, ["users"]).map(x => x.id === id ? { ...x, disabled: true } : x));
        showToast("User disabled");
      })
      .catch(e => showToast(e.message, "error"));
  };
  const grantPro = async id => {
    await api(`/api/admin/users/${id}/grant-pro`, "POST", null, adminKey)
      .then(() => {
        setUsersState(u => normalizeList(u, ["users"]).map(x => x.id === id ? { ...x, is_pro: true } : x));
        showToast("Pro granted");
      })
      .catch(e => showToast(e.message, "error"));
  };

  return (
    <div>
      <SectionHeader title="👥 Users" subtitle={`${safeUsers.length} accounts`} />
      {loading ? <Spinner /> : !safeUsers.length ? (
        <div className="admin-card"><p style={{ color: "#475569", fontSize: 13 }}>No users found.</p></div>
      ) : (
        <div className="admin-card" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0f172a" }}>
                {["Email","Profession","Pro","Push","Actions"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: "1px solid #0f172a", opacity: u.disabled ? 0.4 : 1 }}>
                  <td style={{ padding: "8px 12px", color: "#e2e8f0" }}>{u.email || u.id?.substring(0, 8)}</td>
                  <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{u.profession}</td>
                  <td style={{ padding: "8px 12px" }}>{u.is_pro ? <span style={{ color: "#f59e0b", fontWeight: 700 }}>⭐ Pro</span> : <span style={{ color: "#334155" }}>Free</span>}</td>
                  <td style={{ padding: "8px 12px", color: "#64748b" }}>{u.has_push ? "✓" : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!u.is_pro && <button className="admin-btn" style={{ fontSize: 11 }} onClick={() => grantPro(u.id)}>⭐ Pro</button>}
                      {!u.disabled && <button onClick={() => disable(u.id)} style={{ fontSize: 11, padding: "3px 8px", border: "none", background: "#7f1d1d22", color: "#fca5a5", borderRadius: 4, cursor: "pointer" }}>Disable</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── WRITE PANEL ───────────────────────────────────────────────────────────────
function WritePanel({ adminKey, showToast }) {
  const [form, setForm] = useState({ headline: "", summary_brief: "", full_body: "", domain: "general", status: "verified", source_domain: "dhara.news", truth_score: 85 });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await api("/api/admin/articles", "POST", form, adminKey)
      .then(() => { showToast("Article published"); setForm(f => ({ ...f, headline: "", summary_brief: "", full_body: "" })); })
      .catch(e => showToast(e.message, "error"));
    setSaving(false);
  };

  const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };

  return (
    <div>
      <SectionHeader title="✍️ Write Article" subtitle="Publish directly — bypasses the ingestion pipeline" />
      <div className="admin-card">
        {[["headline","Headline",1],["summary_brief","Brief summary (2 sentences)",2],["full_body","Full body text",6]].map(([k, ph, rows]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>{ph}</label>
            <textarea value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              rows={rows} placeholder={ph} style={{ ...inp, resize: "vertical" }} />
          </div>
        ))}
        <div className="grid3">
          {[["domain","Domain",[...DOMAINS]],["status","Status",["verified","developing","quarantine"]],["source_domain","Source domain",[]]].map(([k, l, opts]) => (
            <div key={k}>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>{l}</label>
              {opts.length > 0 ? (
                <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ ...inp }}>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ ...inp }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Truth score (0–100)</label>
          <input type="number" min={0} max={100} value={form.truth_score} onChange={e => setForm(f => ({ ...f, truth_score: parseInt(e.target.value) }))} style={{ ...inp, width: 100 }} />
        </div>
        <button className="admin-btn-primary" onClick={submit} disabled={saving || !form.headline}>
          {saving ? "Publishing…" : "Publish article"}
        </button>
      </div>
    </div>
  );
}
