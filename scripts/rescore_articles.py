#!/usr/bin/env python3
"""
Dhara News — Rescore existing articles.
Promotes developing articles from credible sources to verified.
Run after applying fixes:
  py scripts\rescore_articles.py
"""
import asyncio, os, sys

PG_DSN = os.environ.get(
    "PG_DSN",
    "postgresql://dhara:dhara_local_dev@localhost:5432/dhara"
)

async def main():
    try:
        import asyncpg
    except ImportError:
        print("Installing asyncpg...")
        os.system(f"{sys.executable} -m pip install asyncpg -q")
        import asyncpg

    print("\nDhara News — Rescore Articles")
    print("=" * 40)

    pool = await asyncpg.create_pool(PG_DSN, min_size=1, max_size=3)

    async with pool.acquire() as conn:
        total     = await conn.fetchval("SELECT COUNT(*) FROM story_clusters")
        dev       = await conn.fetchval("SELECT COUNT(*) FROM story_clusters WHERE status='developing'")
        verified  = await conn.fetchval("SELECT COUNT(*) FROM story_clusters WHERE status='verified'")
        print(f"Current: {total} total, {dev} developing, {verified} verified\n")

        # Promote by known credible sources
        r1 = await conn.execute("""
            UPDATE story_clusters sc
            SET status = 'verified'
            FROM articles a
            JOIN sources s ON s.domain = a.source_domain
            WHERE a.cluster_id = sc.id
              AND sc.status = 'developing'
              AND s.tier <= 2
              AND s.cred_score >= 0.70
        """)
        print(f"Promoted (tier-1/2 sources):    {r1.split()[-1]}")

        # Promote by score threshold
        r2 = await conn.execute("""
            UPDATE story_clusters
            SET status = 'verified'
            WHERE status = 'developing'
              AND truth_score >= 40
        """)
        print(f"Promoted (score >= 40):         {r2.split()[-1]}")

        # Update source_count for clusters that have multiple articles
        r3 = await conn.execute("""
            UPDATE story_clusters sc
            SET source_count = sub.cnt
            FROM (
                SELECT cluster_id, COUNT(DISTINCT source_domain) AS cnt
                FROM articles
                GROUP BY cluster_id
                HAVING COUNT(DISTINCT source_domain) > 1
            ) sub
            WHERE sc.id = sub.cluster_id
        """)
        print(f"Updated multi-source counts:    {r3.split()[-1]}")

        v2 = await conn.fetchval("SELECT COUNT(*) FROM story_clusters WHERE status='verified'")
        print(f"\nResult: {v2} verified articles (was {verified})")
        print(f"\nRefresh http://localhost:3000 to see changes!")

    await pool.close()

asyncio.run(main())
