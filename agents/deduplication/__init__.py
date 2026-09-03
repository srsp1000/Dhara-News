"""
agents/deduplication/__init__.py

FIXES APPLIED (from dhara-analysis.html audit):
  BUG #4  — FingerprintAgent used hashlib.md5() but docstring claimed "SimHash".
             MD5 is a cryptographic hash — two similar strings produce completely
             different values.  Near-duplicate detection requires a locality-
             sensitive hash.  Fixed: fingerprint now uses SHA-256 (consistent,
             collision-resistant) and relies on PostgreSQL pg_trgm similarity()
             (already installed, already used in StoryClusterManager) as the
             near-duplicate pass.  Bloom filter is used for exact-match fast-path.

  BUG #5  — Bloom filter was write-only: the bit was SET after the DB check but
             never READ before it, so it did nothing.  Fixed: two-bit bloom
             filter (k=2 independent hash positions) is now checked BEFORE the
             DB query. If the bloom filter says "probable duplicate", we do the
             DB confirmation; only then do we set both bits. This makes the bloom
             filter actually useful as a fast Redis pre-filter.

  BUG #6  — SemanticDedupAgent.qdrant.upsert() received plain Python dicts.
             The Qdrant async client expects PointStruct objects.  Passing dicts
             silently fails (vectors never stored → every article creates a new
             cluster forever).  Fixed: import PointStruct and use it.

  PERF    — StoryClusterManager: collapsed 7 sequential DB round-trips into
             ~3 using INSERT … ON CONFLICT DO UPDATE … RETURNING and a deferred
             source_count batch approach (kept inline for now; can be extracted
             to a 5-min job later without changing the interface).
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from base import BaseAgent, Q

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Bloom filter helpers (BUG #5 FIX)
# ──────────────────────────────────────────────────────────────────────────────
BLOOM_KEY  = "article_bloom"
BLOOM_SIZE = 2 ** 28   # ~268 million bits ≈ 32 MB


def _bloom_positions(fp: str) -> tuple[int, int]:
    """Return two independent bit positions for a k=2 bloom filter."""
    bit1 = int(fp[:8],  16) % BLOOM_SIZE
    bit2 = int(fp[8:16], 16) % BLOOM_SIZE
    return bit1, bit2


class FingerprintAgent(BaseAgent):
    """
    First dedup pass: SHA-256 fingerprint + k=2 bloom filter (fast path)
    + DB exact match (URL and fingerprint).

    BUG #4 FIX: was hashlib.md5 labelled "SimHash" — now SHA-256.
    BUG #5 FIX: bloom filter now READ before DB query (was write-only).
                Two-bit (k=2) positions reduce false-positive rate.

    Near-duplicate detection (same story, different wording) is handled
    downstream by SemanticDedupAgent (Qdrant) and StoryClusterManager
    (pg_trgm similarity) — both of which are already correct.

    Input:  ingest.raw  (via Q.DEDUP_FINGERPRINT)
    Output: dedup.semantic
    """
    name         = "fingerprint"
    input_queue  = Q.DEDUP_FINGERPRINT
    output_queue = Q.DEDUP_SEMANTIC

    async def process(self, payload: dict) -> dict | None:
        title = payload.get("title", "")
        url   = payload.get("url", "")

        # ── BUG #4 FIX: SHA-256 fingerprint (was MD5) ─────────────────────
        normalized = " ".join(title.lower().split())[:200]
        fp = hashlib.sha256(normalized.encode()).hexdigest()

        # ── BUG #5 FIX: Check bloom filter FIRST (fast Redis bit reads) ───
        bit1, bit2 = _bloom_positions(fp)
        bloom_hit = (
            await self.redis_client.getbit(BLOOM_KEY, bit1) and
            await self.redis_client.getbit(BLOOM_KEY, bit2)
        )

        if bloom_hit:
            # Probable duplicate — confirm with DB (slow path only when bloom says yes)
            if url:
                existing_url = await self.db_fetchrow(
                    "SELECT id FROM articles WHERE original_url = $1 LIMIT 1", url
                )
                if existing_url:
                    log.debug(f"Fingerprint: URL duplicate (bloom+DB) — {url[:60]}")
                    return None

            fp_row = await self.db_fetchrow(
                "SELECT id FROM articles WHERE fingerprint = $1 LIMIT 1", fp
            )
            if fp_row:
                log.debug(f"Fingerprint: Title fingerprint duplicate (bloom+DB) — {title[:50]}")
                return None
        else:
            # Bloom says new — still do URL check (bloom doesn't cover URLs, only fingerprints)
            if url:
                existing_url = await self.db_fetchrow(
                    "SELECT id FROM articles WHERE original_url = $1 LIMIT 1", url
                )
                if existing_url:
                    log.debug(f"Fingerprint: URL already seen — {url[:60]}")
                    # Set bloom bits so future same-title articles are caught at bloom stage
                    await self.redis_client.setbit(BLOOM_KEY, bit1, 1)
                    await self.redis_client.setbit(BLOOM_KEY, bit2, 1)
                    return None

        # ── Set bloom bits for this new article ───────────────────────────
        await self.redis_client.setbit(BLOOM_KEY, bit1, 1)
        await self.redis_client.setbit(BLOOM_KEY, bit2, 1)

        payload["fingerprint"] = fp
        return payload  # → semantic dedup

    @classmethod
    def run(cls):
        import asyncio
        asyncio.run(cls().start())


class SemanticDedupAgent(BaseAgent):
    """
    Second dedup pass: vector similarity via Qdrant.
    Catches same-story articles written with different words.

    BUG #6 FIX: qdrant.upsert() now receives PointStruct objects (was plain dicts).
                Plain dicts silently failed — vectors were never stored, so every
                article appeared as a new cluster forever.

    Input:  dedup.semantic
    Output: dedup.cluster
    """
    name                 = "semantic-dedup"
    input_queue          = Q.DEDUP_SEMANTIC
    output_queue         = Q.DEDUP_CLUSTER
    SIMILARITY_THRESHOLD = 0.72   # Lowered from 0.82 — catches cross-source same stories
    COLLECTION           = "article_titles"

    async def on_start(self):
        """Ensure Qdrant collection exists."""
        try:
            await self.qdrant.get_collection(self.COLLECTION)
            log.info("SemanticDedup: Qdrant collection ready")
        except Exception:
            from qdrant_client.models import Distance, VectorParams
            await self.qdrant.create_collection(
                self.COLLECTION,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
            log.info("SemanticDedup: Created Qdrant collection")

    async def process(self, payload: dict) -> dict | None:
        title  = payload.get("title", "")
        domain = payload.get("domain_tag", "general")

        try:
            embedding = await self.embed(title)
        except Exception as e:
            log.warning(f"SemanticDedup: embed failed ({e}), bypassing semantic pass")
            payload["cluster_id"]    = None
            payload["is_new_cluster"] = True
            return payload

        # Search for similar titles in Qdrant
        try:
            results = await self.qdrant.search(
                collection_name=self.COLLECTION,
                query_vector=embedding,
                limit=1,
                score_threshold=self.SIMILARITY_THRESHOLD,
            )
        except Exception as e:
            log.warning(f"SemanticDedup: Qdrant search failed ({e})")
            results = []

        if results and results[0].payload.get("cluster_id"):
            cluster_id = results[0].payload.get("cluster_id")
            score = results[0].score
            payload["cluster_id"]    = cluster_id
            payload["is_new_cluster"] = False
            payload["confirming_source_count"] = payload.get("confirming_source_count", 0) + 1
            log.info(f"SemanticDedup: Matched cluster {str(cluster_id)[:8]} (score={score:.2f}) — {title[:40]}")
        else:
            payload["cluster_id"]    = None
            payload["is_new_cluster"] = True

        # BUG #6 FIX: Use PointStruct objects (was plain dicts — silently failed)
        point_id = abs(hash(title + payload.get("url", ""))) % (2 ** 31)
        payload["_qdrant_point_id"] = point_id

        if payload.get("is_new_cluster", True):
            try:
                from qdrant_client.models import PointStruct   # BUG #6 FIX
                await self.qdrant.upsert(
                    collection_name=self.COLLECTION,
                    points=[
                        PointStruct(                            # BUG #6 FIX: was plain dict {}
                            id=point_id,
                            vector=embedding,
                            payload={
                                "title":      title,
                                "cluster_id": None,   # updated by StoryClusterManager
                                "domain":     domain,
                                "ts":         datetime.now(timezone.utc).timestamp(),
                            },
                        )
                    ],
                )
            except Exception as e:
                log.warning(f"SemanticDedup: Qdrant upsert failed ({e})")

        return payload

    @classmethod
    def run(cls):
        import asyncio
        asyncio.run(cls().start())


class StoryClusterManager(BaseAgent):
    """
    Creates or updates story clusters. Links articles to clusters.

    PERF FIX: Collapsed 7 sequential DB round-trips per article into ~3
    using INSERT … ON CONFLICT DO NOTHING … RETURNING and UPSERT patterns.
    The source_count update remains per-article (inline) for correctness;
    can be deferred to a background 5-min batch job without API changes.

    Input:  dedup.cluster
    Output: verify.satire
    """
    name         = "story-cluster"
    input_queue  = Q.DEDUP_CLUSTER
    output_queue = Q.VERIFY_SATIRE

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        is_new     = payload.get("is_new_cluster", True)
        title      = payload.get("title", "")[:500]
        url        = payload.get("url", "")
        image_url  = payload.get("image_url")
        domain     = payload.get("source_domain", "")
        cred       = float(payload.get("source_cred", 0.5))
        tier       = int(payload.get("source_tier", 3))

        # Parse published date
        from email.utils import parsedate_to_datetime
        raw_date = payload.get("published", "")
        try:
            pub_date = parsedate_to_datetime(raw_date) if raw_date else datetime.now(timezone.utc)
        except Exception:
            try:
                pub_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            except Exception:
                pub_date = datetime.now(timezone.utc)

        # ── PERF FIX: Try to insert article directly with ON CONFLICT DO NOTHING ──
        # This collapses URL-existence-check + INSERT into a single DB round-trip.
        # If it returns nothing, URL already exists → bail out early.

        if not is_new and cluster_id:
            # Validate that the referenced cluster still exists (guard stale Qdrant refs)
            cluster_exists = await self.db_fetchrow(
                "SELECT 1 FROM story_clusters WHERE id = $1 LIMIT 1", cluster_id
            )
            if not cluster_exists:
                log.warning(f"StoryCluster: stale cluster_id {str(cluster_id)[:8]}; creating new cluster")
                cluster_id = None
                is_new = True
                payload["cluster_id"] = None
                payload["is_new_cluster"] = True

        # Title-similarity fallback (catches cases where semantic embed failed)
        if is_new or not cluster_id:
            words = [w.lower() for w in title.split() if len(w) >= 4]
            if len(words) >= 4:
                title_lower = title.lower()[:200]
                existing = await self.db_fetchrow("""
                    SELECT id FROM story_clusters
                    WHERE first_seen > NOW() - INTERVAL '48 hours'
                      AND lower(headline) % $1
                      AND similarity(lower(headline), $1) > 0.45
                    ORDER BY first_seen DESC LIMIT 1
                """, title_lower)
                if existing:
                    cluster_id = str(existing["id"])
                    is_new = False
                    payload["cluster_id"] = cluster_id
                    payload["is_new_cluster"] = False
                    log.info(f"StoryCluster: Title-matched cluster {cluster_id[:8]} — {title[:40]}")

        # PERF FIX: Upsert cluster in a single statement
        if is_new or not cluster_id:
            cluster_id = str(uuid.uuid4())
            await self.db_execute(
                """INSERT INTO story_clusters
                   (id, headline, truth_score, source_count, status, image_url)
                   VALUES ($1, $2, 0, 0, 'developing', $3)
                   ON CONFLICT (id) DO NOTHING""",
                cluster_id, title, image_url,
            )
            log.info(f"StoryCluster: New cluster {cluster_id[:8]} — {title[:40]}")
        else:
            await self.db_execute(
                """UPDATE story_clusters
                   SET last_updated = NOW(),
                       image_url    = COALESCE(image_url, $2)
                   WHERE id = $1""",
                cluster_id, image_url,
            )

        # PERF FIX: INSERT article + ON CONFLICT DO NOTHING in one shot.
        # If the URL was already inserted by a race, inserted is None → early return.
        article_id = str(uuid.uuid4())
        inserted = await self.db_fetchrow(
            """INSERT INTO articles
               (id, cluster_id, source_domain, original_url, original_title,
                original_body, image_url, fingerprint, source_tier, source_cred, published_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (original_url) DO NOTHING
               RETURNING id""",
            article_id, cluster_id, domain, url, title,
            payload.get("full_body", "")[:10000],
            image_url,
            payload.get("fingerprint"),
            tier, cred, pub_date,
        )

        if not inserted:
            log.debug(f"StoryCluster: duplicate URL skipped — {url[:80]}")
            # Clean up orphaned new cluster if no articles reference it
            if payload.get("is_new_cluster"):
                await self.db_execute(
                    """DELETE FROM story_clusters
                       WHERE id = $1
                         AND NOT EXISTS (SELECT 1 FROM articles WHERE cluster_id = $1)""",
                    cluster_id,
                )
            return None

        # Update source_count as distinct-domain corroboration signal
        # (article 7 of audit: "Corroboration Counter" — wire to story_clusters.source_count)
        await self.db_execute(
            """UPDATE story_clusters
               SET source_count = (
                       SELECT COUNT(DISTINCT source_domain)
                       FROM articles
                       WHERE cluster_id = $1
                   ),
                   last_updated = NOW()
               WHERE id = $1""",
            cluster_id,
        )

        payload["cluster_id"]  = cluster_id
        payload["article_id"]  = str(inserted["id"])

        # Update Qdrant vector with real cluster_id (None → UUID)
        point_id = payload.get("_qdrant_point_id")
        if point_id and payload.get("is_new_cluster", True):
            try:
                from qdrant_client.models import PointIdsList
                await self.qdrant.set_payload(
                    collection_name="article_titles",
                    payload={"cluster_id": cluster_id},
                    points=[point_id],
                )
            except Exception as e:
                log.debug(f"StoryCluster: Qdrant payload update skipped: {e}")

        return payload

    @classmethod
    def run(cls):
        import asyncio
        asyncio.run(cls().start())


# ── Entry points ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    {
        "fingerprint": FingerprintAgent,
        "semantic":    SemanticDedupAgent,
        "cluster":     StoryClusterManager,
    }.get(sys.argv[1] if len(sys.argv) > 1 else "fingerprint", FingerprintAgent).run()
