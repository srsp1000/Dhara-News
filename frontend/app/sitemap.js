// Next.js dynamic sitemap — generates /sitemap.xml
// Includes all article URLs for Google News and search indexing

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE = "https://dhara.news";

export default async function sitemap() {
  const now = new Date().toISOString();

  // Static pages
  const staticPages = [
    { url: SITE,                      lastModified: now, changeFrequency: "hourly",  priority: 1.0 },
    { url: `${SITE}/morning-brief`,   lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE}/live`,            lastModified: now, changeFrequency: "hourly",  priority: 0.9 },
    { url: `${SITE}/trending`,        lastModified: now, changeFrequency: "hourly",  priority: 0.8 },
    { url: `${SITE}/search`,          lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/archive`,         lastModified: now, changeFrequency: "daily",   priority: 0.6 },
    { url: `${SITE}/about`,           lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Dynamic article pages (last 200 verified articles)
  let articlePages = [];
  try {
    const res = await fetch(
      `${API}/api/feed?limit=200&status=verified&offset=0`,
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const articles = await res.json();
      articlePages = (Array.isArray(articles) ? articles : []).map(a => ({
        url:             `${SITE}/article/${a.id}`,
        lastModified:    a.last_updated || a.first_seen || now,
        changeFrequency: "weekly",
        priority:        a.truth_score >= 75 ? 0.9 : 0.7,
      }));
    }
  } catch {}

  return [...staticPages, ...articlePages];
}
