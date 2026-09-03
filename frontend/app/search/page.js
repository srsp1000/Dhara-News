"use client";
import { useState, useRef } from "react";
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import { useThemeValues } from "../../lib/useThemeValues";
import { DOMAINS, PROFESSIONS, INDIAN_STATES } from "../../lib/constants";
import PageState from "../../components/ui/PageState";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DOMAIN_OPTS = ["", ...DOMAINS.filter(d => d !== "All")];
const PROF_OPTS   = ["", ...PROFESSIONS.map(p => p.key)];
const STATE_OPTS  = ["", ...INDIAN_STATES.filter(s => s !== "All States")];
const EXAM_OPTS   = ["","upsc_prelims","upsc_mains_gs1","upsc_mains_gs2","upsc_mains_gs3",
                     "upsc_mains_gs4","neet","jee","clat","gate","cat","ssc"];

const FILTER_DEFS = [
  { key:"domain",     label:"Domain",     opts:DOMAIN_OPTS },
  { key:"profession", label:"Profession", opts:PROF_OPTS },
  { key:"loc_state",  label:"State",      opts:STATE_OPTS },
  { key:"exam_tag",   label:"Exam Tag",   opts:EXAM_OPTS },
];

const SORT_OPTS = [
  { val:"relevance", label:"Most Relevant" },
  { val:"truth",     label:"Highest Truth Score" },
  { val:"latest",    label:"Most Recent" },
];

function scoreColor(s) { return s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b"; }
function scoreBg(s)    { return s >= 75 ? "#dcfce7" : s >= 50 ? "#fef3c7" : "#fee2e2"; }

export default function SearchPage() {
  const t = useThemeValues();
  const [q,        setQ]        = useState("");
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState("");
  const [sort,     setSort]     = useState("relevance");
  const [filters,  setFilters]  = useState({
    domain:"", profession:"", loc_state:"", exam_tag:"", date_from:"", date_to:"",
  });
  const inputRef = useRef(null);

  const doSearch = async (e) => {
    e?.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true); setSearched(true); setError("");
    const params = new URLSearchParams({ q: trimmed, limit:"30", sort });
    Object.entries(filters).forEach(([k,v]) => { if (v) params.set(k, v); });
    try {
      const res = await fetch(`${API}/api/search?${params}`);
      if (!res.ok) throw new Error(`Search request failed (${res.status})`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
      setError("We could not fetch search results right now.");
    } finally {
      setLoading(false);
    }
  };

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }));
  const clearAll  = () => {
    setQ(""); setResults([]); setSearched(false);
    setError("");
    setFilters({ domain:"", profession:"", loc_state:"", exam_tag:"", date_from:"", date_to:"" });
    inputRef.current?.focus();
  };

  const inp = {
    border: `1px solid ${t.border}`, borderRadius: 8,
    fontSize: 12, background: t.bg2, color: t.text1, outline: "none",
  };

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Inter',system-ui,sans-serif", background: t.bg,
      minHeight:"100vh", color: t.text1,
    }}>
      <div style={{ background: t.bg2, borderBottom:`1px solid ${t.border}`, padding:"0 1rem" }}>
        <div style={{ maxWidth:1000, margin:"0 auto", display:"flex", alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color: t.accent }}>धारा</a>
          <span style={{ color: t.text3 }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color: t.text2 }}>Advanced Search</span>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:"1.5rem 1rem" }}>
        <form onSubmit={doSearch} style={{
          background: t.bg2, border:`1px solid ${t.border}`,
          borderRadius:14, padding:"1.2rem", marginBottom:"1rem",
        }}>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              placeholder='Search: "Supreme Court", "UPSC 2026", "budget announcement"…'
              style={{
                flex:1, padding:"10px 16px", border:`1px solid ${t.border}`,
                borderRadius:10, fontSize:15, outline:"none",
                background: t.bg3, color: t.text1, transition:"border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = t.accent}
              onBlur={e => e.target.style.borderColor = t.border} />
            <button type="submit" style={{
              padding:"10px 22px", background: t.accent, color:"#fff",
              border:"none", borderRadius:10, fontSize:14, fontWeight:600,
              cursor:"pointer", whiteSpace:"nowrap",
            }}>Search</button>
            {(searched || q) && (
              <button type="button" onClick={clearAll} style={{
                padding:"10px 14px", background: t.bg3,
                border:`1px solid ${t.border}`, borderRadius:10,
                fontSize:13, cursor:"pointer", color: t.text2,
              }}>Clear</button>
            )}
          </div>

          <div className="search-filter-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:10 }}>
            {FILTER_DEFS.map(({ key, label, opts }) => (
              <div key={key}>
                <label style={{ fontSize:10, fontWeight:700, color: t.text3,
                  letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:4 }}>
                  {label}
                </label>
                <select value={filters[key]} onChange={e => setFilter(key, e.target.value)}
                  style={{ width:"100%", padding:"7px 8px", ...inp }}>
                  {opts.map(o => (
                    <option key={o} value={o}>
                      {o ? o.replace(/_/g," ").charAt(0).toUpperCase()+o.replace(/_/g," ").slice(1) : `All ${label}s`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="search-meta-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            {[["date_from","From Date"],["date_to","To Date"]].map(([key,label]) => (
              <div key={key}>
                <label style={{ fontSize:10, fontWeight:700, color: t.text3,
                  letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:4 }}>
                  {label}
                </label>
                <input type="date" value={filters[key]}
                  onChange={e => setFilter(key, e.target.value)}
                  style={{ width:"100%", padding:"7px 8px", ...inp }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize:10, fontWeight:700, color: t.text3,
                letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:4 }}>
                Sort By
              </label>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ width:"100%", padding:"7px 8px", ...inp }}>
                {SORT_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </form>

        {Object.values(filters).some(Boolean) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
            <span style={{ fontSize:12, color: t.text2, alignSelf:"center" }}>Active filters:</span>
            {Object.entries(filters).filter(([,v]) => v).map(([k,v]) => (
              <span key={k} style={{ display:"flex", alignItems:"center", gap:4,
                padding:"3px 10px", background: t.accent, color:"#fff",
                borderRadius:12, fontSize:12 }}>
                {k.replace(/_/g," ")}: {v}
                <button onClick={() => setFilter(k,"")} style={{
                  background:"none", border:"none", color:"#93c5fd",
                  cursor:"pointer", fontSize:14, lineHeight:1, padding:0,
                }}>×</button>
              </span>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: t.bg2, border:`1px solid ${t.border}`, borderRadius:12, padding:"1rem" }}>
                <div className="skeleton" style={{ height:14, marginBottom:8, width:"70%" }} />
                <div className="skeleton" style={{ height:18, marginBottom:6, width:"90%" }} />
                <div className="skeleton" style={{ height:13, width:"55%" }} />
              </div>
            ))}
          </div>
        )}

        {!loading && searched && error && (
          <PageState
            tone="error"
            icon="⚠️"
            title="Search is unavailable"
            message={error + " Please retry in a moment."}
            actionLabel="Retry search"
            onAction={() => doSearch()}
          />
        )}

        {!loading && searched && !error && results.length === 0 && (
          <PageState
            tone="empty"
            icon="🔍"
            title="No results found"
            message="Try broader keywords or clear one or two filters."
            actionLabel="Clear filters"
            onAction={clearAll}
          />
        )}

        {!loading && results.length > 0 && (
          <>
            <p style={{ fontSize:13, color: t.text2, marginBottom:12 }}>
              {results.length} result{results.length!==1?"s":""} for <strong>"{q}"</strong>
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {results.map(a => (
                <a key={a.id} href={`/article/${a.id}`} style={{
                  background: t.bg2, border:`1px solid ${t.border}`,
                  borderRadius:12, padding:"1rem 1.1rem", cursor:"pointer",
                  transition:"box-shadow 0.15s", textDecoration:"none", color:"inherit",
                }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow=`0 4px 12px ${t.shadowMd}`}
                  onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
                  <div style={{ display:"flex", gap:6, marginBottom:7, flexWrap:"wrap" }}>
                    {a.domain && (
                      <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px",
                        borderRadius:10, background: t.bg3, color: t.text2 }}>
                        {a.domain}
                      </span>
                    )}
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px",
                      borderRadius:10, background:scoreBg(a.truth_score), color:scoreColor(a.truth_score) }}>
                      Score {a.truth_score}
                    </span>
                    {a.loc_state && <span style={{ fontSize:11, color: t.text3 }}>📍 {a.loc_state}</span>}
                    {(a.exam_tags||[]).slice(0,2).map(tag => (
                      <span key={tag} style={{ fontSize:10, padding:"1px 6px", borderRadius:8,
                        background:"#eff6ff", color:"#1e3a5f" }}>
                        {tag.replace(/_/g," ").toUpperCase()}
                      </span>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:11, color: t.text3 }}>
                      {new Date(a.published_at||a.first_seen).toLocaleDateString("en-IN",
                        { day:"numeric", month:"short", year:"numeric" })}
                    </span>
                  </div>
                  <h2 style={{ margin:"0 0 6px", fontSize:16, fontWeight:600, color: t.text1, lineHeight:1.4 }}>
                    {a.headline}
                  </h2>
                  {a.summary_brief && (
                    <p style={{ margin:0, fontSize:14, color: t.text2, lineHeight:1.6 }}>
                      {sanitizeDisplayText(a.summary_brief)}
                    </p>
                  )}
                  <div style={{ marginTop:8, fontSize:12, color: t.text3 }}>
                    {a.source_count} source{a.source_count!==1?"s":""}
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {!searched && !loading && (
          <PageState
            tone="empty"
            icon="🔎"
            title="Search across verified news"
            message="Try: Supreme Court verdict, RBI rate hike, UPSC 2026, Chandrayaan"
          />
        )}
      </div>
    </div>
  );
}
