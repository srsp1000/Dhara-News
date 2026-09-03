#!/usr/bin/env python3
"""
Clear all articles from Dhara News for a fresh start.
Usage: py scripts\clear_articles.py
    py scripts\clear_articles.py --confirm   (skip prompt)
"""
import asyncio, os, sys

PG_DSN = os.environ.get("PG_DSN", "postgresql://dhara:dhara_local_dev@localhost:5432/dhara")

async def main():
    import asyncpg

    confirmed = "--confirm" in sys.argv

    print("\nDhara News — Clear All Articles")
    print("=" * 40)

    pool = await asyncpg.create_pool(PG_DSN, min_size=1, max_size=2)
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM story_clusters")
        print(f"Articles in database: {total}")

        if total == 0:
            print("Nothing to clear.")
            await pool.close()
            return

        if not confirmed:
            answer = input(f"\nDelete ALL {total} articles? This cannot be undone. [yes/NO]: ")
            if answer.lower() != "yes":
                print("Cancelled.")
                await pool.close()
                return

        # Clear in order (respects foreign keys)
        tables = [
            "article_views",
            "article_translations",
            "article_seo",
            "story_events",
            "comments",
            "articles",
            "story_clusters",
        ]
        for table in tables:
            try:
                r = await conn.execute(f"DELETE FROM {table}")
                print(f"  Cleared {table}: {r.split()[-1]} rows")
            except Exception as e:
                print(f"  Skipped {table}: {e}")

        # Legacy compatibility: older schemas had sources.article_count.
        # Guard the operation so clears do not fail on newer schemas.
        has_article_count = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'sources'
                  AND column_name = 'article_count'
            )
            """
        )
        if has_article_count:
            await conn.execute("UPDATE sources SET article_count = 0")
            print("  Reset sources.article_count: OK")
        else:
            print("  Skipped sources.article_count reset: column not present")

    print("\n✓ Database cleared!")
    print("✓ Articles will reappear within 15 minutes (next RSS crawl cycle)")
    print("\nOptional: flush Redis cache with:")
    print("  docker compose exec redis redis-cli FLUSHALL")
    await pool.close()

asyncio.run(main())
