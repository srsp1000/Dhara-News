"use client";
// /live — Live Blog page for breaking news
// Uses Server-Sent Events (SSE) for real-time updates from /api/live/stream

import { useState, useEffect, useRef } from "react";
import { useThemeValues } from "../../lib/useThemeValues";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function timeStr(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function scoreColor(s) { return s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b"; }
function scoreBg(s)    { return s >= 75 ? "#dcfce7" : s >= 50 ? "#fef3c7" : "#fee2e2"; }

export default function LivePage() {
  const t = useThemeValues();
  const [updates, setUpdates]   = useState([]);
  const [connected, setConnected] = useState(false);
  const [topic, setTopic]       = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const bottomRef = useRef(null);
  const esRef     = useRef(null);
  const retryRef  = useRef(null);

  const TOPICS = [
    { key: "all",         label: "All Breaking" },
    { key: "politics",    label: "Politics" },
    { key: "economy",     label: "Economy" },
    { key: "judiciary",   label: "Courts" },
    { key: "defence",     label: "Defence" },
    { key: "technology",  label: "Tech" },
  ];

  useEffect(() => {
    // Close existing connection
    esRef.current?.close();
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    const url = `${API}/api/live/stream?domain=${topic === "all" ? "" : topic}`;

    const connect = () => {
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen    = () => setConnected(true);
      es.onerror   = () => {
        setConnected(false);
        es.close();
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(connect, 5000);
      };

      es.addEventListener("update", e => {
        try {
          const data = JSON.parse(e.data);
          setUpdates(prev => {
              // Deduplicate: don't add if same id already in list
              if (data.id && prev.some(p => p.id === data.id)) return prev;
              return [data, ...prev].slice(0, 100);
            });
        } catch {}
      });

      es.addEventListener("ping", () => {
        setConnected(true);
      });
    };

    connect();
    return () => {
      esRef.current?.close();
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [topic, retryTick]);

  useEffect(() => {
    if (autoScroll && updates.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [updates, autoScroll]);

  return (
    <div suppressHydrationWarning style={{
      fontFamily: "'Inter',system-ui,sans-serif",
      background: t.bg, minHeight: "100vh", color: t.text1,
    }}>
      {/* Header */}
      <div style={{
        background: t.bg2, borderBottom: `1px solid ${t.border}`,
        padding: "0 1rem", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex",
          alignItems: "center", gap: "1rem", height: 52 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 20, fontWeight: 800, color: t.accent }}>धारा</a>
          <span style={{ color: t.text3 }}>›</span>

          {/* LIVE badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px", borderRadius: 20,
              background: connected ? "#dc2626" : t.border,
              color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1,
            }}>
              {connected && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#fff",
                  animation: "pulse-live 1s ease-in-out infinite",
                }} />
              )}
              {connected ? "LIVE" : "CONNECTING"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.text2 }}>Breaking News</span>
          </div>

          <div style={{ marginLeft: "auto", fontSize: 12, color: t.text3 }}>
            {updates.length} updates
          </div>
        </div>

        {/* Topic filter */}
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex",
          gap: 6, paddingBottom: 8, overflowX: "auto" }}>
          {TOPICS.map(tp => (
            <button key={`topic-${tp.key}`} onClick={() => setTopic(tp.key)}
              style={{
                padding: "4px 12px", borderRadius: 16, border: "1.5px solid",
                borderColor: topic === tp.key ? "#dc2626" : t.border,
                background: topic === tp.key ? "#dc2626" : t.bg2,
                color: topic === tp.key ? "#fff" : t.text2,
                fontSize: 12, fontWeight: topic === tp.key ? 600 : 400,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>{tp.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "1rem" }}>

        {/* Auto-scroll toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: t.text2, cursor: "pointer" }}>
            <input type="checkbox" checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)} />
            Auto-scroll to latest
          </label>
        </div>

        {/* No updates yet */}
        {updates.length === 0 && (
          connected ? (
            <PageState
              tone="empty"
              icon="📡"
              title="Listening for breaking news"
              message="Updates appear here as verified breaking stories are published."
            />
          ) : (
            <PageState
              tone="error"
              icon="📡"
              title="Live feed disconnected"
              message="We could not connect to the live stream."
              actionLabel="Retry connection"
              onAction={() => setRetryTick(v => v + 1)}
            />
          )
        )}

        {/* Live updates feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {updates.map((u, i) => (
            <LiveCard key={`${u.id || "item"}-${i}`} update={u} t={t}
              isLatest={i === 0}
              scoreColor={scoreColor} scoreBg={scoreBg} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes pulse-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function LiveCard({ update: u, t, isLatest, scoreColor, scoreBg }) {
  return (
    <a href={`/article/${u.id}`}
      style={{
        display: "block", textDecoration: "none",
        background: t.bg2, border: `1px solid ${isLatest ? "#dc2626" : t.border}`,
        borderLeft: `4px solid ${isLatest ? "#dc2626" : t.border}`,
        borderRadius: 10, padding: "0.9rem 1rem",
        transition: "box-shadow 0.15s",
        animation: isLatest ? "slide-in 0.3s ease" : "none",
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 12px ${t.shadow}`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>

      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
        {isLatest && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px",
            borderRadius: 8, background: "#dc2626", color: "#fff", letterSpacing: 0.5 }}>
            NEW
          </span>
        )}
        {u.domain && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px",
            borderRadius: 8, background: t.bg3, color: t.text2, textTransform: "uppercase" }}>
            {u.domain}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px",
          borderRadius: 8, background: scoreBg(u.truth_score), color: scoreColor(u.truth_score) }}>
          ✓ {u.truth_score}
        </span>
        <span style={{ fontSize: 11, color: t.text3, marginLeft: "auto" }}>
          {timeStr(u.first_seen || u.published_at)}
        </span>
      </div>

      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: t.text1, lineHeight: 1.4 }}>
        {u.headline}
      </h3>
      {u.summary_brief && (
        <p style={{ margin: 0, fontSize: 13, color: t.text2, lineHeight: 1.5 }}>
          {sanitizeDisplayText(u.summary_brief)}
        </p>
      )}
      <div style={{ marginTop: 6, fontSize: 11, color: t.text3 }}>
        {u.source_count} source{u.source_count !== 1 ? "s" : ""}
      </div>
    </a>
  );
}
