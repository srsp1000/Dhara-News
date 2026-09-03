#!/usr/bin/env python3
"""
Re-queue clusters that have no platform_body back through the rewrite pipeline.
Reads from PostgreSQL, publishes to RabbitMQ nlp.rewrite queue.

Usage: docker exec dhara_api python /app/shared/../scripts/requeue_rewrites.py
  or:  python scripts/requeue_rewrites.py  (from host, if deps are installed)
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone

import asyncpg
import aio_pika

PG_DSN       = os.environ.get("PG_DSN", "postgresql://dhara:dhara_local_dev@localhost:5432/dhara")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://dhara:dhara_local@localhost:5672/")
BATCH_SIZE   = int(os.environ.get("REQUEUE_BATCH", "50"))

async def main():
    print(f"Connecting to PostgreSQL: {PG_DSN.split('@')[1] if '@' in PG_DSN else PG_DSN}")
    pool = await asyncpg.create_pool(PG_DSN, min_size=1, max_size=3)

    # Find clusters missing platform_body
    rows = await pool.fetch("""
        SELECT c.id AS cluster_id, c.headline, c.summary_brief, c.summary_deep,
               a.original_body, a.original_title, a.source_domain
        FROM story_clusters c
        JOIN articles a ON a.cluster_id = c.id
        WHERE (c.platform_body IS NULL OR LENGTH(c.platform_body) < 600)
          AND c.headline IS NOT NULL AND BTRIM(c.headline) <> ''
          AND c.summary_brief IS NOT NULL AND BTRIM(c.summary_brief) <> ''
          AND a.original_body IS NOT NULL AND LENGTH(a.original_body) > 100
        ORDER BY c.first_seen DESC
        LIMIT $1
    """, BATCH_SIZE)

    if not rows:
        print("No clusters need rewriting — all have platform_body or lack source text.")
        await pool.close()
        return

    print(f"Found {len(rows)} clusters needing rewrite. Connecting to RabbitMQ...")
    
    conn = await aio_pika.connect_robust(RABBITMQ_URL, timeout=10)
    chan = await conn.channel()
    
    # Declare the queue (passive — must already exist)
    try:
        queue = await chan.declare_queue("nlp.rewrite", durable=True, passive=True)
    except Exception:
        queue = await chan.declare_queue("nlp.rewrite", durable=True)

    queued = 0
    seen_clusters = set()
    for row in rows:
        cid = str(row["cluster_id"])
        if cid in seen_clusters:
            continue
        seen_clusters.add(cid)

        payload = {
            "cluster_id": cid,
            "article_id": "",
            "title": row["original_title"] or row["headline"] or "",
            "full_body": row["original_body"] or "",
            "description": "",
            "source_domain": row["source_domain"] or "",
            "summary_headline": row["headline"] or "",
            "summary_brief": row["summary_brief"] or "",
            "summary_deep": row["summary_deep"] or "",
        }

        envelope = {
            "message_id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_agent": "requeue-script",
            "priority": 5,
            "payload": payload,
        }

        await chan.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(envelope).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=5,
            ),
            routing_key="nlp.rewrite",
        )
        queued += 1

    print(f"✅ Queued {queued} clusters for rewrite")
    print(f"   The rewrite agent will process them and generate platform_body.")
    print(f"   Monitor: docker logs dhara_agent_rewrite --follow --tail=5")

    await conn.close()
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
