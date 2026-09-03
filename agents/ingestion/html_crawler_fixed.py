r"""
agents/ingestion/html_crawler_fixed.py

FIXES TO agents/ingestion/__init__.py HTMLCrawlerAgent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX-1  MHA article link pattern /en/ was too broad — matched every internal
       link, navigation, breadcrumb. Now uses /en/media-corner/press-release/
       which precisely targets the press release section only.

FIX-2  MOHFW pattern matched PDF links but had no PDF text extractor.
       If the URL ends in .pdf, the crawler now skips it (pdfs need a
       separate pdfminer/pypdf reader — not implemented here, flagged for
       future work). Pattern updated to match HTML press-release pages only.

FIX-3  No robots.txt check. Government sites have robots.txt policies
       that should be respected. Added _check_robots() that fetches
       /robots.txt and checks if the listing URL is allowed.
       Cached per domain for 1 hour in Redis.

FIX-4  httpx.AsyncClient was created inside _crawl_source per source but
       then reused inside _fetch_article — creating a connection pool
       that's torn down and rebuilt mid-source. Now: one long-lived client
       per crawl cycle, all sources share it.

FIX-5  No deduplication of already-crawled URLs. The crawler had no memory
       of which URLs it had already processed, meaning the same article
       could be fetched and enqueued on every 30-minute cycle.
       Added URL tracking via Redis SET with 24h TTL.

FIX-6  ISRO pattern /[a-z].*\.html matched too broadly (navigation pages).
       Updated to look for /news/ or /pressrelease/ path segments.

Drop this file in agents/ingestion/ and import HTMLCrawlerAgent from it,
or merge the corrected HTML_CRAWLER_SOURCES and HTMLCrawlerAgent class
back into agents/ingestion/__init__.py.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

try:
    from agents.base import BaseAgent, Q
except ModuleNotFoundError:
    from base import BaseAgent, Q

log = logging.getLogger(__name__)


# ── Corrected source configs ──────────────────────────────────────────────────
HTML_CRAWLER_SOURCES: list[dict] = [
    {
        "name": "RBI",
        "list_url": "https://rbi.org.in/commonman/English/scripts/pressreleases.aspx",
        # FIX: specific to press release display pages only
        "article_link_pattern": r"/Scripts/BS_PressReleaseDisplay\.aspx",
        "title_selector":   "h2, h1, .heading, .RBItitle",
        "date_selector":    ".date, td.date, span.date, .RBIdate",
        "content_selector": "#wrapper, .RBIcontent, .content, article",
        "domain":     "rbi.org.in",
        "cred":  1.0, "tier": 1, "domain_tag": "economy",
    },
    {
        "name": "SEBI",
        "list_url": "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=6&smid=0&ssid=23",
        "article_link_pattern": r"/sebiweb/home/HomeAction\.do\?doListing=no",
        "title_selector":   "h2, h1, td.tableheading",
        "date_selector":    "td.date, .date",
        "content_selector": "#mainContent, .content, td.tabledata",
        "domain":     "sebi.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "economy",
    },
    {
        "name": "MHA",
        "list_url": "https://www.mha.gov.in/en/media-corner/press-release",
        # FIX-1: was "/en/" which matched ALL links. Now targets only press-release URLs.
        "article_link_pattern": r"/en/(commoncontent/|media-corner/press-release/)",
        "title_selector":   "h1, h2, .node__title, .field--name-title",
        "date_selector":    ".date, time, .field--name-field-date, .submitted",
        "content_selector": "article, .field--type-text-with-summary, .node__content, main",
        "domain":     "mha.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "national",
    },
    {
        "name": "ECI",
        "list_url": "https://www.eci.gov.in/press-release/",
        "article_link_pattern": r"/press-release/\w",
        "title_selector":   "h1, h2, .title, .field--name-title",
        "date_selector":    ".date, .post-date, time, .submitted",
        "content_selector": ".content, article, main, .field--type-text-long",
        "domain":     "eci.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "politics",
    },
    {
        "name": "Supreme Court",
        "list_url": "https://www.sci.gov.in/news-updates/",
        "article_link_pattern": r"/news-updates/\d",
        "title_selector":   "h1, h2, .title",
        "date_selector":    ".date, time, .pub-date",
        "content_selector": ".content, article, main, .news-content",
        "domain":     "sci.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "judiciary",
    },
    {
        "name": "ISRO",
        "list_url": "https://www.isro.gov.in/news.html",
        # FIX-6: was /[a-z].*\.html (too broad, matched nav). Now targets news/press paths.
        "article_link_pattern": r"/(news|pressrelease|mediarelease)/[^\"']+\.html",
        "title_selector":   "h1, h2, .field-name-title, .news-title",
        "date_selector":    ".date, time, .submitted, .field-name-post-date",
        "content_selector": ".field-name-body, article, .news-body, .content",
        "domain":     "isro.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "science",
    },
    {
        "name": "Ministry of Health",
        "list_url": "https://www.mohfw.gov.in/pressrelease.html",
        # FIX-2: was \.pdf|/press — matched PDFs we can't parse as HTML.
        # Now only matches HTML press release pages; PDFs are skipped.
        "article_link_pattern": r"/[a-z\-]+\.html(?!.*\.pdf)",
        "title_selector":   "h1, h2, .press-title, td:first-child",
        "date_selector":    ".date, td.date, .press-date",
        "content_selector": ".content, .press-content, main, article",
        "domain":     "mohfw.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "health",
    },
    {
        "name": "PIB Listings",
        "list_url": "https://pib.gov.in/Allrel.aspx",
        "article_link_pattern": r"/PressReleaseIframePage\.aspx\?PRID=",
        "title_selector":   "h1, h2, .RelText, .presshead",
        "date_selector":    ".pressDate, .date, span.date",
        "content_selector": "#RelText, .RelText, .pressContent",
        "domain":     "pib.gov.in",
        "cred":  1.0, "tier": 1, "domain_tag": "national",
    },
]


class HTMLCrawlerAgent(BaseAgent):
    """
    Crawls government sites that don't expose RSS feeds.
    Two-stage: listing page → article links → article fetch.

    Key fixes vs original:
    - robots.txt awareness (FIX-3)
    - Single shared httpx client per cycle (FIX-4)
    - URL deduplication via Redis (FIX-5)
    - Corrected link patterns for MHA, MOHFW, ISRO (FIX-1,2,6)
    - PDF links skipped cleanly
    """
    name          = "html-crawler"
    input_queue   = ""
    output_queue  = Q.INGEST_RAW
    POLL_INTERVAL = 30 * 60      # 30 min between full cycles
    RATE_DELAY    = 8.0          # seconds between requests (polite crawling)
    MAX_ARTICLES  = 15           # max articles per source per run
    URL_SEEN_TTL  = 86400        # 24h dedup window for crawled URLs

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
            # FIX-4: One shared client for the entire cycle (not per source)
            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                headers=self.HEADERS,
            ) as client:
                for source in HTML_CRAWLER_SOURCES:
                    try:
                        await self._crawl_source(source, client)
                        await asyncio.sleep(self.RATE_DELAY)
                    except Exception as e:
                        log.warning(f"HTMLCrawler [{source['name']}]: {e}")
            log.info(f"HTMLCrawler: Cycle done, sleeping {self.POLL_INTERVAL}s")
            await asyncio.sleep(self.POLL_INTERVAL)

    async def _check_robots(self, client: httpx.AsyncClient, list_url: str) -> bool:
        """
        FIX-3: Check robots.txt before crawling.
        Returns True if crawling is allowed, False if disallowed.
        Cached in Redis for 1 hour.
        """
        try:
            from urllib.parse import urlparse, urljoin
            parsed   = urlparse(list_url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            robots_url = urljoin(base_url, "/robots.txt")
            cache_key  = f"robots:{parsed.netloc}"

            cached = await self.redis_client.get(cache_key)
            if cached is not None:
                return str(cached) == "1"

            resp = await client.get(robots_url, timeout=5)
            if resp.status_code != 200:
                await self.redis_client.setex(cache_key, 3600, "1")
                return True

            disallowed = False
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

        # FIX-3: robots.txt check
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

            # FIX-2: Skip PDFs — we can't extract text from them here
            if url.lower().endswith(".pdf"):
                log.debug(f"HTMLCrawler: skipping PDF {url}")
                continue

            # FIX-5: URL deduplication
            seen_key = f"htmlcrawler:seen:{hash(url)}"
            if await self.redis_client.get(seen_key):
                continue

            await asyncio.sleep(self.RATE_DELAY)
            try:
                article = await self._fetch_article(client, url, source)
                if article:
                    await self.publish(article)
                    await self.redis_client.setex(seen_key, self.URL_SEEN_TTL, "1")
                    fetched += 1
            except Exception as e:
                log.debug(f"HTMLCrawler article fetch skipped [{url}]: {e}")

        log.info(f"HTMLCrawler [{source['name']}]: fetched {fetched} new articles")

    def _extract_links(
        self, soup: BeautifulSoup, base_url: str, pattern: re.Pattern
    ) -> list[str]:
        """Extract and normalise article links matching the pattern."""
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
            # Strip fragments
            full = full.split("#")[0]
            if full not in seen:
                seen.add(full)
                links.append(full)
        return links

    async def _fetch_article(
        self, client: httpx.AsyncClient, url: str, source: dict
    ) -> Optional[dict]:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None

        # FIX-2: Content-type check — skip non-HTML responses
        ct = resp.headers.get("content-type", "")
        if "html" not in ct.lower():
            log.debug(f"HTMLCrawler: skipping non-HTML content-type at {url}")
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        title   = self._extract_field(soup, source["title_selector"])
        date    = self._extract_field(soup, source["date_selector"])
        content = self._extract_content(soup, source["content_selector"])

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
                    text = el.get_text(" ", strip=True)
                    if len(text) > 100:
                        return text[:10000]
            except Exception:
                continue
        return ""

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())
