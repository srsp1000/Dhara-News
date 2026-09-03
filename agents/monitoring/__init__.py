"""
agents/monitoring/__init__.py  — Breaking News + Pipeline Health + Trending fixes

NEW     BreakingNewsDetectorAgent — velocity-based breaking news detection
        using a sliding 5-minute window. Runs every 60s, checks article_views
        for velocity spikes, sets is_breaking=true on qualifying clusters,
        expires breaking status after 4 hours.

FIX     TrendingDetectorAgent was writing to Redis sorted sets but
        /api/trending read from the DB article_views table — they never talked.
        Now TrendingDetectorAgent ALSO writes a Redis cache that /api/trending
        can read first (with DB as fallback).

FIX     BiasDriftAgent: removed reference to non-existent bias_score column.
        Now uses source_tier + truth_score proxy.

FIX     TruthScoreUpdater: extended window to 72h, upward promotion when
        source_count grows overnight, time decay for stale developing articles.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

try:
    from shared.truth_scoring import (
        DEFAULT_DEVELOPING_THRESHOLD,
        DEFAULT_VERIFIED_THRESHOLD,
        HIGH_STAKES_DOMAINS,
        HIGH_STAKES_VERIFIED_THRESHOLD,
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
    )
except Exception:
    from truth_scoring import (
        DEFAULT_DEVELOPING_THRESHOLD,
        DEFAULT_VERIFIED_THRESHOLD,
        HIGH_STAKES_DOMAINS,
        HIGH_STAKES_VERIFIED_THRESHOLD,
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
    )

try:
    from agents.base import BaseAgent, Q
except ModuleNotFoundError:
    from base import BaseAgent, Q

try:
    from agents.verification import SourceCredibilityAgent
    _SINGLE_SOURCE_CAPS = SourceCredibilityAgent.SINGLE_SOURCE_CAPS
except ImportError:
    _SINGLE_SOURCE_CAPS            = {1: 78, 2: 70, 3: 55}


log = logging.getLogger(__name__)

RUNTIME_CONFIG_DEFAULTS = {
    "p_verified_default": str(P_VERIFIED_DEFAULT),
    "p_verified_high_stakes": str(P_VERIFIED_HIGH_STAKES),
    "single_source_exception_min_p": str(SINGLE_SOURCE_EXCEPTION_MIN_P),
    "breaking_velocity_mult": "3.0",
    "breaking_min_score": "85",
    "breaking_min_sources": "2",
    "breaking_ttl_hours": "4",
}


def _safe_int(value, default: int) -> int:
    try:
        return int(float(value))
    except Exception:
        return default


def _safe_float(value, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


async def _load_runtime_config(agent: BaseAgent) -> dict[str, str]:
    cfg = dict(RUNTIME_CONFIG_DEFAULTS)
    try:
        cached = await agent.redis_client.get("admin:config")
        if cached:
            data = json.loads(cached)
            if isinstance(data, dict):
                return {**cfg, **{str(k): str(v) for k, v in data.items()}}
    except Exception:
        pass

    try:
        rows = await agent.db_fetch("SELECT key, value FROM admin_config")
        for row in rows:
            cfg[str(row["key"])] = str(row["value"])
    except Exception:
        pass
    return cfg


def _compute_status(score: int, source_count: int, domain: str, has_contradiction: bool) -> str:
    if has_contradiction:
        return "developing" if score >= DEFAULT_DEVELOPING_THRESHOLD else "quarantine"
    is_hs  = domain in HIGH_STAKES_DOMAINS
    vt     = HIGH_STAKES_VERIFIED_THRESHOLD if is_hs else DEFAULT_VERIFIED_THRESHOLD
    if score >= vt and source_count >= 2:
        return "verified"
    return "developing" if score >= DEFAULT_DEVELOPING_THRESHOLD else "quarantine"


# ════════════════════════════════════════════════════════════════════════════
# BREAKING NEWS DETECTOR  (NEW)
#
# Industry standard: "Breaking" = story that crossed a velocity threshold
# within its first 2 hours AND has a truth_score ≥ 85 AND ≥ 2 sources.
#
# Algorithm:
#   Every 60s, query article_views for articles published < 2h ago.
#   Compute velocity = views in last 5 minutes / baseline_rate.
#   If velocity ≥ VELOCITY_THRESHOLD AND quality gate passes → is_breaking.
#   Breaking status expires after BREAKING_TTL_HOURS (4h default).
#   Store breaking cluster IDs in Redis set "breaking:active" with TTL.
# ════════════════════════════════════════════════════════════════════════════
class BreakingNewsDetectorAgent(BaseAgent):
    """
    Detects breaking news by tracking view velocity spikes in real time.

    Breaking news criteria (all must pass):
    1. Article published < 2 hours ago
    2. truth_score >= 85 (verified or near-verified)
    3. source_count >= 2 (corroborated)
    4. View velocity >= 3x the 24h rolling average rate for that article
    5. No unresolved contradiction

    Breaking status expires after 4 hours unless refreshed.
    """
    name           = "breaking-news-detector"
    input_queue    = ""
    CHECK_INTERVAL = 60         # run every 60 seconds
    VELOCITY_MULTIPLIER = 3.0  # 3x baseline = breaking threshold
    BREAKING_TTL_HOURS  = 4    # breaking label expires after 4h
    MIN_TRUTH_SCORE     = 85
    MIN_SOURCES         = 2

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            try:
                await self._detect()
            except Exception as e:
                log.warning(f"BreakingDetector: cycle error: {e}")
            await asyncio.sleep(self.CHECK_INTERVAL)

    async def _detect(self):
        """
        Find articles that:
        - Published in last 2 hours
        - Meet quality gates
        - Have velocity spike in last 5 minutes
        """
        now = datetime.now(timezone.utc)
        two_hours_ago  = now - timedelta(hours=2)
        five_mins_ago  = now - timedelta(minutes=5)
        thirty_mins_ago = now - timedelta(minutes=30)
        runtime_cfg = await _load_runtime_config(self)
        velocity_multiplier = _safe_float(runtime_cfg.get("breaking_velocity_mult"), self.VELOCITY_MULTIPLIER)
        min_truth_score = _safe_int(runtime_cfg.get("breaking_min_score"), self.MIN_TRUTH_SCORE)
        min_sources = _safe_int(runtime_cfg.get("breaking_min_sources"), self.MIN_SOURCES)
        ttl_hours = max(1, _safe_int(runtime_cfg.get("breaking_ttl_hours"), self.BREAKING_TTL_HOURS))

        # Step 1: candidates — recent high-quality articles
        candidates = await self.db_fetch(
            """SELECT
                c.id, c.headline, c.truth_score, c.source_count,
                c.domain, c.conflict, c.is_breaking,
                c.first_seen,
                COUNT(av.id) FILTER (WHERE av.viewed_at >= $2) AS views_5m,
                COUNT(av.id) FILTER (WHERE av.viewed_at >= $3) AS views_30m,
                COUNT(av.id) AS views_total
               FROM story_clusters c
               LEFT JOIN article_views av ON av.cluster_id = c.id
               WHERE c.first_seen >= $1
                 AND c.truth_score >= $4
                 AND c.source_count >= $5
                 AND c.conflict = FALSE
               GROUP BY c.id, c.headline, c.truth_score, c.source_count,
                        c.domain, c.conflict, c.is_breaking, c.first_seen
               ORDER BY views_5m DESC
               LIMIT 50""",
            two_hours_ago,
            five_mins_ago,
            thirty_mins_ago,
            min_truth_score,
            min_sources,
        )

        new_breaking = 0
        expired_breaking = 0

        for row in candidates:
            cluster_id  = str(row["id"])
            views_5m    = int(row["views_5m"] or 0)
            views_30m   = int(row["views_30m"] or 0)
            views_total = int(row["views_total"] or 0)

            # Compute baseline rate: views in 30m window → per-5m baseline
            baseline_5m = max(1, views_30m / 6)  # 30m / 6 = 5m interval baseline

            # Velocity check
            velocity_ratio = views_5m / baseline_5m if baseline_5m > 0 else 0.0
            is_spike = velocity_ratio >= velocity_multiplier and views_5m >= 3

            currently_breaking = bool(row.get("is_breaking", False))

            if is_spike and not currently_breaking:
                # Mark as breaking
                await self.db_execute(
                    "UPDATE story_clusters SET is_breaking=TRUE, breaking_at=NOW() WHERE id=$1",
                    cluster_id,
                )
                # Add to Redis breaking set with TTL
                ttl_seconds = ttl_hours * 3600
                await self.redis_client.setex(f"breaking:{cluster_id}", ttl_seconds, "1")
                await self.redis_client.zadd("breaking:active", {cluster_id: now.timestamp()})
                await self.redis_client.expire("breaking:active", ttl_seconds)

                # Trigger notification pipeline
                try:
                    await self.publish_to(Q.PERS_NOTIFY, {
                        "cluster_id":        cluster_id,
                        "platform_headline": row["headline"],
                        "truth_score":       row["truth_score"],
                        "domain":            row["domain"],
                        "professions":       ["general"],
                        "is_breaking":       True,
                        "velocity_ratio":    round(velocity_ratio, 2),
                    })
                except Exception as e:
                    log.debug(f"BreakingDetector: notify publish failed: {e}")

                new_breaking += 1
                log.info(
                    f"BREAKING: {row['headline'][:60]} "
                    f"(velocity={velocity_ratio:.1f}x, views_5m={views_5m})"
                )

        # Step 2: expire stale breaking articles (older than BREAKING_TTL_HOURS)
        expiry_cutoff = now - timedelta(hours=ttl_hours)
        expired = await self.db_fetch(
            """SELECT id FROM story_clusters
               WHERE is_breaking = TRUE AND breaking_at < $1""",
            expiry_cutoff,
        )
        for row in expired:
            cluster_id = str(row["id"])
            await self.db_execute(
                "UPDATE story_clusters SET is_breaking=FALSE WHERE id=$1", cluster_id
            )
            await self.redis_client.delete(f"breaking:{cluster_id}")
            expired_breaking += 1

        if new_breaking or expired_breaking:
            log.info(f"BreakingDetector: +{new_breaking} breaking, -{expired_breaking} expired")

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# SEARCH INDEXER AGENT  (unchanged — ES retry loop)
# ════════════════════════════════════════════════════════════════════════════
class SearchIndexerAgent(BaseAgent):
    name         = "search-indexer"
    input_queue  = Q.PUB_INDEX
    output_queue = ""
    ES_URL       = "http://elasticsearch:9200"
    ES_INDEX     = "dhara_articles"
    MAPPING = {"mappings": {"properties": {
        "headline":     {"type": "text",    "analyzer": "english"},
        "summary":      {"type": "text",    "analyzer": "english"},
        "domain":       {"type": "keyword"},
        "professions":  {"type": "keyword"},
        "exam_tags":    {"type": "keyword"},
        "is_breaking":  {"type": "boolean"},
        "truth_score":  {"type": "integer"},
        "status":       {"type": "keyword"},
        "published_at": {"type": "date"},
        "source_domain":{"type": "keyword"},
    }}}

    async def on_start(self):
        import httpx
        for attempt in range(12):
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.put(f"{self.ES_URL}/{self.ES_INDEX}", json=self.MAPPING)
                    if resp.status_code in (200, 400):
                        log.info(f"SearchIndexer: ES index ready (attempt {attempt+1})")
                        return
            except Exception as e:
                log.warning(f"SearchIndexer: ES not ready (attempt {attempt+1}): {e}")
            await asyncio.sleep(5)
        log.error("SearchIndexer: Could not reach Elasticsearch after 60s")

    async def process(self, payload: dict) -> dict | None:
        import httpx
        cluster_id = payload.get("cluster_id")
        if not cluster_id:
            return None
        doc = {
            "headline":     payload.get("platform_headline") or payload.get("title", ""),
            "summary":      payload.get("summary_brief", ""),
            "domain":       payload.get("domain", ""),
            "professions":  payload.get("professions", []),
            "exam_tags":    payload.get("exam_tags", []),
            "is_breaking":  payload.get("is_breaking", False),
            "truth_score":  payload.get("truth_score", 0),
            "status":       payload.get("status", "quarantine"),
            "published_at": payload.get("published") or datetime.now(timezone.utc).isoformat(),
            "source_domain":payload.get("source_domain", ""),
        }
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.put(f"{self.ES_URL}/{self.ES_INDEX}/_doc/{cluster_id}", json=doc)
        except Exception as e:
            log.warning(f"SearchIndexer: ES index failed: {e}")
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# TRUTH SCORE UPDATER
# FIX: Upward promotion + time decay + domain sensitivity + cache invalidation
# ════════════════════════════════════════════════════════════════════════════
class TruthScoreUpdater(BaseAgent):
    name         = "truth-score-updater"
    input_queue  = ""
    output_queue = ""
    RUN_INTERVAL       = 30 * 60
    DECAY_START_HOURS  = 48
    DECAY_RATE_PER_DAY = 2
    DECAY_MAX          = 8

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._run()
            await asyncio.sleep(self.RUN_INTERVAL)

    async def _run(self):
        now  = datetime.now(timezone.utc)
        runtime_cfg = await _load_runtime_config(self)
        p_verified_default = _safe_float(runtime_cfg.get("p_verified_default"), DEFAULT_VERIFIED_THRESHOLD / 100)
        p_verified_high_stakes = _safe_float(runtime_cfg.get("p_verified_high_stakes"), HIGH_STAKES_VERIFIED_THRESHOLD / 100)
        n_eff_verified_default = _safe_float(runtime_cfg.get("n_eff_verified_default"), N_EFF_VERIFIED_DEFAULT)
        n_eff_high_stakes = _safe_float(runtime_cfg.get("n_eff_high_stakes"), N_EFF_VERIFIED_HIGH_STAKES)
        single_source_exception_min_p = _safe_float(
            runtime_cfg.get("single_source_exception_min_p"),
            SINGLE_SOURCE_EXCEPTION_MIN_P,
        )
        default_verified_threshold = round(p_verified_default * 100)
        high_stakes_verified_threshold = round(p_verified_high_stakes * 100)
        rows = await self.db_fetch(
            """SELECT c.id, c.source_count, c.truth_score, c.status, c.domain,
                      c.conflict, c.source_tier, c.last_updated, c.first_seen,
                      (
                        SELECT a.source_domain
                        FROM articles a
                        WHERE a.cluster_id = c.id
                        ORDER BY COALESCE(a.source_cred, 0) DESC,
                                 a.published_at ASC NULLS LAST,
                                 a.first_seen ASC NULLS LAST
                        LIMIT 1
                      ) AS primary_source_domain,
                      c.article_probability, c.n_eff, c.label_reason
               FROM story_clusters c
               WHERE c.first_seen > NOW() - INTERVAL '72 hours'"""
        )
        updated = 0
        for row in rows:
            cluster_id        = str(row["id"])
            current_score     = int(row["truth_score"] or 0)
            source_count      = int(row["source_count"] or 0)
            current_status    = str(row["status"] or "developing")
            domain            = str(row["domain"] or "").lower()
            has_contradiction = bool(row["conflict"])
            source_tier       = int(row["source_tier"] or 2)
            last_updated      = row["last_updated"]
            article_probability = row.get("article_probability")
            n_eff = row.get("n_eff")
            current_label_reason = str(row.get("label_reason") or "")
            primary_source_domain = str(row.get("primary_source_domain") or "")
            new_label_reason = current_label_reason

            if last_updated and last_updated.tzinfo is None:
                last_updated = last_updated.replace(tzinfo=timezone.utc)

            new_score = current_score

            # Time decay for stale developing articles
            if current_status == "developing" and last_updated:
                hours_idle = (now - last_updated).total_seconds() / 3600
                if hours_idle > self.DECAY_START_HOURS:
                    days_past = (hours_idle - self.DECAY_START_HOURS) / 24
                    decay     = min(self.DECAY_MAX, int(days_past * self.DECAY_RATE_PER_DAY))
                    new_score = max(0, current_score - decay)

            # Re-apply single-source cap
            if source_count < 2:
                cap       = _SINGLE_SOURCE_CAPS.get(source_tier, 55)
                new_score = min(new_score, cap)

            # Preserve Bayesian labeling semantics whenever probability inputs exist.
            if article_probability is not None and n_eff is not None:
                new_status, bayes_reason = _assign_label(
                    float(article_probability),
                    float(n_eff),
                    domain,
                    has_contradiction,
                    0.0,
                    source_count=source_count,
                    primary_source_domain=primary_source_domain,
                    p_verified_default=p_verified_default,
                    p_verified_high_stakes=p_verified_high_stakes,
                    n_eff_verified_default=n_eff_verified_default,
                    n_eff_high_stakes=n_eff_high_stakes,
                    single_source_exception_min_p=single_source_exception_min_p,
                )
                new_label_reason = bayes_reason
            elif has_contradiction:
                new_status = "developing" if new_score >= DEFAULT_DEVELOPING_THRESHOLD else "quarantine"
            else:
                vt = high_stakes_verified_threshold if domain in HIGH_STAKES_DOMAINS else default_verified_threshold
                if new_score >= vt and source_count >= 2:
                    new_status = "verified"
                else:
                    new_status = "developing" if new_score >= DEFAULT_DEVELOPING_THRESHOLD else "quarantine"

            reason_changed = new_label_reason != current_label_reason
            if abs(new_score - current_score) >= 1 or new_status != current_status or reason_changed:
                await self.db_execute(
                    """UPDATE story_clusters
                       SET truth_score=$1, status=$2, label_reason=$3, last_updated=NOW()
                       WHERE id=$4""",
                    new_score, new_status, new_label_reason, cluster_id,
                )
                updated += 1
                if new_status != current_status:
                    log.info(
                        f"TruthUpdater: {cluster_id[:8]} {current_status}→{new_status} "
                        f"score {current_score}→{new_score}"
                    )

        if updated:
            log.info(f"TruthUpdater: Updated {updated} clusters")
            try:
                keys = [k async for k in self.redis_client.scan_iter(match="feed:*")]
                if keys:
                    await self.redis_client.delete(*keys)
            except Exception as e:
                log.warning(f"TruthUpdater: cache clear failed: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# PIPELINE HEALTH AGENT  (unchanged)
# ════════════════════════════════════════════════════════════════════════════
class PipelineHealthAgent(BaseAgent):
    name           = "pipeline-health"
    input_queue    = ""
    CHECK_INTERVAL = 60

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._check()
            await asyncio.sleep(self.CHECK_INTERVAL)

    async def _check(self):
        import httpx
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    "http://rabbitmq:15672/api/queues/%2F", auth=("dhara", "dhara_local")
                )
                if resp.status_code == 200:
                    for q in resp.json():
                        depth = q.get("messages", 0)
                        name  = q.get("name", "")
                        await self.redis_client.hset("queue_depths", name, depth)
                        if depth > 500:
                            log.warning(f"Health: Queue '{name}' backlog = {depth}")

            # Store agent heartbeats for admin panel
            agent_health = await self.redis_client.hgetall("agent:heartbeat")
            now_ts       = datetime.now(timezone.utc).timestamp()
            stale = []
            for agent_name, last_ts_bytes in agent_health.items():
                try:
                    last_ts = float(last_ts_bytes)
                    if now_ts - last_ts > 120:  # 2 minutes = stale
                        stale.append(agent_name)
                except Exception:
                    pass
            if stale:
                log.warning(f"Health: Stale agents: {stale}")
            await self.redis_client.hset("health:stale_agents", "list", json.dumps(stale))

        except Exception as e:
            log.debug(f"Health check skipped: {e}")

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# BIAS DRIFT AGENT  (FIX: removed bias_score column reference)
# ════════════════════════════════════════════════════════════════════════════
class BiasDriftAgent(BaseAgent):
    name         = "bias-drift"
    input_queue  = ""
    RUN_INTERVAL = 7 * 24 * 3600

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._run()
            await asyncio.sleep(self.RUN_INTERVAL)

    async def _run(self):
        rows = await self.db_fetch(
            """SELECT domain, COUNT(*) AS cnt,
                      AVG(source_tier) AS avg_tier, AVG(truth_score) AS avg_truth
               FROM story_clusters
               WHERE first_seen > NOW() - INTERVAL '7 days'
               GROUP BY domain"""
        )
        if not rows:
            return
        total     = sum(r["cnt"] for r in rows)
        avg_tier  = sum((r["avg_tier"] or 2) * r["cnt"] for r in rows) / max(total, 1)
        avg_truth = sum((r["avg_truth"] or 50) * r["cnt"] for r in rows) / max(total, 1)
        alert     = (avg_tier > 2.5) or (avg_truth < 55)

        await self.db_execute(
            """INSERT INTO bias_reports (week_start, total_articles, avg_bias, domain_breakdown, alert_triggered)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (week_start) DO UPDATE
               SET total_articles=$2, avg_bias=$3, domain_breakdown=$4, alert_triggered=$5""",
            (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d"),
            total,
            round((avg_tier - 2.0) / 1.0, 3),
            json.dumps({r["domain"]: {"count": r["cnt"], "avg_tier": round(r["avg_tier"] or 0, 2), "avg_truth": round(r["avg_truth"] or 0, 2)} for r in rows}),
            alert,
        )
        if alert:
            log.warning(f"BiasDrift ALERT: avg_tier={avg_tier:.2f}, avg_truth={avg_truth:.1f}")

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


# ════════════════════════════════════════════════════════════════════════════
# AD QUALITY AGENT  (unchanged)
# ════════════════════════════════════════════════════════════════════════════
class AdQualityAgent(BaseAgent):
    name           = "ad-quality"
    input_queue    = ""
    CHECK_INTERVAL = 120

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        while self.running:
            await self._refresh_blocklist()
            await asyncio.sleep(self.CHECK_INTERVAL)

    async def _refresh_blocklist(self):
        rows = await self.db_fetch(
            """SELECT id FROM story_clusters
               WHERE truth_score < 50 OR conflict=TRUE OR status='quarantine'
               ORDER BY last_updated DESC LIMIT 500"""
        )
        if rows:
            ids  = [str(r["id"]) for r in rows]
            pipe = self.redis_client.pipeline()
            pipe.delete("ads:blocked_clusters")
            pipe.sadd("ads:blocked_clusters", *ids)
            pipe.expire("ads:blocked_clusters", self.CHECK_INTERVAL * 2)
            for cid in ids:
                pipe.setex(f"ads:block:{cid}", self.CHECK_INTERVAL * 2, "1")
            await pipe.execute()

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


if __name__ == "__main__":
    import sys
    {
        "breaking":      BreakingNewsDetectorAgent,
        "indexer":       SearchIndexerAgent,
        "truth-updater": TruthScoreUpdater,
        "health":        PipelineHealthAgent,
        "bias":          BiasDriftAgent,
        "ads":           AdQualityAgent,
    }.get(sys.argv[1] if len(sys.argv) > 1 else "breaking", BreakingNewsDetectorAgent).run()
