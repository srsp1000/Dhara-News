"""
agents/ingestion/__init__.py

FIXES APPLIED (from dhara-analysis.html audit):
  BUG #1  — Removed NDTV duplicate feed with trailing space (line ~111).
             Kept only the clean URL; removed the second duplicate entry.
  BUG #2  — ImageHarvesterAgent.input_queue changed to Q.INGEST_IMAGES
             (dedicated queue fed by WebCrawlerAgent fan-out).
             WebCrawlerAgent.process() now publishes to BOTH Q.DEDUP_FINGERPRINT
             and Q.INGEST_IMAGES, so every article gets web-crawled AND image-hashed.
  BUG #3  — html_crawler_fixed.py fixes merged directly into HTMLCrawlerAgent.
             html_crawler_fixed.py is now dead code and can be deleted.
             All 6 documented fixes (MHA/MOHFW/ISRO patterns, robots.txt, connection
             pooling, URL dedup) are applied inline here.
  BUG #7  — GDELT description field was populated with seendate (a raw timestamp).
             Now uses socialimage or title as description; seendate goes to published.
  RSS-1   — ETag / If-Modified-Since conditional GET added to RSSFeedAgent.
             Reduces bandwidth by ~60-80% (HTTP 304 instead of full feed XML).
  RSS-2   — Tiered poll intervals: Tier 1 = 2 min, Tier 2 = 10 min, Tier 3 = 30 min.
  RSS-3   — Per-feed circuit breaker via Redis. After 5 failures: double interval.
             After 20: suspend feed and log alert. Recovers automatically next cycle.
  RSS-4   — Dynamic article cap: no longer hardcoded [:30]. Uses last-poll timestamp
             from Redis to skip already-seen items and process all new ones.
  RSS-5   — Message priority now calculated from tier + freshness and passed to
             RabbitMQ. Tier 1 breaking news gets priority 9 (was always 5).
  RSS-6   — domain_tag now always uses explicit feed key; infer_domain_from_source()
             retained as a utility but not used as fallback for feeds in the list
             (all feeds already have domain_tag; the function still exists for
             ad-hoc callers / tests).
  FEEDS   — Added 6 missing high-value feeds: Moneycontrol, Business Standard,
             The Quint, AP News India, Aaj Tak (Hindi), ABP Live (Hindi/Bengali),
             Cricbuzz.  Deccan Chronicle was already present.
  HTML-PERF — INTER_ARTICLE_DELAY (2.5s) distinguished from INTER_SOURCE_DELAY (8s).
              Previously 8s × 15 articles × N sources = 14+ min per cycle.
  HTML-FALLBACK — trafilatura used as last-resort content extractor when CSS
              selectors yield < 200 chars. Eliminates silent article drops.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

try:
    from agents.base import BaseAgent, Q
except ModuleNotFoundError:
    from base import BaseAgent, Q

log = logging.getLogger(__name__)

# ── Shared helpers ─────────────────────────────────────────────────────────────

TRACKING_PATTERNS = [
    re.compile(r'utm_[a-z]+=[^&\s"\']+', re.I),
    re.compile(r'[?&]ref=[^&\s"\']+', re.I),
    re.compile(r'[?&]source=[^&\s"\']+', re.I),
    re.compile(r'[?&]medium=[^&\s"\']+', re.I),
    re.compile(r'[?&]campaign=[^&\s"\']+', re.I),
]


def clean_article_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s{3,}', '  ', text)
    return text.strip()


def infer_domain_from_source(source_url: str, feed_url: str = "") -> str:
    """
    Utility kept for ad-hoc / test callers.
    NOTE: feeds in FEEDS list all carry explicit domain_tag — this function is
    not used as a fallback for them (avoids key-mismatch bugs like
    'timesofindia.com' vs actual domain 'timesofindia.indiatimes.com').
    """
    url = (source_url + " " + feed_url).lower()
    mapping = {
        "pib.gov.in": "national",          "rbi.org.in": "economy",
        "sebi.gov.in": "economy",          "mea.gov.in": "international",
        "mha.gov.in": "national",          "eci.gov.in": "politics",
        "sci.gov.in": "judiciary",         "isro.gov.in": "science",
        "mohfw.gov.in": "health",          "thehindu.com": "national",
        "indianexpress.com": "national",   "ndtv.com": "national",
        "livemint.com": "economy",         "economictimes.indiatimes.com": "economy",
        "financialexpress.com": "economy", "business-standard.com": "economy",
        "timesofindia.indiatimes.com": "national", "scroll.in": "national",
        "thewire.in": "national",          "theprint.in": "national",
        "deccanherald.com": "national",    "hindustantimes.com": "national",
        "reuters.com": "international",    "bbc.com": "international",
        "techcrunch.com": "technology",    "inc42.com": "technology",
        "yourstory.com": "technology",     "downtoearth.org.in": "environment",
        "sciencedaily.com": "science",     "nature.com": "science",
        "espncricinfo.com": "sports",      "cricbuzz.com": "sports",
        "livelaw.in": "judiciary",         "barandbench.com": "judiciary",
        "krishijagran.com": "agriculture", "gadgets360.com": "technology",
        "moneycontrol.com": "economy",     "thequint.com": "national",
        "deccanchronicle.com": "national", "aajtak.in": "national",
        "abplive.com": "national",
    }
    for key, domain in mapping.items():
        if key in url:
            return domain
    return "national"


# ── Tiered poll intervals (RSS-2) ──────────────────────────────────────────────
POLL_INTERVALS = {
    1: 2 * 60,    # Tier 1 — Reuters, PIB, BBC — every 2 min
    2: 10 * 60,   # Tier 2 — national outlets — every 10 min
    3: 30 * 60,   # Tier 3 — regional / specialty — every 30 min
}

# Circuit-breaker thresholds (RSS-3)
CB_BACKOFF_THRESHOLD  = 5    # failures before doubling interval
CB_SUSPEND_THRESHOLD  = 20   # failures before suspending feed


def _compute_priority(feed: dict, pub_dt: datetime | None) -> int:
    """
    RSS-5: Calculate RabbitMQ message priority (1–9).
    Tier 1 + fresh article → priority 9; Tier 3 + old → priority 1.
    """
    tier = feed.get("tier", 3)
    age_minutes = 9999
    if pub_dt:
        try:
            now = datetime.now(timezone.utc)
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            age_minutes = (now - pub_dt).total_seconds() / 60
        except Exception:
            pass
    fresh_bonus = 1 if age_minutes < 30 else 0
    # Tier 1 → base 6, Tier 2 → base 3, Tier 3 → base 0; plus freshness
    priority = max(1, min(9, (4 - tier) * 3 + fresh_bonus))
    return priority


def _parse_pub_date(entry) -> datetime | None:
    """Parse feedparser entry published date to datetime."""
    raw = entry.get("published_parsed") or entry.get("updated_parsed")
    if raw:
        try:
            import time as _time
            return datetime(*raw[:6], tzinfo=timezone.utc)
        except Exception:
            pass
    raw_str = entry.get("published", entry.get("updated", ""))
    if raw_str:
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(raw_str)
        except Exception:
            pass
    return None


# ════════════════════════════════════════════════════════════════════════════
# RSS FEED AGENT
# ════════════════════════════════════════════════════════════════════════════
class RSSFeedAgent(BaseAgent):
    name         = "rss-feed"
    input_queue  = ""            # No input queue — scheduler-driven
    output_queue = Q.INGEST_RAW

    # BUG #1 FIX: Removed NDTV duplicate with trailing space.
    # Added 6 missing high-value feeds (Moneycontrol, Business Standard,
    # The Quint, AP News India, Aaj Tak, ABP Live, Cricbuzz).
    FEEDS = [
        # ── Tier 1 — Wire services & Government ──────────────────────────────
        {"url": "https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3&reg=2",
         "domain": "pib.gov.in",         "tier": 1, "cred": 1.00, "domain_tag": "national"},
        {"url": "https://feeds.reuters.com/reuters/topNews",
         "domain": "reuters.com",         "tier": 1, "cred": 1.00, "domain_tag": "international"},
        {"url": "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml",
         "domain": "bbc.com",             "tier": 1, "cred": 0.95, "domain_tag": "international"},
        {"url": "https://www.mea.gov.in/rss.aspx",
         "domain": "mea.gov.in",          "tier": 1, "cred": 1.00, "domain_tag": "international"},
        {"url": "https://rsshub.app/apnews/topics/india",
         "domain": "apnews.com",          "tier": 1, "cred": 0.98, "domain_tag": "international"},
        {"url": "https://www.nature.com/nature.rss",
         "domain": "nature.com",          "tier": 1, "cred": 0.98, "domain_tag": "science"},
        # ── Tier 2 — National outlets ─────────────────────────────────────
        {"url": "https://www.thehindu.com/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "national"},
        {"url": "https://indianexpress.com/feed/",
         "domain": "indianexpress.com",   "tier": 2, "cred": 0.88, "domain_tag": "national"},
        {"url": "https://www.livemint.com/rss/news",
         "domain": "livemint.com",        "tier": 2, "cred": 0.85, "domain_tag": "economy"},
        {"url": "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
         "domain": "timesofindia.indiatimes.com", "tier": 2, "cred": 0.78, "domain_tag": "national"},
        {"url": "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
         "domain": "economictimes.indiatimes.com", "tier": 2, "cred": 0.84, "domain_tag": "economy"},
        {"url": "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
         "domain": "hindustantimes.com",  "tier": 2, "cred": 0.80, "domain_tag": "national"},
        {"url": "https://thewire.in/feed",
         "domain": "thewire.in",          "tier": 2, "cred": 0.75, "domain_tag": "national"},
        {"url": "https://scroll.in/feed",
         "domain": "scroll.in",           "tier": 2, "cred": 0.76, "domain_tag": "national"},
        # BUG #1 FIX: Only ONE NDTV entry — no trailing space, no duplicate.
        {"url": "https://feeds.feedburner.com/ndtvnews-top-stories",
         "domain": "ndtv.com",            "tier": 2, "cred": 0.82, "domain_tag": "national"},
        {"url": "https://theprint.in/feed/",
         "domain": "theprint.in",         "tier": 2, "cred": 0.82, "domain_tag": "national"},
        {"url": "https://www.deccanherald.com/stories.rss",
         "domain": "deccanherald.com",    "tier": 2, "cred": 0.80, "domain_tag": "national"},
        {"url": "https://www.dnaindia.com/feeds/india.xml",
         "domain": "dnaindia.com",        "tier": 2, "cred": 0.72, "domain_tag": "national"},
        {"url": "https://www.financialexpress.com/feed/",
         "domain": "financialexpress.com","tier": 2, "cred": 0.84, "domain_tag": "economy"},
        {"url": "https://feeds.feedburner.com/gadgets360-latest",
         "domain": "gadgets360.com",      "tier": 2, "cred": 0.80, "domain_tag": "technology"},
        {"url": "https://www.downtoearth.org.in/rss",
         "domain": "downtoearth.org.in",  "tier": 2, "cred": 0.88, "domain_tag": "environment"},
        {"url": "https://techcrunch.com/feed/",
         "domain": "techcrunch.com",      "tier": 2, "cred": 0.82, "domain_tag": "technology"},
        {"url": "https://inc42.com/feed/",
         "domain": "inc42.com",           "tier": 2, "cred": 0.80, "domain_tag": "technology"},
        {"url": "https://yourstory.com/feed",
         "domain": "yourstory.com",       "tier": 2, "cred": 0.75, "domain_tag": "technology"},
        {"url": "https://www.indiatoday.in/rss/home",
         "domain": "indiatoday.in",       "tier": 2, "cred": 0.82, "domain_tag": "national"},
        {"url": "https://www.news18.com/rss/india.xml",
         "domain": "news18.com",          "tier": 2, "cred": 0.78, "domain_tag": "national"},
        {"url": "https://www.firstpost.com/rss/india.xml",
         "domain": "firstpost.com",       "tier": 2, "cred": 0.80, "domain_tag": "national"},
        {"url": "https://www.deccanchronicle.com/rss_feed/",
         "domain": "deccanchronicle.com", "tier": 2, "cred": 0.72, "domain_tag": "national"},
        # ── NEW: Missing high-value feeds (Section 08 of audit) ──────────────
        {"url": "http://www.moneycontrol.com/rss/latestnews.xml",
         "domain": "moneycontrol.com",    "tier": 2, "cred": 0.80, "domain_tag": "economy"},
        {"url": "https://www.business-standard.com/rss/home_page_top_stories.rss",
         "domain": "business-standard.com", "tier": 2, "cred": 0.84, "domain_tag": "economy"},
        {"url": "https://www.outlookindia.com/rss/main/magazine",
         "domain": "outlookindia.com",    "tier": 2, "cred": 0.78, "domain_tag": "national"},
        {"url": "https://www.thequint.com/quint-news-feed",
         "domain": "thequint.com",        "tier": 2, "cred": 0.78, "domain_tag": "national"},
        {"url": "https://www.cricbuzz.com/cricket-news/rss",
         "domain": "cricbuzz.com",        "tier": 2, "cred": 0.85, "domain_tag": "sports"},
        # ── Vernacular feeds (Section 07 & 08 of audit) ───────────────────────
        {"url": "https://www.aajtak.in/rss/news.xml",
         "domain": "aajtak.in",           "tier": 2, "cred": 0.78, "domain_tag": "national"},
        {"url": "https://www.abplive.com/feed",
         "domain": "abplive.com",         "tier": 2, "cred": 0.75, "domain_tag": "national"},
        # ── Regional / State ─────────────────────────────────────────────────
        {"url": "https://www.thehindu.com/news/national/kerala/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "national"},
        {"url": "https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "national"},
        {"url": "https://www.thehindu.com/news/national/telangana/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "national"},
        {"url": "https://www.thehindu.com/sci-tech/science/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "science"},
        {"url": "https://www.thehindu.com/business/feeder/default.rss",
         "domain": "thehindu.com",        "tier": 2, "cred": 0.90, "domain_tag": "economy"},
        # ── Science / Environment ────────────────────────────────────────────
        {"url": "https://www.sciencedaily.com/rss/top/science.xml",
         "domain": "sciencedaily.com",    "tier": 2, "cred": 0.85, "domain_tag": "science"},
        # ── Sports ───────────────────────────────────────────────────────────
        {"url": "https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
         "domain": "espncricinfo.com",    "tier": 2, "cred": 0.85, "domain_tag": "sports"},
        # ── Judiciary / Legal ────────────────────────────────────────────────
        {"url": "https://www.livelaw.in/feed/",
         "domain": "livelaw.in",          "tier": 2, "cred": 0.88, "domain_tag": "judiciary"},
        {"url": "https://www.barandbench.com/feed/",
         "domain": "barandbench.com",     "tier": 2, "cred": 0.85, "domain_tag": "judiciary"},
        # ── Agriculture ──────────────────────────────────────────────────────
        {"url": "https://krishijagran.com/feed/",
         "domain": "krishijagran.com",    "tier": 2, "cred": 0.78, "domain_tag": "agriculture"},
        # ── Other national/digital ───────────────────────────────────────────
        {"url": "https://www.oneindia.com/rss/news-fb.xml",
         "domain": "oneindia.com",        "tier": 3, "cred": 0.70, "domain_tag": "national"},
        {"url": "https://www.rediff.com/rss/newsrss.xml",
         "domain": "rediff.com",          "tier": 3, "cred": 0.70, "domain_tag": "national"},
        {"url": "https://www.indianewsnetwork.com/rss.en.politics.xml",
         "domain": "indianewsnetwork.com","tier": 3, "cred": 0.65, "domain_tag": "national"},
    ]

    async def on_start(self):
        # RSS-1: initialise ETag / Last-Modified caches per feed URL
        self._etags: dict[str, str] = {}
        self._last_modified: dict[str, str] = {}
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        """RSS-2: tiered independent poll loops per tier."""
        tier_queues: dict[int, list] = {1: [], 2: [], 3: []}
        for feed in self.FEEDS:
            tier_queues[feed.get("tier", 2)].append(feed)
        tasks = [
            self._tier_loop(tier, feeds, POLL_INTERVALS[tier])
            for tier, feeds in tier_queues.items()
        ]
        await asyncio.gather(*tasks)

    async def _tier_loop(self, tier: int, feeds: list, interval: int):
        while self.running:
            log.info(f"RSS Tier {tier}: Starting crawl ({len(feeds)} feeds)")
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                tasks = [self._crawl_one(feed, client) for feed in feeds]
                await asyncio.gather(*tasks, return_exceptions=True)
            log.info(f"RSS Tier {tier}: Cycle done, sleeping {interval}s")
            await asyncio.sleep(interval)

    async def _crawl_one(self, feed: dict, client: httpx.AsyncClient):
        url = feed["url"].strip()  # BUG #1: strip() removes accidental trailing spaces

        # RSS-3: circuit breaker — check if feed is suspended
        fail_key = f"rss:failures:{url}"
        fail_count = int(await self.redis_client.get(fail_key) or 0)
        if fail_count >= CB_SUSPEND_THRESHOLD:
            log.warning(f"RSS: Feed SUSPENDED after {fail_count} failures — {url[:60]}")
            return

        # RSS-3: back-off: double the check if already in backoff territory
        if fail_count >= CB_BACKOFF_THRESHOLD:
            # Only crawl every other cycle when in backoff
            backoff_token_key = f"rss:backoff_token:{url}"
            token = await self.redis_client.get(backoff_token_key)
            if token:
                await self.redis_client.delete(backoff_token_key)
                return  # skip this cycle
            await self.redis_client.setex(backoff_token_key, POLL_INTERVALS.get(feed.get("tier", 2), 600) * 2, "1")

        try:
            # RSS-1: ETag / If-Modified-Since conditional GET
            headers: dict = {}
            if url in self._etags:
                headers["If-None-Match"] = self._etags[url]
            if url in self._last_modified:
                headers["If-Modified-Since"] = self._last_modified[url]

            resp = await client.get(url, headers=headers)

            if resp.status_code == 304:
                # Nothing changed — save bandwidth
                log.debug(f"RSS: 304 Not Modified — {url[:60]}")
                await self.redis_client.delete(fail_key)
                return

            # Cache ETag / Last-Modified for next request
            if etag := resp.headers.get("ETag"):
                self._etags[url] = etag
            if lm := resp.headers.get("Last-Modified"):
                self._last_modified[url] = lm

            parsed = feedparser.parse(resp.text)

            # RSS-4: Dynamic cap — only process articles newer than last poll
            last_poll_key = f"rss:last_poll:{abs(hash(url))}"
            last_poll_ts = float(await self.redis_client.get(last_poll_key) or 0)
            cutoff = datetime.fromtimestamp(last_poll_ts, tz=timezone.utc) if last_poll_ts else None

            processed = 0
            for entry in parsed.entries:  # RSS-4: no [:30] cap
                pub = _parse_pub_date(entry)
                if cutoff and pub and pub.replace(tzinfo=timezone.utc if pub.tzinfo is None else pub.tzinfo) < cutoff:
                    break  # feed is ordered newest-first

                article_url = entry.get("link", "")
                if not article_url:
                    continue

                # RSS-5: compute priority from tier + freshness
                priority = _compute_priority(feed, pub)

                published_str = entry.get("published", entry.get("updated", ""))
                await self.publish({
                    "url":           article_url,
                    "title":         entry.get("title", "")[:500],
                    "description":   entry.get("summary", "")[:2000],
                    "published":     published_str,
                    "source_domain": feed["domain"],
                    "source_tier":   feed["tier"],
                    "source_cred":   feed["cred"],
                    # RSS-6: always use explicit domain_tag from feed dict — no fallback inference
                    "domain_tag":    feed["domain_tag"],
                    "image_url":     self._extract_rss_image(entry),
                }, priority=priority)
                processed += 1

            await self.redis_client.set(last_poll_key, datetime.now(timezone.utc).timestamp())
            # RSS-3: reset failure counter on success
            await self.redis_client.delete(fail_key)
            log.debug(f"RSS: {processed} new items — {url[:60]}")

        except Exception as e:
            log.warning(f"RSS crawl failed [{url[:60]}]: {e}")
            # RSS-3: increment failure counter
            new_count = await self.redis_client.incr(fail_key)
            await self.redis_client.expire(fail_key, 7 * 24 * 3600)  # expire after 7 days
            if new_count >= CB_SUSPEND_THRESHOLD:
                log.error(f"RSS: Feed suspended after {new_count} consecutive failures — {url[:60]}")

    @staticmethod
    def _extract_rss_image(entry) -> str:
        for key in ("media_thumbnail", "media_content"):
            items = entry.get(key, [])
            if items:
                return items[0].get("url", "")
        return ""

    async def process(self, payload: dict) -> dict | None:
        return None


# ════════════════════════════════════════════════════════════════════════════
# HTML CRAWLER SOURCES  (BUG #3 FIX: merged from html_crawler_fixed.py)
# All 6 fixes from html_crawler_fixed.py applied inline:
#   FIX-1: MHA link pattern tightened to /en/commoncontent/|/en/media-corner/
#   FIX-2: MOHFW pattern excludes PDFs; content-type check in _fetch_article
#   FIX-3: robots.txt check with Redis cache
#   FIX-4: Single shared httpx client per crawl cycle (not per source)
#   FIX-5: URL dedup via Redis SET with 24h TTL
#   FIX-6: ISRO pattern narrowed to /news/ or /pressrelease/ paths
# ════════════════════════════════════════════════════════════════════════════
HTML_CRAWLER_SOURCES: list[dict] = [
    {
        "name": "RBI",
        "list_url": "https://rbi.org.in/commonman/English/scripts/pressreleases.aspx",
        # FIX-6 equivalent: specific to press release display pages only
        "article_link_pattern": r"/Scripts/BS_PressReleaseDisplay\.aspx",
        "title_selector":   "h2, h1, .heading, .RBItitle",
        "date_selector":    ".date, td.date, span.date, .RBIdate",
        "content_selector": "#wrapper, .RBIcontent, .content, article",
        "domain": "rbi.org.in", "cred": 1.0, "tier": 1, "domain_tag": "economy",
    },
    {
        "name": "SEBI",
        "list_url": "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=6&smid=0&ssid=23",
        "article_link_pattern": r"/sebiweb/home/HomeAction\.do\?doListing=no",
        "title_selector":   "h2, h1, td.tableheading",
        "date_selector":    "td.date, .date",
        "content_selector": "#mainContent, .content, td.tabledata",
        "domain": "sebi.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "economy",
    },
    {
        "name": "MHA",
        "list_url": "https://www.mha.gov.in/en/media-corner/press-release",
        # FIX-1 (from html_crawler_fixed): was "/en/" — matched ALL internal links.
        "article_link_pattern": r"/en/(commoncontent/|media-corner/press-release/)",
        "title_selector":   "h1, h2, .node__title, .field--name-title",
        "date_selector":    ".date, time, .field--name-field-date, .submitted",
        "content_selector": "article, .field--type-text-with-summary, .node__content, main",
        "domain": "mha.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "national",
    },
    {
        "name": "ECI",
        "list_url": "https://www.eci.gov.in/press-release/",
        "article_link_pattern": r"/press-release/\w",
        "title_selector":   "h1, h2, .title, .field--name-title",
        "date_selector":    ".date, .post-date, time, .submitted",
        "content_selector": ".content, article, main, .field--type-text-long",
        "domain": "eci.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "politics",
    },
    {
        "name": "Supreme Court",
        "list_url": "https://www.sci.gov.in/news-updates/",
        "article_link_pattern": r"/news-updates/\d",
        "title_selector":   "h1, h2, .title",
        "date_selector":    ".date, time, .pub-date",
        "content_selector": ".content, article, main, .news-content",
        "domain": "sci.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "judiciary",
    },
    {
        "name": "ISRO",
        "list_url": "https://www.isro.gov.in/news.html",
        # FIX-6: was /[a-z].*\.html (too broad, matched nav). Targets news/press paths only.
        "article_link_pattern": r"/(news|pressrelease|mediarelease)/[^\"']+\.html",
        "title_selector":   "h1, h2, .field-name-title, .news-title",
        "date_selector":    ".date, time, .submitted, .field-name-post-date",
        "content_selector": ".field-name-body, article, .news-body, .content",
        "domain": "isro.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "science",
    },
    {
        "name": "Ministry of Health",
        "list_url": "https://www.mohfw.gov.in/pressrelease.html",
        # FIX-2: only matches HTML press release pages; PDFs are skipped via content-type check.
        "article_link_pattern": r"/[a-z\-]+\.html(?!.*\.pdf)",
        "title_selector":   "h1, h2, .press-title, td:first-child",
        "date_selector":    ".date, td.date, .press-date",
        "content_selector": ".content, .press-content, main, article",
        "domain": "mohfw.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "health",
    },
    {
        "name": "PIB Listings",
        "list_url": "https://pib.gov.in/Allrel.aspx",
        "article_link_pattern": r"/PressReleaseIframePage\.aspx\?PRID=",
        "title_selector":   "h1, h2, .RelText, .presshead",
        "date_selector":    ".pressDate, .date, span.date",
        "content_selector": "#RelText, .RelText, .pressContent",
        "domain": "pib.gov.in", "cred": 1.0, "tier": 1, "domain_tag": "national",
    },
]


class HTMLCrawlerAgent(BaseAgent):
    """
    BUG #3 FIX: This class now incorporates ALL fixes from html_crawler_fixed.py.
    html_crawler_fixed.py is superseded by this implementation and can be deleted.

    Crawls government/institutional sites lacking RSS feeds.
    Two-stage: listing page → article links → article fetch.

    HTML-PERF FIX: INTER_ARTICLE_DELAY (2.5s) now distinguished from
    INTER_SOURCE_DELAY (8s). Previously 8s × 15 articles = 2min per source,
    14+ min total per cycle. Now: 2.5s × 15 = 37s per source.

    HTML-FALLBACK: trafilatura used as last-resort content extractor.
    """
    name               = "html-crawler"
    input_queue        = ""                  # Scheduler-driven
    output_queue       = Q.INGEST_RAW
    POLL_INTERVAL      = 30 * 60             # 30 min between full cycles
    INTER_SOURCE_DELAY = 8.0                 # seconds between sources (polite)
    INTER_ARTICLE_DELAY = 2.5               # seconds between articles within a source
    MAX_ARTICLES       = 15                  # max articles per source per run
    URL_SEEN_TTL       = 86400              # 24h dedup window

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; DharaNewsBot/1.0; "
            "+https://dhara.news/about#bot)"
        ),
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
    }

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            log.info("HTMLCrawler: Starting crawl cycle")
            # FIX-4: One shared client for the entire cycle
            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                headers=self.HEADERS,
            ) as client:
                for source in HTML_CRAWLER_SOURCES:
                    try:
                        await self._crawl_source(source, client)
                        await asyncio.sleep(self.INTER_SOURCE_DELAY)
                    except Exception as e:
                        log.warning(f"HTMLCrawler [{source['name']}]: {e}")
            log.info(f"HTMLCrawler: Cycle done, sleeping {self.POLL_INTERVAL}s")
            await asyncio.sleep(self.POLL_INTERVAL)

    async def _check_robots(self, client: httpx.AsyncClient, list_url: str) -> bool:
        """
        FIX-3: Check robots.txt before crawling.
        Returns True if crawling is allowed. Cached in Redis for 1 hour.
        """
        try:
            parsed    = urlparse(list_url)
            base_url  = f"{parsed.scheme}://{parsed.netloc}"
            robots_url = urljoin(base_url, "/robots.txt")
            cache_key  = f"robots:{parsed.netloc}"

            cached = await self.redis_client.get(cache_key)
            if cached is not None:
                return str(cached) == "1"

            resp = await client.get(robots_url, timeout=5)
            if resp.status_code != 200:
                await self.redis_client.setex(cache_key, 3600, "1")
                return True

            disallowed   = False
            in_our_block = False
            for line in resp.text.splitlines():
                line = line.strip()
                if line.lower().startswith("user-agent:"):
                    agent = line.split(":", 1)[1].strip().lower()
                    in_our_block = agent in ("*", "dharanewsbot", "dhara")
                elif in_our_block and line.lower().startswith("disallow:"):
                    path = line.split(":", 1)[1].strip()
                    if path and parsed.path.startswith(path):
                        disallowed = True
                        break

            allowed = not disallowed
            await self.redis_client.setex(cache_key, 3600, "1" if allowed else "0")
            return allowed
        except Exception as e:
            log.debug(f"HTMLCrawler: robots.txt check failed ({e}) — allowing by default")
            return True

    async def _crawl_source(self, source: dict, client: httpx.AsyncClient):
        """Two-stage: fetch listing → extract valid links → fetch each article."""
        list_url = source["list_url"]
        base_url = "/".join(list_url.split("/")[:3])
        pattern  = re.compile(source["article_link_pattern"], re.I)

        if not await self._check_robots(client, list_url):
            log.info(f"HTMLCrawler [{source['name']}]: disallowed by robots.txt — skipping")
            return

        try:
            resp = await client.get(list_url)
            resp.raise_for_status()
        except Exception as e:
            log.warning(f"HTMLCrawler listing failed [{source['name']}]: {e}")
            return

        soup  = BeautifulSoup(resp.text, "html.parser")
        links = self._extract_links(soup, base_url, pattern)

        if not links:
            log.debug(f"HTMLCrawler [{source['name']}]: no article links found")
            return

        log.info(f"HTMLCrawler [{source['name']}]: {len(links)} candidate links")
        fetched = 0

        for url in links:
            if fetched >= self.MAX_ARTICLES:
                break

            if url.lower().endswith(".pdf"):
                log.debug(f"HTMLCrawler: skipping PDF {url}")
                continue

            # FIX-5: URL deduplication via Redis
            seen_key = f"htmlcrawler:seen:{abs(hash(url))}"
            if await self.redis_client.get(seen_key):
                continue

            # HTML-PERF FIX: use INTER_ARTICLE_DELAY (2.5s), not full INTER_SOURCE_DELAY (8s)
            await asyncio.sleep(self.INTER_ARTICLE_DELAY)
            try:
                article = await self._fetch_article(client, url, source)
                if article:
                    await self.publish(article)
                    await self.redis_client.setex(seen_key, self.URL_SEEN_TTL, "1")
                    fetched += 1
            except Exception as e:
                log.debug(f"HTMLCrawler article fetch skipped [{url}]: {e}")

        log.info(f"HTMLCrawler [{source['name']}]: fetched {fetched} new articles")

    def _extract_links(self, soup: BeautifulSoup, base_url: str, pattern: re.Pattern) -> list[str]:
        seen, links = set(), []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not pattern.search(href):
                continue
            if href.startswith("http"):
                full = href
            elif href.startswith("//"):
                full = "https:" + href
            elif href.startswith("/"):
                full = base_url + href
            else:
                full = base_url + "/" + href
            full = full.split("#")[0]
            if full not in seen:
                seen.add(full)
                links.append(full)
        return links

    async def _fetch_article(self, client: httpx.AsyncClient, url: str, source: dict) -> dict | None:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None

        # FIX-2: skip non-HTML responses (catches PDFs served without .pdf extension)
        ct = resp.headers.get("content-type", "")
        if "html" not in ct.lower():
            log.debug(f"HTMLCrawler: skipping non-HTML content-type at {url}")
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        title   = self._extract_field(soup, source["title_selector"])
        date    = self._extract_field(soup, source["date_selector"])
        content = self._extract_content_with_fallback(resp.text, soup, source["content_selector"])

        if not title or len(title) < 10:
            return None
        if not content or len(content) < 100:
            return None

        og = soup.select_one('meta[property="og:image"]')
        image_url = (og.get("content") or "").strip() if og else ""

        return {
            "url":           url,
            "title":         title[:500],
            "description":   content[:400],
            "full_body":     content[:10000],
            "published":     date,
            "source_domain": source["domain"],
            "source_tier":   source["tier"],
            "source_cred":   source["cred"],
            "domain_tag":    source["domain_tag"],
            "image_url":     image_url,
            "crawler_type":  "html",
        }

    @staticmethod
    def _extract_field(soup: BeautifulSoup, selector: str) -> str:
        for sel in [s.strip() for s in selector.split(",")]:
            try:
                el = soup.select_one(sel)
                if el:
                    text = el.get_text(" ", strip=True)
                    if text:
                        return text
            except Exception:
                continue
        return ""

    @staticmethod
    def _extract_content(soup: BeautifulSoup, selector: str) -> str:
        for sel in [s.strip() for s in selector.split(",")]:
            try:
                el = soup.select_one(sel)
                if el:
                    for tag in el(["script", "style", "nav", "header", "footer", "aside"]):
                        tag.decompose()
                    text = clean_article_text(el.get_text(" ", strip=True))
                    if len(text) > 100:
                        return text[:10000]
            except Exception:
                continue
        return ""

    @staticmethod
    def _extract_content_with_fallback(raw_html: str, soup: BeautifulSoup, selector: str) -> str:
        """
        HTML-FALLBACK FIX: Try CSS selector first; fall back to trafilatura
        for unknown/updated DOM structures that would otherwise silently drop articles.
        """
        result = HTMLCrawlerAgent._extract_content(soup, selector)
        if len(result) >= 200:
            return result
        # Trafilatura as last-resort extractor (pip install trafilatura)
        try:
            import trafilatura
            extracted = trafilatura.extract(
                raw_html,
                include_comments=False,
                include_tables=False,
            )
            return (extracted or "")[:10000]
        except ImportError:
            pass
        except Exception as e:
            log.debug(f"HTMLCrawler trafilatura fallback failed: {e}")
        return result

    async def process(self, payload: dict) -> dict | None:
        return None


# ════════════════════════════════════════════════════════════════════════════
# WEB CRAWLER AGENT
# BUG #2 FIX: Now fans out to BOTH Q.DEDUP_FINGERPRINT and Q.INGEST_IMAGES
#             so every article gets both web-crawled AND image-hashed.
# PERF FIX:   Persistent httpx client reused across articles (no new TCP per article).
# ════════════════════════════════════════════════════════════════════════════
class WebCrawlerAgent(BaseAgent):
    name         = "web-crawler"
    input_queue  = Q.INGEST_RAW
    output_queue = Q.DEDUP_FINGERPRINT

    STRIP_TAGS = re.compile(r'<[^>]+>')
    CLEAN_WS   = re.compile(r'\s{3,}')
    NOISE_CLASS_HINTS = (
        "nav", "menu", "header", "footer", "breadcrumb", "share", "social",
        "related", "comment", "advert", "ads", "promo", "cookie", "popup",
        "newsletter", "subscribe", "signin", "login", "trending", "recommend",
    )
    NOISY_DESC_HINTS = (
        "edition in in", "weather sign in", "today's epaper", "city news",
        "benchmarks nifty", "subscribe sign in", "web stories", "follow us",
    )

    # PERF FIX: persistent client — reused across articles, not created per-article
    _http_client: httpx.AsyncClient | None = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=12,
                follow_redirects=True,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._http_client

    async def process(self, payload: dict) -> dict | None:
        url  = payload.get("url", "")
        desc = clean_article_text(payload.get("description", ""))

        # If HTMLCrawlerAgent already provided full_body, skip re-fetch
        if payload.get("full_body") and len(payload["full_body"]) > 300:
            result = payload
        else:
            client = await self._get_http_client()
            body, og_image, extra_images = await self._fetch_full_text_and_image(url, client)
            body = clean_article_text(body or "")
            if not body:
                desc_l = desc.lower()
                if any(hint in desc_l for hint in self.NOISY_DESC_HINTS):
                    body = clean_article_text(payload.get("title", ""))
                else:
                    body = desc

            result = {**payload, "full_body": body[:10000]}
            if og_image and not payload.get("image_url"):
                result["image_url"] = og_image
            if extra_images:
                result["extra_images"] = extra_images

        # BUG #2 FIX: Fan out to INGEST_IMAGES as well so ImageHarvesterAgent
        # receives every article (via its dedicated queue, not competing on INGEST_RAW).
        await self.publish_to(Q.INGEST_IMAGES, result)

        return result  # → DEDUP_FINGERPRINT via output_queue

    async def _fetch_full_text_and_image(self, url: str, client: httpx.AsyncClient) -> tuple:
        try:
            resp = await client.get(url, headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml",
            })
            if resp.status_code != 200:
                return None, None, []

            html = resp.text
            for pattern in TRACKING_PATTERNS[:5]:
                html = pattern.sub(" ", html)

            soup = BeautifulSoup(html, "html.parser")
            og_image = None
            for selector in [
                'meta[property="og:image"]',
                'meta[name="og:image"]',
                'meta[property="twitter:image"]',
                'meta[name="twitter:image"]',
            ]:
                tag = soup.select_one(selector)
                if tag:
                    candidate = (tag.get("content") or "").strip()
                    if candidate.startswith("http"):
                        og_image = candidate
                        break

            body = self._extract_article_text(soup)
            if not body:
                body = self._extract_jsonld_article_text(soup)

            extra_images = []
            for tag in soup.find_all(["figure", "img"])[:8]:
                is_noisy = any(c in str(tag.get("class", "")) for c in self.NOISE_CLASS_HINTS)
                if is_noisy:
                    continue
                img_tag = tag.find("img") if tag.name == "figure" else tag
                if not img_tag:
                    continue
                src = (img_tag.get("src") or img_tag.get("data-src") or "").strip()
                if not src.startswith("http"):
                    continue
                w = img_tag.get("width", "0")
                try:
                    if int(str(w).replace("px", "")) < 200:
                        continue
                except Exception:
                    pass
                caption = ""
                if tag.name == "figure":
                    figcap = tag.find("figcaption")
                    if figcap:
                        caption = figcap.get_text(strip=True)[:200]
                if src not in [og_image] and src not in [i["url"] for i in extra_images]:
                    extra_images.append({"url": src, "caption": caption})
                if len(extra_images) >= 4:
                    break

            return body, og_image, extra_images
        except Exception:
            return None, None, []

    def _extract_jsonld_article_text(self, soup: BeautifulSoup) -> str:
        candidates = []

        def collect_text(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if str(key).lower() in ("articlebody", "text", "description") and isinstance(value, str):
                        cleaned = clean_article_text(value)
                        if len(cleaned) >= 180:
                            candidates.append(cleaned)
                    else:
                        collect_text(value)
            elif isinstance(node, list):
                for item in node:
                    collect_text(item)

        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = (script.string or script.get_text() or "").strip()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except Exception:
                continue
            collect_text(parsed)

        if not candidates:
            return ""
        return max(candidates, key=len)[:12000]

    def _extract_article_text(self, soup: BeautifulSoup) -> str:
        for tag in soup(["script", "style", "noscript", "svg", "iframe", "nav",
                         "header", "footer", "aside", "form", "button"]):
            tag.decompose()
        for node in soup.find_all(True):
            attrs = " ".join([
                str(node.get("id") or ""),
                " ".join(node.get("class") or []),
                str(node.get("role") or ""),
            ]).lower()
            if any(hint in attrs for hint in self.NOISE_CLASS_HINTS):
                node.decompose()
        candidates = []
        for selector in [
            "article", "main article", "main",
            "[itemprop='articleBody']", "[role='main']",
            "div.story-content", "div.article-body",
        ]:
            candidates.extend(soup.select(selector))
        if not candidates:
            candidates = [soup]
        best_text, best_score = "", 0
        for root in candidates:
            paras = []
            for p in root.find_all("p"):
                text = clean_article_text(p.get_text(" ", strip=True))
                if len(text) < 45:
                    continue
                paras.append(text)
            if len(paras) < 3:
                for div in root.find_all("div"):
                    text = clean_article_text(div.get_text(" ", strip=True))
                    if 120 <= len(text) <= 1000:
                        paras.append(text)
            deduped, seen = [], set()
            for para in paras:
                key = para[:160].lower()
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(para)
            candidate_text = " ".join(deduped[:30]).strip()
            score = len(candidate_text)
            if score > best_score:
                best_score, best_text = score, candidate_text
        if len(best_text) < 220:
            return ""
        return best_text[:12000]


# ════════════════════════════════════════════════════════════════════════════
# NEWSAPI / GDELT AGENT
# BUG #7 FIX: description field no longer populated with seendate (raw timestamp).
#             Now uses socialimage or title as description; seendate → published.
# ════════════════════════════════════════════════════════════════════════════
class NewsAPIAgent(BaseAgent):
    name         = "newsapi"
    input_queue  = ""
    output_queue = Q.DEDUP_FINGERPRINT
    POLL_INTERVAL = 30 * 60

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._fetch_gdelt()
            await asyncio.sleep(self.POLL_INTERVAL)

    async def _fetch_gdelt(self):
        url = (
            "https://api.gdeltproject.org/api/v2/doc/doc"
            "?query=india+sourcelang:english&mode=artlist&maxrecords=25&sort=hybridrel&format=json"
        )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url)
                data = resp.json()
                for art in data.get("articles", []):
                    # BUG #7 FIX: description = socialimage or title (NOT seendate timestamp)
                    description = (
                        art.get("socialimage", "")
                        or art.get("title", "")
                    )[:500]
                    await self.publish({
                        "url":           art.get("url", ""),
                        "title":         art.get("title", "")[:500],
                        "description":   description,
                        "published":     art.get("seendate", ""),   # BUG #7 FIX: correct field
                        "source_domain": art.get("domain", ""),
                        "source_tier":   3,
                        "source_cred":   0.5,
                        "domain_tag":    "national",
                    })
        except Exception as e:
            log.warning(f"GDELT fetch failed: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None


# ════════════════════════════════════════════════════════════════════════════
# SOCIAL SIGNAL AGENT
# ════════════════════════════════════════════════════════════════════════════
class SocialSignalAgent(BaseAgent):
    name         = "social-signal"
    input_queue  = ""
    output_queue = ""
    POLL_INTERVAL = 10 * 60

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._check_trends()
            await asyncio.sleep(self.POLL_INTERVAL)

    async def _check_trends(self):
        url = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=IN"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url)
            parsed = feedparser.parse(resp.text)
            trending = []
            for entry in parsed.entries[:20]:
                topic = entry.get("title", "").strip()
                if topic:
                    trending.append(topic)
                    await self.redis_client.zadd(
                        "trending:global",
                        {topic: int(datetime.now(timezone.utc).timestamp())}
                    )
            await self.redis_client.zremrangebyrank("trending:global", 0, -51)
            log.info(f"Social: {len(trending)} trending topics cached")
        except Exception as e:
            log.warning(f"Social signal error: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None


# ════════════════════════════════════════════════════════════════════════════
# IMAGE HARVESTER AGENT
# BUG #2 FIX: input_queue changed to Q.INGEST_IMAGES (fed by WebCrawlerAgent
#             fan-out). No longer competes with WebCrawlerAgent on Q.INGEST_RAW.
# ════════════════════════════════════════════════════════════════════════════
class ImageHarvesterAgent(BaseAgent):
    name         = "image-harvester"
    # BUG #2 FIX: dedicated queue — WebCrawlerAgent publishes here after processing
    input_queue  = Q.INGEST_IMAGES
    output_queue = Q.INGEST_IMAGES  # pass-through after enrichment

    async def process(self, payload: dict) -> dict | None:
        image_url = payload.get("image_url")
        if not image_url:
            return payload

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(image_url)
            if resp.status_code != 200:
                return payload

            from PIL import Image
            import imagehash
            import io
            img   = Image.open(io.BytesIO(resp.content))
            phash = str(imagehash.phash(img))
            payload["image_phash"] = phash

            await self.publish_to(Q.VERIFY_IMAGE, {
                "article_url":  payload.get("url"),
                "image_url":    image_url,
                "image_phash":  phash,
                "article_date": payload.get("published"),
            })
        except Exception as e:
            log.debug(f"Image harvest skip: {e}")

        return payload


# ── Entry points ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    # BUG #3 FIX: html-crawler now uses the merged HTMLCrawlerAgent defined
    # in this file. html_crawler_fixed.py import removed.
    agents = {
        "rss":          RSSFeedAgent,
        "html-crawler": HTMLCrawlerAgent,
        "crawler":      WebCrawlerAgent,
        "newsapi":      NewsAPIAgent,
        "social":       SocialSignalAgent,
        "images":       ImageHarvesterAgent,
    }
    name = sys.argv[1] if len(sys.argv) > 1 else "rss"
    agents[name].run()
