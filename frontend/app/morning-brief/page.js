"use client";
import { useState, useEffect } from "react";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { useThemeValues } from "../../lib/useThemeValues";
import { PROFESSIONS } from "../../lib/constants";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function scoreColor(s) { return s>=75?"#166534":s>=50?"#92400e":"#991b1b"; }
function scoreBg(s)    { return s>=75?"#dcfce7":s>=50?"#fef3c7":"#fee2e2"; }

function getIstYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value || "1970";
  const m = parts.find(p => p.type === "month")?.value || "01";
  const d = parts.find(p => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

export default function MorningBriefPage() {
  const t = useThemeValues();
  const [profession, setProf]  = useState("upsc");
  const [brief,  setBrief]     = useState(null);
  const [loading,setLoading]   = useState(true);
  const [copied, setCopied]    = useState(false);
  const [error,  setError]     = useState("");

  const today = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday:"long", day:"numeric", month:"long", year:"numeric"
  }).format(new Date());
  const todaySlug = getIstYmd();
  const shareUrl = typeof window!=="undefined"
    ? `${window.location.origin}/morning-brief?prof=${encodeURIComponent(profession)}&date=${todaySlug}`
    : `https://dhara.news/morning-brief?prof=${encodeURIComponent(profession)}&date=${todaySlug}`;

  useEffect(() => {
    setLoading(true); setBrief(null); setError("");
    fetch(`${API}/api/morning-brief/${profession}`)
      .then(r=>{ if (!r.ok) throw new Error(`Morning brief request failed (${r.status})`); return r.json(); })
      .then(d=>{ setBrief(d); setLoading(false); })
      .catch(()=>{ setError("We could not load the morning brief."); setLoading(false); });
  }, [profession]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch {}
  };

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Inter',system-ui,sans-serif",
      background:t.bg, minHeight:"100vh", color:t.text1,
    }}>
      <div style={{ background:t.bg2, borderBottom:`1px solid ${t.border}`, padding:"0 1rem" }}>
        <div style={{ maxWidth:760, margin:"0 auto", display:"flex", alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:t.accent }}>धारा</a>
          <span style={{ color:t.text3 }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color:t.text2 }}>Morning Brief</span>
          <span style={{ marginLeft:"auto", fontSize:11, background:"#dcfce7", color:"#166534", padding:"2px 10px", borderRadius:12, fontWeight:600 }}>
            Ad-free
          </span>
        </div>
      </div>

      <div style={{ maxWidth:760, margin:"0 auto", padding:"2rem 1rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          marginBottom:"1.5rem", flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:800, color:t.text1, margin:"0 0 4px" }}>☀️ Morning Brief</h1>
            <p style={{ fontSize:14, color:t.text2, margin:0 }}>{today}</p>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {PROFESSIONS.map(p=>(
              <button key={p.key} onClick={()=>setProf(p.key)} style={{
                display:"flex", alignItems:"center", gap:5,
                padding:"6px 13px", borderRadius:20, border:"1.5px solid",
                borderColor: profession===p.key ? t.accent : t.border,
                background:  profession===p.key ? t.accent : t.bg2,
                color:       profession===p.key ? "#fff"   : t.text2,
                fontSize:13, fontWeight:profession===p.key?600:400, cursor:"pointer",
              }}><span style={{ fontSize:14 }}>{p.icon}</span>{p.label}</button>
            ))}
          </div>
        </div>

        {profession==="upsc" && (
          <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12,
            padding:"0.9rem 1rem", marginBottom:"1.5rem",
            display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, color:t.text1, flex:1 }}>
              📤 Share today's UPSC Current Affairs with your study group
            </span>
            <button onClick={copyLink} style={{
              padding:"6px 14px", background:t.accent, color:"#fff",
              border:"none", borderRadius:8, fontSize:12, fontWeight:600,
              cursor:"pointer", whiteSpace:"nowrap",
            }}>{copied?"✓ Copied!":"Copy link"}</button>
          </div>
        )}

        {loading ? (
          <div>
            <div style={{ background:t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1.2rem", marginBottom:"1.5rem" }}>
              <div className="skeleton" style={{ height:14, marginBottom:6, width:"90%" }} />
              <div className="skeleton" style={{ height:14, width:"70%" }} />
            </div>
            {[1,2,3,4,5].map(i=>(
              <div key={i} style={{ display:"flex", gap:14, padding:"1rem 0", borderBottom:`1px solid ${t.border2}` }}>
                <div className="skeleton" style={{ width:28, height:28, borderRadius:4, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div className="skeleton" style={{ height:14, marginBottom:6, width:"80%" }} />
                  <div className="skeleton" style={{ height:18, width:"95%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <PageState
            tone="error"
            icon="⚠️"
            title="Morning Brief is unavailable"
            message={error + " Please retry in a moment."}
            actionLabel="Retry"
            onAction={() => {
              setError("");
              setLoading(true);
              fetch(`${API}/api/morning-brief/${profession}`)
                .then(r=>{ if (!r.ok) throw new Error(`Morning brief request failed (${r.status})`); return r.json(); })
                .then(d=>{ setBrief(d); setLoading(false); })
                .catch(()=>{ setError("We could not load the morning brief."); setLoading(false); });
            }}
          />
        ) : (!brief || (!(brief.articles?.length) && !(brief.stories?.length))) ? (
          <PageState
            tone="empty"
            icon="📭"
            title="No brief available yet"
            message="Check back after 6 AM IST for the first edition of the day."
          />
        ) : (
          <>
            {(brief.digest || brief.intro) && (
              <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:12,
                padding:"1.2rem", marginBottom:"1.5rem",
                fontSize:15, color:t.text1, lineHeight:1.7 }}>
                {brief.digest || brief.intro}
              </div>
            )}
            {(brief.articles||brief.stories||[]).map((a,i)=>(
              <div key={a.id||i} style={{ display:"flex", gap:14, padding:"1rem 0",
                borderBottom:`1px solid ${t.border2}` }}>
                <div style={{ width:28, height:28, borderRadius:6, flexShrink:0,
                  background:t.accent, color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:12, fontWeight:700 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:6, marginBottom:5, flexWrap:"wrap" }}>
                    {a.domain && (
                      <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px",
                        borderRadius:8, background:t.bg3, color:t.text2, textTransform:"uppercase" }}>
                        {a.domain}
                      </span>
                    )}
                    <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px",
                      borderRadius:8, background:scoreBg(a.truth_score), color:scoreColor(a.truth_score) }}>
                      Score {a.truth_score}
                    </span>
                    {(a.exam_tags||[]).slice(0,2).map(tag=>(
                      <span key={tag} style={{ fontSize:10, padding:"1px 6px", borderRadius:6,
                        background:"#eff6ff", color:"#1e3a5f", fontWeight:500 }}>
                        {tag.replace(/_/g," ").toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <a href={`/article/${a.id}`} style={{ textDecoration:"none" }}>
                    <h3 style={{ margin:"0 0 4px", fontSize:16, fontWeight:700, color:t.text1, lineHeight:1.35 }}>
                      {a.headline}
                    </h3>
                  </a>
                  {a.summary_brief && (
                    <p style={{ margin:0, fontSize:14, color:t.text2, lineHeight:1.6 }}>
                      {sanitizeDisplayText(a.summary_brief)}
                    </p>
                  )}
                  <div style={{ marginTop:4, fontSize:11, color:t.text3 }}>
                    {a.source_count} source{a.source_count!==1?"s":""}
                    {a.published_at && ` · ${new Date(a.published_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
