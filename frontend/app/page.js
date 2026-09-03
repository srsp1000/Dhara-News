"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import ArticleCard from "../components/news/ArticleCard";
import ArticleModal from "../components/news/ArticleModal";
import Sidebar from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import TrendingSidebar from "../components/layout/TrendingSidebar";
import { useThemeValues } from "../lib/useThemeValues";
import OfflineIndicator from "../components/features/OfflineIndicator";
import { PROFESSIONS } from "../lib/constants";
import PageState from "../components/ui/PageState";

const API = "";
const REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithFallback(path, options) {
  const bases = [""];

  for (const base of bases) {
    const url = `${base}${path}`;
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok) return await res.json();
    } catch {
      // Try next base URL.
    }
  }
  return null;
}

async function postWithFallback(path, options) {
  const bases = [""];

  for (const base of bases) {
    const url = `${base}${path}`;
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok) return true;
    } catch {
      // Try next base URL.
    }
  }
  return false;
}

function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function shiftYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getRecentDateOptions(todayYmd) {
  const out = [];
  // Show previous 3 dates + today (4 chips total)
  for (let i = 3; i >= 0; i--) {
    const ymd = shiftYmd(todayYmd, -i);
    const d = new Date(`${ymd}T00:00:00+05:30`);
    out.push({
      key: ymd,
      label: i === 0 ? "Today" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

function OnboardingTooltip({ onDismiss }) {
  return (
    <div style={{
      position:"fixed", bottom:24, right:24, zIndex:500,
      background:"#1e3a5f", color:"#fff", borderRadius:4,
      padding:"1.2rem 1.4rem", maxWidth:290,
      boxShadow:"0 8px 32px rgba(0,0,0,0.3)",
      fontSize:13, lineHeight:1.6, border:"1px solid rgba(255,255,255,0.1)",
    }}>
      <button onClick={onDismiss} style={{
        position:"absolute", top:8, right:10, background:"none",
        border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:16,
      }}>✕</button>
      <div style={{
        fontFamily:"'Georgia','Times New Roman',serif",
        fontWeight:700, marginBottom:10, fontSize:15,
        letterSpacing:-0.2,
      }}>Welcome to धारा</div>
      {[
        ["Truth Score","Every story is AI-verified across multiple sources. Green = verified, yellow = verified (needs confirmation)."],
        ["Depth toggle","Switch Headline / Brief / Deep Dive in the top bar."],
        ["Live blog","Click LIVE in the header for real-time breaking news."],
        ["Push alerts","Tap 🔔 to receive breaking news on your device."],
      ].map(([k,v]) => (
        <div key={k} style={{ marginBottom:7 }}>
          <strong style={{ color:"#86efac" }}>{k}</strong>{" — "}{v}
        </div>
      ))}
      <button onClick={onDismiss} style={{
        marginTop:10, width:"100%", padding:"8px",
        background:"#0f7b6c", border:"none", borderRadius:3,
        color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer",
      }}>Got it</button>
    </div>
  );
}

function HomePageContent() {
  const t = useThemeValues();
  const [profession, setProfession] = useState("general");
  const [domain,     setDomain]     = useState("All");
  const [state,      setState]      = useState("All States");
  const [district,   setDistrict]   = useState("All Districts");
  const [depth,      setDepth]      = useState("brief");
  const [articles,   setArticles]   = useState([]);
  const [trending,   setTrending]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [offset,     setOffset]     = useState(0);
  const [hasMore,    setHasMore]    = useState(true);
  const [sortMode,   setSortMode]   = useState("latest");
  const [searchRes,  setSearchRes]  = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [rangeDays, setRangeDays] = useState(7);
  const [examTag, setExamTag] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dateOptions, setDateOptions] = useState([]);
  const [todayMaxDate, setTodayMaxDate] = useState("");
  const [feedNotice, setFeedNotice] = useState("");
  const [feedError, setFeedError] = useState("");
  const [searchError, setSearchError] = useState("");
  const dateInputRef = useRef(null);

  useEffect(() => {
    // Compute date labels only on client to avoid server/client day-boundary mismatches.
    const today = getIstYmd();
    setDateOptions(getRecentDateOptions(today));
    setTodayMaxDate(today);
    setSelectedDate(today);
    setRangeDays(0);
  }, []);

  const handleSetProfession = useCallback((nextProfession) => {
    setProfession(nextProfession);
    // Avoid conflicting taxonomy filters: profession mode resets domain filter.
    if (nextProfession !== "general" && domain !== "All") {
      setDomain("All");
    }
  }, [domain]);

  const handleSetDomain = useCallback((nextDomain) => {
    setDomain(nextDomain);
    // Avoid conflicting taxonomy filters: domain mode resets profession filter.
    if (nextDomain !== "All" && profession !== "general") {
      setProfession("general");
    }
  }, [profession]);

  useEffect(() => {
    // Read domain from URL params (for section page navigation)
    const domainParam = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("domain")
      : null;
    if (domainParam) setDomain(domainParam);
    // Also read from sessionStorage
    try {
      const storedDomain = sessionStorage.getItem("dhara_domain_filter");
      if (storedDomain && storedDomain !== "All") { setDomain(storedDomain); sessionStorage.removeItem("dhara_domain_filter"); }
      if (!sessionStorage.getItem("dhara_v3_welcomed")) setShowOnboarding(true);
    } catch {}
  }, []); // eslint-disable-line

  // Lock body scroll when mobile filter drawer open
  useEffect(() => {
    if (!showMobileFilters) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showMobileFilters]);

  const fetchFeed = useCallback(async (reset = true, nextOffset = 0) => {
    setLoading(true);
    setFeedNotice("");
    setFeedError("");
    const params = new URLSearchParams({
      profession, limit:"20", status:"developing,verified",
    });
    params.set("sort", sortMode);
    if (domain !== "All")       params.set("domain",    domain);
    if (state !== "All States") params.set("loc_state", state);
    if (district !== "All Districts") params.set("loc_district", district);
    if (examTag) params.set("exam_tag", examTag);
    if (!reset) params.set("offset", String(nextOffset));

    // Compute date filter (exact selected date OR optional rolling range).
    const rangeStart = shiftYmd(getIstYmd(), -(Math.max(rangeDays, 1) - 1));

    if (selectedDate) {
      params.set("date_from", selectedDate);
      params.set("date_to", selectedDate);
    } else if (rangeDays > 0) {
      params.set("date_from", rangeStart);
    }

    const [feed, trend] = await Promise.all([
      fetchJsonWithFallback(`/api/feed?${params}`, { cache: "no-store" }),
      fetchJsonWithFallback(`/api/trending?profession=${profession}&limit=8`, { cache: "no-store" }),
    ]);

    if (feed === null) {
      setFeedError("We could not load the feed right now.");
    }

    let incoming = Array.isArray(feed) ? feed : [];

    // If a strict single-day filter yields no stories, gracefully fallback to recent days.
    if (reset && incoming.length === 0 && selectedDate) {
      const fallbackParams = new URLSearchParams(params.toString());
      const fallbackStart = shiftYmd(getIstYmd(), -6);
      fallbackParams.set("date_from", fallbackStart);
      fallbackParams.delete("date_to");
      const fallbackFeed = await fetchJsonWithFallback(`/api/feed?${fallbackParams}`, { cache: "no-store" });
      const fallbackIncoming = Array.isArray(fallbackFeed) ? fallbackFeed : [];
      if (fallbackIncoming.length > 0) {
        incoming = fallbackIncoming;
        setFeedNotice("No stories for selected date. Showing recent stories.");
      }
    }
    if (reset) {
      setArticles(incoming);
      setOffset(incoming.length);
    } else {
      setArticles(prev => {
        const seen = new Set(prev.map(a => a?.id));
        const fresh = incoming.filter(a => a?.id && !seen.has(a.id));
        return [...prev, ...fresh];
      });
      setOffset(nextOffset + incoming.length);
    }
    setTrending(Array.isArray(trend) ? trend : []);
    setHasMore(incoming.length === 20);
    setLoading(false);
  }, [profession, domain, state, district, selectedDate, rangeDays, examTag, sortMode]);

  useEffect(() => {
    setSearchRes(null);
    fetchFeed(true);
  }, [profession, domain, state, district, depth, selectedDate, rangeDays, examTag, sortMode]); // eslint-disable-line

  const loadMore = () => { fetchFeed(false, offset); };

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchRes(null); setSearchError(""); return; }
    setLoading(true);
    setSearchError("");
    const params = new URLSearchParams({ q, limit:"20", sort:"relevance" });
    if (domain !== "All")      params.set("domain", domain);
    if (profession !== "general") params.set("profession", profession);
    if (examTag) params.set("exam_tag", examTag);
    const res = await fetchJsonWithFallback(`/api/search?${params}`);
    if (res === null) {
      setSearchRes([]);
      setSearchError("Search is temporarily unavailable.");
    } else {
      setSearchRes(res?.results || []);
    }
    setLoading(false);
  };

  const openArticle = async (id) => {
    setModalLoading(true);
    setSelected({ _loading:true, id });
    const res = await fetchJsonWithFallback(`/api/article/${id}`);
    setModalLoading(false);
    if (res) setSelected(res); else setSelected(null);
    postWithFallback(`/api/article/${id}/view?profession=${encodeURIComponent(profession)}`, {
      method:"POST",
    }).catch(() => {});
  };

  const display = searchRes !== null ? searchRes : articles;

  return (
    <div suppressHydrationWarning style={{
      fontFamily:"'Segoe UI',-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
      background:t.bg, minHeight:"100vh", color:t.text1,
    }}>
      <Header
        profession={profession} setProfession={handleSetProfession}
        depth={depth} setDepth={setDepth}
        domain={domain} setDomain={handleSetDomain}
        state={state} setState={setState}
        district={district} setDistrict={setDistrict}
        onSearch={doSearch} searchActive={searchRes !== null}
        onClearSearch={() => setSearchRes(null)}
      />

      <div className="page-container">
        <div className="feed-grid">
          <Sidebar
            domain={domain}
            setDomain={handleSetDomain}
            state={state}
            setState={setState}
            district={district}
            setDistrict={setDistrict}
            examTag={examTag}
            setExamTag={setExamTag}
          />

          <main>
            {/* Date filter: past week dates */}
            {searchRes === null && (
              <div className="date-tabs-row" style={{ marginBottom:"0.75rem", display:"flex", flexDirection:"column", gap:8 }}>
                <div className="date-tabs-scroll" style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"nowrap", overflowX:"auto" }}>
                  <button
                    onClick={() => {
                      const el = dateInputRef.current;
                      if (!el) return;
                      if (typeof el.showPicker === "function") {
                        el.showPicker();
                      } else {
                        el.focus();
                        el.click();
                      }
                    }}
                    title="Pick a date"
                    style={{
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      padding:"5px 9px", borderRadius:20,
                      border:`1px solid ${selectedDate ? t.accent : t.border}`,
                      background:selectedDate ? t.accent : t.bg2,
                      color:selectedDate ? "#fff" : t.text2,
                      fontSize:12, cursor:"pointer", whiteSpace:"nowrap",
                    }}
                  >
                    📅
                  </button>

                  <input
                    ref={dateInputRef}
                    type="date"
                    value={selectedDate}
                    max={todayMaxDate || undefined}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setRangeDays(0);
                    }}
                    aria-hidden="true"
                    tabIndex={-1}
                    style={{
                      position:"absolute",
                      width:1,
                      height:1,
                      opacity:0,
                      pointerEvents:"none",
                    }}
                  />

                  <div style={{ width:1, alignSelf:"stretch", background:t.border, margin:"0 4px" }} />

                  {dateOptions.map(opt => (
                    <button key={opt.key} onClick={() => setSelectedDate(opt.key)}
                      style={{
                        padding:"5px 11px", borderRadius:20,
                        border:`1px solid ${selectedDate===opt.key ? t.accent : t.border}`,
                        background:selectedDate===opt.key ? t.accent : t.bg2,
                        color:selectedDate===opt.key ? "#fff" : t.text2,
                        fontSize:12, fontWeight:selectedDate===opt.key ? 600 : 400,
                        cursor:"pointer", whiteSpace:"nowrap",
                      }}>
                      {opt.label}
                    </button>
                  ))}

                  <div style={{ width:1, alignSelf:"stretch", background:t.border, margin:"0 4px" }} />

                  {[7,15].map(days => (
                    <button key={`range-${days}`}
                      onClick={() => { setRangeDays(days); setSelectedDate(""); }}
                      style={{
                        padding:"5px 11px", borderRadius:20,
                        border:`1px solid ${!selectedDate && rangeDays===days ? t.accent : t.border}`,
                        background:!selectedDate && rangeDays===days ? t.accent : t.bg2,
                        color:!selectedDate && rangeDays===days ? "#fff" : t.text2,
                        fontSize:12, fontWeight:!selectedDate && rangeDays===days ? 600 : 400,
                        cursor:"pointer", whiteSpace:"nowrap",
                      }}>
                      {`Past ${days} days`}
                    </button>
                  ))}

                  <div style={{ width:1, alignSelf:"stretch", background:t.border, margin:"0 4px" }} />

                  {[ ["verified", "Most Verified"], ["latest", "Latest"] ].map(([key, label]) => (
                    <button key={`sort-${key}`}
                      onClick={() => setSortMode(key)}
                      style={{
                        padding:"5px 11px", borderRadius:20,
                        border:`1px solid ${sortMode===key ? t.accent : t.border}`,
                        background:sortMode===key ? t.accent : t.bg2,
                        color:sortMode===key ? "#fff" : t.text2,
                        fontSize:12, fontWeight:sortMode===key ? 600 : 400,
                        cursor:"pointer", whiteSpace:"nowrap",
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchRes !== null && (
              <div style={{
                marginBottom:"1rem", padding:"0.6rem 1rem",
                background:t.bg2, borderRadius:3,
                border:`1px solid ${t.border}`,
                fontSize:13, color:t.text2,
              }}>
                {searchRes.length} result{searchRes.length!==1?"s":""} found
              </div>
            )}

            {searchRes === null && feedNotice && (
              <div style={{
                marginBottom:"1rem", padding:"0.6rem 1rem",
                background:t.bg2, borderRadius:3,
                border:`1px solid ${t.border}`,
                fontSize:13, color:t.text2,
              }}>
                {feedNotice}
              </div>
            )}

            {/* Mobile filters button */}
            <button className="mobile-filter-btn"
              onClick={() => setShowMobileFilters(true)}
              style={{
                display:"none", marginBottom:"0.75rem",
                padding:"8px 14px", borderRadius:3,
                border:`1px solid ${t.border}`,
                background:t.bg2, color:t.text2,
                fontSize:13, fontWeight:600, cursor:"pointer",
                alignItems:"center", gap:6, width:"100%",
              }}>
              ☰ Filters &amp; Sections
            </button>

            {loading && display.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {[1,2,3,4,5].map(i => <SkeletonCard key={i} t={t} />)}
              </div>
            ) : searchRes !== null && searchError ? (
              <PageState
                tone="error"
                icon="⚠️"
                title="Search is unavailable"
                message={searchError + " Please try again in a moment."}
              />
            ) : searchRes === null && feedError ? (
              <PageState
                tone="error"
                icon="⚠️"
                title="Feed is unavailable"
                message={feedError + " Check your connection and refresh."}
              />
            ) : display.length === 0 ? (
              <EmptyState t={t} searchMode={searchRes !== null} />
            ) : (
              <>
                {/* Breaking news banner */}
                {searchRes === null && (() => {
                  const breaking = sortMode === "latest"
                    ? display[0]
                    : display.find(a => a.truth_score >= 75 && a.status === "verified");
                  return breaking ? (
                    <div onClick={() => openArticle(breaking.id)}
                      style={{ cursor:"pointer", background:"#dc2626", color:"#fff",
                        padding:"10px 16px", marginBottom:12, borderRadius:4,
                        display:"flex", alignItems:"center", gap:10, fontSize:13 }}>
                      <span style={{ fontWeight:800, letterSpacing:1, fontSize:11 }}>🔴 BREAKING</span>
                      <span style={{ fontWeight:600, flex:1, lineHeight:1.3 }}>{breaking.headline}</span>
                      <span style={{ opacity:0.7, fontSize:11, flexShrink:0 }}>
                        {new Date(breaking.published_at||breaking.first_seen).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
                      </span>
                    </div>
                  ) : null;
                })()}

                {/* Hero grid — top 3 articles */}
                {searchRes === null && display.length >= 3 && (
                  <div className="hero-grid" style={{ marginBottom:"1.5rem" }}>
                    <ArticleCard article={display[0]} depth={depth} onClick={openArticle} hero />
                    <ArticleCard article={display[1]} depth={depth} onClick={openArticle} hero />
                    <ArticleCard article={display[2]} depth={depth} onClick={openArticle} hero />
                  </div>
                )}

                {/* Section header for rest */}
                {searchRes === null && display.length > 3 && (
                  <div className="section-header">
                    <span className="section-header-label">
                      {domain !== "All" ? `${domain.charAt(0).toUpperCase()+domain.slice(1)} News` : "Latest News"}
                    </span>
                    <div style={{ flex:1, height:1, background:t.border, marginLeft:10 }} />
                  </div>
                )}

                {/* List feed */}
                <div style={{
                  background:t.bg2,
                  border:`1px solid ${t.border}`,
                  borderRadius:3,
                  padding:"10px 0",
                  display:"flex",
                  flexDirection:"column",
                  gap:10,
                }}>
                  {(searchRes !== null || display.length < 3 ? display : display.slice(3)).map((a, i) => (
                    <div key={a.id} style={{ padding:"0 14px" }}>
                      <ArticleCard article={a} depth={depth} onClick={openArticle} />
                      {/* Ad slot every 7 articles */}
                      {i > 0 && i % 7 === 0 && <AdSlot t={t} />}
                    </div>
                  ))}
                </div>

                {hasMore && searchRes === null && (
                  <button onClick={loadMore} disabled={loading}
                    style={{
                      width:"100%", marginTop:12, padding:"12px",
                      background:t.bg2, border:`1px solid ${t.border}`,
                      borderRadius:3, cursor:loading?"not-allowed":"pointer",
                      fontSize:14, fontWeight:600, color:t.text2,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                      letterSpacing:0.3,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.bg3}
                    onMouseLeave={e => e.currentTarget.style.background = t.bg2}>
                    {loading ? <><span className="spinner"/>Loading…</> : "Load more stories"}
                  </button>
                )}
              </>
            )}
          </main>

          <TrendingSidebar trending={trending} profession={profession} onClick={openArticle} />
        </div>
      </div>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div onClick={() => setShowMobileFilters(false)}
          style={{
            position:"fixed", inset:0,
            background:"rgba(0,0,0,0.5)", zIndex:210,
            display:"flex", justifyContent:"flex-start",
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width:"min(340px,92vw)", height:"100%",
              background:t.bg, borderRight:`1px solid ${t.border}`,
              padding:"0.75rem", overflowY:"auto",
            }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <strong style={{ fontSize:15, color:t.text1, fontFamily:"'Georgia',serif" }}>Sections</strong>
              <button onClick={() => setShowMobileFilters(false)}
                style={{
                  border:`1px solid ${t.border}`, borderRadius:3,
                  width:32, height:32, background:t.bg2, color:t.text2, cursor:"pointer",
                }}>✕</button>
            </div>
            <Sidebar
              inDrawer
              domain={domain}
              setDomain={d => { handleSetDomain(d); setShowMobileFilters(false); }}
              state={state}
              setState={s => { setState(s); setShowMobileFilters(false); }}
              district={district}
              setDistrict={d => { setDistrict(d); setShowMobileFilters(false); }}
              examTag={examTag}
              setExamTag={setExamTag}
            />
          </div>
        </div>
      )}

      {/* Modal loading */}
      {modalLoading && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
          zIndex:190, display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{
            background:t.bg2, borderRadius:4, padding:"1.5rem 2rem",
            display:"flex", alignItems:"center", gap:12,
            fontSize:14, color:t.text2, boxShadow:"0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <span className="spinner" /> Loading article…
          </div>
        </div>
      )}

      {selected && !selected._loading && (
        <ArticleModal article={selected} initialDepth={depth} onClose={() => setSelected(null)} />
      )}

      {showOnboarding && (
        <OnboardingTooltip onDismiss={() => {
          setShowOnboarding(false);
          try { sessionStorage.setItem("dhara_v3_welcomed","1"); } catch {}
        }} />
      )}

      <OfflineIndicator />
    </div>
  );
}

function SkeletonCard({ t }) {
  return (
    <div style={{
      background:t.bg2, borderBottom:`1px solid ${t.border}`,
      padding:"14px 0", display:"flex", gap:12,
    }}>
      <div className="skeleton" style={{ width:3, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div className="skeleton" style={{ height:11, marginBottom:8, width:"60%" }} />
        <div className="skeleton" style={{ height:17, marginBottom:6, width:"90%" }} />
        <div className="skeleton" style={{ height:13, width:"75%" }} />
      </div>
      <div className="skeleton" style={{ width:100, height:72, flexShrink:0, borderRadius:2 }} />
    </div>
  );
}

function EmptyState({ t, searchMode }) {
  return (
    <PageState
      tone="empty"
      icon={searchMode ? "🔍" : "📭"}
      title={searchMode ? "No matching results" : "No articles found"}
      message={searchMode ? "Try simpler keywords or clear one filter." : "Try a different section or check back soon."}
    />
  );
}

function AdSlot({ t }) {
  return (
    <div style={{
      margin:"8px 0", padding:"12px",
      border:`1px dashed ${t.border}`, minHeight:80,
      background:t.bg3, borderRadius:3,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <span style={{ fontSize:11, color:t.text3, letterSpacing:0.5 }}>ADVERTISEMENT</span>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
