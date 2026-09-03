"use client";
import { useState, useEffect, useCallback } from "react";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { useThemeValues } from "../../lib/useThemeValues";
import { DOMAINS } from "../../lib/constants";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DOMAINS_LIST = ["", ...DOMAINS.filter(d => d !== "All")];

function today() { return new Date().toISOString().split("T")[0]; }

export default function ArchivePage() {
  const t = useThemeValues();
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [selDate,  setSelDate]  = useState(today());
  const [domain,   setDomain]   = useState("");
  const [heatmap,  setHeatmap]  = useState({});
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [autoDateTried, setAutoDateTried] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/archive/heatmap?year=${calYear}&month=${calMonth}`)
      .then(r=>r.json())
      .then(data => {
        const m = {};
        (Array.isArray(data)?data:[]).forEach(d => { m[d.date] = d.count; });
        setHeatmap(m);
      }).catch(()=>{});
  }, [calYear, calMonth]);

  const fetchDay = useCallback(() => {
    setLoading(true);
    setError("");
    const p = new URLSearchParams({ date: selDate, limit:"60" });
    if (domain) p.set("domain", domain);
    fetch(`${API}/api/archive?${p}`)
      .then(r=>{ if (!r.ok) throw new Error(`Archive request failed (${r.status})`); return r.json(); })
      .then(d=>{ setArticles(d.articles||[]); setLoading(false); })
      .catch(()=>{ setArticles([]); setError("We could not load this archive date."); setLoading(false); });
  }, [selDate, domain]);

  useEffect(() => { fetchDay(); }, [fetchDay]);

  useEffect(() => {
    if (loading||autoDateTried||articles.length>0||selDate!==today()) return;
    setAutoDateTried(true);
    fetch(`${API}/api/feed?limit=1&status=developing,verified`)
      .then(r=>r.json())
      .then(d => {
        if (!Array.isArray(d)||d.length===0) return;
        const dt = d[0]?.first_seen ? new Date(d[0].first_seen).toISOString().split("T")[0] : null;
        if (dt&&dt!==selDate) setSelDate(dt);
      }).catch(()=>{});
  }, [loading, autoDateTried, articles.length, selDate]);

  const daysInMonth  = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWk = new Date(calYear, calMonth-1, 1).getDay();
  const monthLabel   = new Date(calYear, calMonth-1).toLocaleString("en-IN", { month:"long", year:"numeric" });

  const prevMonth = () => { if(calMonth===1){setCalMonth(12);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===12){setCalMonth(1);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); };

  const maxCount = Math.max(1, ...Object.values(heatmap));
  function heatLevel(count) {
    if (!count) return 0;
    const r = count/maxCount;
    if (r>0.75) return 4; if (r>0.5) return 3; if (r>0.25) return 2; return 1;
  }
  const HEAT = ["#e2e8f0","#bfdbfe","#93c5fd","#3b82f6","#1d4ed8"];

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Inter',system-ui,sans-serif",
      background:t.bg, minHeight:"100vh", color:t.text1,
    }}>
      <div style={{ background:t.bg2, borderBottom:`1px solid ${t.border}`, padding:"0 1rem" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:t.accent }}>धारा</a>
          <span style={{ color:t.text3 }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color:t.text2 }}>📅 Date Archive</span>
        </div>
      </div>

      <div className="archive-layout" style={{ maxWidth:1100, margin:"0 auto", padding:"1.5rem 1rem",
        display:"grid", gridTemplateColumns:"300px 1fr", gap:"1.5rem" }}>

        {/* Calendar */}
        <div>
          <div style={{ background:t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1rem", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <button onClick={prevMonth} style={{ width:30, height:30, borderRadius:8,
                border:`1px solid ${t.border}`, background:t.bg3, cursor:"pointer", fontSize:14, color:t.text2 }}>‹</button>
              <span style={{ fontSize:13, fontWeight:700, color:t.text1 }}>{monthLabel}</span>
              <button onClick={nextMonth} style={{ width:30, height:30, borderRadius:8,
                border:`1px solid ${t.border}`, background:t.bg3, cursor:"pointer", fontSize:14, color:t.text2 }}>›</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
                <div key={d} style={{ fontSize:10, fontWeight:700, color:t.text3, textAlign:"center", padding:"2px 0" }}>{d}</div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
              {Array.from({ length: firstDayOfWk }).map((_,i)=><div key={`pad-${i}`}/>)}
              {Array.from({ length: daysInMonth }).map((_,i)=>{
                const d   = i+1;
                const iso = `${calYear}-${String(calMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const cnt = heatmap[iso]||0;
                const lv  = heatLevel(cnt);
                const sel = iso===selDate;
                const fut = new Date(iso)>new Date();
                return (
                  <button key={d} disabled={fut} onClick={()=>setSelDate(iso)}
                    title={cnt?`${cnt} articles`:"No articles"}
                    style={{ width:"100%", aspectRatio:"1", borderRadius:6,
                      border: sel?"2px solid #1e3a5f":"2px solid transparent",
                      background: sel?"#1e3a5f":HEAT[lv],
                      color: sel?"#fff":(lv>=3?"#fff":"#374151"),
                      fontSize:11, fontWeight:sel?700:400,
                      cursor:fut?"not-allowed":"pointer",
                      opacity:fut?0.3:1, transition:"all .1s" }}>
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Heatmap legend */}
            <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, color:t.text3 }}>Articles:</span>
              <div style={{ display:"flex", gap:3 }}>
                {HEAT.map((c,i)=>(
                  <div key={i} style={{ width:16, height:16, borderRadius:4,
                    background:c, border:`1px solid ${t.border}` }}/>
                ))}
              </div>
              <span style={{ fontSize:10, color:t.text3 }}>None → Many</span>
            </div>
          </div>

          <div style={{ background:t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1rem" }}>
            <p style={{ fontSize:10, fontWeight:700, color:t.text3, letterSpacing:"0.07em",
              textTransform:"uppercase", margin:"0 0 8px" }}>Filter by Domain</p>
            <select value={domain} onChange={e=>setDomain(e.target.value)} style={{
              width:"100%", padding:"7px 10px",
              border:`1px solid ${t.border}`, borderRadius:8,
              fontSize:13, background:t.bg2, color:t.text1, outline:"none",
            }}>
              {DOMAINS_LIST.map(d=>(
                <option key={d} value={d}>
                  {d?d.charAt(0).toUpperCase()+d.slice(1):"All Domains"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Articles */}
        <div>
          <h2 style={{ fontSize:17, fontWeight:700, color:t.text1, margin:"0 0 12px" }}>
            {new Date(selDate).toLocaleDateString("en-IN",
              { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
            {" "}<span style={{ fontSize:13, fontWeight:400, color:t.text3 }}>{articles.length} articles</span>
          </h2>

          {loading ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[1,2,3].map(i=>(
                <div key={i} style={{ background:t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1rem" }}>
                  <div className="skeleton" style={{ height:14, marginBottom:8, width:"70%" }} />
                  <div className="skeleton" style={{ height:18, marginBottom:6, width:"90%" }} />
                  <div className="skeleton" style={{ height:13, width:"55%" }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <PageState
              tone="error"
              icon="⚠️"
              title="Archive is unavailable"
              message={error + " Please retry now."}
              actionLabel="Retry"
              onAction={fetchDay}
            />
          ) : articles.length===0 ? (
            <PageState
              tone="empty"
              icon="📭"
              title="No archived articles for this date"
              message="Try another date or remove the domain filter."
            />
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {articles.map(a=>(
                <a key={a.id} href={`/article/${a.id}`} style={{
                  background:t.bg2, border:`1px solid ${t.border}`,
                  borderRadius:12, padding:"0.9rem 1rem",
                  textDecoration:"none", color:"inherit", display:"block",
                  transition:"box-shadow .15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 4px 12px ${t.shadowMd}`}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                  <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                    {a.domain && (
                      <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px",
                        borderRadius:8, background:t.bg3, color:t.text2 }}>{a.domain}</span>
                    )}
                    {(a.exam_tags||[]).slice(0,2).map(tag=>(
                      <span key={tag} style={{ fontSize:10, padding:"1px 6px",
                        borderRadius:6, background:t.bg3, color:t.text2 }}>
                        {tag.replace(/_/g," ").toUpperCase()}
                      </span>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:11, color:t.text3 }}>
                      {new Date(a.published_at||a.first_seen).toLocaleTimeString("en-IN",
                        { hour:"2-digit", minute:"2-digit" })}
                    </span>
                  </div>
                  <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:600, color:t.text1, lineHeight:1.4 }}>
                    {a.headline}
                  </h3>
                  {a.summary_brief && (
                    <p style={{ margin:0, fontSize:13, color:t.text2, lineHeight:1.5 }}>
                      {sanitizeDisplayText(a.summary_brief)}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
