"use client";
import { useState, useEffect } from "react";
import { useThemeValues } from "../../lib/useThemeValues";
import { PROFESSIONS } from "../../lib/constants";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function scoreColor(s) { return s>=75?"#166534":s>=50?"#92400e":"#991b1b"; }
function scoreBg(s)    { return s>=75?"#dcfce7":s>=50?"#fef3c7":"#fee2e2"; }

const STATES = ["All India","Delhi","Maharashtra","Karnataka","Tamil Nadu","Gujarat",
  "Uttar Pradesh","West Bengal","Telangana","Kerala","Rajasthan","Bihar",
  "Punjab","Andhra Pradesh","Odisha","Assam"];

export default function TrendingPage() {
  const t = useThemeValues();
  const [view,     setView]     = useState("global");
  const [prof,     setProf]     = useState("upsc");
  const [state,    setState]    = useState("Delhi");
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit:"20" });
    if (view==="profession") params.set("profession", prof);
    if (view==="state")      params.set("loc_state",  state);
    fetch(`${API}/api/trending?${params}`)
      .then(r=>{ if (!r.ok) throw new Error(`Trending request failed (${r.status})`); return r.json(); })
      .then(d=>{ setArticles(Array.isArray(d)?d:[]); setLoading(false); })
      .catch(()=>{ setArticles([]); setError("We could not load trending stories."); setLoading(false); });
  }, [view, prof, state, reloadKey]);

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Inter',system-ui,sans-serif",
      background:t.bg, minHeight:"100vh", color:t.text1,
    }}>
      <div style={{ background:t.bg2, borderBottom:`1px solid ${t.border}`, padding:"0 1rem" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:t.accent }}>धारा</a>
          <span style={{ color:t.text3 }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color:t.text2 }}>🔥 Trending</span>
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"1.5rem 1rem" }}>
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {[["global","🌐 Global"],["profession","👤 By Profession"],["state","📍 By State"]].map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:"7px 16px", borderRadius:20, border:"1.5px solid",
              borderColor: view===v ? t.accent : t.border,
              background:  view===v ? t.accent : t.bg2,
              color:       view===v ? "#fff"   : t.text2,
              fontSize:13, fontWeight:view===v?600:400, cursor:"pointer",
            }}>{label}</button>
          ))}
        </div>

        {view==="profession" && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
            {PROFESSIONS.map(p=>(
              <button key={p.key} onClick={()=>setProf(p.key)} style={{
                display:"flex", alignItems:"center", gap:4,
                padding:"5px 12px", borderRadius:16, border:"1px solid",
                borderColor: prof===p.key ? t.accent : t.border,
                background:  prof===p.key ? "#eff6ff" : t.bg2,
                color:       prof===p.key ? t.accent  : t.text2,
                fontSize:12, fontWeight:prof===p.key?600:400, cursor:"pointer",
              }}><span>{p.icon}</span>{p.label}</button>
            ))}
          </div>
        )}

        {view==="state" && (
          <select value={state} onChange={e=>setState(e.target.value)} style={{
            marginBottom:14, padding:"7px 12px",
            border:`1px solid ${t.border}`, borderRadius:10,
            fontSize:13, background:t.bg2, color:t.text1, outline:"none",
          }}>
            {STATES.map(s=><option key={s}>{s}</option>)}
          </select>
        )}

        {loading ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {[1,2,3,4,5].map(i=>(
              <div key={i} style={{ background:t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1rem" }}>
                <div className="skeleton" style={{ height:14, marginBottom:8, width:"80%" }} />
                <div className="skeleton" style={{ height:18, width:"95%" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <PageState
            tone="error"
            icon="⚠️"
            title="Trending is unavailable"
            message={error + " Please retry in a moment."}
            actionLabel="Retry"
            onAction={() => setReloadKey(v => v + 1)}
          />
        ) : articles.length===0 ? (
          <PageState
            tone="empty"
            icon="🔥"
            title="No trending stories yet"
            message="Come back after more article views are recorded."
          />
        ) : (
          <div style={{ display:"grid", gap:12, gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))" }}>
            {articles.map((a,i)=>(
              <a key={a.id} href={`/article/${a.id}`} style={{
                background:t.bg2, border:`1px solid ${t.border}`,
                borderRadius:12, padding:"1rem",
                textDecoration:"none", color:"inherit", display:"block",
                transition:"box-shadow .15s",
              }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 4px 16px ${t.shadowMd}`}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{
                    width:28, height:28, borderRadius:8, flexShrink:0,
                    background: i<3 ? t.accent : t.bg3,
                    color: i<3 ? "#fff" : t.text3,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:700,
                  }}>{i+1}</span>
                  {a.domain && (
                    <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px",
                      borderRadius:8, background:t.bg3, color:t.text2,
                      textTransform:"uppercase" }}>{a.domain}</span>
                  )}
                  <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px",
                    borderRadius:8, background:scoreBg(a.truth_score),
                    color:scoreColor(a.truth_score), marginLeft:"auto" }}>
                    {a.truth_score}
                  </span>
                </div>
                <h3 style={{ margin:"0 0 6px", fontSize:14, fontWeight:600, color:t.text1, lineHeight:1.4 }}>
                  {a.headline}
                </h3>
                <div style={{ fontSize:11, color:t.text3 }}>
                  {a.view_count?`${a.view_count.toLocaleString("en-IN")} views · `:""}
                  {a.source_count} source{a.source_count!==1?"s":""}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
