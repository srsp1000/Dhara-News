"""
Email Digest Agent — sends daily morning brief via Brevo (free: 300/day)
Schedule: 5:30 AM IST daily via APScheduler in base.py

Setup:
  1. Sign up at brevo.com (free)
  2. API → Generate API key
  3. Add BREVO_API_KEY=your_key to .env
"""
import os, json, logging, asyncio
from datetime import datetime, timezone
import httpx

log = logging.getLogger(__name__)
API_URL = os.environ.get("INTERNAL_API_URL", "http://localhost:8000")
BREVO_KEY = os.environ.get("BREVO_API_KEY", "")
FROM_EMAIL = os.environ.get("DIGEST_FROM_EMAIL", "brief@dhara.news")
FROM_NAME  = os.environ.get("DIGEST_FROM_NAME", "धारा Morning Brief")

EMAIL_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{ margin:0; padding:0; background:#f1f5f9; font-family:'Segoe UI',system-ui,sans-serif; }}
  .wrap {{ max-width:600px; margin:0 auto; background:#fff; }}
  .header {{ background:#1e3a5f; padding:20px 30px; }}
  .logo {{ color:#fff; font-size:28px; font-weight:700; font-family:Georgia,serif; margin:0; }}
  .tagline {{ color:rgba(255,255,255,0.6); font-size:12px; margin:4px 0 0; letter-spacing:1px; }}
  .body {{ padding:24px 30px; }}
  .date {{ font-size:13px; color:#64748b; margin-bottom:20px; }}
  .intro {{ background:#eff6ff; border-left:3px solid #1e3a5f; padding:12px 16px;
            margin-bottom:24px; font-size:14px; color:#1e293b; line-height:1.6; }}
  .story {{ border-bottom:1px solid #f1f5f9; padding:16px 0; }}
  .story:last-child {{ border-bottom:none; }}
  .num {{ display:inline-block; width:24px; height:24px; background:#1e3a5f; color:#fff;
          border-radius:50%; font-size:11px; font-weight:700; text-align:center;
          line-height:24px; margin-right:10px; vertical-align:top; }}
  .domain {{ font-size:10px; font-weight:700; text-transform:uppercase; color:#64748b;
             letter-spacing:0.5px; margin-bottom:5px; }}
  .headline {{ font-size:16px; font-weight:700; color:#1e293b; line-height:1.3;
               text-decoration:none; display:block; margin-bottom:6px; }}
  .brief {{ font-size:13px; color:#475569; line-height:1.6; margin-bottom:6px; }}
  .score {{ display:inline-block; font-size:10px; font-weight:700; padding:2px 8px;
            border-radius:10px; }}
  .score.verified {{ background:#dcfce7; color:#166534; }}
  .score.developing {{ background:#fef3c7; color:#92400e; }}
  .footer {{ background:#f8fafc; padding:16px 30px; border-top:1px solid #e2e8f0; }}
  .footer-text {{ font-size:11px; color:#94a3b8; line-height:1.6; }}
  .unsub {{ color:#94a3b8; }}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <p class="logo">धारा</p>
    <p class="tagline">MORNING BRIEF · {date} · {profession}</p>
  </div>
  <div class="body">
    <p class="date">Good morning! Here are today's top verified stories for {profession_label}.</p>
    {intro_html}
    {stories_html}
  </div>
  <div class="footer">
    <p class="footer-text">
      You're receiving this because you subscribed to धारा Morning Brief.<br>
      <a href="{unsubscribe_url}" class="unsub">Unsubscribe</a> · 
      <a href="https://dhara.news" class="unsub">Read on dhara.news</a>
    </p>
  </div>
</div>
</body></html>
"""

def render_story(i: int, story: dict) -> str:
    score = story.get("truth_score", 0)
    score_class = "verified" if score >= 75 else "developing"
    score_label = f"{'✓ Verified' if score>=75 else '⏳ Developing'} · {score}/100"
    url = f"https://dhara.news/article/{story.get('id','')}"
    brief = story.get("summary_brief") or ""
    return f"""
    <div class="story">
      <span class="num">{i+1}</span>
      <div class="domain">{story.get('domain','').upper()}</div>
      <a href="{url}" class="headline">{story.get('headline','')}</a>
      {f'<p class="brief">{brief[:200]}</p>' if brief else ''}
      <span class="score {score_class}">{score_label}</span>
    </div>"""

async def send_digest(email: str, profession: str, unsubscribe_token: str):
    """Fetch brief and send via Brevo API."""
    if not BREVO_KEY:
        log.warning("BREVO_API_KEY not set — digest not sent")
        return False

    # Fetch morning brief
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{API_URL}/api/morning-brief/{profession}")
        if not r.is_success:
            log.warning(f"Brief fetch failed for {profession}")
            return False
        brief_data = r.json()

    stories = brief_data.get("articles") or brief_data.get("stories") or []
    if not stories:
        log.info(f"No stories for {profession} — skipping digest")
        return False

    today_str = datetime.now(timezone.utc).strftime("%A, %d %B %Y")
    prof_labels = {
        "general":"General News", "upsc":"UPSC / Civil Services",
        "medical":"Medical", "law":"Law", "technology":"Technology",
        "finance":"Finance", "student":"Students", "defence":"Defence",
        "agriculture":"Agriculture", "environment":"Environment",
    }
    intro_html = f'<div class="intro">{brief_data.get("intro","")}</div>' if brief_data.get("intro") else ""
    stories_html = "".join(render_story(i, s) for i, s in enumerate(stories[:7]))

    html = EMAIL_HTML_TEMPLATE.format(
        date=today_str,
        profession=profession.upper(),
        profession_label=prof_labels.get(profession, profession),
        intro_html=intro_html,
        stories_html=stories_html,
        unsubscribe_url=f"https://dhara.news/api/digest/unsubscribe?token={unsubscribe_token}",
    )

    # Send via Brevo
    payload = {
        "sender": {"name": FROM_NAME, "email": FROM_EMAIL},
        "to": [{"email": email}],
        "subject": f"☀️ धारा Morning Brief — {today_str}",
        "htmlContent": html,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_KEY, "Content-Type": "application/json"},
            json=payload,
        )
    if resp.is_success:
        log.info(f"Digest sent to {email} ({profession})")
        return True
    else:
        log.warning(f"Brevo error {resp.status_code}: {resp.text[:200]}")
        return False


async def send_all_digests(db_pool):
    """Called by scheduler at 5:30 AM IST."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT user_id, email, profession, unsubscribe_token FROM email_preferences WHERE digest_enabled=TRUE"
        )
    log.info(f"Sending digests to {len(rows)} subscribers")
    sent, failed = 0, 0
    for row in rows:
        try:
            ok = await send_digest(row["email"], row["profession"] or "general", row["unsubscribe_token"] or "")
            if ok: sent += 1
            else: failed += 1
        except Exception as e:
            log.warning(f"Digest error for {row['email']}: {e}")
            failed += 1
        await asyncio.sleep(0.5)  # Brevo rate limit
    log.info(f"Digest run complete: {sent} sent, {failed} failed")
