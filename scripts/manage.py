#!/usr/bin/env python3
"""
Dhara News — Source & Content Manager
======================================
Manage RSS sources and write/delete articles directly.

Usage:
  python scripts/manage.py sources list
  python scripts/manage.py sources add --url https://example.com/feed.rss --tier 2 --domain politics
  python scripts/manage.py sources remove --domain example.com
  python scripts/manage.py sources test --url https://example.com/feed.rss

  python scripts/manage.py article write --headline "..." --body "..." --domain politics --source "Dhara Editorial"
  python scripts/manage.py article delete --id <cluster_id>
  python scripts/manage.py article list --status verified --limit 10
"""
import argparse, asyncio, sys, os, uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared.db_utils import create_pg_pool

PG_DSN = os.environ.get("PG_DSN", "postgresql://dhara:dhara_local_dev@localhost:5432/dhara")

async def get_pool():
    return await create_pg_pool(PG_DSN, min_size=1, max_size=3)

# ── SOURCE MANAGEMENT ─────────────────────────────────────────────────────────

async def sources_list(args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT domain, rss_url, tier, domains_covered, active, cred_score,
                      article_count, last_fetched
               FROM sources ORDER BY tier, domain"""
        )
    if not rows:
        print("No sources configured yet.")
        return
    print(f"\n{'Domain':<30} {'Tier':<5} {'Cred':<5} {'Domain':<14} {'Active':<7} {'Articles':<10} {'Last fetched'}")
    print("-" * 90)
    for r in rows:
        last = r['last_fetched'].strftime("%Y-%m-%d %H:%M") if r['last_fetched'] else "Never"
        print(f"{r['domain']:<30} {r['tier']:<5} {r['cred_score']:<5} {r['domains_covered'] or '':<14} "
              f"{'Yes' if r['active'] else 'No':<7} {r['article_count'] or 0:<10} {last}")
    print()

async def sources_add(args):
    """Add a new RSS source."""
    import urllib.request
    from urllib.parse import urlparse

    url    = args.url
    domain = urlparse(url).netloc.replace("www.", "")
    tier   = getattr(args, 'tier', 2)
    dom    = getattr(args, 'domain', 'general')

    # Test the RSS feed first
    print(f"Testing RSS feed: {url}")
    try:
        req = urllib.request.urlopen(url, timeout=10)
        content = req.read()
        if b'<rss' not in content and b'<feed' not in content:
            print("✗  URL does not look like an RSS/Atom feed")
            sys.exit(1)
        import re
        items = len(re.findall(b'<item>|<entry>', content))
        print(f"✓  Valid RSS feed — found {items} items")
    except Exception as e:
        print(f"✗  Could not fetch RSS: {e}")
        sys.exit(1)

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO sources (domain, rss_url, tier, domains_covered, active, cred_score)
               VALUES ($1, $2, $3, $4, true, $5)
               ON CONFLICT (domain) DO UPDATE
               SET rss_url=$2, tier=$3, domains_covered=$4, active=true""",
            domain, url, tier, dom,
            1.0 if tier == 1 else 0.85 if tier == 2 else 0.65 if tier == 3 else 0.4
        )
    print(f"✓  Added source: {domain} (Tier {tier}, domain: {dom})")
    print(f"   The RSS crawler will pick it up within 15 minutes.")

async def sources_remove(args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE sources SET active=false WHERE domain=$1", args.domain
        )
    print(f"✓  Deactivated source: {args.domain} (articles remain, future crawling stopped)")

async def sources_test(args):
    """Test an RSS feed without adding it."""
    import urllib.request, re
    try:
        content = urllib.request.urlopen(args.url, timeout=10).read()
        titles = re.findall(b'<title><![CDATA[(.*?)]]></title>|<title>(.*?)</title>', content)[:5]
        print(f"✓  Feed is valid. Sample headlines:")
        for t in titles:
            headline = (t[0] or t[1]).decode('utf-8', errors='ignore').strip()
            if headline and headline != 'RSS' and len(headline) > 5:
                print(f"   · {headline[:80]}")
    except Exception as e:
        print(f"✗  Error: {e}")

# ── ARTICLE MANAGEMENT ────────────────────────────────────────────────────────

async def article_write(args):
    """Publish a custom editorial article directly to the platform."""
    pool = await get_pool()

    cluster_id = str(uuid.uuid4())
    article_id = str(uuid.uuid4())
    headline   = args.headline
    body       = args.body
    domain     = getattr(args, 'domain', 'general')
    source_name= getattr(args, 'source', 'Dhara Editorial')
    profession = getattr(args, 'profession', 'general').split(',')

    # Auto-generate brief summary (first 100 words)
    brief = ' '.join(body.split()[:100]) + ("..." if len(body.split()) > 100 else "")

    async with pool.acquire() as conn:
        # Insert cluster (the story)
        await conn.execute(
            """INSERT INTO story_clusters
               (id, headline, summary_brief, summary_deep, truth_score, status,
                source_count, domain, professions, first_seen, last_updated)
               VALUES ($1,$2,$3,$4,100,'verified',1,$5,$6,NOW(),NOW())""",
            cluster_id, headline, brief, body, domain, profession
        )
        # Insert article (the source)
        await conn.execute(
            """INSERT INTO articles
               (id, cluster_id, source_domain, original_url, original_title,
                original_body, source_tier, source_cred, published_at)
               VALUES ($1,$2,$3,$4,$5,$6,1,1.0,NOW())""",
            article_id, cluster_id, source_name.lower().replace(' ', ''),
            f"https://dhara.news/article/{cluster_id}", headline, body
        )
        # Insert source record
        await conn.execute(
            """INSERT INTO sources (domain, rss_url, tier, active, cred_score)
               VALUES ($1,'', 1, true, 1.0) ON CONFLICT (domain) DO NOTHING""",
            source_name.lower().replace(' ', '')
        )

    print(f"\n✓  Article published!")
    print(f"   ID:       {cluster_id}")
    print(f"   URL:      http://localhost:3000/article/{cluster_id}")
    print(f"   Headline: {headline}")
    print(f"   Domain:   {domain}")
    print(f"   Status:   verified (Truth Score: 100)")

async def article_delete(args):
    """Remove an article from the platform (soft delete → quarantine)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE story_clusters SET status='quarantine' WHERE id=$1",
            args.id
        )
    print(f"✓  Article {args.id} moved to quarantine (hidden from main feed)")
    print(f"   To permanently delete: docker compose exec postgres psql -U dhara -d dhara -c \"DELETE FROM story_clusters WHERE id='{args.id}'\"")

async def article_list(args):
    pool = await get_pool()
    status = getattr(args, 'status', 'verified')
    limit  = getattr(args, 'limit', 10)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, headline, domain, truth_score, status, source_count, first_seen
               FROM story_clusters WHERE status=$1
               ORDER BY first_seen DESC LIMIT $2""",
            status, limit
        )
    if not rows:
        print(f"No {status} articles found")
        return
    print(f"\n{'ID':<38} {'Score':<6} {'Domain':<14} {'Sources':<8} {'Published':<18} Headline")
    print("-" * 120)
    for r in rows:
        pub = r['first_seen'].strftime("%Y-%m-%d %H:%M") if r['first_seen'] else ""
        print(f"{str(r['id']):<38} {r['truth_score']:<6} {r['domain'] or '':<14} "
              f"{r['source_count']:<8} {pub:<18} {r['headline'][:50]}")

# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Dhara News — Source & Content Manager")
    sub = parser.add_subparsers(dest="cmd")

    # sources subcommand
    src = sub.add_parser("sources")
    src_sub = src.add_subparsers(dest="action")

    src_sub.add_parser("list")

    src_add = src_sub.add_parser("add")
    src_add.add_argument("--url",    required=True, help="RSS feed URL")
    src_add.add_argument("--tier",   type=int, default=2, help="Credibility tier 1-4 (1=highest)")
    src_add.add_argument("--domain", default="general", help="News domain (politics,health,etc)")

    src_rm = src_sub.add_parser("remove")
    src_rm.add_argument("--domain", required=True)

    src_test = src_sub.add_parser("test")
    src_test.add_argument("--url", required=True)

    # article subcommand
    art = sub.add_parser("article")
    art_sub = art.add_subparsers(dest="action")

    art_write = art_sub.add_parser("write")
    art_write.add_argument("--headline",   required=True)
    art_write.add_argument("--body",       required=True, help="Article body text")
    art_write.add_argument("--domain",     default="general")
    art_write.add_argument("--source",     default="Dhara Editorial")
    art_write.add_argument("--profession", default="general", help="Comma-separated: upsc,medical,general")

    art_del = art_sub.add_parser("delete")
    art_del.add_argument("--id", required=True, help="Cluster UUID")

    art_list = art_sub.add_parser("list")
    art_list.add_argument("--status", default="verified", choices=["verified","developing","quarantine"])
    art_list.add_argument("--limit",  type=int, default=10)

    args = parser.parse_args()

    dispatch = {
        ("sources", "list"):    sources_list,
        ("sources", "add"):     sources_add,
        ("sources", "remove"):  sources_remove,
        ("sources", "test"):    sources_test,
        ("article", "write"):   article_write,
        ("article", "delete"):  article_delete,
        ("article", "list"):    article_list,
    }

    key = (args.cmd, getattr(args, "action", None))
    if key not in dispatch:
        parser.print_help()
        return

    asyncio.run(dispatch[key](args))

if __name__ == "__main__":
    main()
