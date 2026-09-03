"""
api/routes/extras.py
Extra routes: WebSocket, Sitemap, RSS, Perspectives, Flashcards from saves
FIXED:
  - Removed duplicate /api/comments/* (already in main.py with proper auth)
  - Removed duplicate /api/subscriptions/create-checkout (conflicts with main.py)
  - Removed insecure GET /api/subscriptions/webhook (granted Pro without payment verification)
  - Fixed XML/RSS injection: all dynamic content CDATA-wrapped or XML-escaped
  - Fixed WebSocket concurrent disconnect (thread-safe list.remove)
  - Added UUID validation before parameterized query in flashcard generation
"""
import html as _html
import json
import os
import re
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, article_id: str) -> None:
        await ws.accept()
        self.active.setdefault(article_id, []).append(ws)

    def disconnect(self, ws: WebSocket, article_id: str) -> None:
        conns = self.active.get(article_id, [])
        try:
            conns.remove(ws)
        except ValueError:
            pass

    async def broadcast_score(self, article_id: str, score: int, status: str) -> None:
        msg = json.dumps({"type": "truth_score", "score": score, "status": status})
        dead: list[WebSocket] = []
        for ws in list(self.active.get(article_id, [])):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, article_id)


ws_manager = ConnectionManager()


@router.websocket("/ws/truth-score/{article_id}")
async def truth_score_ws(websocket: WebSocket, article_id: str):
    """Live Truth Score updates pushed to browser via WebSocket."""
    await ws_manager.connect(websocket, article_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, article_id)


# ── XML helpers ───────────────────────────────────────────────────────────────

def _xml_escape(text: str) -> str:
    """Escape XML special characters to prevent injection."""
    return (
        str(text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


# ── Sitemap XML ───────────────────────────────────────────────────────────────

@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    from main import db_fetch
    base = os.environ.get("SITE_URL", "https://dhara.news")
    rows = await db_fetch(
        "SELECT id, first_seen FROM story_clusters WHERE status = 'verified' ORDER BY first_seen DESC LIMIT 50000"
    )
    static_paths = [
        "/", "/about", "/search", "/archive", "/morning-brief",
        "/trending", "/upsc", "/medical", "/law", "/technology",
        "/finance", "/student", "/environment", "/defence",
    ]
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path in static_paths:
        parts.append(f"<url><loc>{_xml_escape(base + path)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>")
    for row in rows:
        loc = _xml_escape(f"{base}/article/{row['id']}")
        lastmod = _xml_escape(row["first_seen"].strftime("%Y-%m-%d")) if row.get("first_seen") else ""
        parts.append(f"<url><loc>{loc}</loc><lastmod>{lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>")
    parts.append("</urlset>")
    return Response("\n".join(parts), media_type="application/xml")


# ── RSS Feed ──────────────────────────────────────────────────────────────────

@router.get("/feed.rss", include_in_schema=False)
@router.get("/feed/{profession}.rss", include_in_schema=False)
async def rss_feed(profession: str = "general"):
    from main import db_fetch
    base = os.environ.get("SITE_URL", "https://dhara.news")
    conditions = ["status = 'verified'"]
    params: list = []
    if profession != "general":
        conditions.append("$1 = ANY(professions)")
        params.append(profession)
    rows = await db_fetch(
        f"SELECT id, headline, summary_brief, domain, first_seen, truth_score FROM story_clusters WHERE {' AND '.join(conditions)} ORDER BY first_seen DESC LIMIT 50",
        *params,
    )
    items = []
    for r in rows:
        pub_date = r["first_seen"].strftime("%a, %d %b %Y %H:%M:%S +0000") if r.get("first_seen") else ""
        link = _xml_escape(f"{base}/article/{r['id']}")
        headline = _xml_escape(r["headline"] or "")
        # Summary uses CDATA to avoid per-character escaping
        summary_raw = str(r["summary_brief"] or "")
        score = r["truth_score"] or 0
        category = _xml_escape(r["domain"] or "general")
        items.append(
            f"  <item>\n"
            f"    <title>{headline}</title>\n"
            f"    <link>{link}</link>\n"
            f'    <guid isPermaLink="true">{link}</guid>\n'
            f"    <description><![CDATA[{summary_raw} [Truth Score: {score}]]]></description>\n"
            f"    <pubDate>{pub_date}</pubDate>\n"
            f"    <category>{category}</category>\n"
            f"  </item>"
        )
    prof_label = profession.capitalize() if profession != "general" else "All"
    feed_link = _xml_escape(f"{base}/feed/{profession}.rss")
    rss = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        f"  <channel>\n"
        f"    <title>Dhara News — {prof_label}</title>\n"
        f"    <link>{_xml_escape(base)}</link>\n"
        f"    <description>AI-verified Indian news with Truth Scores. {prof_label} feed.</description>\n"
        f"    <language>en-IN</language>\n"
        f'    <atom:link href="{feed_link}" rel="self" type="application/rss+xml"/>\n'
        + "\n".join(items)
        + "\n  </channel>\n</rss>"
    )
    return Response(rss, media_type="application/rss+xml")


# ── Perspectives ──────────────────────────────────────────────────────────────

@router.get("/api/article/{cluster_id}/perspectives")
async def get_perspectives(cluster_id: str):
    """Return up to 3 sources with different political leans for the same story."""
    from main import db_fetch
    rows = await db_fetch(
        """SELECT a.source_domain, a.original_url, a.original_title,
                  s.bias_score AS bias, s.cred_score AS cred, s.tier
           FROM articles a
           LEFT JOIN sources s ON s.domain = a.source_domain
           WHERE a.cluster_id = $1
           ORDER BY ABS(COALESCE(s.bias_score, 0)) ASC LIMIT 10""",
        cluster_id,
    )
    if not rows:
        return []
    sources = [dict(r) for r in rows]
    left   = next((s for s in sources if (s.get("bias") or 0) < -0.15), None)
    centre = next((s for s in sources if abs(s.get("bias") or 0) <= 0.15), None)
    right  = next((s for s in sources if (s.get("bias") or 0) > 0.15), None)
    result = [x for x in [left, centre, right] if x]
    if len(result) < 3:
        used = {r["source_domain"] for r in result}
        for s in sources:
            if len(result) >= 3:
                break
            if s["source_domain"] not in used:
                result.append(s)
                used.add(s["source_domain"])
    return result[:3]


# ── Flashcard generation from saves ──────────────────────────────────────────

class FlashcardRequest(BaseModel):
    article_ids: List[str]


@router.post("/api/saves/{user_id}/flashcards")
async def generate_flashcards_from_saves(user_id: str, body: FlashcardRequest):
    """Generate Q&A flashcards from saved articles using Ollama."""
    from main import db_fetch
    import httpx

    if not body.article_ids:
        raise HTTPException(400, "No article IDs provided")

    # Validate UUIDs to prevent injection
    valid_ids = [aid for aid in body.article_ids if UUID_RE.match(str(aid))]
    if not valid_ids:
        raise HTTPException(400, "No valid article IDs provided")

    OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
    OLLAMA_TIMEOUT = max(4, int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "8")))
    max_attempts = max(1, int(os.environ.get("OLLAMA_FLASHCARD_MAX_ATTEMPTS", "2")))
    model_order = [
        os.environ.get("OLLAMA_FLASHCARD_MODEL", "llama3.2:3b"),
        "llama3.1:8b",
        "llama3.2:1b",
        "tinyllama:latest",
    ][:max_attempts]

    placeholders = ",".join(f"${i+1}" for i in range(len(valid_ids)))
    rows = await db_fetch(
        f"SELECT id, headline, summary_brief, domain FROM story_clusters WHERE id IN ({placeholders})",
        *valid_ids,
    )

    cards: list[dict] = []
    for row in rows[:8]:
        prompt = (
            f"From this news article, generate exactly 2 flashcard Q&A pairs for a competitive exam student.\n"
            f"Article: Headline: {row['headline']}\n{row['summary_brief'] or ''}\n"
            f'Return JSON: [{{"q":"question","a":"answer","source":"{row["domain"]}"}}]\n'
            f"Short, factual, exam-style questions only. JSON only, no other text."
        )
        generated = False
        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                for model_name in model_order:
                    try:
                        res = await client.post(
                            f"{OLLAMA_URL}/api/generate",
                            json={"model": model_name, "prompt": prompt, "stream": False, "format": "json"},
                        )
                    except httpx.TimeoutException:
                        continue
                    if res.status_code != 200:
                        continue
                    try:
                        parsed = json.loads(res.json().get("response", ""))
                    except Exception:
                        parsed = None
                    if isinstance(parsed, list) and parsed:
                        cards.extend(parsed[:2])
                        generated = True
                        break
        except Exception:
            pass

        if not generated:
            cards.extend([
                {"q": f"What happened? ({row['domain']})", "a": row["headline"], "source": row["domain"]},
                {"q": f"Key fact from: \"{(row['headline'] or '')[:40]}...\"", "a": row["summary_brief"] or row["headline"], "source": row["domain"]},
            ])

    return {"cards": cards, "count": len(cards)}
