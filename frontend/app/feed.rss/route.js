// /feed.rss — RSS 2.0 feed for Google News inclusion

const API  = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE = "https://dhara.news";

function esc(s) {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

export async function GET() {
  let articles = [];
  try {
    const res = await fetch(`${API}/api/feed?limit=50&status=verified`,
      { next: { revalidate: 900 } });
    if (res.ok) articles = await res.json();
  } catch {}

  const items = (Array.isArray(articles) ? articles : []).map(a => {
    const pubDate = a.published_at || a.first_seen
      ? new Date(a.published_at || a.first_seen).toUTCString()
      : new Date().toUTCString();
    const tags = (a.exam_tags || [])
      .map(t => `<category>${esc(t.replace(/_/g," "))}</category>`).join("");
    return `
    <item>
      <title>${esc(a.headline)}</title>
      <link>${SITE}/article/${a.id}</link>
      <guid isPermaLink="true">${SITE}/article/${a.id}</guid>
      <description>${esc(a.summary_brief || a.headline)}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${esc(a.domain || "general")}</category>
      ${tags}
      ${a.image_url ? `<enclosure url="${esc(a.image_url)}" type="image/jpeg" length="0"/>` : ""}
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>धारा News — Verified News for India</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/feed.rss" rel="self" type="application/rss+xml"/>
    <description>AI-verified Indian news with Truth Scores. Personalized for professionals.</description>
    <language>en-IN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <managingEditor>news@dhara.news (धारा News)</managingEditor>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type":  "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, stale-while-revalidate=1800",
    },
  });
}
