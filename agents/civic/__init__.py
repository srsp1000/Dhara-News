"""
Dhara News — Civic Intelligence Agents
Three specialised agents for unique content no competitor offers:

1. ParliamentTrackerAgent  — Bill tracking, session business, MP votes from sansad.in
2. CourtOrderAgent         — Supreme Court daily orders → plain-English summaries
3. WikipediaOnThisDayAgent — Historical events for today's date (Wikipedia API)

All run on a daily schedule, store in story_clusters table like normal articles,
but tagged with special domain + exam tags for discoverability.
"""
import asyncio
import hashlib
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from base import BaseAgent, Q

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# PARLIAMENT TRACKER AGENT
# Polls sansad.in and PRS India for bill status, session business, votes
# Runs every 30 min during Parliament sessions, daily otherwise
# ═══════════════════════════════════════════════════════════════════════════════
class ParliamentTrackerAgent(BaseAgent):
    name         = "parliament-tracker"
    input_queue  = ""   # scheduler-driven
    output_queue = Q.DEDUP_FINGERPRINT

    POLL_INTERVAL_SESSION = 30 * 60   # 30 min when in session
    POLL_INTERVAL_RECESS  = 6 * 3600  # 6 hours when not in session

    # PRS India has a structured bill-tracking JSON endpoint
    PRS_BILLS_URL = "https://prsindia.org/api/bills?session=current&limit=20"

    # Sansad.in business list (HTML, needs parsing)
    SANSAD_LS_URL = "https://sansad.in/ls/business/business-list"
    SANSAD_RS_URL = "https://rajyasabha.nic.in/rsnew/rsbull/rsbull.asp"

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            try:
                await self._fetch_parliament_business()
                await self._fetch_prs_bills()
            except Exception as e:
                log.warning(f"Parliament tracker error: {e}")
            await asyncio.sleep(self.POLL_INTERVAL_SESSION)

    async def _fetch_parliament_business(self):
        """Fetch today's Lok Sabha business list and publish as structured article."""
        import httpx
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Check if we already processed today
        cache_key = f"parliament:business:{today}"
        cached = await self.cache_get(cache_key)
        if cached:
            return

        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(self.SANSAD_LS_URL, headers={
                    "User-Agent": "Mozilla/5.0 DharaNewsBot/1.0",
                    "Accept": "text/html",
                })
            if resp.status_code != 200:
                return

            # Extract text content (basic HTML stripping)
            html = resp.text
            # Remove script/style
            html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r'<[^>]+>', ' ', html)
            html = re.sub(r'\s{2,}', ' ', html).strip()

            # Only publish if content seems valid (has "Lok Sabha" or bill names)
            if "Lok Sabha" not in html and "Bill" not in html:
                return

            # Build article payload
            date_str = datetime.now(timezone.utc).strftime("%d %B %Y")
            payload = {
                "url":           f"https://sansad.in/ls/business/{today}",
                "title":         f"Lok Sabha Business — {date_str}",
                "description":   html[:3000],
                "full_body":     html[:8000],
                "published":     datetime.now(timezone.utc).isoformat(),
                "source_domain": "sansad.in",
                "source_tier":   1,
                "source_cred":   1.0,
                "domain_hint":   "politics",
                "profession_hint": ["upsc", "law"],
                "exam_tag_hint": ["upsc_prelims", "upsc_mains_gs2"],
                "content_type":  "parliament",
            }
            await self.publish(payload, priority=8)  # High priority — official source
            await self.cache_set(cache_key, "done", 3600 * 12)
            log.info(f"Parliament: Published today's Lok Sabha business")

        except Exception as e:
            log.warning(f"Parliament business fetch failed: {e}")

    async def _fetch_prs_bills(self):
        """Fetch recent bill updates from PRS India (best structured source)."""
        import httpx
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cache_key = f"parliament:bills:{today}"
        if await self.cache_get(cache_key):
            return

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # PRS India website — scrape their bill list page
                resp = await client.get(
                    "https://prsindia.org/billtrack",
                    headers={"User-Agent": "Mozilla/5.0 DharaNewsBot/1.0"}
                )
            if resp.status_code != 200:
                return

            html = resp.text
            # Extract bill names via pattern matching
            bills = re.findall(r'([A-Z][^<>\n]{10,80}(?:Bill|Amendment)[^<>\n]{0,40})', html)
            bills = list(dict.fromkeys(bills))[:10]  # deduplicate, top 10

            if not bills:
                return

            date_str = datetime.now(timezone.utc).strftime("%d %B %Y")
            bill_list = "\n".join(f"• {b.strip()}" for b in bills[:10])

            payload = {
                "url":           f"https://prsindia.org/billtrack/{today}",
                "title":         f"Parliament Bills Update — {date_str}",
                "description":   f"Bills currently in Parliament as of {date_str}:\n{bill_list}",
                "full_body":     f"Bills currently before Parliament ({date_str}):\n\n{bill_list}\n\nSource: PRS India Legislative Research",
                "published":     datetime.now(timezone.utc).isoformat(),
                "source_domain": "prsindia.org",
                "source_tier":   1,
                "source_cred":   0.95,
                "domain_hint":   "politics",
                "profession_hint": ["upsc", "law"],
                "exam_tag_hint": ["upsc_mains_gs2", "clat"],
                "content_type":  "parliament",
            }
            await self.publish(payload, priority=7)
            await self.cache_set(cache_key, "done", 3600 * 12)
            log.info(f"Parliament: Published bill update ({len(bills)} bills)")

        except Exception as e:
            log.warning(f"PRS bills fetch failed: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None  # Scheduler-driven only


# ═══════════════════════════════════════════════════════════════════════════════
# COURT ORDER AGENT
# Downloads Supreme Court daily cause list and order summaries
# Runs at 6 PM IST (when SC typically uploads orders)
# ═══════════════════════════════════════════════════════════════════════════════
class CourtOrderAgent(BaseAgent):
    name         = "court-orders"
    input_queue  = ""
    output_queue = Q.DEDUP_FINGERPRINT

    SC_ORDERS_URL   = "https://main.sci.gov.in/supremecourt/temp/order{date}.pdf"
    SC_CAUSELIST_URL= "https://main.sci.gov.in/causelist"

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            now = datetime.now(timezone(timedelta(hours=5, minutes=30)))  # IST
            # Run at 4 PM and 7 PM IST (when SC uploads orders)
            if now.hour in (16, 19):
                try:
                    await self._fetch_sc_orders()
                except Exception as e:
                    log.warning(f"Court order fetch error: {e}")
            await asyncio.sleep(3600)  # Check hourly

    async def _fetch_sc_orders(self):
        """Fetch Supreme Court daily orders page and create article."""
        import httpx
        today = datetime.now(timezone.utc)
        date_str = today.strftime("%d %B %Y")
        cache_key = f"court:orders:{today.strftime('%Y-%m-%d')}"

        if await self.cache_get(cache_key):
            return

        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(self.SC_CAUSELIST_URL, headers={
                    "User-Agent": "Mozilla/5.0 DharaNewsBot/1.0"
                })

            if resp.status_code != 200:
                return

            html = resp.text
            html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s{2,}', ' ', html).strip()

            if len(text) < 100:
                return

            # Extract case names (typically "vs" patterns)
            cases = re.findall(r'([A-Z][^.!?\n]{10,100}(?:vs|v/s|versus)[^.!?\n]{5,80})', text)
            cases = list(dict.fromkeys(cases))[:8]

            case_list = "\n".join(f"• {c.strip()}" for c in cases[:8]) if cases else text[:1000]

            payload = {
                "url":           f"https://main.sci.gov.in/causelist/{today.strftime('%Y%m%d')}",
                "title":         f"Supreme Court — Today's Cause List ({date_str})",
                "description":   f"Supreme Court of India cause list for {date_str}. Cases listed for hearing:\n{case_list}",
                "full_body":     text[:5000],
                "published":     datetime.now(timezone.utc).isoformat(),
                "source_domain": "main.sci.gov.in",
                "source_tier":   1,
                "source_cred":   1.0,
                "domain_hint":   "judiciary",
                "profession_hint": ["law", "upsc"],
                "exam_tag_hint": ["upsc_mains_gs2", "clat"],
                "content_type":  "court",
            }
            await self.publish(payload, priority=8)
            await self.cache_set(cache_key, "done", 3600 * 8)
            log.info(f"Court: Published SC cause list ({len(cases)} cases)")

        except Exception as e:
            log.warning(f"SC orders fetch failed: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# WIKIPEDIA ON THIS DAY AGENT
# Fetches historical events for today's date — free Wikipedia API, no rate limits
# Runs once at midnight IST, cached for 24 hours
# ═══════════════════════════════════════════════════════════════════════════════
class WikipediaOnThisDayAgent(BaseAgent):
    name         = "wikipedia-otd"
    input_queue  = ""
    output_queue = Q.DEDUP_FINGERPRINT

    WIKI_API = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/{type}/{month}/{day}"

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        # Run immediately on start, then daily
        await self._fetch_today()
        while self.running:
            await asyncio.sleep(24 * 3600)
            await self._fetch_today()

    async def _fetch_today(self):
        import httpx
        now = datetime.now(timezone.utc)
        month = now.strftime("%m")
        day   = now.strftime("%d")
        year  = now.year
        date_str = now.strftime("%d %B")

        cache_key = f"wiki:otd:{now.strftime('%Y-%m-%d')}"
        if await self.cache_get(cache_key):
            return

        events  = await self._fetch_type("events",  month, day)
        births  = await self._fetch_type("births",  month, day)
        deaths  = await self._fetch_type("deaths",  month, day)

        if not events:
            return

        # Filter for India-relevant events
        india_keywords = [
            "India", "Indian", "Gandhi", "Nehru", "Modi", "Delhi", "Mumbai",
            "Pakistan", "Bangladesh", "Mughal", "British India", "Independence",
            "Constitution", "Parliament", "Supreme Court", "ISRO", "Chandrayaan",
            "Bollywood", "Cricket", "IPL", "Olympic", "Nobel"
        ]

        def india_score(text):
            text_lower = text.lower()
            return sum(1 for kw in india_keywords if kw.lower() in text_lower)

        # Sort by India relevance, take top 5 + 3 global notable ones
        events_sorted = sorted(events, key=lambda e: india_score(e.get("text","")) * 10 + (year - e.get("year", 0)) * -1, reverse=True)
        top_events = events_sorted[:8]

        # Build article body
        lines = [f"## On This Day — {date_str}\n"]
        lines.append("### Historical Events")
        for ev in top_events:
            year_ev = ev.get("year", "")
            text_ev = ev.get("text", "").strip()
            if text_ev:
                lines.append(f"**{year_ev}** — {text_ev}")

        if births:
            notable_births = sorted(births, key=lambda b: india_score(b.get("text","")), reverse=True)[:3]
            if notable_births:
                lines.append("\n### Notable Births")
                for b in notable_births:
                    lines.append(f"**{b.get('year','')}** — {b.get('text','').strip()}")

        body = "\n\n".join(lines)

        # Also store structured JSON for frontend widget
        structured = {
            "events": [{"year": e.get("year"), "text": e.get("text","").strip()} for e in top_events],
            "births": [{"year": b.get("year"), "text": b.get("text","").strip()} for b in (births[:5] if births else [])],
            "date":   {"month": month, "day": day, "display": date_str},
        }

        # Store structured data in Redis for frontend widget (no DB article needed)
        await self.redis_client.setex(
            f"otd:structured:{now.strftime('%Y-%m-%d')}",
            25 * 3600,
            json.dumps(structured)
        )

        # Also publish as a story
        payload = {
            "url":           f"https://en.wikipedia.org/wiki/Wikipedia:On_this_day/{month}_{day}",
            "title":         f"On This Day — {date_str}: Key Events in History",
            "description":   "\n".join(f"{e.get('year')} — {e.get('text','').strip()}" for e in top_events[:3]),
            "full_body":     body,
            "published":     datetime.now(timezone.utc).isoformat(),
            "source_domain": "en.wikipedia.org",
            "source_tier":   2,
            "source_cred":   0.85,
            "domain_hint":   "general",
            "profession_hint": ["upsc", "student", "general"],
            "exam_tag_hint": ["upsc_prelims", "upsc_mains_gs1"],
            "content_type":  "historical",
        }
        await self.publish(payload, priority=6)
        await self.cache_set(cache_key, "done", 3600 * 24)
        log.info(f"Wikipedia OTD: Published {len(top_events)} historical events for {date_str}")

    async def _fetch_type(self, event_type: str, month: str, day: str) -> list:
        import httpx
        url = self.WIKI_API.format(type=event_type, month=month.lstrip("0"), day=day.lstrip("0"))
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "DharaNewsBot/1.0 (dhara.news)"
                })
            if resp.status_code == 200:
                data = resp.json()
                return data.get(event_type, [])
        except Exception as e:
            log.warning(f"Wikipedia {event_type} fetch failed: {e}")
        return []

    async def process(self, payload: dict) -> dict | None:
        return None


if __name__ == "__main__":
    import sys
    agents = {
        "parliament": ParliamentTrackerAgent,
        "court":      CourtOrderAgent,
        "wikipedia":  WikipediaOnThisDayAgent,
    }
    name = sys.argv[1] if len(sys.argv) > 1 else "parliament"
    agents.get(name, ParliamentTrackerAgent).run()
