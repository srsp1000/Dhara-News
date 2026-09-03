"""
agents/publishing/__init__.py

FIXES APPLIED
─────────────────────────────────────────────────────────────────────────────
FIX #1  Removed 3 duplicated deduplication classes:
          FingerprintAgent, SemanticDedupAgent, StoryClusterManager
        These were copied here verbatim from agents/deduplication/__init__.py.
        With both modules running, RabbitMQ round-robins 3 consumers on the
        same queue → 2 out of 3 articles silently vanish.
        CANONICAL location: agents/deduplication/__init__.py

FIX #2  Removed 4 duplicated personalization / monitoring classes:
          ProfessionFeedAgent, LocationFeedAgent    → agents/personalization/__init__.py
          TrendingDetectorAgent, MorningBriefAgent  → agents/personalization/__init__.py
          SearchIndexerAgent, TruthScoreUpdater     → agents/monitoring/__init__.py
          PipelineHealthAgent                       → agents/monitoring/__init__.py
        Each had a second copy here that could diverge silently from the canonical.

FIX #3  PublishQueueManager now also fires Q.PERS_NOTIFY so NotificationAgent
        actually receives messages. Previously nothing ever published to
        pers.notify, meaning push notifications were permanently broken.

This file now contains ONLY the three classes that belong here:
  PublishQueueManager  — the publish gate (canonically here)
  SEOAgent             — SEO meta generation (canonically here)
  SocialShareAgent     — share card generation (canonically here)
"""

import asyncio
import json
import os
import logging
import sys
from pathlib import Path
from datetime import datetime, timezone

try:
    from agents.base import BaseAgent, Q
except ModuleNotFoundError:
    from base import BaseAgent, Q

try:
    from shared.location_utils import normalize_state_name, normalize_district_name
except Exception:
    # Container fallback: add repo root so shared/ can be imported.
    try:
        repo_root = Path(__file__).resolve().parents[2]
        if str(repo_root) not in sys.path:
            sys.path.append(str(repo_root))
        from shared.location_utils import normalize_state_name, normalize_district_name
    except Exception:
        def normalize_state_name(name):
            return name
        def normalize_district_name(name, state_hint=None):
            return name, state_hint

log = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════════
# PUBLISH QUEUE MANAGER
# Gate between personalization and storage/indexing.
# FIX #3: Now publishes to Q.PERS_NOTIFY so push notifications fire.
# ════════════════════════════════════════════════════════════════════════════
class PublishQueueManager(BaseAgent):
    name         = "publish-queue"
    input_queue  = Q.PUB_GATE
    output_queue = Q.PUB_INDEX   # → SearchIndexerAgent

    async def process(self, payload: dict) -> dict | None:
        cluster_id  = payload.get("cluster_id")
        truth_score = int(payload.get("truth_score", 0))
        status      = payload.get("status", "quarantine")
        professions = payload.get("professions") or []
        raw_state = payload.get("loc_state")
        raw_city = payload.get("loc_city")
        raw_district = payload.get("loc_district")

        norm_state = normalize_state_name(raw_state) if raw_state else raw_state
        norm_district, inferred_state = normalize_district_name(raw_district or raw_city, norm_state)
        if not norm_state and inferred_state:
            norm_state = inferred_state

        if isinstance(professions, list):
            deduped = []
            for p in professions:
                p = str(p).strip()
                if p and p not in deduped:
                    deduped.append(p)
            professions = deduped[:3] if deduped else ["general"]
        else:
            professions = ["general"]

        if not cluster_id:
            return None

        # Write all enriched data to the cluster row
        await self.db_execute(
            """UPDATE story_clusters SET
               headline        = COALESCE($2, headline),
               summary_brief   = COALESCE($3, summary_brief),
               summary_deep    = COALESCE($4, summary_deep),
               platform_body   = COALESCE($5, platform_body),
               truth_score     = $6,
               status          = $7,
               domain          = COALESCE($8, domain),
               professions     = COALESCE($9, professions),
               exam_tags       = COALESCE($10, exam_tags),
               loc_country     = COALESCE($11, loc_country),
               loc_state       = COALESCE($12, loc_state),
               loc_city        = COALESCE($13, loc_city),
               loc_district    = COALESCE($14, loc_district),
               loc_global      = COALESCE($15, loc_global),
               conflict        = COALESCE($16, conflict),
               image_url       = COALESCE($17, image_url),
               article_probability = COALESCE($18, article_probability),
               article_uncertainty = COALESCE($19, article_uncertainty),
               n_eff           = COALESCE($20, n_eff),
               is_breaking     = COALESCE($21, is_breaking),
               breaking_at     = CASE
                                   WHEN $21 = FALSE THEN NULL
                                   WHEN $21 = TRUE THEN COALESCE($22, breaking_at, NOW())
                                   ELSE breaking_at
                                 END,
               label_reason    = COALESCE($23, label_reason),
               last_updated    = now()
               WHERE id = $1""",
            cluster_id,
            payload.get("platform_headline") or payload.get("title"),
            payload.get("summary_brief"),
            payload.get("summary_deep"),
            payload.get("platform_body"),
            truth_score,
            status,
            payload.get("domain"),
            professions,
            payload.get("exam_tags"),
            payload.get("loc_country", "IN"),
            norm_state,
            raw_city,
            norm_district,
            payload.get("loc_global", False),
            payload.get("has_contradiction", False),
            payload.get("image_url"),
            payload.get("article_probability"),
            payload.get("article_uncertainty"),
            payload.get("n_eff"),
            payload.get("is_breaking"),
            payload.get("breaking_at"),
            payload.get("label_reason") or (payload.get("_score_meta") or {}).get("label_reason"),
        )

        # Persist translations
        for lang, t in (payload.get("translations") or {}).items():
            if not t or not t.get("headline"):
                continue
            try:
                await self.db_execute(
                    """INSERT INTO article_translations
                           (cluster_id, language, headline, summary)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (cluster_id, language) DO UPDATE
                           SET headline = EXCLUDED.headline,
                               summary  = EXCLUDED.summary""",
                    cluster_id,
                    str(lang),
                    str(t.get("headline", ""))[:500],
                    str(t.get("brief", ""))[:2000],
                )
            except Exception as e:
                log.warning(f"[{self.name}] Translation insert failed ({lang}): {e}")

        log.info(f"Published cluster {str(cluster_id)[:8]} | score={truth_score} | status={status}")

        if status in ("verified", "developing"):
            await self.publish_to(Q.PUB_SEO,         payload)
            await self.publish_to(Q.PUB_SHARE,        payload)
            await self.publish_to(Q.NLP_TIMELINE,     payload)
            await self.publish_to(Q.PERS_TRENDING,    payload)
            # FIX #3: Fire PERS_NOTIFY so NotificationAgent receives messages.
            # Previously this queue had no producer — push notifications never fired.
            await self.publish_to(Q.PERS_NOTIFY,      payload)

            # Invalidate feed cache so new articles appear immediately
            try:
                keys = [k async for k in self.redis_client.scan_iter(match="feed:page:*")]
                if keys:
                    await self.redis_client.delete(*keys)
                    log.debug(f"[{self.name}] Invalidated {len(keys)} feed cache keys")
            except Exception as e:
                log.warning(f"[{self.name}] Feed cache invalidation failed: {e}")

        return payload   # → SearchIndexerAgent via output_queue

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# SEO AGENT
# ════════════════════════════════════════════════════════════════════════════
class SEOAgent(BaseAgent):
    name         = "seo-agent"
    input_queue  = Q.PUB_SEO
    output_queue = ""

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        headline   = payload.get("platform_headline") or payload.get("title", "")
        brief      = payload.get("summary_brief", "")
        domain     = payload.get("domain", "general")
        entities   = payload.get("entities", [])

        keywords = [e["text"] for e in entities if e.get("label") in ("PERSON", "ORG", "GPE")][:5]
        keywords.append(domain)

        seo_meta = {
            "meta_title":       f"{headline[:60]} | Dhara News",
            "meta_description": brief[:155] if brief else headline[:155],
            "keywords":         ", ".join(keywords),
            "og_title":         headline[:95],
            "og_description":   brief[:200] if brief else "",
            "schema_type":      "NewsArticle",
        }

        await self.db_execute(
            """INSERT INTO article_seo (cluster_id, meta_title, meta_description, keywords, schema_json)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (cluster_id) DO UPDATE SET
               meta_title = $2, meta_description = $3""",
            cluster_id,
            seo_meta["meta_title"],
            seo_meta["meta_description"],
            seo_meta["keywords"],
            json.dumps(seo_meta),
        )
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# SOCIAL SHARE AGENT
# ════════════════════════════════════════════════════════════════════════════
class SocialShareAgent(BaseAgent):
    """
    Generates shareable preview cards for WhatsApp, X, LinkedIn.
    social_share_impl.py is an empty stub — this is the canonical implementation.
    """
    name         = "social-share"
    input_queue  = Q.PUB_SHARE
    output_queue = ""

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        headline   = payload.get("platform_headline") or payload.get("title", "")
        score      = payload.get("truth_score", 0)
        domain     = payload.get("domain", "general")
        SITE       = os.environ.get("SITE_URL", "https://dhara.news")

        if not cluster_id:
            return None

        share_data = {
            "url":      f"{SITE}/article/{cluster_id}",
            "whatsapp": (
                f"https://wa.me/?text={headline}"
                f"+%E2%80%94+Truth+Score+{score}%25"
                f"+%7C+{SITE}/article/{cluster_id}"
            ),
            "twitter":  (
                f"https://twitter.com/intent/tweet"
                f"?text={headline}&url={SITE}/article/{cluster_id}&via=DharaNews"
            ),
            "linkedin": (
                f"https://www.linkedin.com/shareArticle"
                f"?mini=true&url={SITE}/article/{cluster_id}&title={headline}"
            ),
        }

        await self.redis_client.setex(
            f"share:{cluster_id}", 7 * 24 * 3600,
            json.dumps(share_data)
        )
        log.debug(f"SocialShare: Stored share links for {str(cluster_id)[:8]}")
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


if __name__ == "__main__":
    import sys
    {
        "publish":  PublishQueueManager,
        "seo":      SEOAgent,
        "share":    SocialShareAgent,
    }.get(sys.argv[1] if len(sys.argv) > 1 else "publish", PublishQueueManager).run()
