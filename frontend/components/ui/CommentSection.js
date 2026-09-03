"use client";
// frontend/components/ui/CommentSection.js
import React from "react";
import { useAuth } from "../auth/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COMMENTS_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}, timeoutMs = COMMENTS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function CommentSection({ clusterId }) {
  const { user, session } = useAuth();
  const [comments, setComments] = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [text,     setText]     = React.useState("");
  const [posting,  setPosting]  = React.useState(false);
  const [error,    setError]    = React.useState("");
  const [loadError, setLoadError] = React.useState("");

  const loadComments = React.useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetchWithTimeout(`${API}/api/comments/${clusterId}`);
      if (!res.ok) {
        throw new Error(`comments_fetch_failed_${res.status}`);
      }
      const d = await res.json();
      setComments(Array.isArray(d) ? d : []);
    } catch (e) {
      setComments([]);
      if (e?.name === "AbortError") {
        setLoadError("Comments timed out. Please retry.");
      } else {
        setLoadError("Could not load comments right now.");
      }
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  React.useEffect(() => {
    loadComments();
  }, [loadComments]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setPosting(true); setError("");
    const res = await fetch(`${API}/api/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ user_id: user.id, cluster_id: clusterId, text: text.trim() }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    if (res?.id) {
      setComments(prev => [res, ...prev]);
      setText("");
    } else {
      setError("Could not post comment. Try again.");
    }
    setPosting(false);
  };

  return (
    <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:16, marginTop:16 }}>
      <p style={{ fontSize:13, fontWeight:600, color:"#1e3a5f", margin:"0 0 12px" }}>
        Comments ({comments.length})
      </p>

      {/* Comment input */}
      {user ? (
        <form onSubmit={submit} style={{ marginBottom:16 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment (be respectful, cite sources)..."
            maxLength={500}
            rows={3}
            style={{ width:"100%", padding:"8px 12px", border:"1px solid #e2e8f0",
              borderRadius:10, fontSize:13, resize:"vertical", outline:"none",
              fontFamily:"inherit", background:"#f8fafc", boxSizing:"border-box" }}
          />
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
            <span style={{ fontSize:11, color:"#94a3b8" }}>{text.length}/500</span>
            <button type="submit" disabled={!text.trim() || posting}
              style={{ padding:"6px 16px", background:"#1e3a5f", color:"#fff",
                border:"none", borderRadius:8, fontSize:12, cursor:"pointer",
                opacity: !text.trim() || posting ? 0.5 : 1 }}>
              {posting ? "Posting..." : "Post comment"}
            </button>
          </div>
          {error && <p style={{ fontSize:11, color:"#dc2626", marginTop:4 }}>{error}</p>}
        </form>
      ) : (
        <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10,
          padding:"10px 14px", marginBottom:14, fontSize:13, color:"#64748b" }}>
          <a href="/login" style={{ color:"#1e3a5f", fontWeight:600 }}>Sign in</a> to comment.
          Verified accounts only.
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <p style={{ fontSize:12, color:"#94a3b8" }}>Loading comments...</p>
      ) : loadError ? (
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <p style={{ fontSize:12, color:"#dc2626", margin:0 }}>{loadError}</p>
          <button
            type="button"
            onClick={loadComments}
            style={{
              padding:"4px 10px",
              border:"1px solid #e2e8f0",
              borderRadius:8,
              background:"#fff",
              color:"#1e3a5f",
              fontSize:12,
              cursor:"pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <p style={{ fontSize:12, color:"#94a3b8" }}>No comments yet. Be the first.</p>
      ) : (
        comments.map(c => (
          <div key={c.id} style={{ padding:"10px 0", borderBottom:"1px solid #f8fafc" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#1e293b" }}>
                {c.user_email?.split("@")[0] || "User"}
                {c.is_verified && (
                  <span style={{ marginLeft:5, fontSize:10, background:"#dcfce7",
                    color:"#16a34a", padding:"1px 5px", borderRadius:8 }}>✓</span>
                )}
              </span>
              <span style={{ fontSize:11, color:"#94a3b8" }}>
                {new Date(c.created_at).toLocaleDateString("en-IN")}
              </span>
            </div>
            <p style={{ fontSize:13, color:"#374151", margin:0, lineHeight:1.5 }}>{c.text}</p>
          </div>
        ))
      )}
    </div>
  );
}
