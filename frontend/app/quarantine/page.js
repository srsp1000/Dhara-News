"use client";
import { useState, useEffect } from "react";
import { useThemeValues } from "../../lib/useThemeValues";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function QuarantinePage() {
  const t = useThemeValues();
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => {
    setError("");
    fetch(`${API}/api/quarantine?limit=40`)
      .then(r=>{ if (!r.ok) throw new Error(`Quarantine request failed (${r.status})`); return r.json(); })
      .then(d=>{ setArticles(Array.isArray(d)?d:[]); setLoading(false); })
      .catch(()=>{ setError("We could not load quarantine stories."); setLoading(false); });
  }, []);

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Inter',system-ui,sans-serif",
      background:t.bg, minHeight:"100vh", color:t.text1,
    }}>
      <div style={{ background:t.bg2, borderBottom:`1px solid ${t.border}`, padding:"0 1rem" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:t.accent }}>धारा</a>
          <span style={{ color:t.text3 }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color:t.text2 }}>⚠ Quarantine</span>
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"1.5rem 1rem" }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:t.text1, margin:"0 0 6px" }}>⚠ Quarantined Articles</h1>

        <div className="quarantine-info-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:"1.5rem" }}>
          {[
            { icon:"🧐", title:"What is this?",
              body:"Articles that didn't reach our Truth Score threshold (below 35) or couldn't be confirmed by any credible source. Published transparently instead of deleted." },
            { icon:"🔍", title:"Why show it?",
              body:"Transparency matters. You can see what we caught, why we flagged it, and track how often stories graduate from quarantine to verified status." },
            { icon:"🛑", title:"What to do?",
              body:"Do not share these as fact. If you believe a story is wrongly quarantined, use the feedback button — our team reviews flagged cases daily." },
          ].map(card=>(
            <div key={card.title} style={{ background:"#fef3c7", border:"1px solid #fcd34d",
              borderRadius:12, padding:"0.9rem", fontSize:13, color:t.text2, lineHeight:1.5 }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{card.icon}</div>
              <div style={{ fontWeight:700, color:"#92400e", marginBottom:4 }}>{card.title}</div>
              <div>{card.body}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <PageState tone="loading" icon="⏳" title="Loading quarantine stories" message="Fetching latest flagged content..." />
        ) : error ? (
          <PageState tone="error" icon="⚠️" title="Quarantine is unavailable" message={error} />
        ) : articles.length===0 ? (
          <PageState tone="empty" icon="✅" title="No quarantined articles right now" message="The current stream has no stories below the quarantine threshold." />
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {articles.map(a=>(
              <div key={a.id} style={{
                background:t.bg2,
                border:`1px solid #fca5a5`,
                borderLeft:"4px solid #ef4444",
                borderRadius:10, padding:"0.9rem 1rem",
              }}>
                <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px",
                    borderRadius:10, background:"#fee2e2", color:"#991b1b" }}>
                    ⚠ Unverified · Score {a.truth_score}
                  </span>
                  {a.domain && (
                    <span style={{ fontSize:11, padding:"2px 7px", borderRadius:8,
                      background:t.bg3, color:t.text2 }}>{a.domain}</span>
                  )}
                  <span style={{ marginLeft:"auto", fontSize:11, color:t.text3 }}>
                    {a.first_seen ? new Date(a.first_seen).toLocaleDateString("en-IN",
                      { day:"numeric", month:"short", year:"numeric" }) : ""}
                  </span>
                </div>
                <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:600, color:t.text1, lineHeight:1.4 }}>
                  {a.headline}
                </h3>
                {a.summary_brief && (
                  <p style={{ margin:"0 0 6px", fontSize:13, color:t.text2, lineHeight:1.5 }}>
                    {sanitizeDisplayText(a.summary_brief)}
                  </p>
                )}
                {a.quarantine_reason && (
                  <div style={{ fontSize:12, color:"#92400e", padding:"5px 8px",
                    background:"#fef3c7", borderRadius:6 }}>
                    <strong>Why flagged:</strong> {a.quarantine_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
