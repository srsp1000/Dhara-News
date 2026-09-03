"""
Dhara News — Base Agent
All 42 agents inherit from this. Handles:
- RabbitMQ connection + message consumption
- PostgreSQL connection pool
- Redis connection
- Qdrant client
- Ollama (local LLM) client
- Metrics + health endpoint
- Graceful shutdown
- Dead-letter queue routing
- Message schema validation
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import random
import signal
import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

import threading

import aio_pika
import asyncpg
import httpx
import redis.asyncio as redis_async
from pydantic import BaseModel, field_validator
from qdrant_client import AsyncQdrantClient
from prometheus_client import Counter, Histogram, start_http_server
try:
    from shared.db_utils import (
        db_fetch as _shared_db_fetch,
        db_fetchrow as _shared_db_fetchrow,
        db_execute as _shared_db_execute,
    )
except Exception:
    from db_utils import (
        db_fetch as _shared_db_fetch,
        db_fetchrow as _shared_db_fetchrow,
        db_execute as _shared_db_execute,
    )

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s"
)

# ── Env config ────────────────────────────────────────────────────────────────
PG_DSN        = os.environ.get("PG_DSN",       "postgresql://dhara:dhara_local_dev@postgres:5432/dhara")
REDIS_URL     = os.environ.get("REDIS_URL",    "redis://redis:6379/0")
RABBITMQ_URL  = os.environ.get("RABBITMQ_URL", "amqp://dhara:dhara_local@rabbitmq:5672/")
QDRANT_URL    = os.environ.get("QDRANT_URL",   "http://qdrant:6333")
OLLAMA_URL    = os.environ.get("OLLAMA_URL",   "http://ollama:11434")
OLLAMA_TIMEOUT_SECONDS = max(8, int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "35")))
ES_URL        = os.environ.get("ES_URL",       "http://elasticsearch:9200")
GROQ_MAX_RPS  = max(1, int(os.environ.get("GROQ_MAX_RPS", "10")))   # raised: 2 → 10
GROQ_RETRIES  = max(0, int(os.environ.get("GROQ_RETRIES", "3")))

# ── Multi-key pool: GROQ_API_KEY_1 … GROQ_API_KEY_8 + legacy GROQ_API_KEY ────
def _load_groq_key_pool() -> list[str]:
    """
    Collect all configured Groq API keys into a deduplicated ordered list.
    Numbered keys (GROQ_API_KEY_1 … 8) take priority; legacy GROQ_API_KEY is
    appended last so existing single-key setups continue to work unchanged.
    Blank / whitespace-only values are silently skipped.
    """
    seen: set[str] = set()
    pool: list[str] = []
    for i in range(1, 9):
        k = os.environ.get(f"GROQ_API_KEY_{i}", "").strip()
        if k and k not in seen:
            seen.add(k)
            pool.append(k)
    legacy = os.environ.get("GROQ_API_KEY", "").strip()
    if legacy and legacy not in seen:
        pool.append(legacy)
    return pool

GROQ_KEY_POOL: list[str] = _load_groq_key_pool()

# ── Message envelope (every RabbitMQ message uses this schema) ────────────────
class MessageEnvelope(BaseModel):
    message_id: str
    created_at: str
    source_agent: str
    priority: int = 5   # 1 (low) → 10 (urgent/tier-1 breaking news)
    payload: dict[str, Any]

    @field_validator("priority")
    @classmethod
    def clamp_priority(cls, v):
        return max(1, min(10, v))

    @classmethod
    def create(cls, source_agent: str, payload: dict, priority: int = 5) -> "MessageEnvelope":
        return cls(
            message_id=str(uuid.uuid4()),
            created_at=datetime.now(timezone.utc).isoformat(),
            source_agent=source_agent,
            priority=priority,
            payload=payload,
        )

# ── Queue name constants ──────────────────────────────────────────────────────
class Q:
    # Ingestion
    INGEST_RAW          = "ingest.raw"
    INGEST_IMAGES       = "ingest.images"
    # Deduplication
    DEDUP_FINGERPRINT   = "dedup.fingerprint"
    DEDUP_SEMANTIC      = "dedup.semantic"
    DEDUP_CLUSTER       = "dedup.cluster"
    # Verification
    VERIFY_CLAIMS       = "verify.claims"
    VERIFY_XREF         = "verify.xref"
    VERIFY_CREDIBILITY  = "verify.credibility"
    VERIFY_SCORE        = "verify.score"
    VERIFY_RELIABILITY  = "verify.reliability"
    VERIFY_CONTRADICTION= "verify.contradiction"
    VERIFY_SATIRE       = "verify.satire"
    VERIFY_FAKE_SIGNAL  = "verify.fake_signal"
    VERIFY_IMAGE        = "verify.image"
    # NLP
    NLP_ENTITIES        = "nlp.entities"
    NLP_TOPICS          = "nlp.topics"
    NLP_SUMMARIZE       = "nlp.summarize"
    NLP_REWRITE         = "nlp.rewrite"
    NLP_HEADLINE        = "nlp.headline"
    NLP_TRANSLATE       = "nlp.translate"
    NLP_TERMINOLOGY     = "nlp.terminology"
    NLP_EXAM_TAGS       = "nlp.exam_tags"
    NLP_TIMELINE        = "nlp.timeline"
    # Personalization
    PERS_PROFESSION     = "pers.profession"
    PERS_LOCATION       = "pers.location"
    PERS_TRENDING       = "pers.trending"
    PERS_NOTIFY         = "pers.notify"
    # Publishing
    PUB_GATE            = "pub.gate"
    PUB_INDEX           = "pub.index"
    PUB_SEO             = "pub.seo"
    PUB_SHARE           = "pub.share"
    # DLQ (dead-letter)
    DLQ_PREFIX          = "dlq."

# ── Base Agent ────────────────────────────────────────────────────────────────
class BaseAgent(ABC):
    """
    Inherit from this. Implement `process(payload: dict) -> dict | None`.
    - Return a dict to publish to `output_queue`
    - Return None to ack without forwarding
    - Raise an exception to NACK and route to DLQ after max_retries
    """
    name: str           = "base-agent"
    input_queue: str    = ""
    output_queue: str   = ""
    max_retries: int    = 3
    prefetch_count: int = 2   # Low prefetch so RabbitMQ priority queue can reorder messages.
                               # Tier-1 (priority 9) articles overtake queued Tier-2 (priority 6)
                               # only when each worker holds at most 2 un-acked messages.

    def __init__(self):
        self.running   = False
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.redis_client: Optional[redis_async.Redis] = None
        self.qdrant: Optional[AsyncQdrantClient] = None
        self.amqp_conn  = None
        self.amqp_chan  = None
        self._heartbeat_task: Optional[asyncio.Task] = None

        # Prometheus metrics
        self.msgs_processed = Counter(
            f"dhara_{self.name.replace('-','_')}_processed_total",
            "Total messages processed"
        )
        self.msgs_failed = Counter(
            f"dhara_{self.name.replace('-','_')}_failed_total",
            "Total messages failed"
        )
        self.processing_time = Histogram(
            f"dhara_{self.name.replace('-','_')}_processing_seconds",
            "Processing time per message"
        )

    async def start(self):
        """Start the agent — connect to all services, begin consuming."""
        log.info(f"[{self.name}] Starting...")

        # Start Prometheus metrics server — port from env so each agent can
        # bind a unique port; catch OSError so scheduler agents sharing a
        # process don't crash when the port is already bound.
        metrics_port = int(os.environ.get("METRICS_PORT", "9100"))
        try:
            start_http_server(metrics_port)
        except OSError:
            log.debug(f"[{self.name}] Prometheus port {metrics_port} already bound — skipping")

        # Connect to infrastructure
        self.pg_pool = await asyncpg.create_pool(PG_DSN, min_size=2, max_size=10)
        self.redis_client = redis_async.from_url(REDIS_URL, decode_responses=True)
        self.qdrant = AsyncQdrantClient(url=QDRANT_URL)

        # Connect to RabbitMQ with exponential backoff retry
        for attempt in range(20):
            try:
                self.amqp_conn = await aio_pika.connect_robust(
                    RABBITMQ_URL,
                    timeout=10,
                    reconnect_interval=5,
                )
                self.amqp_chan = await self.amqp_conn.channel()
                await self.amqp_chan.set_qos(prefetch_count=self.prefetch_count)
                log.info(f"[{self.name}] RabbitMQ connected")
                break
            except Exception as e:
                wait = min(2 ** attempt, 30)  # exponential backoff, cap at 30s
                log.warning(f"[{self.name}] RabbitMQ attempt {attempt+1}/20 failed, retrying in {wait}s: {e}")
                await asyncio.sleep(wait)
        else:
            raise RuntimeError(f"[{self.name}] Could not connect to RabbitMQ after 20 attempts")

        # Declare queues
        await self._declare_queues()

        self.running = True

        # Run setup hook after infra is ready.
        await self.on_start()

        # Register shutdown handlers
        for sig in (signal.SIGINT, signal.SIGTERM):
            asyncio.get_running_loop().add_signal_handler(sig, lambda: asyncio.create_task(self.stop()))

        if self.redis_client:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        log.info(f"[{self.name}] Ready — consuming from '{self.input_queue}'")
        await self._consume()

    async def _declare_queues(self):
        """
        Declare queues using ONLY durable=True + x-max-priority.
        NO x-dead-letter-exchange — this permanently prevents PRECONDITION_FAILED.
        DLQ is still created but without RabbitMQ-level routing (we do it manually).
        Any existing queue with wrong args falls back to passive declare silently.
        """
        SAFE_ARGS = {"x-max-priority": 10}

        async def safe_declare(name: str):
            """Declare a queue, fall back to passive if args conflict."""
            if not name:
                return
            try:
                await self.amqp_chan.declare_queue(
                    name, durable=True, arguments=SAFE_ARGS
                )
            except Exception as e:
                if "PRECONDITION_FAILED" in str(e) or "inequivalent" in str(e):
                    # Queue exists with different args — accept it as-is
                    try:
                        await self.amqp_chan.declare_queue(name, durable=True, passive=True)
                        log.info(f"[{self.name}] Accepted existing queue: {name}")
                    except Exception:
                        log.warning(f"[{self.name}] Could not declare queue {name} — will retry")
                else:
                    raise

        # Declare DLQ first (plain, no priority needed)
        if self.input_queue:
            try:
                await self.amqp_chan.declare_queue(
                    Q.DLQ_PREFIX + self.input_queue, durable=True
                )
            except Exception:
                pass  # DLQ is best-effort

        # Declare input queue
        if self.input_queue:
            await safe_declare(self.input_queue)

        # Declare output queue
        if self.output_queue and self.output_queue != self.input_queue:
            await safe_declare(self.output_queue)
            try:
                await self.amqp_chan.declare_queue(
                    Q.DLQ_PREFIX + self.output_queue, durable=True
                )
            except Exception:
                pass  # DLQ is best-effort

    async def _consume(self):
        """Main consume loop. Skipped for scheduler-only agents."""
        if not self.input_queue:
            # Scheduler agent — just keep alive while running
            while self.running:
                await asyncio.sleep(60)
            return

        MAX_MESSAGE_AGE_HOURS = float(os.environ.get("MAX_MESSAGE_AGE_HOURS", "6"))

        queue = await self.amqp_chan.get_queue(self.input_queue)
        async with queue.iterator() as q_iter:
            async for message in q_iter:
                if not self.running:
                    await message.nack(requeue=True)
                    break
                async with message.process(requeue=False):
                    start = time.monotonic()
                    msg_id = "unknown"
                    try:
                        envelope = MessageEnvelope.model_validate_json(message.body)
                        msg_id = envelope.message_id

                        # ── Stale message guard ───────────────────────────
                        created = datetime.fromisoformat(envelope.created_at)
                        age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
                        if age_hours > MAX_MESSAGE_AGE_HOURS:
                            log.warning(
                                f"[{self.name}][{msg_id}] Stale message ({age_hours:.1f}h old) — discarding"
                            )
                            self.msgs_failed.inc()
                            continue  # ack without processing
                        # ─────────────────────────────────────────────────

                        result = await self.process(envelope.payload)
                        if result is not None and self.output_queue:
                            await self.publish(result, priority=envelope.priority)
                        self.msgs_processed.inc()
                    except Exception as e:
                        self.msgs_failed.inc()
                        retry_count = int(message.headers.get("x-retry-count", 0))
                        log.error(f"[{self.name}][{msg_id}] Processing failed (attempt {retry_count+1}): {e}")
                        if retry_count < self.max_retries:
                            # Re-queue with retry count incremented
                            await self.amqp_chan.default_exchange.publish(
                                aio_pika.Message(
                                    body=message.body,
                                    headers={**message.headers, "x-retry-count": retry_count + 1, "x-correlation-id": msg_id},
                                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                                    priority=message.priority,
                                ),
                                routing_key=self.input_queue,
                            )
                        else:
                            # Send to DLQ
                            await self._send_to_dlq(message.body, str(e))
                    finally:
                        elapsed = time.monotonic() - start
                        self.processing_time.observe(elapsed)

    async def publish(self, payload: dict, queue: str = "", priority: int = 5):
        """Publish a message to a queue."""
        target = queue or self.output_queue
        if not target:
            return
        envelope = MessageEnvelope.create(
            source_agent=self.name,
            payload=payload,
            priority=priority,
        )
        await self.amqp_chan.default_exchange.publish(
            aio_pika.Message(
                body=envelope.model_dump_json().encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=priority,
                headers={"x-correlation-id": envelope.message_id},
            ),
            routing_key=target,
        )

    async def publish_to(self, queue: str, payload: dict, priority: int = 5):
        """Publish to a specific queue (not the default output)."""
        await self.publish(payload, queue=queue, priority=priority)

    async def _send_to_dlq(self, body: bytes, error: str):
        dlq_name = Q.DLQ_PREFIX + self.input_queue
        dlq_msg = json.dumps({"original": body.decode(), "error": error, "ts": datetime.now(timezone.utc).isoformat()})
        await self.amqp_chan.default_exchange.publish(
            aio_pika.Message(body=dlq_msg.encode(), delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
            routing_key=dlq_name,
        )
        log.warning(f"[{self.name}] Sent to DLQ: {error[:100]}")

    async def stop(self):
        log.info(f"[{self.name}] Shutting down...")
        self.running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        if self.amqp_conn:
            await self.amqp_conn.close()
        if self.pg_pool:
            await self.pg_pool.close()
        if self.redis_client:
            try:
                await self.redis_client.hdel("agent:heartbeat", self.name)
            except Exception:
                pass
            await self.redis_client.close()

    async def _heartbeat_loop(self):
        """Keep a last-seen timestamp in Redis for admin/monitoring views."""
        while self.running:
            try:
                await self.redis_client.hset(
                    "agent:heartbeat",
                    self.name,
                    datetime.now(timezone.utc).timestamp(),
                )
            except Exception as e:
                log.debug(f"[{self.name}] Heartbeat update failed: {e}")
            await asyncio.sleep(30)

    # ── Helpers for subclasses ────────────────────────────────
    async def db_fetch(self, query: str, *args):
        return await _shared_db_fetch(self.pg_pool, query, *args)

    async def db_execute(self, query: str, *args):
        return await _shared_db_execute(self.pg_pool, query, *args)

    async def db_fetchrow(self, query: str, *args):
        return await _shared_db_fetchrow(self.pg_pool, query, *args)

    async def cache_get(self, key: str) -> Optional[str]:
        return await self.redis_client.get(key)

    async def cache_set(self, key: str, value: str, ttl: int = 3600):
        await self.redis_client.setex(key, ttl, value)

    async def cache_incr(self, key: str, ttl: int = 3600) -> int:
        val = await self.redis_client.incr(key)
        await self.redis_client.expire(key, ttl)
        return val

    async def _pick_groq_key_least_rpm(self) -> str | None:
        """
        Least-RPM key selection with per-second slot enforcement and org-level
        circuit breaker.

        Steps:
        1. Check groq:org_ratelimited — if set, skip Groq entirely (no spinning).
        2. Scan key pool; skip rate-limited keys; pick lowest-RPM available key.
        3. When ≥50 % of keys are simultaneously rate-limited, trip the org
           circuit breaker for 30 s so all agents stop hammering Redis.
        4. Enforce GROQ_MAX_RPS per second per key.
        5. Return selected key string, or None to fall through to Ollama.
        """
        if not GROQ_KEY_POOL:
            return None

        # Fast path — no Redis
        if not self.redis_client:
            await asyncio.sleep(0.08 + random.uniform(0.0, 0.06))
            return GROQ_KEY_POOL[0]

        # ── Org-level circuit breaker ─────────────────────────────────────
        # Set when ≥50 % of keys are simultaneously on 429.
        # While active, every agent skips Groq entirely — no Redis polling,
        # no spinning, no wasted latency — and goes straight to Ollama / GitHub.
        if await self.redis_client.exists("groq:org_ratelimited"):
            log.debug("[LLM] Groq org circuit breaker active — skipping to fallback")
            return None

        minute_epoch = int(time.time()) // 60

        for _spin in range(4):        # reduced from 12 — fail faster when org busy
            best_idx: int | None = None
            best_rpm: int        = 10_000_000
            rl_count: int        = 0  # rate-limited key count this scan

            for idx, _key in enumerate(GROQ_KEY_POOL):
                if await self.redis_client.exists(f"groq:ratelimited:{idx}"):
                    rl_count += 1
                    continue

                rpm_key   = f"groq:rpm:{idx}:{minute_epoch}"
                rpm_count = int(await self.redis_client.get(rpm_key) or 0)

                if rpm_count < best_rpm:
                    best_rpm = rpm_count
                    best_idx = idx

            if best_idx is None:
                # All keys exhausted — trip circuit breaker if ≥50 % are RL'd
                if rl_count >= max(1, len(GROQ_KEY_POOL) // 2):
                    await self.redis_client.setex("groq:org_ratelimited", 30, "1")
                    log.warning(
                        f"[LLM] Groq org circuit breaker tripped "
                        f"({rl_count}/{len(GROQ_KEY_POOL)} keys rate-limited) — "
                        "skipping Groq for 30 s"
                    )
                await asyncio.sleep(0.5 + random.uniform(0.0, 0.3))
                continue

            # Enforce per-second slot for the chosen key
            sec       = int(time.time())
            rps_key   = f"groq:rps:{best_idx}:{sec}"
            rps_count = await self.redis_client.incr(rps_key)
            if rps_count == 1:
                await self.redis_client.expire(rps_key, 2)

            if rps_count <= GROQ_MAX_RPS:
                rpm_key = f"groq:rpm:{best_idx}:{minute_epoch}"
                cnt = await self.redis_client.incr(rpm_key)
                if cnt == 1:
                    await self.redis_client.expire(rpm_key, 90)
                log.debug(f"[LLM] Groq key #{best_idx} selected  rpm={best_rpm+1}  rps={rps_count}")
                return GROQ_KEY_POOL[best_idx]

            # Per-second slot full — tiny sleep, retry
            wait = max(0.04, 1.02 - (time.time() - sec)) + random.uniform(0.02, 0.08)
            await asyncio.sleep(wait)

        log.warning("[LLM] _pick_groq_key_least_rpm: no slot acquired — falling back")
        return None

    async def _mark_groq_key_ratelimited(self, key: str, retry_after: float = 60.0):
        """Mark a key as rate-limited in Redis so _pick_groq_key_least_rpm skips it.
        Also trips the org-level circuit breaker when ≥50 % of keys are now RL'd."""
        if not self.redis_client:
            return
        try:
            idx = GROQ_KEY_POOL.index(key)
            ttl = max(5, int(retry_after) + 2)
            await self.redis_client.setex(f"groq:ratelimited:{idx}", ttl, "1")
            log.warning(f"[LLM] Groq key #{idx} marked rate-limited for {ttl}s")

            # Count how many keys are currently rate-limited
            rl_count = 0
            for i in range(len(GROQ_KEY_POOL)):
                if await self.redis_client.exists(f"groq:ratelimited:{i}"):
                    rl_count += 1

            # Trip the org circuit breaker proactively when half the pool is gone
            threshold = max(1, len(GROQ_KEY_POOL) // 2)
            if rl_count >= threshold:
                cb_ttl = min(int(retry_after) + 5, 120)  # cap at 2 min
                await self.redis_client.setex("groq:org_ratelimited", cb_ttl, "1")
                log.warning(
                    f"[LLM] Groq org circuit breaker tripped proactively "
                    f"({rl_count}/{len(GROQ_KEY_POOL)} keys RL) for {cb_ttl}s"
                )
        except ValueError:
            pass

    # ── LLM entry-point ───────────────────────────────────────
    async def llm(self, prompt: str, model: str = "llama3.1:8b",
                  temperature: float = 0.3, max_tokens: int = 1000,
                  json_mode: bool = False) -> str:
        """
        Call LLM with cascading fallback:
          1. Groq API  (Least-RPM key from pool — fast & free)
          2. Ollama    (local inference — always available)
          3. GitHub Models  (student pack / extra free quota)
        """
        # ── 1. Groq API — multi-key Least-RPM pool ────────────────────────
        if GROQ_KEY_POOL:
            # Fast-exit: if the org-level circuit breaker is set, skip Groq
            # entirely without any network calls or Redis polling.
            _cb_active = (
                self.redis_client
                and await self.redis_client.exists("groq:org_ratelimited")
            )
            if not _cb_active:
                groq_model = os.environ.get("GROQ_MODEL", "qwen/qwen3.6-27b")
                try:
                    messages = []
                    if json_mode:
                        messages.append({
                            "role": "system",
                            "content": "You are a helpful assistant. Respond with valid JSON only, no markdown, no explanation."
                        })
                    messages.append({"role": "user", "content": prompt})

                    body: dict = {
                        "model": groq_model,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    }
                    if json_mode:
                        body["response_format"] = {"type": "json_object"}

                    for attempt in range(GROQ_RETRIES + 1):
                        groq_key = await self._pick_groq_key_least_rpm()
                        if groq_key is None:
                            log.warning("[LLM] All Groq keys exhausted — falling back to Ollama")
                            break

                        async with httpx.AsyncClient(timeout=30) as client:
                            resp = await client.post(
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {groq_key}",
                                         "Content-Type": "application/json"},
                                json=body,
                            )

                        if resp.status_code == 200:
                            text = resp.json()["choices"][0]["message"]["content"]
                            if text:
                                return text

                        if resp.status_code == 429:
                            # Parse retry-after; mark this specific key as rate-limited
                            try:
                                retry_after = float(resp.headers.get("retry-after", "60"))
                            except Exception:
                                retry_after = 60.0
                            await self._mark_groq_key_ratelimited(groq_key, retry_after)
                            if attempt < GROQ_RETRIES:
                                log.warning(
                                    f"[LLM] Groq 429 on key (attempt {attempt+1}/{GROQ_RETRIES+1}) "
                                    f"— key marked, retrying with next key"
                                )
                                continue   # _pick will skip the rate-limited key next round
                            break

                        detail = resp.text[:120]
                        log.warning(f"[LLM] Groq {resp.status_code}: {detail} — falling back to Ollama")
                        break

                except Exception as e:
                    log.warning(f"[LLM] Groq exception ({e}) — falling back to Ollama")

        # ── Ollama (local fallback) ──────────────────────────────────────────
        # Try smaller model first — better for low-RAM machines
        models_to_try = []
        if model == "llama3.1:8b":
            models_to_try = ["llama3.2:3b", "llama3.1:8b", "llama3.2:1b", "tinyllama:latest"]
        else:
            models_to_try = [model, "llama3.2:3b"]

        payload_base = {
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if json_mode:
            payload_base["format"] = "json"

        for m in models_to_try:
            try:
                payload = {**payload_base, "model": m, "prompt": prompt}
                async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
                    resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
                    if resp.status_code == 200:
                        result = resp.json().get("response", "")
                        if result:
                            if m != model:
                                log.info(f"[{self.name}] Used fallback model {m}")
                            return result
                    elif resp.status_code == 500:
                        err = resp.text[:100]
                        if "not found" in err.lower() or "pull" in err.lower():
                            log.warning(f"[{self.name}] Model {m} not downloaded — trying next")
                            continue
            except httpx.TimeoutException:
                log.warning(f"[{self.name}] Ollama timeout with {m} — trying next")
                continue
            except Exception as e:
                log.warning(f"[{self.name}] Ollama error with {m}: {e}")
                continue

        log.warning(f"[{self.name}] Ollama failed — trying GitHub Models")

        # ── GitHub Models (3rd tier: Student pack / free tier fallback) ──────
        # Get a token: github.com/settings/tokens → Models:Read permission
        # Free: llama-3.1-8b = 15 RPM, 500 req/day (separate from Copilot quota)
        github_token = os.environ.get("GITHUB_TOKEN", "").strip()
        if github_token:
            github_model = os.environ.get("GITHUB_MODEL", "meta-llama-3.1-8b-instruct")
            try:
                messages = []
                if json_mode:
                    messages.append({"role": "system",
                        "content": "Respond with valid JSON only. No markdown, no explanation."})
                messages.append({"role": "user", "content": prompt})
                body = {"model": github_model, "messages": messages,
                        "max_tokens": max_tokens, "temperature": temperature}
                if json_mode:
                    body["response_format"] = {"type": "json_object"}
                for attempt in range(2):
                    async with httpx.AsyncClient(timeout=30) as client:
                        resp = await client.post(
                            "https://models.inference.ai.azure.com/chat/completions",
                            headers={"Authorization": f"Bearer {github_token}",
                                     "Content-Type": "application/json"},
                            json=body,
                        )
                    if resp.status_code == 200:
                        text = resp.json()["choices"][0]["message"]["content"]
                        if text:
                            log.info(f"[{self.name}] GitHub Models OK ({github_model})")
                            return text
                    if resp.status_code == 429 and attempt == 0:
                        log.warning(f"[{self.name}] GitHub Models rate-limited — sleeping 6s")
                        await asyncio.sleep(6)
                        continue
                    log.warning(f"[{self.name}] GitHub Models {resp.status_code}: {resp.text[:80]}")
                    break
            except Exception as e:
                log.warning(f"[{self.name}] GitHub Models exception: {e}")

        log.warning(f"[{self.name}] All LLM backends exhausted — returning empty")
        return ""  # Graceful empty — agent will use headline as fallback

    # ── Embeddings (local sentence-transformers) ───────────────
    _embedder = None
    _embedder_lock = threading.Lock()

    async def embed(self, text: str) -> list[float]:
        """Generate text embeddings locally — no API cost."""
        if BaseAgent._embedder is None:
            def _load():
                with BaseAgent._embedder_lock:
                    if BaseAgent._embedder is None:
                        from sentence_transformers import SentenceTransformer
                        BaseAgent._embedder = SentenceTransformer("all-MiniLM-L6-v2")  # 80MB, fast
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _load)
        loop = asyncio.get_running_loop()
        embedding = await loop.run_in_executor(None, BaseAgent._embedder.encode, text)
        return embedding.tolist()

    # ── Abstract method ───────────────────────────────────────
    @abstractmethod
    async def process(self, payload: dict) -> dict | None:
        """
        Process one message payload.
        Return dict to forward to output_queue, or None to stop here.
        Raise an exception to trigger retry → DLQ logic.
        """
        ...

    async def on_start(self):
        """Optional: setup hook called after all connections are ready."""
        pass

    @classmethod
    def run(cls):
        """Entry point: `python -m agents.ingestion.rss_feed` → runs this."""
        agent = cls()
        asyncio.run(agent.start())
