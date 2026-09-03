// frontend/app/[profession]/page.js
// SEO-optimized profession landing pages: /upsc, /medical, /law etc.
import { sanitizeDisplayText } from "../../lib/textSanitizer";
import PageState from "../../components/ui/PageState";

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PROFESSION_META = {
  upsc: {
    title:"UPSC Current Affairs Today | Dhara News",
    desc:"Daily verified current affairs for UPSC aspirants. Prelims & Mains GS1-4 tagged. Source graph on every story.",
    heading:"UPSC Civil Services", icon:"🏛️",
    exams:["upsc_prelims","upsc_mains_gs2","upsc_mains_gs3"],
    sources:["PIB","The Hindu","Indian Express","Rajya Sabha TV","PRS India"],
    tip:"Articles are tagged with UPSC Prelims / Mains GS paper relevance automatically.",
  },
  medical: {
    title:"Medical & Health News | Dhara News",
    desc:"Drug approvals, CDSCO alerts, clinical trials, NEET PG news. Verified health journalism for Indian doctors and medical students.",
    heading:"Medical & Health", icon:"🩺",
    exams:["neet"],
    sources:["ICMR","CDSCO","The Hindu Health","WHO India","Lancet India"],
    tip:"Drug names are linked to pharmacology popups when you tap them.",
  },
  law: {
    title:"Supreme Court Judgements & Legal News | Dhara News",
    desc:"Supreme Court orders, High Court verdicts, new legislation, Bar Council updates. Verified legal news for lawyers and law students.",
    heading:"Law & Judiciary", icon:"⚖️",
    exams:["clat"],
    sources:["LiveLaw","Bar & Bench","Supreme Court of India","PRS India"],
    tip:"Case citations are auto-linked to the judgement text.",
  },
  technology: {
    title:"India Tech News Verified | Dhara News",
    desc:"Startup funding, AI developments, TRAI/MeitY policy, cybersecurity alerts. Verified tech news for India's tech professionals.",
    heading:"Technology", icon:"💻",
    exams:[],
    sources:["Inc42","TechCrunch India","YourStory","CERT-In","MeitY"],
    tip:"No filtered tech-bro hype — hard tech and policy focus.",
  },
  finance: {
    title:"Business & Finance News India | Dhara News",
    desc:"RBI policy, budget, Sensex/Nifty, startup ecosystem, SEBI circulars. Verified financial news for Indian investors and professionals.",
    heading:"Finance & Business", icon:"📈",
    exams:["cat"],
    sources:["RBI","SEBI","Economic Times","Mint","Bloomberg Quint"],
    tip:"SEBI circulars and RBI policy updates are priority-sourced.",
  },
  student: {
    title:"GK & Current Affairs for Students | Dhara News",
    desc:"Daily GK, awards, government schemes, important days. Simple language current affairs for CBSE, SSC, IBPS and competitive exam students.",
    heading:"Students & GK", icon:"🎓",
    exams:["ssc","upsc_prelims"],
    sources:["PIB","DD News","Ministry of Education","Competition Success Review"],
    tip:"Articles are written in simple language. Monthly GK PDF export available.",
  },
};

export async function generateStaticParams() {
  return Object.keys(PROFESSION_META).map(p => ({ profession: p }));
}

export async function generateMetadata({ params }) {
  const { profession } = await params;
  const meta = PROFESSION_META[profession];
  if (!meta) return { title:"Dhara News" };
  return { title: meta.title, description: meta.desc };
}

export default async function ProfessionPage({ params }) {
  const { profession: prof } = await params;
  const meta = PROFESSION_META[prof];
  if (!meta) {
    return (
      <div style={{ padding:"2rem", maxWidth:760, margin:"0 auto" }}>
        <PageState
          tone="empty"
          icon="🧭"
          title="Profession page not found"
          message="This section does not exist yet."
          actionLabel="Back to home"
          actionHref="/"
        />
      </div>
    );
  }

  let articles = [];
  try {
    articles = await fetch(`${API}/api/feed?profession=${prof}&limit=20&status=verified&require_fully_generated=true`, { cache: "no-store" })
      .then(r => r.json());
    if (!Array.isArray(articles)) articles = [];
    if (articles.length === 0) {
      articles = await fetch(`${API}/api/feed?profession=${prof}&limit=20&status=developing,verified&require_fully_generated=true`, { cache: "no-store" })
        .then(r => r.json());
      if (!Array.isArray(articles)) articles = [];
    }
  } catch {}

  const scoreColor = s => s >= 75 ? "#166534" : s >= 50 ? "#92400e" : "#991b1b";
  const scoreBg    = s => s >= 75 ? "#dcfce7" : s >= 50 ? "#fef3c7" : "#fee2e2";

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", background:"#f1f5f9", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ background:"#1e3a5f", padding:"0 1rem" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex",
          alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:"#fff" }}>धारा</a>
          <span style={{ color:"#93c5fd" }}>›</span>
          <span style={{ fontSize:14, color:"#e2e8f0" }}>{meta.icon} {meta.heading}</span>
          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
            <a href="/login" style={{ padding:"5px 12px", background:"rgba(255,255,255,.15)",
              color:"#fff", borderRadius:8, textDecoration:"none", fontSize:12 }}>Sign in</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"1.5rem 1rem",
        display:"grid", gridTemplateColumns:"1fr 300px", gap:"1.5rem" }}>

        {/* Main feed */}
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:"#1e293b", margin:"0 0 4px" }}>
            {meta.icon} {meta.heading} — Latest Verified News
          </h1>
          <p style={{ fontSize:13, color:"#64748b", margin:"0 0 1rem" }}>{meta.desc}</p>

          {/* Exam tags quick filter */}
          {meta.exams.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
              {meta.exams.map(e => (
                <a key={e} href={`/search?exam_tag=${e}`}
                  style={{ fontSize:11, padding:"3px 9px", borderRadius:12,
                    background:"#eff6ff", color:"#1e3a5f", textDecoration:"none",
                    border:"1px solid #bfdbfe", fontWeight:500 }}>
                  {e.replace(/_/g," ").toUpperCase()}
                </a>
              ))}
            </div>
          )}

          {articles.length === 0 ? (
            <PageState
              tone="empty"
              icon="📭"
              title="No articles yet for this profession"
              message="Check back in 15 minutes after the next crawl cycle."
              actionLabel="Open all news"
              actionHref="/"
            />
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {articles.map(a => (
                <a key={a.id} href={`/article/${a.id}`}
                  style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12,
                    padding:"1rem 1.1rem", textDecoration:"none", display:"block",
                    transition:"box-shadow .15s" }}
                >
                  <div style={{ display:"flex", gap:6, marginBottom:7, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:10,
                      background:scoreBg(a.truth_score), color:scoreColor(a.truth_score) }}>
                      ✓ {a.truth_score}
                    </span>
                    {(a.exam_tags||[]).slice(0,2).map(t => (
                      <span key={t} style={{ fontSize:10, padding:"1px 6px", borderRadius:8,
                        background:"#eff6ff", color:"#1e3a5f" }}>
                        {t.replace(/_/g," ").toUpperCase()}
                      </span>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8" }}>
                      {new Date(a.first_seen).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}
                    </span>
                  </div>
                  <h2 style={{ margin:"0 0 6px", fontSize:15, fontWeight:600,
                    color:"#1e293b", lineHeight:1.4 }}>{a.headline}</h2>
                  {a.summary_brief && (
                    <p style={{ margin:0, fontSize:13, color:"#64748b", lineHeight:1.6 }}>
                      {sanitizeDisplayText(a.summary_brief)}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0",
            borderRadius:12, padding:"1rem", marginBottom:"1rem" }}>
            <p style={{ fontSize:11, fontWeight:700, color:"#94a3b8",
              letterSpacing:".06em", textTransform:"uppercase", margin:"0 0 8px" }}>
              Top sources
            </p>
            {meta.sources.map(s => (
              <div key={s} style={{ fontSize:13, color:"#374151", padding:"5px 0",
                borderBottom:"1px solid #f8fafc" }}>
                {s}
              </div>
            ))}
          </div>

          <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe",
            borderRadius:12, padding:"1rem" }}>
            <p style={{ fontSize:12, fontWeight:600, color:"#1e3a5f", margin:"0 0 6px" }}>
              💡 {meta.icon} Tip
            </p>
            <p style={{ fontSize:12, color:"#374151", margin:0, lineHeight:1.6 }}>
              {meta.tip}
            </p>
          </div>

          <a href={`/search?profession=${prof}`}
            style={{ display:"block", marginTop:10, padding:"10px", background:"#1e3a5f",
              color:"#fff", borderRadius:10, textDecoration:"none", fontSize:13,
              fontWeight:600, textAlign:"center" }}>
            Advanced search for {meta.heading}
          </a>
        </aside>
      </div>
    </div>
  );
}
