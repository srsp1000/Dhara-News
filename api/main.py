"""
Dhara News — FastAPI Backend
All API routes for the frontend.
Run: uvicorn main:app --reload --port 8000
"""
import os, json, logging, asyncio, time
import secrets as _secrets
import re
import html
import uuid
import hmac
import hashlib
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as aioredis
import httpx
from fastapi import FastAPI, Query, HTTPException, Request, Depends, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
try:
    from shared.truth_scoring import (
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
        probability_to_truth_score,
    )
except Exception:
    from truth_scoring import (
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
        probability_to_truth_score,
    )
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _SLOWAPI_AVAILABLE = True
except Exception:
    _SLOWAPI_AVAILABLE = False

    class Limiter:
        def __init__(self, *args, **kwargs):
            pass

        def limit(self, *args, **kwargs):
            def _decorator(func):
                return func
            return _decorator

    def get_remote_address(request: Request):
        return request.client.host if request and request.client else "unknown"

    class RateLimitExceeded(Exception):
        pass

    async def _rate_limit_exceeded_handler(request, exc):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

try:
    import sentry_sdk
except Exception:
    sentry_sdk = None
try:
    from shared.location_utils import normalize_state_name, normalize_district_name
except Exception:
    from location_utils import normalize_state_name, normalize_district_name
from shared.db_utils import (
    create_pg_pool as _create_pg_pool,
    db_fetch as _shared_db_fetch,
    db_fetchrow as _shared_db_fetchrow,
    db_execute as _shared_db_execute,
)

_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn and sentry_sdk is not None:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        environment=os.environ.get("ENVIRONMENT", "production"),
    )

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))


def _env_int(name: str, default: int, minimum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except Exception:
        value = default
    return max(minimum, value)


ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
ALLOW_INSECURE_WEBHOOKS = os.environ.get("ALLOW_INSECURE_WEBHOOKS", "false").lower() == "true"
WEBHOOK_RECEIPTS_TTL_DAYS = _env_int("WEBHOOK_RECEIPTS_TTL_DAYS", 14, 1)
WEBHOOK_CLEANUP_INTERVAL_SECS = _env_int("WEBHOOK_CLEANUP_INTERVAL_SECS", 3600, 300)


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _validate_startup_configuration() -> None:
    """Fail fast in production on insecure or incomplete runtime configuration."""
    if ENVIRONMENT != "production":
        return

    admin_key = os.environ.get("ADMIN_KEY", "").strip()
    if not admin_key or admin_key == "dhara-admin-secret":
        raise RuntimeError("ADMIN_KEY must be configured to a secure value in production")

    _require_env("SUPABASE_JWT_SECRET")

    if ALLOW_INSECURE_WEBHOOKS:
        raise RuntimeError("ALLOW_INSECURE_WEBHOOKS must be false in production")

    has_razorpay = bool(os.environ.get("RAZORPAY_KEY_ID", "").strip() and os.environ.get("RAZORPAY_KEY_SECRET", "").strip())
    if has_razorpay:
        _require_env("RAZORPAY_WEBHOOK_SECRET")


def _now_ist() -> datetime:
    return datetime.now(IST)


def _ist_day_bounds_utc(day_value: date) -> tuple[datetime, datetime]:
    """Return UTC bounds for an IST calendar date (00:00:00 to 23:59:59.999999 IST)."""
    start_ist = datetime.combine(day_value, datetime.min.time(), tzinfo=IST)
    end_ist = datetime.combine(day_value, datetime.max.time(), tzinfo=IST)
    return start_ist.astimezone(timezone.utc), end_ist.astimezone(timezone.utc)

# ─── DOMAIN NORMALIZER ───────────────────────────────────────────────────────

# ─── Domain aliases: ONLY fires for generic/missing domains ────────────────────
# Weak single-word triggers (app, award, ai, cyber) intentionally removed.
DOMAIN_ALIASES = {
    "lok sabha":"politics", "rajya sabha":"politics", "parliament":"politics",
    "bjp":"politics", "congress":"politics", "modi":"politics", "election":"politics",
    "rbi":"economy", "sebi":"economy", "gdp":"economy", "inflation":"economy",
    "sensex":"economy", "nifty":"economy", "repo rate":"economy",
    "china":"international", "pakistan":"international", "russia":"international",
    "ukraine":"international", "nato":"international", "g20":"international",
    "cricket":"sports", "ipl":"sports", "olympics":"sports",
    "football":"sports", "hockey":"sports", "kabaddi":"sports",
    "bollywood":"entertainment", "web series":"entertainment",
    "film festival":"entertainment", "box office":"entertainment",
    "music album":"entertainment", "filmfare":"entertainment",
    "isro":"science", "nasa":"science", "chandrayaan":"science",
    "gaganyaan":"science", "aditya-l1":"science",
    "semiconductor":"technology", "5g network":"technology",
    "quantum computing":"technology", "data breach":"technology",
    "cybersecurity":"technology",
    "supreme court":"judiciary", "high court":"judiciary",
    "fir filed":"judiciary", "acquitted":"judiciary",
    "flood":"environment", "cyclone":"environment", "earthquake":"environment",
    "landslide":"environment", "drought":"environment", "wildfire":"environment",
    "cloudburst":"environment",
    "murdered":"judiciary", "murder":"judiciary",
    "rape case":"judiciary", "kidnapped":"judiciary",
}

# ─── Crash-override: corrects obviously wrong stored domains at READ time ───────
_CRASH_OVERRIDE_RULES = [
    ({"technology","entertainment","sports","business"},
     ["murder","murdered","killed","stabbed","shot dead","lynched","lynching",
      "rape","acid attack","arrested for","chargesheeted","fir against","homicide"],
     "judiciary"),
    ({"technology","entertainment","sports","business","politics"},
     ["flood","cyclone","earthquake","landslide","tsunami","cloudburst",
      "wildfire","avalanche","disaster","death toll","rescue"],
     "environment"),
    ({"technology","entertainment"},
     ["accident","crash","collapsed","explosion","stampede","burned alive","derailment"],
     "social"),
]

def normalize_domain(domain: str, headline: str = "", source_domain: str = "") -> str:
    """
    Phase 1 — crash-override: fix obviously wrong domains even if explicit.
    Phase 2 — alias inference: fill generic/empty domains from headline keywords.
    Uses word-boundary-aware regex matching for short/ambiguous keywords.
    """
    title_low = headline.lower()

    # Phase 1: correct explicit domains that contradict the headline
    if domain and domain not in ("general", "other", ""):
        for bad_domains, signals, correct in _CRASH_OVERRIDE_RULES:
            if domain in bad_domains and any(sig in title_low for sig in signals):
                return correct
        return domain

    # Phase 2: infer for generic articles using weighted alias scoring
    text = (headline + " " + source_domain).lower()

    def keyword_in_text(keyword: str) -> bool:
        """Word-boundary-aware keyword match — avoids false positives on short tokens."""
        kw = (keyword or "").strip().lower()
        if not kw:
            return False
        if " " in kw:
            parts = [re.escape(p) for p in kw.split() if p]
            if not parts:
                return False
            pattern = r"\b" + r"\s+".join(parts) + r"\b"
            return re.search(pattern, text, flags=re.IGNORECASE) is not None
        if len(kw) <= 3:
            return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text, flags=re.IGNORECASE) is not None
        return re.search(rf"\b{re.escape(kw)}\b", text, flags=re.IGNORECASE) is not None

    # Guardrail: do not map tragedy/crime stories to technology based on weak tech tokens.
    tragedy_markers = [
        "death", "died", "dead", "killed", "fatal", "murder", "homicide", "suicide",
        "body found", "postmortem", "post-mortem", "accident", "crash",
    ]
    strong_tech_markers = [
        "artificial intelligence", "machine learning", "ai model", "semiconductor",
        "cyberattack", "cyber security", "data breach", "satellite", "isro", "nasa", "5g",
    ]
    if any(keyword_in_text(k) for k in tragedy_markers):
        if domain == "technology" and not any(keyword_in_text(k) for k in strong_tech_markers):
            return "social"

    alias_scores: dict[str, int] = {}
    for keyword, mapped in DOMAIN_ALIASES.items():
        if keyword_in_text(keyword):
            alias_scores[mapped] = alias_scores.get(mapped, 0) + (
                3 if keyword in title_low else 1
            )
    if alias_scores:
        return max(alias_scores, key=alias_scores.get)
    return domain or "general"

logging.basicConfig(level=logging.INFO)

PG_DSN    = os.environ.get("PG_DSN",    "postgresql://dhara:dhara_local_dev@postgres:5432/dhara")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
ES_URL    = os.environ.get("ES_URL",    "http://elasticsearch:9200")

pg_pool: asyncpg.Pool = None
redis_client: aioredis.Redis = None


async def _pg_conn_init(conn: asyncpg.Connection) -> None:
    # Validate connection immediately so unhealthy connections don't enter pool.
    await conn.execute("SELECT 1")


async def _cleanup_webhook_receipts_once() -> None:
    async with pg_pool.acquire() as c:
        await c.execute(
            "DELETE FROM webhook_event_receipts WHERE received_at < NOW() - ($1::int * INTERVAL '1 day')",
            WEBHOOK_RECEIPTS_TTL_DAYS,
        )


async def _webhook_receipt_cleanup_loop() -> None:
    while True:
        try:
            await _cleanup_webhook_receipts_once()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning(f"Webhook receipt cleanup failed: {e}")
        await asyncio.sleep(WEBHOOK_CLEANUP_INTERVAL_SECS)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool, redis_client
    _validate_startup_configuration()
    pg_pool    = await _create_pg_pool(PG_DSN, min_size=2, max_size=20, init=_pg_conn_init)
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        await redis_client.ping()
    except Exception as e:
        log.warning(f"Redis ping failed at startup: {e}")

    # Guard frequently referenced columns during startup to avoid runtime query failures.
    try:
        async with pg_pool.acquire() as conn:
            await conn.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE"
            )
            await conn.execute(
                "ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS is_breaking BOOLEAN DEFAULT FALSE"
            )
            await conn.execute(
                "ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS breaking_at TIMESTAMPTZ"
            )
    except Exception as e:
        log.warning(f"Startup schema guards failed: {e}")

    cleanup_task = asyncio.create_task(_webhook_receipt_cleanup_loop())
    log.info("Database connections ready")
    yield
    cleanup_task.cancel()
    await asyncio.gather(cleanup_task, return_exceptions=True)
    await pg_pool.close()
    await redis_client.close()

app = FastAPI(title="Dhara News API", version="2.0.0", lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
if _SLOWAPI_AVAILABLE:
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# FIX: origins locked to FRONTEND_ORIGIN env var (was allow_origins=["*"])
_raw_origins = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_raw_cors_methods = os.environ.get("CORS_ALLOW_METHODS", "").strip()
if _raw_cors_methods:
    ALLOWED_METHODS = [m.strip().upper() for m in _raw_cors_methods.split(",") if m.strip()]
elif ENVIRONMENT == "production":
    # Production default: exact methods currently used by API endpoints.
    ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
else:
    # Development default keeps PUT for local testing flexibility.
    ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=ALLOWED_METHODS,
    allow_headers=["Authorization", "Content-Type", "X-Admin-Key", "X-Razorpay-Signature"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = (request.headers.get("X-Request-ID") or str(uuid.uuid4())).strip()[:64]
    request.state.request_id = request_id
    started_at = time.perf_counter()

    try:
        response: Response = await call_next(request)
    except Exception:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        log.exception(
            f"[{request_id}] unhandled exception {request.method} {request.url.path} ({elapsed_ms}ms)"
        )
        raise

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    response.headers.setdefault("X-Request-ID", request_id)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("X-XSS-Protection", "0")
    if ENVIRONMENT == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if response.status_code >= 500:
        log.warning(
            f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({elapsed_ms}ms)"
        )

    return response

PROFESSIONS = ["general","upsc","medical","law","technology","finance",
               "student","defence","agriculture","environment","education","research"]
DOMAINS     = ["politics","economy","health","technology","judiciary","environment",
               "sports","science","international","business","agriculture","defence","education","social","general"]

VISIBLE_TEXT_FIELDS = {
    "headline",
    "summary_brief",
    "summary_deep",
    "platform_body",
    "original_title",
}

def normalize_location_fields(row: dict) -> dict:
    if not any(k in row for k in ("loc_country", "loc_state", "loc_city", "loc_district", "loc_global")):
        return row

    state = normalize_state_name(row.get("loc_state"))
    district, district_state = normalize_district_name(row.get("loc_district") or row.get("loc_city"), state)

    if district:
        row["loc_district"] = district
        state = state or district_state
        if not row.get("loc_country"):
            row["loc_country"] = "IN"
        row["loc_global"] = False
    else:
        row["loc_district"] = None

    row["loc_state"] = state
    if row.get("loc_state") and not row.get("loc_country"):
        row["loc_country"] = "IN"

    # Only expose district/state/country tags to the UI; raw loc_city values were noisy
    # and could contain person/company names from imperfect NER.
    row["loc_city"] = None
    return row


def sanitize_visible_text(value: str) -> str:
    text = str(value or "")
    if not text:
        return ""
    lower = text.lower()
    noise_markers = [
        "datalayer.push",
        "window.datalayer",
        "var datalayer",
        "'pagedetails'",
        '"pagedetails"',
        "tp.push(['init'",
        "require.config(",
        "local directory baseurl",
        "th-online/",
        "jquery-3.4.1",
    ]
    cut_points = [lower.find(m) for m in noise_markers if lower.find(m) != -1]
    if cut_points:
        text = text[:min(cut_points)]

    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"(?is)\bvar\s+dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]\s*;?", " ", text)
    text = re.sub(r"(?is)window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]\s*;?", " ", text)
    text = re.sub(r"(?is)dataLayer\??\.push\s*\(\s*\{.*?\}\s*\)\s*;?", " ", text)
    text = re.sub(r"(?is)\btp\.push\s*\(\s*\[\s*['\"]init['\"].*?\]\s*\)\s*;?", " ", text)
    text = re.sub(r"(?im)^\s*(WhatsApp|X\s*\(Twitter\)|LinkedIn|Telegram|Facebook|Copy\s*link|Advertisement)\s*$", " ", text)
    text = re.sub(r"(?i)\bskip to content\b", " ", text)
    text = re.sub(
        r"(?i)\bhome\s+news\s+sport\s+business\s+technology\s+health\s+culture\s+arts\s+travel\s+earth\s+audio\s+video\s+live\b",
        " ",
        text,
    )
    text = html.unescape(text)
    text = re.sub(r"\\[nrt]", " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text

def _has_meaningful_deep_summary(value) -> bool:
    """Return True only when deep summary has meaningful, non-empty content."""
    if value is None:
        return False

    def _clean_text(v: str) -> str:
        return sanitize_visible_text(v).strip()

    # If DB returns JSON object/array directly (e.g., JSONB columns)
    if isinstance(value, dict):
        sections = [_clean_text(str(v)) for v in value.values() if v is not None]
        non_empty = [s for s in sections if s]
        combined = " ".join(non_empty)
        return len(non_empty) >= 2 and len(combined) >= 80

    if isinstance(value, list):
        parts = [_clean_text(str(v)) for v in value if v is not None]
        non_empty = [p for p in parts if p]
        return len(non_empty) > 0 and len(" ".join(non_empty)) >= 80

    raw = str(value).strip()
    if not raw:
        return False

    if raw.lower() in {"null", '"null"', '""', "{}", "[]"}:
        return False

    # If deep summary is stored as JSON string, parse and validate the structure.
    if raw.startswith("{") or raw.startswith("["):
        try:
            parsed = json.loads(raw)
            return _has_meaningful_deep_summary(parsed)
        except Exception as e:
            log.debug(f"summary_deep JSON parse failed in meaningful-check: {e}")

    # Plain text fallback
    return len(_clean_text(raw)) >= 80

def _is_fully_generated_story(row: dict) -> bool:
    """
    True only when all user-facing text fields are meaningfully populated.
    - headline: non-empty
    - summary_brief: non-empty
    - summary_deep: has structured content (≥80 chars)
    - platform_body: meaningful article prose, not a summary JSON blob or a short stub
    """
    def _has_meaningful_platform_body(value, brief_value=None, deep_value=None, projected_len=0) -> bool:
        raw = str(value or "").strip()
        if not raw:
            return False
        if raw.lower() in {"null", '"null"', '""', "{}", "[]"}:
            return False
        if raw.startswith("{") or raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, (dict, list)):
                    return False
            except Exception as e:
                log.debug(f"platform_body JSON parse failed in generated-check: {e}")

        cleaned = sanitize_visible_text(raw)
        words = len(cleaned.split())
        if len(cleaned) < 600 or words < 110:
            return False

        brief_clean = sanitize_visible_text(brief_value or "")
        deep_clean = sanitize_visible_text(deep_value or "")
        if brief_clean and cleaned == brief_clean:
            return False
        if deep_clean and cleaned == deep_clean:
            return False

        return projected_len >= 600 or bool(cleaned)

    headline = sanitize_visible_text(row.get("headline") or "")
    brief    = sanitize_visible_text(row.get("summary_brief") or "")
    deep     = row.get("summary_deep")
    body     = row.get("platform_body") or ""
    body_len = row.get("platform_body_length")
    try:
        body_len = int(body_len or 0)
    except (TypeError, ValueError):
        body_len = 0
    return (
        bool(headline)
        and bool(brief)
        and _has_meaningful_deep_summary(deep)
        and _has_meaningful_platform_body(body, brief, deep, body_len)
    )

# ── Helpers ──────────────────────────────────────────────────────────────────

async def db_fetch(q, *args):
    return await _shared_db_fetch(pg_pool, q, *args)

async def db_fetchrow(q, *args):
    return await _shared_db_fetchrow(pg_pool, q, *args)

async def db_execute(q, *args):
    return await _shared_db_execute(pg_pool, q, *args)

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif isinstance(v, str) and k in VISIBLE_TEXT_FIELDS:
            d[k] = sanitize_visible_text(v)
    normalize_location_fields(d)
    return d

async def invalidate_feed_cache() -> None:
    """Delete all cached feed pages after content mutations."""
    try:
        keys = []
        async for k in redis_client.scan_iter(match="feed:*"):
            keys.append(k)
        if keys:
            await redis_client.delete(*keys)
    except Exception as e:
        log.warning(f"Feed cache invalidation failed: {e}")


ADMIN_CONFIG_DEFAULTS = {
    "p_verified_default": "0.85",
    "p_verified_high_stakes": "0.90",
    "n_eff_verified_default": "2.0",
    "n_eff_high_stakes": "3.0",
    "single_source_exception_min_p": "0.95",
    "breaking_velocity_mult": "3.0",
    "breaking_min_score": "85",
    "breaking_min_sources": "2",
    "breaking_ttl_hours": "4",
    "trending_window_hours": "24",
    "trending_velocity_weight": "3.0",
    "feed_cache_ttl_secs": "900",
    "max_quarantine_age_days": "7",
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


def _safe_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


async def load_admin_config() -> dict[str, str]:
    """Return the current runtime config, with sane defaults on fresh DBs."""
    cached = None
    try:
        cached = await redis_client.get("admin:config")
    except Exception as e:
        log.warning(f"admin config cache read failed: {e}")
        cached = None
    if cached:
        try:
            data = json.loads(cached)
            if isinstance(data, dict):
                return {**ADMIN_CONFIG_DEFAULTS, **{str(k): str(v) for k, v in data.items()}}
        except Exception as e:
            log.warning(f"admin config cache decode failed: {e}")

    data = dict(ADMIN_CONFIG_DEFAULTS)
    try:
        rows = await db_fetch("SELECT key, value FROM admin_config")
        for row in rows:
            data[str(row["key"])] = str(row["value"])
    except Exception as e:
        log.warning(f"admin config DB load failed: {e}")

    try:
        await redis_client.setex("admin:config", 60, json.dumps(data))
    except Exception as e:
        log.warning(f"admin config cache write failed: {e}")
    return data


async def log_pipeline_event(
    event_type: str,
    cluster_id: Optional[str] = None,
    actor: str = "system",
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    try:
        await db_execute(
            """INSERT INTO pipeline_events
                   (event_type, cluster_id, actor, old_value, new_value, reason)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            event_type,
            cluster_id,
            actor,
            old_value,
            new_value,
            reason,
        )
    except Exception as e:
        log.warning(f"pipeline_event insert failed: {e}")


async def apply_source_reliability_update(
    cluster_id: str,
    was_correct: bool,
    actor: str = "admin",
    reason: str = "",
) -> None:
    """Direct reliability update used by admin corrections and manual moderation."""
    try:
        cluster = await db_fetchrow(
            "SELECT domain FROM story_clusters WHERE id = $1",
            cluster_id,
        )
        if not cluster:
            return
        topic_dom = str(cluster["domain"] or "general").lower()
        rows = await db_fetch(
            "SELECT DISTINCT source_domain FROM articles WHERE cluster_id = $1 AND source_domain IS NOT NULL",
            cluster_id,
        )
        for row in rows:
            domain = str(row["source_domain"] or "").strip().lower()
            if not domain:
                continue
            key = f"src_prior:{domain}:{topic_dom}"
            current = 0.80
            try:
                cached = await redis_client.get(key)
                if cached:
                    current = float(cached)
            except Exception as e:
                log.debug(f"source reliability cache read failed for {key}: {e}")
            if was_correct:
                new_prior = current + 0.05 * (1.0 - current)
            else:
                new_prior = current - 0.05 * current
            new_prior = max(0.1, min(0.99, new_prior))
            try:
                await redis_client.setex(key, 86400 * 7, str(round(new_prior, 4)))
            except Exception as e:
                log.debug(f"source reliability cache write failed for {key}: {e}")
            try:
                await db_execute(
                    """UPDATE sources
                       SET correction_rate = CASE
                               WHEN $2 THEN GREATEST(0.0, correction_rate - 0.01)
                               ELSE LEAST(1.0, correction_rate + 0.05)
                           END,
                           last_accuracy_update = NOW(),
                           accuracy_history = array_append(COALESCE(accuracy_history, '{}'), $3::float)
                       WHERE domain = $1""",
                    domain,
                    was_correct,
                    float(was_correct),
                )
            except Exception as e:
                log.warning(f"sources reliability update failed for {domain}: {e}")
            try:
                await db_execute(
                    """INSERT INTO source_reliability_history
                           (source_domain, topic_domain, prior_value, event_type, cluster_id)
                       VALUES ($1, $2, $3, $4, $5)""",
                    domain,
                    topic_dom,
                    float(round(new_prior, 4)),
                    "confirmation" if was_correct else "correction",
                    cluster_id,
                )
            except Exception as e:
                log.warning(f"source_reliability_history insert failed for {domain}: {e}")
        await log_pipeline_event(
            "source_reliability",
            cluster_id=cluster_id,
            actor=actor,
            new_value="correct" if was_correct else "incorrect",
            reason=reason or "admin_status_change",
        )
    except Exception as e:
        log.warning(f"Source reliability update skipped: {e}")


async def set_breaking_state(
    cluster_id: str,
    is_breaking: bool,
    actor: str = "system",
    reason: str = "",
) -> None:
    cfg = await load_admin_config()
    ttl_hours = _safe_int(cfg.get("breaking_ttl_hours"), 4)
    ttl_seconds = max(1, ttl_hours) * 3600

    if is_breaking:
        await db_execute(
            "UPDATE story_clusters SET is_breaking = TRUE, breaking_at = NOW(), last_updated = NOW() WHERE id = $1",
            cluster_id,
        )
        try:
            await redis_client.setex(f"breaking:{cluster_id}", ttl_seconds, "1")
            await redis_client.zadd("breaking:active", {cluster_id: datetime.now(timezone.utc).timestamp()})
            await redis_client.expire("breaking:active", ttl_seconds)
        except Exception as e:
            log.warning(f"set_breaking_state redis set failed for {cluster_id}: {e}")
    else:
        await db_execute(
            "UPDATE story_clusters SET is_breaking = FALSE, breaking_at = NULL, last_updated = NOW() WHERE id = $1",
            cluster_id,
        )
        try:
            await redis_client.delete(f"breaking:{cluster_id}")
            await redis_client.zrem("breaking:active", cluster_id)
        except Exception as e:
            log.warning(f"set_breaking_state redis clear failed for {cluster_id}: {e}")

    await log_pipeline_event(
        "breaking_set",
        cluster_id=cluster_id,
        actor=actor,
        new_value="true" if is_breaking else "false",
        reason=reason or "manual_toggle",
    )

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok", "platform": "Dhara News", "version": "2.0"}

# ─── FEED ────────────────────────────────────────────────────────────────────

@app.get("/api/feed")
@limiter.limit("60/minute")
async def get_feed(
    request: Request,
    profession:  str           = Query("general"),
    domain:      Optional[str] = Query(None),
    exam_tag:    Optional[str] = Query(None),
    loc_state:   Optional[str] = Query(None),
    loc_district: Optional[str] = Query(None),
    loc_country: str           = Query("IN"),
    date_from:   Optional[date]= Query(None),
    date_to:     Optional[date]= Query(None),
    status:      str           = Query("developing,verified"),
    sort:        str           = Query("verified", pattern="^(verified|latest)$"),
    require_depth: Optional[str] = Query(None, pattern="^(headline|brief|deep)$"),
    require_fully_generated: bool = Query(True),
    limit:       int           = Query(20, le=50),
    offset:      int           = Query(0),
):
    """Main news feed filtered by profession, location, date, domain."""
    # Try Redis cache first (15-min TTL per profession)
    # Include status in cache key to avoid stale results
    runtime_cfg = await load_admin_config()
    feed_cache_ttl = max(30, _safe_int(runtime_cfg.get("feed_cache_ttl_secs"), 120))

    def _ckey(v: Optional[str]) -> str:
        vv = str(v).strip() if v is not None else ""
        return vv if vv else "__none__"

    date_from_key = date_from.isoformat() if date_from else "__none__"
    date_to_key = date_to.isoformat() if date_to else "__none__"
    domain_key = _ckey(domain)
    exam_tag_key = _ckey(exam_tag)
    loc_state_key = _ckey(loc_state)
    loc_district_key = _ckey(loc_district)
    loc_country_key = _ckey(loc_country)
    require_depth_key = _ckey(require_depth)
    status_key = _ckey(status)
    sort_key = _ckey(sort)
    cache_key = (
        f"feed:{_ckey(profession)}:{domain_key}:{exam_tag_key}:{loc_state_key}:{loc_district_key}:{loc_country_key}:{status_key}:{sort_key}:"
        f"{require_depth_key}:{require_fully_generated}:{limit}:{offset}:{date_from_key}:{date_to_key}"
    )
    if offset == 0 and not date_from:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    # Build query — "all" shows everything, else filter by status
    if status == "all" or not status:
        conditions = []
        params = []
        idx = 1
    else:
        status_list = [s.strip() for s in status.split(",") if s.strip()]
        if len(status_list) == 1:
            conditions = ["c.status = $1"]
        else:
            placeholders = ", ".join(f"${i+1}" for i in range(len(status_list)))
            conditions = [f"c.status IN ({placeholders})"]
        params = status_list
        idx = len(status_list) + 1

    if profession and profession != "general":
        # Non-general feeds should only show explicitly tagged professions.
        conditions.append(f"${idx} = ANY(c.professions)")
        params.append(profession); idx += 1
    # general: no profession filter — show all articles

    if domain:
        if domain == "national":
            # National section is a virtual bucket: India-focused domestic stories.
            # Most rows are tagged by topical domain (politics/economy/etc), not
            # literal 'national', so exact match yields near-empty results.
            conditions.append("COALESCE(c.loc_country, 'IN') = 'IN' AND c.domain <> 'international'")
        else:
            conditions.append(f"c.domain = ${idx}")
            params.append(domain); idx += 1

    if exam_tag:
        conditions.append(f"${idx} = ANY(c.exam_tags)")
        params.append(exam_tag); idx += 1

    if loc_state:
        conditions.append(f"c.loc_state = ${idx}")
        params.append(loc_state); idx += 1

    if loc_district:
        conditions.append(f"COALESCE(c.loc_district, c.loc_city) = ${idx}")
        params.append(loc_district); idx += 1
    # Note: loc_country filter removed from default - articles may not have country set yet

    if date_from:
        date_from_start_utc, _ = _ist_day_bounds_utc(date_from)
        conditions.append(f"COALESCE(src.published_at, c.first_seen) >= ${idx}")
        params.append(date_from_start_utc); idx += 1
    if date_to:
        _, date_to_end_utc = _ist_day_bounds_utc(date_to)
        conditions.append(f"COALESCE(src.published_at, c.first_seen) <= ${idx}")
        params.append(date_to_end_utc); idx += 1

    # Optional strict depth-content filter: only return cards with generated text.
    if require_depth == "headline":
        conditions.append("c.headline IS NOT NULL AND BTRIM(c.headline) <> ''")
    elif require_depth == "brief":
        conditions.append("c.summary_brief IS NOT NULL AND BTRIM(c.summary_brief) <> ''")
    elif require_depth == "deep":
        conditions.append(
            "c.summary_deep IS NOT NULL "
            "AND c.summary_deep::text <> '""' "
            "AND c.summary_deep::text <> '{}'"
        )

    if require_fully_generated:
        conditions.append("c.headline IS NOT NULL AND BTRIM(c.headline) <> ''")
        conditions.append("c.summary_brief IS NOT NULL AND BTRIM(c.summary_brief) <> ''")
        conditions.append(
            "c.summary_deep IS NOT NULL "
            "AND c.summary_deep::text <> '""' "
            "AND c.summary_deep::text <> '{}'"
        )
        # Guard: platform_body must have real article text (not just extractive stub).
        # Crawler failures leave platform_body NULL or summary-sized bodies — exclude those.
        conditions.append("c.platform_body IS NOT NULL AND LENGTH(c.platform_body) >= 600")

    where = " AND ".join(conditions) if conditions else "TRUE"
    if sort == "latest":
        order_clause = "c.first_seen DESC, c.truth_score DESC, c.source_count DESC"
    else:
        order_clause = """
            CASE
                WHEN c.status = 'verified' THEN 0
                WHEN c.status = 'developing' THEN 1
                WHEN c.status = 'quarantine' THEN 2
                ELSE 3
            END,
            c.truth_score DESC,
            c.source_count DESC,
            c.first_seen DESC
        """
    # Fast path for the hottest feed requests (no date range):
    # select the page of clusters first, then resolve per-row published_at/views.
    # This avoids global scans/aggregations on articles and article_views.
    if not date_from and not date_to:
        fast_order_clause = order_clause.replace("c.", "p.")
        query = f"""
            WITH page AS (
                SELECT c.id, c.headline, c.summary_brief, c.summary_deep, c.platform_body, c.truth_score, c.status,
                       c.source_count, c.domain, c.professions, c.exam_tags,
                       c.loc_country, c.loc_state, c.loc_city, c.loc_district, c.loc_global,
                       c.first_seen, c.last_updated, c.conflict, c.image_url
                FROM story_clusters c
                WHERE {where}
                ORDER BY {order_clause}
                LIMIT {limit} OFFSET {offset}
            ),
            src AS (
                SELECT a.cluster_id, MIN(a.published_at) AS published_at
                FROM articles a
                JOIN page p ON p.id = a.cluster_id
                WHERE a.published_at IS NOT NULL
                GROUP BY a.cluster_id
            ),
            v AS (
                SELECT av.cluster_id, COUNT(*) AS views_24h
                FROM article_views av
                JOIN page p ON p.id = av.cluster_id
                WHERE av.viewed_at > NOW() - INTERVAL '24 hours'
                GROUP BY av.cluster_id
            ),
            hi AS (
                SELECT DISTINCT at.cluster_id
                FROM article_translations at
                JOIN page p ON p.id = at.cluster_id
                WHERE at.language = 'hi'
                  AND at.headline IS NOT NULL
            )
            SELECT p.id, p.headline, p.summary_brief, p.summary_deep, p.platform_body, p.truth_score, p.status,
                   p.source_count, p.domain, p.professions, p.exam_tags,
                   p.loc_country, p.loc_state, p.loc_city, COALESCE(p.loc_district, p.loc_city) AS loc_district, p.loc_global,
                   p.first_seen, p.last_updated, p.conflict, COALESCE(p.image_url, NULL) AS image_url,
                   (hi.cluster_id IS NOT NULL) AS has_hindi,
                   COALESCE(LENGTH(p.platform_body), 0) AS platform_body_length,
                   COALESCE(src.published_at, p.first_seen) AS published_at,
                   COALESCE(v.views_24h, 0) AS views_24h
            FROM page p
            LEFT JOIN src ON src.cluster_id = p.id
            LEFT JOIN v ON v.cluster_id = p.id
            LEFT JOIN hi ON hi.cluster_id = p.id
            ORDER BY {fast_order_clause}
        """
    else:
        query = f"""
            SELECT c.id, c.headline, c.summary_brief, c.summary_deep, c.platform_body, c.truth_score, c.status,
                   c.source_count, c.domain, c.professions, c.exam_tags,
                   c.loc_country, c.loc_state, c.loc_city, COALESCE(c.loc_district, c.loc_city) AS loc_district, c.loc_global,
                   c.first_seen, c.last_updated, c.conflict, COALESCE(c.image_url, NULL) AS image_url,
                     EXISTS (
                      SELECT 1 FROM article_translations at
                      WHERE at.cluster_id = c.id
                        AND at.language = 'hi'
                        AND at.headline IS NOT NULL
                     ) AS has_hindi,
                   COALESCE(LENGTH(c.platform_body), 0) AS platform_body_length,
                   COALESCE(src.published_at, c.first_seen) AS published_at,
                   COALESCE(v.views_24h, 0) AS views_24h
            FROM story_clusters c
            LEFT JOIN (
                SELECT cluster_id, MIN(published_at) AS published_at
                FROM articles
                WHERE published_at IS NOT NULL
                GROUP BY cluster_id
            ) src ON src.cluster_id = c.id
            LEFT JOIN (
                SELECT cluster_id, COUNT(*) AS views_24h
                FROM article_views
                WHERE viewed_at > NOW() - INTERVAL '24 hours'
                GROUP BY cluster_id
            ) v ON v.cluster_id = c.id
            WHERE {where}
            ORDER BY {order_clause}
            LIMIT {limit} OFFSET {offset}
        """
    rows = await db_fetch(query, *params)
    result = []
    for r in rows:
        d = row_to_dict(r)
        if require_depth == "deep" and not _has_meaningful_deep_summary(d.get("summary_deep")):
            continue

        d.pop("platform_body_length", None)
        d.pop("platform_body", None)
        original_domain = d.get("domain") or "general"
        normalized_domain = normalize_domain(original_domain, d.get("headline", ""), "")
        d["domain_original"] = original_domain
        d["domain"] = normalized_domain
        d["domain_conflict"] = normalized_domain != original_domain
        d["has_hindi"] = bool(d.get("has_hindi"))
        result.append(d)

    if offset == 0 and not date_from:
        await redis_client.setex(cache_key, feed_cache_ttl, json.dumps(result, default=str))

    return result


@app.get("/api/locations/districts")
async def get_available_districts(
    state: str = Query(...),
    limit: int = Query(200, ge=10, le=500),
):
    """Return districts that currently have stories for the selected state."""
    normalized_state = normalize_state_name(state) or state
    rows = await db_fetch(
        """
        SELECT COALESCE(loc_district, loc_city) AS district_name, COUNT(*) AS cnt
        FROM story_clusters
        WHERE loc_state = $1
          AND COALESCE(loc_district, loc_city) IS NOT NULL
          AND BTRIM(COALESCE(loc_district, loc_city)) <> ''
        GROUP BY COALESCE(loc_district, loc_city)
        ORDER BY cnt DESC
        LIMIT $2
        """,
        normalized_state,
        limit,
    )

    aggregated: dict[str, int] = {}
    for r in rows:
        raw_name = r.get("district_name")
        count = int(r.get("cnt") or 0)
        district, district_state = normalize_district_name(raw_name, normalized_state)
        if not district:
            continue
        if district_state and district_state != normalized_state:
            continue
        aggregated[district] = aggregated.get(district, 0) + count

    result = [
        {"district": d, "count": c}
        for d, c in sorted(aggregated.items(), key=lambda x: (-x[1], x[0]))
    ]
    return result

# ─── TRENDING ─────────────────────────────────────────────────────────────────

@app.get("/api/trending")
@limiter.limit("30/minute")
async def get_trending(
    request: Request,
    profession: str = Query("general"),
    loc_state:  Optional[str] = Query(None),
    limit:      int = Query(10, le=20),
):
    """Trending articles — engagement-ranked from article_views with recency weights."""
    params = []
    view_filters = ["av.viewed_at > NOW() - INTERVAL '24 hours'"]
    idx = 1

    if profession and profession != "general":
        view_filters.append(f"av.profession = ${idx}")
        params.append(profession)
        idx += 1
    if loc_state:
        view_filters.append(f"av.loc_state = ${idx}")
        params.append(loc_state)
        idx += 1

    # Recency-weighted trend score:
    # 1h views (x3) + 6h views (x2) + 24h views (x1), with light quality tie-breakers.
    trend_query = f"""
        WITH vw AS (
            SELECT
                av.cluster_id,
                COUNT(*) FILTER (WHERE av.viewed_at > NOW() - INTERVAL '1 hour')  AS views_1h,
                COUNT(*) FILTER (WHERE av.viewed_at > NOW() - INTERVAL '6 hours') AS views_6h,
                COUNT(*) FILTER (WHERE av.viewed_at > NOW() - INTERVAL '24 hours') AS views_24h
            FROM article_views av
            WHERE {' AND '.join(view_filters)}
            GROUP BY av.cluster_id
        )
        SELECT
            c.id,
            c.headline,
            c.domain,
            c.truth_score,
            c.source_count,
            c.first_seen,
            c.professions,
            vw.views_1h,
            vw.views_6h,
            vw.views_24h,
            (
                (vw.views_1h * 3.0) +
                (vw.views_6h * 2.0) +
                (vw.views_24h * 1.0) +
                (c.truth_score * 0.05) +
                (c.source_count * 0.5)
            ) AS trend_score
        FROM vw
        JOIN story_clusters c ON c.id = vw.cluster_id
        WHERE c.status = 'verified'
        ORDER BY trend_score DESC, c.truth_score DESC, c.source_count DESC, c.first_seen DESC
        LIMIT {limit}
    """

    rows = await db_fetch(trend_query, *params)
    if rows:
        return [row_to_dict(r) for r in rows]

    # Fallback for cold-start or no recent views in the selected slice.
    fallback_conditions = ["status='verified'"]
    fb_params = []
    fb_idx = 1
    if profession and profession != "general":
        fallback_conditions.append(f"${fb_idx} = ANY(professions)")
        fb_params.append(profession)
        fb_idx += 1
    if loc_state:
        fallback_conditions.append(f"loc_state = ${fb_idx}")
        fb_params.append(loc_state)
        fb_idx += 1

    fallback_rows = await db_fetch(
        f"""SELECT id, headline, domain, truth_score, source_count, first_seen, professions
            FROM story_clusters
            WHERE {' AND '.join(fallback_conditions)}
            ORDER BY truth_score DESC, source_count DESC, first_seen DESC
            LIMIT {limit}""",
        *fb_params
    )
    return [row_to_dict(r) for r in fallback_rows]

# ─── LIVE BREAKING STREAM (SSE) ─────────────────────────────────────────────

@app.get("/api/live/stream")
@limiter.limit("10/minute")
async def live_stream(
    request: Request,
    domain: Optional[str] = Query(None),
):
    """Server-Sent Events stream of latest verified/developing updates."""

    async def event_generator():
        seen_ids: set[str] = set()
        # Keep an in-memory cursor so reconnects don't replay too much data.
        latest_seen = datetime.now(timezone.utc) - timedelta(minutes=30)

        while True:
            if await request.is_disconnected():
                break

            try:
                params = [latest_seen]
                idx = 2
                filters = ["first_seen >= $1", "status IN ('verified','developing')"]

                if domain:
                    filters.append(f"domain = ${idx}")
                    params.append(domain)
                    idx += 1

                query = f"""
                    SELECT id, headline, summary_brief, truth_score, status,
                           source_count, domain, first_seen,
                           COALESCE(last_updated, first_seen) AS updated_at
                    FROM story_clusters
                    WHERE {' AND '.join(filters)}
                    ORDER BY updated_at DESC
                    LIMIT 25
                """

                rows = await db_fetch(query, *params)
                if rows:
                    newest = max((r["updated_at"] for r in rows if r.get("updated_at")), default=latest_seen)
                    if newest and newest > latest_seen:
                        latest_seen = newest

                for row in rows:
                    row_id = row.get("id")
                    if not row_id:
                        continue
                    if row_id in seen_ids:
                        continue
                    seen_ids.add(row_id)

                    payload = row_to_dict(row)
                    # EventSource client subscribes specifically to "update".
                    yield f"event: update\ndata: {json.dumps(payload, default=str)}\n\n"

                # Keep connection active through proxies/load balancers.
                yield "event: ping\ndata: {\"ok\": true}\n\n"
            except Exception as e:
                log.exception("live stream loop error: %s", e)
                yield "event: ping\ndata: {\"ok\": false}\n\n"

            await asyncio.sleep(5)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

# ─── ARTICLE DETAIL ───────────────────────────────────────────────────────────

@app.get("/api/article/{article_id}")
async def get_article(article_id: str):
    """Full article with deep summary, sources, timeline, terminology."""
    cache_key = f"article:{article_id}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    cluster = await db_fetchrow("SELECT * FROM story_clusters WHERE id = $1", article_id)
    if not cluster:
        raise HTTPException(404, "Article not found")

    result = row_to_dict(cluster)

    # Sources
    sources = await db_fetch(
        "SELECT id, source_domain, original_url, original_title, published_at, source_tier, source_cred "
        "FROM articles WHERE cluster_id = $1 ORDER BY published_at ASC",
        article_id
    )
    result["sources"] = [row_to_dict(r) for r in sources]

    # Story timeline
    timeline = await db_fetch(
        "SELECT id, event_text, event_date, source_name FROM story_events "
        "WHERE cluster_id = $1 ORDER BY event_date ASC",
        article_id
    )

    # Guard against duplicate timeline rows from repeated pipeline retries.
    dedup_timeline = []
    seen_timeline = set()
    for row in timeline:
        row_dict = row_to_dict(row)
        event_text = str(row_dict.get("event_text") or "")
        normalized_text = " ".join(event_text.split()).strip().lower()
        event_date_raw = row_dict.get("event_date")
        event_date_key = str(event_date_raw)[:19] if event_date_raw is not None else ""
        dedup_key = (normalized_text, event_date_key)
        if dedup_key in seen_timeline:
            continue
        seen_timeline.add(dedup_key)
        dedup_timeline.append(row_dict)
    result["timeline"] = dedup_timeline

    # Story connections: nearby clusters in same domain with similar headlines.
    try:
        base_headline = str(cluster.get("headline") or "").strip().lower()
        base_domain = str(cluster.get("domain") or "").strip()
        base_seen = cluster.get("first_seen")
        if base_headline and base_seen:
            linked_rows = await db_fetch(
                """SELECT id, headline, summary_brief, truth_score, status, first_seen,
                          similarity(lower(headline), $2) AS sim
                   FROM story_clusters
                   WHERE id <> $1
                     AND domain = $3
                     AND first_seen BETWEEN $4::timestamptz - INTERVAL '21 days'
                                       AND $4::timestamptz + INTERVAL '21 days'
                     AND (lower(headline) % $2 OR similarity(lower(headline), $2) > 0.20)
                   ORDER BY sim DESC, first_seen DESC
                   LIMIT 8""",
                article_id,
                base_headline[:250],
                base_domain,
                base_seen,
            )
            connections = []
            for row in linked_rows:
                item = row_to_dict(row)
                try:
                    item["similarity"] = round(float(item.get("sim") or 0), 3)
                except Exception:
                    item["similarity"] = 0
                item.pop("sim", None)
                item_first_seen = row.get("first_seen")
                item["relation"] = "follow_up" if (item_first_seen and base_seen and item_first_seen > base_seen) else "background"
                connections.append(item)
            result["story_connections"] = connections
        else:
            result["story_connections"] = []
    except Exception:
        result["story_connections"] = []

    # Translations
    translations = await db_fetch(
        "SELECT language, headline, summary FROM article_translations WHERE cluster_id = $1",
        article_id
    )
    result["translations"] = {r["language"]: row_to_dict(r) for r in translations}

    # Terminology
    terms_row = await db_fetchrow(
        "SELECT schema_json FROM article_seo WHERE cluster_id = $1",
        article_id
    )
    result["seo"] = terms_row["schema_json"] if terms_row else {}

    # Fetch article images (multi-image support)
    try:
        image_rows = await db_fetch(
            "SELECT url, caption, alt_text, position FROM article_images WHERE cluster_id = $1 ORDER BY position ASC",
            article_id
        )
        result["media"] = [{"url": r["url"], "caption": r["caption"] or "", "alt_text": r["alt_text"] or "", "position": r["position"]} for r in image_rows if r["url"]]
    except Exception:
        result["media"] = []

    await redis_client.setex(cache_key, 300, json.dumps(result, default=str))
    return result

# ─── VIEW LOGGING ─────────────────────────────────────────────────────────────

@app.post("/api/article/{article_id}/view")
async def log_view(
    article_id: str,
    profession:  str           = Query("general"),
    loc_country: str           = Query("IN"),
    loc_state:   Optional[str] = Query(None),
):
    """Log article view for trending (no user ID stored — privacy-first)."""
    exists = await db_fetchrow("SELECT 1 FROM story_clusters WHERE id = $1", article_id)
    if not exists:
        # Stale client/article id after resets should not raise FK errors.
        return {"ok": True, "skipped": True, "reason": "cluster_not_found"}

    await db_execute(
        "INSERT INTO article_views (cluster_id, profession, loc_country, loc_state) "
        "VALUES ($1, $2, $3, $4)",
        article_id, profession, loc_country, loc_state
    )
    # Increment trending counters
    await redis_client.zincrby(f"trending:prof:{profession}", 1, article_id)
    await redis_client.zincrby("trending:global", 1, article_id)
    if loc_state:
        await redis_client.zincrby(f"trending:state:{loc_state}", 1, article_id)
    return {"ok": True}

# ─── SEARCH ───────────────────────────────────────────────────────────────────

@app.get("/api/search")
@limiter.limit("30/minute")
async def search(
    request: Request,
    q:          str            = Query(..., min_length=2),
    domain:     Optional[str]  = Query(None),
    profession: Optional[str]  = Query(None),
    loc_state:  Optional[str]  = Query(None),
    exam_tag:   Optional[str]  = Query(None),
    date_from:  Optional[date] = Query(None),
    date_to:    Optional[date] = Query(None),
    limit:      int            = Query(20, le=50),
    offset:     int            = Query(0),
    sort:       str            = Query("relevance"),  # FIX: server-side sort param
):
    """Full-text search with all filters via PostgreSQL tsvector."""
    # Try Elasticsearch first (richer relevance), fallback to PG
    try:
        es_result = await _es_search(q, domain, profession, loc_state, exam_tag, date_from, date_to, limit, offset, sort)
        return es_result
    except Exception as e:
        log.debug(f"Elasticsearch fallback to PostgreSQL for query '{q}': {e}")

    # PostgreSQL full-text fallback
    safe_q = " & ".join(w for w in q.split() if len(w) > 2 and w.isalpha())
    if not safe_q:
        return {"results": [], "query": q, "count": 0}

    rows = await db_fetch(
        """SELECT id, headline, summary_brief, truth_score, status, source_count,
                  domain, professions, exam_tags, loc_state, first_seen, conflict
           FROM story_clusters
           WHERE search_vec @@ to_tsquery('english', $1)
             AND status = 'verified'
             AND ($2::text IS NULL OR domain = $2)
             AND ($3::text IS NULL OR $3 = ANY(professions))
             AND ($4::text IS NULL OR loc_state = $4)
             AND ($5::text IS NULL OR $5 = ANY(exam_tags))
           ORDER BY
             CASE WHEN $8 = 'truth'  THEN truth_score     ELSE 0   END DESC,
             CASE WHEN $8 = 'latest' THEN EXTRACT(EPOCH FROM first_seen) ELSE 0 END DESC,
             ts_rank(search_vec, to_tsquery('english', $1)) DESC,
             truth_score DESC
           LIMIT $6 OFFSET $7""",
        safe_q, domain, profession, loc_state, exam_tag, limit, offset, sort
    )
    return {"results": [row_to_dict(r) for r in rows], "query": q, "count": len(rows)}

async def _es_search(q, domain, profession, loc_state, exam_tag, date_from, date_to, limit, offset, sort):
    """Search via Elasticsearch for better relevance."""
    must = [{"multi_match": {"query": q, "fields": ["headline^3", "summary^1"]}}]
    filters = [{"term": {"status": "verified"}}]
    if domain:     filters.append({"term": {"domain": domain}})
    if profession: filters.append({"term": {"professions": profession}})
    if loc_state:  filters.append({"term": {"loc_state": loc_state}})
    if exam_tag:   filters.append({"term": {"exam_tags": exam_tag}})
    if date_from or date_to:
        rng = {}
        if date_from: rng["gte"] = str(date_from)
        if date_to:   rng["lte"] = str(date_to)
        filters.append({"range": {"first_seen": rng}})

    es_sort = (
        [{"truth_score": "desc"}, {"_score": "desc"}] if sort == "truth"
        else [{"first_seen": "desc"}]                 if sort == "latest"
        else [{"_score": "desc"}, {"truth_score": "desc"}]
    )
    body = {"query": {"bool": {"must": must, "filter": filters}},
            "from": offset, "size": limit,
            "sort": es_sort}

    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(f"{ES_URL}/dhara_articles/_search", json=body)
        resp.raise_for_status()
        hits = resp.json()["hits"]["hits"]
        results = [{"id": h["_id"], **h["_source"]} for h in hits]
        return {"results": results, "query": q, "count": len(results)}

# ─── ARCHIVE ──────────────────────────────────────────────────────────────────

@app.get("/api/archive")
async def get_archive(
    archive_date: date         = Query(..., alias="date"),
    domain:       Optional[str]= Query(None),
    loc_state:    Optional[str]= Query(None),
    limit:        int          = Query(50, le=100),
    offset:       int          = Query(0),
):
    """Date-wise archive — all stories from a specific day."""
    start, end = _ist_day_bounds_utc(archive_date)

    rows = await db_fetch(
        """SELECT id, headline, summary_brief, summary_deep, platform_body, truth_score, status, source_count,
                  domain, loc_state, loc_city,
                  COALESCE(loc_district, loc_city) AS loc_district,
                  COALESCE(LENGTH(platform_body), 0) AS platform_body_length,
                  first_seen, professions, exam_tags
           FROM story_clusters
           WHERE first_seen BETWEEN $1 AND $2
             AND status IN ('verified','developing')
             AND headline IS NOT NULL AND BTRIM(headline) <> ''
             AND summary_brief IS NOT NULL AND BTRIM(summary_brief) <> ''
             AND summary_deep IS NOT NULL
             AND summary_deep::text <> '""'
             AND summary_deep::text <> '{}'
             AND platform_body IS NOT NULL
             AND LENGTH(platform_body) >= 600
             AND ($3::text IS NULL OR domain = $3)
             AND ($4::text IS NULL OR loc_state = $4)
           ORDER BY truth_score DESC, source_count DESC
           LIMIT $5 OFFSET $6""",
        start, end, domain, loc_state, limit, offset
    )
    articles = []
    for row in rows:
        item = row_to_dict(row)
        if not _is_fully_generated_story(item):
            continue
        item.pop("platform_body_length", None)
        item.pop("platform_body", None)
        articles.append(item)
    return {
        "date":     str(archive_date),
        "articles": articles,
        "total":    len(articles)
    }

@app.get("/api/archive/heatmap")
async def get_heatmap(year: int = Query(...), month: int = Query(...)):
    """Calendar heatmap — article count per day for a month."""
    cache_key = f"heatmap:{year}:{month}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    rows = await db_fetch(
        "SELECT * FROM get_monthly_heatmap($1, $2)", year, month
    )
    if not rows:
        # Fallback during warm-up windows where stories are still developing.
        rows = await db_fetch(
            """SELECT DATE_TRUNC('day', first_seen)::DATE AS day_date, COUNT(*) AS article_count
               FROM story_clusters
               WHERE EXTRACT(YEAR FROM first_seen) = $1
                 AND EXTRACT(MONTH FROM first_seen) = $2
                 AND status IN ('verified','developing')
               GROUP BY day_date
               ORDER BY day_date""",
            year, month,
        )
    result = [{"date": str(r["day_date"]), "count": r["article_count"]} for r in rows]
    await redis_client.setex(cache_key, 3600, json.dumps(result))
    return result

# ─── DOMAINS & STATES ────────────────────────────────────────────────────────

@app.get("/api/domains")
async def get_domains():
    """Domains with article counts."""
    cached = await redis_client.get("meta:domains")
    if cached:
        return json.loads(cached)
    rows = await db_fetch(
        "SELECT domain, COUNT(*) AS cnt FROM story_clusters "
        "WHERE status='verified' AND domain IS NOT NULL "
        "GROUP BY domain ORDER BY cnt DESC"
    )
    result = [{"domain": r["domain"], "count": r["cnt"]} for r in rows]
    await redis_client.setex("meta:domains", 3600, json.dumps(result))
    return result

@app.get("/api/states")
async def get_states():
    """Indian states with news coverage."""
    cached = await redis_client.get("meta:states")
    if cached:
        return json.loads(cached)
    rows = await db_fetch(
        "SELECT loc_state, COUNT(*) AS cnt FROM story_clusters "
        "WHERE status='verified' AND loc_state IS NOT NULL "
        "GROUP BY loc_state ORDER BY cnt DESC"
    )
    result = [{"state": r["loc_state"], "count": r["cnt"]} for r in rows]
    await redis_client.setex("meta:states", 3600, json.dumps(result))
    return result

# ─── MORNING BRIEF ───────────────────────────────────────────────────────────

@app.get("/api/morning-brief/{profession}")
async def get_morning_brief(profession: str):
    """Today's morning brief for a profession."""
    now_ist = _now_ist()
    today = now_ist.strftime("%Y-%m-%d")
    day_start_utc, day_end_utc = _ist_day_bounds_utc(now_ist.date())
    cached = await redis_client.get(f"morning_brief:{profession}:{today}")
    if cached:
        return json.loads(cached)
    # Fallback: top 10 today
    rows = await db_fetch(
        """SELECT id, headline, summary_brief, truth_score, domain, first_seen
           FROM story_clusters
                     WHERE status='verified'
                         AND first_seen BETWEEN $2 AND $3
             AND ($1 = ANY(professions) OR $1 = 'general')
           ORDER BY truth_score DESC, source_count DESC
           LIMIT 10""",
        profession, day_start_utc, day_end_utc
    )
    stories = [row_to_dict(r) for r in rows]
    # Also cache this result for 1 hour
    result = {
        "intro": f"Good morning! Here are today's top verified stories for {profession}.",
        "articles": stories,   # frontend expects 'articles'
        "stories": stories,    # backward compat
        "date": today,
    }
    await redis_client.setex(f"morning_brief:{profession}:{today}", 3600, json.dumps(result, default=str))
    return result

# ─── QUARANTINE SECTION ──────────────────────────────────────────────────────

@app.get("/api/quarantine")
async def get_quarantine(limit: int = Query(20, le=50)):
    """Quarantined articles — visible but clearly labeled unverified."""
    rows = await db_fetch(
        "SELECT id, headline, summary_brief, truth_score, source_count, domain, first_seen "
        "FROM story_clusters WHERE status='quarantine' "
        "ORDER BY first_seen DESC LIMIT $1",
        limit
    )
    return [row_to_dict(r) for r in rows]

# ─── USER PROFILE ────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    profession:      Optional[str] = None
    exam_tag:        Optional[str] = None
    default_state:   Optional[str] = None
    language:        Optional[str] = None
    reading_depth:   Optional[str] = None
    email_digest:    Optional[bool] = None
    digest_time:     Optional[str] = None
    notifications:   Optional[bool] = None


class FactCheckRequestBody(BaseModel):
    claim: str


@app.get("/api/today/history")
async def get_today_history(limit: int = Query(6, ge=1, le=20)):
    """On-this-day events for sidebar widget (cached briefly in Redis)."""
    now = _now_ist()
    month = now.month
    day = now.day
    cache_key = f"today:history:{month}:{day}:{limit}"

    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    events = []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{month}/{day}",
                headers={"Accept": "application/json", "User-Agent": "DharaNews/1.0"},
            )
        if resp.status_code == 200:
            data = resp.json()
            for ev in data.get("events", []):
                year = ev.get("year")
                text = str(ev.get("text", "")).strip()
                if year and text:
                    events.append({"year": year, "text": text})
                if len(events) >= limit:
                    break
    except Exception:
        events = []

    result = {
        "date": now.strftime("%d %B"),
        "events": events,
    }
    await redis_client.setex(cache_key, 3600, json.dumps(result))
    return result


@app.get("/api/markets")
async def get_market_quotes():
    """Live market quotes for sidebar widget using Yahoo Finance (no API key)."""
    cache_key = "markets:live"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    symbols = ["^BSESN", "^NSEI", "INR=X", "GC=F"]
    symbol_meta = {
        "^BSESN": {
            "name": "Sensex", "hint": "BSE 30",
            "url": "https://www.bseindia.com/",
        },
        "^NSEI": {
            "name": "Nifty 50", "hint": "NSE 50",
            "url": "https://www.nseindia.com/market-data/live-equity-market",
        },
        "INR=X": {
            "name": "₹/USD", "hint": "FX",
            "url": "https://www.rbi.org.in/home.aspx",
        },
        "GC=F": {
            "name": "Gold", "hint": "Futures",
            "url": "https://www.mcxindia.com/market-data/commodity-market-watch/0/Gold",
        },
    }

    results = []
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0 DharaNews/1.0"}) as client:
            for symbol in symbols:
                meta = symbol_meta[symbol]
                resp = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"interval": "1d", "range": "1d"},
                )
                if resp.status_code != 200:
                    continue
                payload = resp.json()
                chart = (payload.get("chart") or {}).get("result") or []
                if not chart:
                    continue
                qmeta = chart[0].get("meta") or {}
                price = qmeta.get("regularMarketPrice")
                prev = qmeta.get("chartPreviousClose")

                change = None
                change_percent = None
                if isinstance(price, (int, float)) and isinstance(prev, (int, float)) and prev != 0:
                    change = float(price) - float(prev)
                    change_percent = (change / float(prev)) * 100.0

                results.append({
                    "symbol": symbol,
                    "name": meta["name"],
                    "hint": meta["hint"],
                    "url": meta["url"],
                    "price": price,
                    "change": change,
                    "change_percent": change_percent,
                    "currency": qmeta.get("currency"),
                    "as_of": datetime.now(timezone.utc).isoformat(),
                })
    except Exception:
        results = []

    if not results:
        for symbol in symbols:
            meta = symbol_meta[symbol]
            results.append({
                "symbol": symbol,
                "name": meta["name"],
                "hint": meta["hint"],
                "url": meta["url"],
                "price": None,
                "change": None,
                "change_percent": None,
                "currency": None,
                "as_of": datetime.now(timezone.utc).isoformat(),
            })

    await redis_client.setex(cache_key, 60, json.dumps(results, default=str))
    return results


@app.post("/api/factcheck/request")
async def submit_factcheck_request(body: FactCheckRequestBody, request: Request):
    """Collect user fact-check requests (lightweight queue in Redis)."""
    claim = (body.claim or "").strip()
    if len(claim) < 15:
        raise HTTPException(400, "Claim too short")

    item = {
        "id": str(uuid.uuid4()),
        "claim": claim[:1200],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ip": request.client.host if request.client else None,
    }
    await redis_client.lpush("factcheck:requests", json.dumps(item))
    await redis_client.ltrim("factcheck:requests", 0, 999)
    return {"ok": True, "id": item["id"]}

@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str, authorization: str = Header(None)):
    _require_own_user(user_id, authorization)
    row = await db_fetchrow("SELECT * FROM user_profiles WHERE id = $1", user_id)
    if not row:
        raise HTTPException(404, "User not found")
    return row_to_dict(row)

# ── Auth helper ───────────────────────────────────────────────────────────────
# Validates the Supabase-issued Bearer JWT and checks ownership.
# We decode without full signature verification (Supabase signs with RS256 and
# the public key isn't always pinned locally), relying on the `sub` claim match
# as the primary ownership guard.  To enable full RS256 verification, set
# SUPABASE_JWT_SECRET in .env with the JWT secret from the Supabase dashboard.

def _require_own_user(user_id: str, authorization: str = Header(None)):
    """FastAPI dependency — raises 401/403 if the bearer token doesn't match user_id."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authorization header required")
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    try:
        import base64 as _b64
        import time as _time

        def _b64url_decode(raw: str) -> bytes:
            padded = raw + "=" * (-len(raw) % 4)
            return _b64.urlsafe_b64decode(padded.encode("utf-8"))

        # Decode the payload section (middle part) without signature verification
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("malformed JWT")
        header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
        payload_bytes = _b64url_decode(parts[1])
        claims = json.loads(payload_bytes)

        # Validate HS256 signatures when secret is available.
        if jwt_secret:
            alg = str(header.get("alg") or "")
            if alg != "HS256":
                raise HTTPException(status_code=401, detail="Unsupported token algorithm")
            signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
            expected_sig = _b64.urlsafe_b64encode(
                hmac.new(jwt_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
            ).decode("utf-8").rstrip("=")
            if not _secrets.compare_digest(expected_sig, parts[2]):
                raise HTTPException(status_code=401, detail="Invalid token signature")
        elif ENVIRONMENT == "production":
            raise HTTPException(status_code=401, detail="Token verification is not configured")

        sub = claims.get("sub", "")
        exp = claims.get("exp", 0)
        if exp and _time.time() > exp:
            raise HTTPException(status_code=401, detail="Token expired")
        if sub != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return sub
    except HTTPException:
        raise
    except Exception as e:
        log.warning(f"JWT decode failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

# Allowed fields for profile updates — explicit whitelist prevents accidental
# exposure of privileged columns (is_admin, disabled, is_premium, etc.)
_SAFE_PROFILE_FIELDS = {
    "profession", "loc_state", "loc_country", "language",
    "exam_name", "exam_date", "email_digest", "digest_email",
}

@app.patch("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    body: ProfileUpdate,
    _sub: str = Depends(_require_own_user),
):
    updates = {}
    if body.profession    is not None: updates["profession"] = body.profession
    if body.exam_tag      is not None: updates["exam_tag"] = body.exam_tag
    if body.default_state is not None: updates["default_state"] = body.default_state
    if body.language      is not None: updates["language"] = body.language
    if body.reading_depth is not None: updates["reading_depth"] = body.reading_depth
    if body.email_digest  is not None: updates["email_digest"] = body.email_digest
    if body.digest_time   is not None: updates["digest_time"] = body.digest_time
    if body.notifications is not None: updates["notifications"] = body.notifications

    if not updates:
        return {"ok": True, "updated": []}

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = [user_id] + list(updates.values())
    await db_execute(
        f"""UPDATE user_profiles SET {set_clause}, updated_at = NOW()
           WHERE id = $1""",
        *values
    )

    try:
        await redis_client.delete(f"profile:{user_id}")
    except Exception as e:
        log.warning(f"profile cache invalidation failed for {user_id}: {e}")

    return {"ok": True, "updated": list(updates.keys())}

# ─── SAVED ARTICLES ──────────────────────────────────────────────────────────

@app.post("/api/save/{user_id}/{cluster_id}")
async def save_article(
    user_id: str,
    cluster_id: str,
    _sub: str = Depends(_require_own_user),
):
    # Guard against rare auth/profile sync delays so saves do not fail on FK.
    await db_execute(
        "INSERT INTO user_profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
        user_id,
    )
    await db_execute(
        "INSERT INTO saved_articles (user_id, cluster_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        user_id, cluster_id
    )
    return {"ok": True}

@app.get("/api/save/{user_id}/{cluster_id}")
async def is_article_saved(
    user_id: str,
    cluster_id: str,
    _sub: str = Depends(_require_own_user),
):
    row = await db_fetchrow(
        "SELECT 1 FROM saved_articles WHERE user_id = $1 AND cluster_id = $2 LIMIT 1",
        user_id,
        cluster_id,
    )
    return {"saved": bool(row)}

@app.delete("/api/save/{user_id}/{cluster_id}")
async def unsave_article(
    user_id: str,
    cluster_id: str,
    _sub: str = Depends(_require_own_user),
):
    await db_execute(
        "DELETE FROM saved_articles WHERE user_id=$1 AND cluster_id=$2",
        user_id, cluster_id
    )
    return {"ok": True}

@app.get("/api/saves/{user_id}")
async def get_saves(
    user_id: str,
    limit: int = Query(50, le=100),
    _sub: str = Depends(_require_own_user),
):
    rows = await db_fetch(
        """SELECT c.id, c.headline, c.summary_brief, c.domain, c.truth_score,
                  c.first_seen, s.saved_at
           FROM saved_articles s
           JOIN story_clusters c ON c.id = s.cluster_id
           WHERE s.user_id = $1
           ORDER BY s.saved_at DESC LIMIT $2""",
        user_id, limit
    )
    return [row_to_dict(r) for r in rows]

# ─── METRICS (for Grafana) ───────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════════════════
# ADMIN API — Protected by ADMIN_KEY header
# ═══════════════════════════════════════════════════════════════════════════

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
if not ADMIN_KEY or ADMIN_KEY == "dhara-admin-secret":
    log.warning(
        "ADMIN_KEY is missing or insecure; admin routes are disabled until a secure ADMIN_KEY is configured"
    )
    ADMIN_KEY = ""

def require_admin(x_admin_key: str = Header(None)):
    """Dependency: validates admin key from X-Admin-Key header."""
    if not ADMIN_KEY:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_admin_key or not _secrets.compare_digest(x_admin_key, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Key header")
    return True


class CommentCreate(BaseModel):
    user_id: str
    cluster_id: str
    text: str


@app.get("/api/comments/{cluster_id}")
async def get_comments(cluster_id: str, limit: int = Query(50, le=100)):
    rows = await db_fetch(
        """SELECT c.id, c.text, c.created_at,
                  u.id AS user_id,
                  LEFT(u.email, POSITION('@' IN u.email) - 1) AS username
           FROM comments c
           JOIN user_profiles u ON c.user_id = u.id
           WHERE c.cluster_id = $1
             AND c.is_hidden = FALSE
           ORDER BY c.created_at DESC
           LIMIT $2""",
        cluster_id,
        limit,
    )
    return [row_to_dict(r) for r in rows]


@app.post("/api/comments")
async def post_comment(
    body: CommentCreate,
    _sub: str = Depends(_require_own_user),
):
    text = body.text.strip()[:500]
    if not text:
        raise HTTPException(400, "Comment text is required")
    if len(text) < 3:
        raise HTTPException(400, "Comment too short")

    recent = await db_fetchrow(
        """SELECT COUNT(*) AS cnt FROM comments
           WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'""",
        body.user_id,
    )
    if recent and int(recent["cnt"]) >= 5:
        raise HTTPException(429, "Too many comments. Try again in an hour.")

    comment_id = str(uuid.uuid4())
    await db_execute(
        """INSERT INTO comments (id, cluster_id, user_id, text)
           VALUES ($1, $2, $3, $4)""",
        comment_id,
        body.cluster_id,
        body.user_id,
        text,
    )
    await db_execute(
        "UPDATE story_clusters SET last_updated = NOW() WHERE id = $1",
        body.cluster_id,
    )
    return {"ok": True, "id": comment_id}


@app.delete("/api/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    user_id: str = Query(...),
    _sub: str = Depends(_require_own_user),
):
    result = await db_execute(
        "DELETE FROM comments WHERE id = $1 AND user_id = $2",
        comment_id,
        user_id,
    )
    if result == "DELETE 0":
        raise HTTPException(404, "Comment not found or not yours")
    return {"ok": True}


@app.post("/api/admin/comments/{comment_id}/hide")
async def admin_hide_comment(
    comment_id: str,
    _: bool = Depends(require_admin),
):
    await db_execute(
        "UPDATE comments SET is_hidden = TRUE WHERE id = $1",
        comment_id,
    )
    return {"ok": True}


# ─── ADMIN USERS ──────────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_list_users(_: bool = Depends(require_admin)):
    """List registered users for admin management."""
    try:
        rows = await db_fetch("""
            SELECT u.id, u.email, u.profession, u.created_at,
                   COALESCE(u.is_pro, FALSE) AS is_pro,
                   COALESCE(u.disabled, FALSE) AS disabled,
                   EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) AS has_push,
                   (SELECT COUNT(*) FROM saved_articles sa WHERE sa.user_id = u.id) AS save_count
            FROM user_profiles u
            ORDER BY u.created_at DESC
            LIMIT 500
        """)
        users = [row_to_dict(r) for r in rows]
        return {"users": users, "total": len(users)}
    except Exception as e:
        log.warning(f"Admin users error: {e}")
        return {"users": [], "total": 0}

@app.post("/api/admin/users/{user_id}/disable")
async def admin_disable_user(user_id: str, _: bool = Depends(require_admin)):
    """Disable a user account."""
    try:
        await db_execute(
            "UPDATE user_profiles SET disabled = TRUE WHERE id = $1",
            user_id
        )
    except Exception as e:
        # disabled column may not exist yet — run migration
        log.warning(f"Disable user error (may need migration): {e}")
    return {"id": user_id, "disabled": True}


@app.post("/api/admin/users/{user_id}/grant-pro")
async def admin_grant_pro_user(user_id: str, _: bool = Depends(require_admin)):
    """Grant Dhara Pro manually."""
    expires = datetime.now(timezone.utc) + timedelta(days=365)
    await db_execute(
        """UPDATE user_profiles
           SET is_pro = TRUE,
               is_premium = TRUE,
               premium_until = $2
           WHERE id = $1""",
        user_id,
        expires,
    )
    return {"id": user_id, "is_pro": True, "premium_until": expires.isoformat()}


# ─── ADMIN FACT-CHECKS ────────────────────────────────────────────────────────

@app.get("/api/admin/factchecks")
async def admin_list_factchecks(_: bool = Depends(require_admin)):
    """List user-submitted fact-check requests."""
    try:
        rows = await db_fetch("""
            SELECT fr.id, fr.claim, fr.user_id, fr.submitted_at, fr.status, fr.cluster_id,
                   c.headline AS article_headline
            FROM factcheck_requests fr
            LEFT JOIN story_clusters c ON c.id = fr.cluster_id
            ORDER BY fr.submitted_at DESC LIMIT 100
        """)
        return {"items": [row_to_dict(r) for r in rows]}
    except Exception as e:
        log.warning(f"Factcheck list error: {e}")
        # Fall back to Redis queue
        try:
            raw_items = await redis_client.lrange("factcheck:requests", 0, 49)
            items = []
            for raw in raw_items:
                try:
                    d = json.loads(raw)
                    items.append({"id": d.get("id",""), "claim": d.get("claim",""),
                                  "submitted_at": d.get("submitted",""), "status": "pending"})
                except Exception as parse_err:
                    log.debug(f"factcheck redis item parse failed: {parse_err}")
            return {"items": items}
        except Exception as redis_err:
            log.warning(f"factcheck redis fallback failed: {redis_err}")
            return {"items": []}

@app.patch("/api/admin/factchecks/{request_id}")
async def admin_update_factcheck(
    request_id: str,
    request: Request,
    _: bool = Depends(require_admin),
):
    body = await request.json()
    status = body.get("status") or body.get("verdict") or "in_progress"
    try:
        await db_execute(
            "UPDATE factcheck_requests SET status = $2 WHERE id = $1",
            request_id, status
        )
    except Exception as e:
        log.warning(f"Factcheck update error: {e}")
    return {"id": request_id, "status": status, "verdict": status}


# ─── USER DISABLED COLUMN MIGRATION (idempotent) ─────────────────────────────

# NOTE: ensure_user_disabled_column is handled in lifespan startup — on_event removed (deprecated)

@app.get("/api/metrics/pipeline")
async def get_pipeline_metrics():
    """Queue depths and pipeline stats for monitoring dashboard."""
    try:
        depths = await redis_client.hgetall("queue_depths")
    except Exception as e:
        log.warning(f"Pipeline metrics queue depth read failed: {e}")
        depths = {}
    try:
        agent_heartbeats = await redis_client.hgetall("agent:heartbeat")
    except Exception as e:
        log.warning(f"Pipeline metrics heartbeat read failed: {e}")
        agent_heartbeats = {}
    try:
        total = await db_fetchrow("SELECT COUNT(*) AS c FROM story_clusters")
    except Exception as e:
        log.warning(f"Pipeline metrics total count failed: {e}")
        total = None
    try:
        verified = await db_fetchrow("SELECT COUNT(*) AS c FROM story_clusters WHERE status='verified'")
    except Exception as e:
        log.warning(f"Pipeline metrics verified count failed: {e}")
        verified = None
    try:
        today = await db_fetchrow(
            "SELECT COUNT(*) AS c FROM story_clusters WHERE first_seen > NOW() - INTERVAL '24 hours'"
        )
    except Exception as e:
        log.warning(f"Pipeline metrics daily count failed: {e}")
        today = None
    try:
        breaking_active = await db_fetchrow(
            "SELECT COUNT(*) AS c FROM story_clusters WHERE is_breaking = TRUE"
        )
    except Exception as e:
        log.warning(f"Pipeline metrics breaking count failed: {e}")
        breaking_active = None
    return {
        "queue_depths": depths,
        "agent_heartbeats": agent_heartbeats,
        "total_clusters": total["c"] if total else 0,
        "verified": verified["c"] if verified else 0,
        "today": today["c"] if today else 0,
        "breaking_active": breaking_active["c"] if breaking_active else 0,
        "cache_hit_rate": None,
    }

# ─── AUTH / PROFILE UPSERT ───────────────────────────────────────────────────
# Called by frontend after Supabase OAuth login to sync profile to PostgreSQL

class ProfileUpsert(BaseModel):
    id:         str
    email:      Optional[str] = None
    profession: str = "general"
    avatar_url: Optional[str] = None
    full_name:  Optional[str] = None

@app.post("/api/profile/upsert")
async def upsert_profile(body: ProfileUpsert):
    """Creates or updates user profile after login. Called by frontend auth callback."""
    await db_execute(
        """INSERT INTO user_profiles (id, email, profession)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE
           SET email      = COALESCE(EXCLUDED.email, user_profiles.email),
               profession = COALESCE(EXCLUDED.profession, user_profiles.profession)""",
        body.id, body.email, body.profession
    )
    return {"ok": True}

# ─── READING DEPTH PREFERENCE ────────────────────────────────────────────────

@app.post("/api/depth-pref/{user_id}")
async def update_depth_pref(user_id: str, topic: str = Query(...), depth: str = Query(...)):
    """Record that a user read an article at a particular depth."""
    key = f"depth_pref:{user_id}:{topic}"
    raw = await redis_client.get(key)
    prefs = json.loads(raw) if raw else {"headline": 1, "brief": 2, "deep": 1}
    prefs[depth] = prefs.get(depth, 0) + 1
    await redis_client.setex(key, 90 * 24 * 3600, json.dumps(prefs))
    return {"ok": True}

@app.get("/api/depth-pref/{user_id}")
async def get_depth_pref(user_id: str, topic: str = Query("general")):
    """Returns the preferred reading depth for a user+topic."""
    key = f"depth_pref:{user_id}:{topic}"
    raw = await redis_client.get(key)
    if not raw:
        return {"depth": "brief"}
    prefs = json.loads(raw)
    return {"depth": max(prefs, key=prefs.get) if prefs else "brief"}

# ─── BIAS REPORT ─────────────────────────────────────────────────────────────

@app.get("/api/bias-report/latest")
async def get_bias_report():
    """Latest weekly bias report (for editorial transparency)."""
    row = await db_fetchrow(
        "SELECT * FROM bias_reports ORDER BY week_start DESC LIMIT 1"
    )
    if not row:
        return {"message": "No bias report generated yet"}
    data = row_to_dict(row)
    data.setdefault("alert", data.get("alert_triggered"))
    data.setdefault("avg_source_tier", data.get("avg_bias"))
    data.setdefault("avg_truth_score", None)
    return data

# ─── PLATFORM STATS (public) ─────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats():
    """Public platform statistics for the about/transparency page."""
    cached = await redis_client.get("stats:public")
    if cached:
        return json.loads(cached)

    total    = await db_fetchrow("SELECT COUNT(*) AS c FROM story_clusters")
    verified = await db_fetchrow("SELECT COUNT(*) AS c FROM story_clusters WHERE status='verified'")
    sources  = await db_fetchrow("SELECT COUNT(*) AS c FROM sources WHERE active=true")
    today    = await db_fetchrow(
        "SELECT COUNT(*) AS c FROM story_clusters WHERE first_seen > NOW() - INTERVAL '24 hours'"
    )
    quarantine = await db_fetchrow("SELECT COUNT(*) AS c FROM story_clusters WHERE status='quarantine'")

    result = {
        "total_stories":      total["c"]     if total     else 0,
        "verified_stories":   verified["c"]  if verified  else 0,
        "active_sources":     sources["c"]   if sources   else 0,
        "stories_today":      today["c"]     if today     else 0,
        "quarantined":        quarantine["c"]if quarantine else 0,
        "verification_rate":  round(
            (verified["c"] / max(total["c"], 1)) * 100, 1
        ) if total and verified else 0,
    }
    await redis_client.setex("stats:public", 60, json.dumps(result))
    return result

# ── INCLUDE EXTRA ROUTES ─────────────────────────────────────────────────────
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
try:
    from routes.extras import router as extras_router
    app.include_router(extras_router)
except ImportError as e:
    import logging
    logging.getLogger(__name__).warning(f"Could not load extras router: {e}")

try:
    from routes.civic_gov import router as civic_gov_router
    app.include_router(civic_gov_router)
except ImportError as e:
    if ENVIRONMENT == "production":
        raise RuntimeError(f"Failed to load civic_gov router in production: {e}") from e
    logging.getLogger(__name__).warning(f"Could not load civic_gov router: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN API — Protected by ADMIN_KEY header
# ═══════════════════════════════════════════════════════════════════════════



# ─── AI FLASHCARD GENERATION ──────────────────────────────────────────────────

class FlashcardGenRequest(BaseModel):
    user_id:    str
    articles:   list  # [{id, headline, brief, domain, exam_tags}]
    exam_filter: str = "all"

@app.post("/api/flashcards/generate")
async def generate_flashcards(body: FlashcardGenRequest):
    """Generate exam-quality Q&A flashcards using LLM."""
    cards = []
    for art in body.articles[:15]:
        headline = art.get("headline", "")
        brief    = art.get("brief", "")
        domain   = art.get("domain", "general")
        tags     = art.get("exam_tags", [])
        art_id   = art.get("id", "")
        if not headline or not brief:
            continue

        # Determine exam context
        exam_ctx = ""
        if any("upsc_mains_gs1" in t for t in tags): exam_ctx = "UPSC GS Paper 1 (History/Culture/Geography)"
        elif any("upsc_mains_gs2" in t for t in tags): exam_ctx = "UPSC GS Paper 2 (Polity/Governance/IR)"
        elif any("upsc_mains_gs3" in t for t in tags): exam_ctx = "UPSC GS Paper 3 (Economy/Environment/Security)"
        elif any("upsc" in t for t in tags): exam_ctx = "UPSC Civil Services"
        elif any("neet" in t for t in tags): exam_ctx = "NEET (Medical entrance)"
        elif any("jee" in t for t in tags): exam_ctx = "JEE"
        elif any("clat" in t for t in tags): exam_ctx = "CLAT (Law)"

        prompt = f"""You are an expert exam question writer for Indian competitive exams.
Given this verified news item, generate ONE high-quality exam question and answer.
The question should test understanding, analysis, or implications — NOT just recall of the headline.

Headline: {headline}
Summary: {brief}
Domain: {domain}
Exam context: {exam_ctx or "General knowledge"}

Respond in JSON only:
{{"question": "The exam-style question here", "answer": "Clear, complete answer (2-4 sentences)"}}

Make the question analytical, not just "what happened". Ask about implications, significance, constitutional provisions, or policy context where relevant."""

        try:
            from agents.base import BaseAgent
            agent = BaseAgent("flashcard-gen")
            result_text = await agent.llm(prompt, json_mode=True, max_tokens=300)
            if result_text:
                import json as _json
                parsed = _json.loads(result_text.strip().strip("```json").strip("```").strip())
                if parsed.get("question") and parsed.get("answer"):
                    cards.append({
                        "id": art_id, "q": parsed["question"], "a": parsed["answer"],
                        "domain": domain, "tags": tags,
                        "ease": 2.5, "interval": 1, "reps": 0,
                        "due": datetime.now(timezone.utc).isoformat(), "lastQuality": -1,
                    })
                    continue
        except Exception as e:
            log.debug(f"LLM flashcard gen failed: {e}")

        # Fallback: domain-aware question without LLM
        q_templates = {
            "judiciary": f"What were the key legal/constitutional issues in: '{headline}'?",
            "economy":   f"Analyse the economic implications of: '{headline}'",
            "environment": f"What are the environmental policy implications of: '{headline}'?",
            "international": f"Examine India's foreign policy context of: '{headline}'",
            "politics":  f"What governance and polity issues are raised by: '{headline}'?",
            "health":    f"From a public health policy perspective, analyse: '{headline}'",
            "science":   f"What are the scientific/technological implications of: '{headline}'?",
            "defence":   f"Examine the national security implications of: '{headline}'",
        }
        q = q_templates.get(domain, f"Discuss the significance of: '{headline}' in the current context.")
        cards.append({
            "id": art_id, "q": q, "a": brief,
            "domain": domain, "tags": tags,
            "ease": 2.5, "interval": 1, "reps": 0,
            "due": datetime.now(timezone.utc).isoformat(), "lastQuality": -1,
        })

    return {"cards": cards, "generated": len(cards)}

# ─── FLASHCARDS + SPACED REPETITION ──────────────────────────────────────────

@app.get("/api/flashcards/{user_id}")
async def get_flashcards(user_id: str, limit: int = Query(50, le=100)):
    """Return due flashcards for SM-2 spaced repetition review."""
    try:
        rows = await db_fetch(
            """SELECT fp.cluster_id, fp.ease_factor, fp.interval_days, fp.repetitions,
                      fp.due_date, fp.last_quality,
                      c.headline, c.summary_brief, c.domain, c.exam_tags, c.truth_score
               FROM flashcard_progress fp
               JOIN story_clusters c ON c.id = fp.cluster_id
               WHERE fp.user_id = $1
                 AND fp.due_date <= NOW() + INTERVAL '1 day'
               ORDER BY fp.due_date ASC
               LIMIT $2""",
            user_id, limit
        )
        if rows:
            cards = [{"id": str(r["cluster_id"]), "q": r["headline"],
                      "a": r["summary_brief"] or r["headline"],
                      "domain": r["domain"], "tags": r["exam_tags"] or [],
                      "score": r["truth_score"], "ease": r["ease_factor"],
                      "interval": r["interval"], "reps": r["repetitions"],
                      "due": r["due_date"].isoformat() if r["due_date"] else None,
                      "lastQuality": r["last_quality"]} for r in rows]
            return {"cards": cards}
    except Exception as e:
        log.warning(f"Flashcard fetch error: {e}")
    return {"cards": []}

class FlashcardProgress(BaseModel):
    cluster_id: str
    quality:    int   # 0-5

@app.post("/api/flashcards/{user_id}/progress")
async def save_flashcard_progress(user_id: str, body: FlashcardProgress):
    """Save SM-2 review result for a flashcard."""
    q = max(0, min(5, body.quality))
    try:
        # Fetch existing progress
        existing = await db_fetchrow(
            "SELECT ease_factor, interval, repetitions FROM flashcard_progress WHERE user_id=$1 AND cluster_id=$2",
            user_id, body.cluster_id
        )
        if existing:
            ease, interval, reps = existing["ease_factor"], existing["interval_days"], existing["repetitions"]
        else:
            ease, interval, reps = 2.5, 1, 0

        # SM-2 algorithm
        if q >= 3:
            interval = 1 if reps == 0 else (6 if reps == 1 else round(interval * ease))
            reps += 1
        else:
            reps = 0; interval = 1
        ease = max(1.3, ease + 0.1 - (5-q) * (0.08 + (5-q) * 0.02))
        due = datetime.now(timezone.utc) + timedelta(days=interval)

        await db_execute(
            """INSERT INTO flashcard_progress (user_id, cluster_id, ease_factor, interval_days, repetitions, due_date, last_quality)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (user_id, cluster_id) DO UPDATE
               SET ease_factor=$3, interval_days=$4, repetitions=$5, due_date=$6, last_quality=$7""",
            user_id, body.cluster_id, ease, interval, reps, due, q
        )

        # Update streak
        await _update_streak(user_id)
        return {"ok": True, "next_review_days": interval}
    except Exception as e:
        log.warning(f"Flashcard progress error: {e}")
        return {"ok": False}

class FlashcardSync(BaseModel):
    cards: list

@app.post("/api/flashcards/{user_id}/sync")
async def sync_flashcards(user_id: str, body: FlashcardSync):
    """Bulk-insert new flashcard entries (from locally generated cards)."""
    try:
        for card in body.cards[:50]:
            cid = card.get("id")
            if not cid: continue
            await db_execute(
                """INSERT INTO flashcard_progress (user_id, cluster_id, due_date)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (user_id, cluster_id) DO NOTHING""",
                user_id, cid
            )
    except Exception as e:
        log.warning(f"Flashcard sync error: {e}")
    return {"ok": True}

# ─── STREAK TRACKING ──────────────────────────────────────────────────────────

async def _update_streak(user_id: str):
    """Update daily streak. Called whenever a card is reviewed."""
    try:
        today = datetime.now(timezone.utc).date()
        existing = await db_fetchrow("SELECT current_streak, longest_streak, last_activity FROM user_streaks WHERE user_id=$1", user_id)
        if existing:
            last = existing["last_activity"]
            cur  = existing["current_streak"]
            lng  = existing["longest_streak"]
            if last == today:
                return  # already updated today
            elif last == today - timedelta(days=1):
                cur += 1  # consecutive day
            else:
                cur = 1   # streak broken
            lng = max(lng, cur)
            await db_execute("UPDATE user_streaks SET current_streak=$2, longest_streak=$3, last_activity=$4, updated_at=NOW() WHERE user_id=$1",
                             user_id, cur, lng, today)
        else:
            await db_execute("INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity) VALUES ($1,1,1,$2)", user_id, today)
    except Exception as e:
        log.warning(f"Streak update error: {e}")

@app.get("/api/streaks/{user_id}")
async def get_streak(user_id: str):
    try:
        row = await db_fetchrow("SELECT current_streak, longest_streak, last_activity FROM user_streaks WHERE user_id=$1", user_id)
        if row:
            return {"current": row["current_streak"], "longest": row["longest_streak"], "last_date": str(row["last_activity"])}
    except Exception as e:
        log.warning(f"Streak fetch error: {e}")
    return {"current": 0, "longest": 0}

# ─── ANNOTATIONS / HIGHLIGHTS ────────────────────────────────────────────────

class AnnotationCreate(BaseModel):
    cluster_id:    str
    start_char:    int
    end_char:      int
    selected_text: str
    note:          str = ""
    tag:           str = ""   # GS1, GS2, NEET, important

@app.post("/api/annotations/{user_id}")
async def create_annotation(user_id: str, body: AnnotationCreate):
    try:
        import uuid as _uuid
        ann_id = str(_uuid.uuid4())
        await db_execute(
            """INSERT INTO article_annotations (id, user_id, cluster_id, start_char, end_char, selected_text, note, tag)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            ann_id, user_id, body.cluster_id, body.start_char, body.end_char,
            body.selected_text[:500], body.note[:200], body.tag
        )
        return {"id": ann_id, "ok": True}
    except Exception as e:
        log.warning(f"Annotation create error: {e}")
        return {"ok": False}

@app.get("/api/annotations/{user_id}")
async def get_annotations(user_id: str, cluster_id: Optional[str] = Query(None)):
    try:
        if cluster_id:
            rows = await db_fetch(
                "SELECT * FROM article_annotations WHERE user_id=$1 AND cluster_id=$2 ORDER BY start_char",
                user_id, cluster_id
            )
        else:
            rows = await db_fetch(
                """SELECT a.*, c.headline, c.domain FROM article_annotations a
                   JOIN story_clusters c ON c.id = a.cluster_id
                   WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 100""",
                user_id
            )
        return [row_to_dict(r) for r in rows]
    except Exception as e:
        log.warning(f"Annotation fetch error: {e}")
        return []

@app.delete("/api/annotations/{user_id}/{annotation_id}")
async def delete_annotation(user_id: str, annotation_id: str):
    try:
        await db_execute("DELETE FROM article_annotations WHERE id=$1 AND user_id=$2", annotation_id, user_id)
    except Exception as e:
        log.warning(f"Annotation delete error: {e}")
    return {"ok": True}

# ─── EMAIL DIGEST SUBSCRIPTION ───────────────────────────────────────────────

class DigestSubscribe(BaseModel):
    user_id:    str
    email:      str
    profession: str = "general"
    digest_time: str = "07:00"


class PushSubscription(BaseModel):
    user_id: str
    subscription: dict
    profession: str = "general"

@app.post("/api/digest/subscribe")
async def digest_subscribe(body: DigestSubscribe):
    """Subscribe user to daily email digest. Uses Brevo free tier."""
    try:
        await db_execute(
            """INSERT INTO email_preferences (user_id, email, profession, digest_time, digest_enabled)
               VALUES ($1,$2,$3,$4,TRUE)
               ON CONFLICT (user_id) DO UPDATE
               SET email=$2, profession=$3, digest_time=$4, digest_enabled=TRUE""",
            body.user_id, body.email.strip().lower(), body.profession, body.digest_time
        )
        # Also update user_profiles
        await db_execute(
            "UPDATE user_profiles SET email_digest=TRUE, digest_email=$2 WHERE id=$1",
            body.user_id, body.email.strip().lower()
        )
        return {"ok": True, "message": "Subscribed to daily digest"}
    except Exception as e:
        log.warning(f"Digest subscribe error: {e}")
        return {"ok": False, "message": str(e)}

@app.get("/api/digest/unsubscribe")
async def digest_unsubscribe(token: str = Query(...)):
    """One-click unsubscribe via token in email footer."""
    try:
        await db_execute(
            "UPDATE email_preferences SET digest_enabled=FALSE WHERE unsubscribe_token=$1", token
        )
        return {"ok": True, "message": "Unsubscribed successfully"}
    except Exception as e:
        return {"ok": False}
@app.post("/api/push/subscribe")
async def push_subscribe(data: PushSubscription):
    """Store a Web Push subscription for a user."""
    endpoint = data.subscription.get("endpoint", "")
    if not endpoint:
        raise HTTPException(400, "Missing endpoint")
    try:
        await db_execute(
            """INSERT INTO push_subscriptions (endpoint, subscription_json, user_id, profession, created_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (endpoint) DO UPDATE
               SET subscription_json = EXCLUDED.subscription_json,
                   profession = EXCLUDED.profession,
                   user_id = EXCLUDED.user_id""",
            endpoint,
            json.dumps(data.subscription),
            data.user_id,
            data.profession,
        )
    except Exception as e:
        log.warning(f"Push subscribe DB error: {e} — table may not exist yet")
    return {"ok": True}

@app.post("/api/push/unsubscribe")
async def push_unsubscribe(request: Request):
    body = await request.json()
    endpoint = body.get("endpoint", "")
    if endpoint:
        try:
            await db_execute("DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint)
        except Exception as e:
            log.warning(f"push unsubscribe DB error: {e}")
    return {"ok": True}

class ArticleCreate(BaseModel):
    headline:      str
    summary_brief: str = ""
    summary_deep:  str = ""
    platform_body: str = ""
    full_body:     str = ""
    domain:        str = "general"
    professions:   list = []
    exam_tags:     list = []
    loc_country:   str = "IN"
    loc_state:     str = None
    loc_city:      str = None
    loc_district:  str = None
    loc_global:    bool = True
    status:        str = "verified"
    truth_score:   int = 85
    image_url:     str = None
    source_name:   str = "Dhara Editorial"
    source_url:    str = ""
    source_domain: str = "dhara.news"

class ArticleUpdate(BaseModel):
    headline:      str = None
    summary_brief: str = None
    summary_deep:  str = None
    platform_body: str = None
    full_body:     str = None
    domain:        str = None
    professions:   list = None
    exam_tags:     list = None
    loc_country:   str = None
    loc_state:     str = None
    loc_city:      str = None
    loc_district:  str = None
    loc_global:    bool = None
    status:        str = None
    truth_score:   int = None
    image_url:     str = None
    source_domain: str = None
    source_name:   str = None
    source_url:    str = None


class ArticleSourceItem(BaseModel):
    id: Optional[str] = None
    source_domain: str
    original_url: str
    original_title: str = ""
    published_at: Optional[datetime] = None
    source_tier: Optional[int] = 3
    source_cred: Optional[float] = 0.5


class ArticleTimelineItem(BaseModel):
    id: Optional[str] = None
    event_text: str
    event_date: datetime
    source_name: Optional[str] = None


class ArticleSourcesUpdate(BaseModel):
    sources: list[ArticleSourceItem]


class ArticleTimelineUpdate(BaseModel):
    timeline: list[ArticleTimelineItem]


class BreakingToggle(BaseModel):
    is_breaking: bool
    reason: Optional[str] = None


class SourceCreate(BaseModel):
    domain: str
    name: str = ""
    tier: int = 3
    cred_score: float = 0.5
    crawl_type: str = "rss"
    feed_url: Optional[str] = None
    category: Optional[str] = None
    wire_source: Optional[str] = None
    ownership_chain: Optional[str] = None
    language: str = "en"
    country: str = "IN"
    active: bool = True


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    tier: Optional[int] = None
    cred_score: Optional[float] = None
    crawl_type: Optional[str] = None
    feed_url: Optional[str] = None
    category: Optional[str] = None
    wire_source: Optional[str] = None
    ownership_chain: Optional[str] = None
    language: Optional[str] = None
    country: Optional[str] = None
    active: Optional[bool] = None

# ── CREATE article ──────────────────────────────────────────────────────────
@app.post("/api/admin/articles")
async def admin_create_article(
    body: ArticleCreate,
    _: bool = Depends(require_admin),
):
    """Create an original article. Bypasses the agent pipeline."""
    import uuid as _uuid
    cluster_id = str(_uuid.uuid4())
    platform_body = (body.platform_body or body.full_body or "").strip()
    source_domain = (body.source_domain or "dhara.news").strip() or "dhara.news"

    await db_execute("""
        INSERT INTO story_clusters
            (id, headline, summary_brief, summary_deep, platform_body,
             truth_score, source_count, status, domain, professions,
             exam_tags, loc_country, loc_state, loc_city, loc_district, loc_global,
             image_url, first_seen, last_updated)
        VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
    """,
        cluster_id,
        body.headline.strip(),
        body.summary_brief.strip(),
        body.summary_deep.strip(),
        platform_body,
        body.truth_score,
        body.status,
        body.domain,
        body.professions or ["general"],
        body.exam_tags or [],
        body.loc_country,
        body.loc_state,
        body.loc_city,
        body.loc_district,
        body.loc_global,
        body.image_url,
    )

    # Add editorial source record
    if body.source_name:
        art_id = str(_uuid.uuid4())
        await db_execute("""
            INSERT INTO articles
                (id, cluster_id, source_domain, original_url, original_title,
                 original_body, source_tier, source_cred)
            VALUES ($1,$2,$3,$4,$5,$6,1,1.0)
            ON CONFLICT (original_url) DO NOTHING
        """,
            art_id, cluster_id,
            source_domain,
            body.source_url or f"https://dhara.news/article/{cluster_id}",
            body.headline,
            platform_body or body.summary_brief or body.headline,
        )

    # Invalidate feed pages so new editorial items appear immediately.
    await invalidate_feed_cache()
    await redis_client.delete(f"article:{cluster_id}")
    await log_pipeline_event(
        "create",
        cluster_id=cluster_id,
        actor="admin",
        new_value=body.status,
        reason="manual_article_create",
    )

    return {"id": cluster_id, "status": "created", "url": f"/article/{cluster_id}"}

# ── UPDATE / EDIT article ───────────────────────────────────────────────────
@app.patch("/api/admin/articles/{article_id}")
async def admin_update_article(
    article_id: str,
    body: ArticleUpdate,
    _: bool = Depends(require_admin),
):
    """Edit any field of an existing article."""
    # Build SET clause dynamically from non-None fields
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "full_body" in updates and "platform_body" not in updates:
        updates["platform_body"] = updates["full_body"]
    updates.pop("full_body", None)
    updates.pop("source_domain", None)
    updates.pop("source_name", None)
    updates.pop("source_url", None)
    if not updates:
        raise HTTPException(400, "No fields to update")

    set_parts = []
    params = [article_id]
    for i, (col, val) in enumerate(updates.items(), start=2):
        set_parts.append(f"{col} = ${i}")
        params.append(val)
    set_parts.append("last_updated = NOW()")

    rows = await db_fetch(
        f"UPDATE story_clusters SET {', '.join(set_parts)} WHERE id = $1 RETURNING id",
        *params
    )
    if not rows:
        raise HTTPException(404, "Article not found")

    # Bust caches
    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()
    await log_pipeline_event(
        "update",
        cluster_id=article_id,
        actor="admin",
        new_value=",".join(sorted(updates.keys())),
        reason="manual_article_edit",
    )

    return {"id": article_id, "status": "updated", "fields": list(updates.keys())}


@app.patch("/api/admin/articles/{article_id}/sources")
async def admin_update_article_sources(
    article_id: str,
    body: ArticleSourcesUpdate,
    _: bool = Depends(require_admin),
):
    """Replace/edit article sources for a cluster."""
    exists = await db_fetchrow("SELECT 1 FROM story_clusters WHERE id = $1", article_id)
    if not exists:
        raise HTTPException(404, "Article not found")

    existing = await db_fetch("SELECT id FROM articles WHERE cluster_id = $1", article_id)
    existing_ids = {str(r["id"]) for r in existing}
    keep_ids = set()

    for item in body.sources:
        source_domain = (item.source_domain or "").strip()
        original_url = (item.original_url or "").strip()
        original_title = (item.original_title or "").strip()
        if not source_domain or not original_url:
            raise HTTPException(400, "Each source must include source_domain and original_url")

        source_id = str(item.id).strip() if item.id else str(uuid.uuid4())
        keep_ids.add(source_id)
        if source_id in existing_ids:
            await db_execute(
                """UPDATE articles
                   SET source_domain = $2,
                       original_url = $3,
                       original_title = $4,
                       published_at = $5,
                       source_tier = $6,
                       source_cred = $7
                   WHERE id = $1 AND cluster_id = $8""",
                source_id,
                source_domain,
                original_url,
                original_title,
                item.published_at,
                item.source_tier if item.source_tier is not None else 3,
                item.source_cred if item.source_cred is not None else 0.5,
                article_id,
            )
        else:
            await db_execute(
                """INSERT INTO articles
                       (id, cluster_id, source_domain, original_url, original_title, published_at, source_tier, source_cred)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                source_id,
                article_id,
                source_domain,
                original_url,
                original_title,
                item.published_at,
                item.source_tier if item.source_tier is not None else 3,
                item.source_cred if item.source_cred is not None else 0.5,
            )

    remove_ids = [rid for rid in existing_ids if rid not in keep_ids]
    if remove_ids:
        placeholders = ",".join(f"${i + 2}" for i in range(len(remove_ids)))
        await db_execute(
            f"DELETE FROM articles WHERE cluster_id = $1 AND id IN ({placeholders})",
            article_id,
            *remove_ids,
        )

    count_row = await db_fetchrow("SELECT COUNT(*) AS c FROM articles WHERE cluster_id = $1", article_id)
    await db_execute(
        "UPDATE story_clusters SET source_count = $2, last_updated = NOW() WHERE id = $1",
        article_id,
        int(count_row["c"]) if count_row else 0,
    )

    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()
    await log_pipeline_event(
        "sources_update",
        cluster_id=article_id,
        actor="admin",
        new_value=str(len(body.sources)),
        reason="manual_sources_edit",
    )
    return {"id": article_id, "status": "sources_updated", "count": len(body.sources)}


@app.patch("/api/admin/articles/{article_id}/timeline")
async def admin_update_article_timeline(
    article_id: str,
    body: ArticleTimelineUpdate,
    _: bool = Depends(require_admin),
):
    """Replace/edit article timeline events for a cluster."""
    exists = await db_fetchrow("SELECT 1 FROM story_clusters WHERE id = $1", article_id)
    if not exists:
        raise HTTPException(404, "Article not found")

    existing = await db_fetch("SELECT id FROM story_events WHERE cluster_id = $1", article_id)
    existing_ids = {str(r["id"]) for r in existing}
    keep_ids = set()

    for item in body.timeline:
        event_text = (item.event_text or "").strip()
        if not event_text:
            raise HTTPException(400, "Timeline event_text is required")

        event_id = str(item.id).strip() if item.id else str(uuid.uuid4())
        keep_ids.add(event_id)
        if event_id in existing_ids:
            await db_execute(
                """UPDATE story_events
                   SET event_text = $2,
                       event_date = $3,
                       source_name = $4
                   WHERE id = $1 AND cluster_id = $5""",
                event_id,
                event_text,
                item.event_date,
                (item.source_name or "").strip() or None,
                article_id,
            )
        else:
            await db_execute(
                """INSERT INTO story_events
                       (id, cluster_id, event_text, event_date, source_name)
                   VALUES ($1, $2, $3, $4, $5)""",
                event_id,
                article_id,
                event_text,
                item.event_date,
                (item.source_name or "").strip() or None,
            )

    remove_ids = [rid for rid in existing_ids if rid not in keep_ids]
    if remove_ids:
        placeholders = ",".join(f"${i + 2}" for i in range(len(remove_ids)))
        await db_execute(
            f"DELETE FROM story_events WHERE cluster_id = $1 AND id IN ({placeholders})",
            article_id,
            *remove_ids,
        )

    await db_execute(
        "UPDATE story_clusters SET last_updated = NOW() WHERE id = $1",
        article_id,
    )
    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()
    await log_pipeline_event(
        "timeline_update",
        cluster_id=article_id,
        actor="admin",
        new_value=str(len(body.timeline)),
        reason="manual_timeline_edit",
    )
    return {"id": article_id, "status": "timeline_updated", "count": len(body.timeline)}

# ── DELETE article ──────────────────────────────────────────────────────────
@app.delete("/api/admin/articles/{article_id}")
async def admin_delete_article(
    article_id: str,
    _: bool = Depends(require_admin),
):
    """Permanently delete an article and all associated data."""
    rows = await db_fetch(
        "SELECT id FROM story_clusters WHERE id = $1", article_id
    )
    if not rows:
        raise HTTPException(404, "Article not found")
    await log_pipeline_event(
        "delete",
        cluster_id=article_id,
        actor="admin",
        reason="manual_article_delete",
    )

    # Delete in correct FK order
    await db_execute("DELETE FROM story_events       WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM article_views       WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM article_translations WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM article_seo         WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM saved_articles       WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM claims               WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM articles             WHERE cluster_id = $1", article_id)
    await db_execute("DELETE FROM story_clusters       WHERE id = $1",         article_id)

    # Bust caches
    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()

    return {"id": article_id, "status": "deleted"}

# ── QUARANTINE / CHANGE STATUS ──────────────────────────────────────────────
@app.post("/api/admin/articles/{article_id}/status")
async def admin_set_status(
    article_id: str,
    status: str = Query(..., pattern="^(verified|developing|quarantine|satire)$"),
    _: bool = Depends(require_admin),
):
    """Change article status: verified / developing / quarantine / satire."""
    before = await db_fetchrow(
        "SELECT status FROM story_clusters WHERE id = $1",
        article_id,
    )
    rows = await db_fetch(
        "UPDATE story_clusters SET status=$2, last_updated=NOW() WHERE id=$1 RETURNING id",
        article_id, status
    )
    if not rows:
        raise HTTPException(404, "Article not found")
    await log_pipeline_event(
        "status_change",
        cluster_id=article_id,
        actor="admin",
        old_value=str(before["status"]) if before else None,
        new_value=status,
        reason="manual_status_update",
    )
    previous_status = str(before["status"]) if before and before.get("status") is not None else None
    if status in {"quarantine", "satire"} and previous_status != status:
        await apply_source_reliability_update(
            article_id,
            was_correct=False,
            actor="admin",
            reason=f"status->{status}",
        )
        await set_breaking_state(
            article_id,
            False,
            actor="admin",
            reason=f"status->{status}",
        )
    elif status == "verified" and previous_status != "verified":
        await apply_source_reliability_update(
            article_id,
            was_correct=True,
            actor="admin",
            reason="status->verified",
        )
    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()
    return {"id": article_id, "status": status}

# ── LIST all articles (admin view) ──────────────────────────────────────────
@app.get("/api/admin/articles")
async def admin_list_articles(
    status:  str = Query(None),
    domain:  str = Query(None),
    article_id: str = Query(None),
    q:       str = Query(None),
    limit:   int = Query(50, le=200),
    offset:  int = Query(0),
    _: bool = Depends(require_admin),
):
    """List articles with all metadata for admin review."""
    conditions = []
    params = []
    idx = 1
    if status:
        conditions.append(f"status = ${idx}"); params.append(status); idx += 1
    if domain:
        conditions.append(f"domain = ${idx}"); params.append(domain); idx += 1
    if article_id:
        conditions.append(f"id = ${idx}")
        params.append(article_id.strip())
        idx += 1
    if q:
        conditions.append(f"(headline ILIKE ${idx} OR summary_brief ILIKE ${idx} OR id::text ILIKE ${idx})")
        params.append(f"%{q.strip()}%")
        idx += 1
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    try:
        rows = await db_fetch(
            f"""SELECT id, headline, status, domain, truth_score, source_count,
                       professions, first_seen, image_url,
                       article_probability, article_uncertainty, n_eff,
                       label_reason, is_breaking, breaking_at
                FROM story_clusters
                {where}
                ORDER BY first_seen DESC
                LIMIT {limit} OFFSET {offset}""",
            *params
        )
    except Exception as e:
        log.warning(f"Admin articles extended query failed, falling back: {e}")
        rows = await db_fetch(
            f"""SELECT id, headline, status, domain, truth_score, source_count,
                       professions, first_seen, image_url,
                       NULL::float AS article_probability,
                       NULL::float AS article_uncertainty,
                       NULL::float AS n_eff,
                       NULL::text AS label_reason,
                       FALSE AS is_breaking,
                       NULL::timestamptz AS breaking_at
                FROM story_clusters
                {where}
                ORDER BY first_seen DESC
                LIMIT {limit} OFFSET {offset}""",
            *params
        )
    total = await db_fetchrow(
        f"SELECT COUNT(*) AS c FROM story_clusters {where}", *params
    )
    return {"total": total["c"] if total else 0, "articles": [row_to_dict(r) for r in rows]}

# ── ADMIN STATS ─────────────────────────────────────────────────────────────
@app.get("/api/admin/stats")
async def admin_stats(_: bool = Depends(require_admin)):
    """Full platform stats for admin dashboard."""
    try:
        rows = await db_fetch("""
            SELECT status, COUNT(*) AS cnt FROM story_clusters GROUP BY status
        """)
        by_status = {r["status"]: r["cnt"] for r in rows}
    except Exception as e:
        log.warning(f"Admin stats status query failed: {e}")
        by_status = {}

    try:
        domain_rows = await db_fetch("""
            SELECT domain, COUNT(*) AS cnt FROM story_clusters
            GROUP BY domain ORDER BY cnt DESC LIMIT 10
        """)
    except Exception as e:
        log.warning(f"Admin stats domain query failed: {e}")
        domain_rows = []

    try:
        queue_depths = await redis_client.hgetall("queue_depths") or {}
    except Exception as e:
        log.warning(f"Admin stats queue depth read failed: {e}")
        queue_depths = {}
    try:
        breaking_active = await db_fetchrow(
            "SELECT COUNT(*) AS c FROM story_clusters WHERE is_breaking = TRUE"
        )
    except Exception as e:
        log.warning(f"Admin stats breaking count failed: {e}")
        breaking_active = None
    total_count = sum(by_status.values())

    return {
        "by_status":    by_status,
        "total":        total_count,
        "by_domain":    [{"domain": r["domain"], "count": r["cnt"]} for r in domain_rows],
        "queue_depths": queue_depths,
        "breaking_active": breaking_active["c"] if breaking_active else 0,
        "verification_rate": round(((by_status.get("verified", 0) / max(total_count, 1)) * 100), 1),
    }


@app.get("/api/admin/config")
async def admin_get_config(_: bool = Depends(require_admin)):
    return await load_admin_config()


@app.patch("/api/admin/config")
async def admin_update_config(
    request: Request,
    _: bool = Depends(require_admin),
):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "Expected a JSON object of config values")

    updates = {
        str(k): str(v)
        for k, v in body.items()
        if k in ADMIN_CONFIG_DEFAULTS and v is not None
    }
    if not updates:
        raise HTTPException(400, "No valid config keys provided")

    for key, value in updates.items():
        await db_execute(
            """INSERT INTO admin_config (key, value, description, updated_at, updated_by)
               VALUES ($1, $2, $3, NOW(), 'admin')
               ON CONFLICT (key) DO UPDATE
               SET value = EXCLUDED.value,
                   updated_at = NOW(),
                   updated_by = 'admin'""",
            key,
            value,
            None,
        )

    try:
        await redis_client.delete("admin:config")
    except Exception as e:
        log.warning(f"admin config cache clear failed: {e}")
    await log_pipeline_event(
        "config_update",
        actor="admin",
        new_value=",".join(sorted(updates.keys())),
        reason="admin_config_patch",
    )
    return await load_admin_config()


@app.get("/api/admin/breaking")
async def admin_list_breaking(_: bool = Depends(require_admin)):
    try:
        rows = await db_fetch(
            """SELECT id, headline, truth_score, source_count, domain, status,
                      is_breaking, breaking_at, first_seen
               FROM story_clusters
               WHERE is_breaking = TRUE
                  OR first_seen >= NOW() - INTERVAL '6 hours'
               ORDER BY is_breaking DESC, COALESCE(breaking_at, first_seen) DESC
               LIMIT 100"""
        )
    except Exception as e:
        log.warning(f"Admin breaking extended query failed, falling back: {e}")
        rows = await db_fetch(
            """SELECT id, headline, truth_score, source_count, domain, status,
                      FALSE AS is_breaking,
                      NULL::timestamptz AS breaking_at,
                      first_seen
               FROM story_clusters
               WHERE first_seen >= NOW() - INTERVAL '6 hours'
               ORDER BY first_seen DESC
               LIMIT 100"""
        )
    return {"articles": [row_to_dict(r) for r in rows]}


@app.post("/api/admin/articles/{article_id}/breaking")
async def admin_set_breaking(
    article_id: str,
    body: BreakingToggle,
    _: bool = Depends(require_admin),
):
    row = await db_fetchrow(
        "SELECT id, is_breaking FROM story_clusters WHERE id = $1",
        article_id,
    )
    if not row:
        raise HTTPException(404, "Article not found")

    await set_breaking_state(
        article_id,
        body.is_breaking,
        actor="admin",
        reason=body.reason or "manual_breaking_override",
    )
    await redis_client.delete(f"article:{article_id}")
    await invalidate_feed_cache()
    return {"id": article_id, "is_breaking": body.is_breaking}


@app.get("/api/admin/sources")
async def admin_list_sources(_: bool = Depends(require_admin)):
    try:
        rows = await db_fetch(
            """SELECT id, domain, name, tier, cred_score, COALESCE(crawl_type, 'rss') AS crawl_type,
                      feed_url, language, country,
                      category, active, ownership_chain, wire_source,
                      correction_rate, last_accuracy_update, created_at
               FROM sources
               ORDER BY active DESC, tier ASC, domain ASC"""
        )
    except Exception as e:
        log.warning(f"Admin sources extended query failed, falling back: {e}")
        rows = await db_fetch(
            """SELECT id, domain, name, tier, cred_score,
                      CASE WHEN feed_url IS NOT NULL AND btrim(feed_url) <> '' THEN 'rss' ELSE 'html' END AS crawl_type,
                      feed_url, language, country,
                      category, active,
                      NULL::text AS ownership_chain,
                      NULL::text AS wire_source,
                      NULL::float AS correction_rate,
                      NULL::timestamptz AS last_accuracy_update,
                      created_at
               FROM sources
               ORDER BY active DESC, tier ASC, domain ASC"""
        )
    data = [row_to_dict(r) for r in rows]
    return {"sources": data, "total": len(data)}


@app.post("/api/admin/sources")
async def admin_create_source(
    body: SourceCreate,
    _: bool = Depends(require_admin),
):
    crawl_type = (body.crawl_type or "rss").strip().lower()
    if crawl_type not in {"rss", "html"}:
        raise HTTPException(400, "crawl_type must be either 'rss' or 'html'")

    try:
        row = await db_fetchrow(
            """INSERT INTO sources
                   (domain, name, tier, cred_score, crawl_type, feed_url, language, country, category, active,
                    ownership_chain, wire_source)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
               ON CONFLICT (domain) DO UPDATE
               SET name = EXCLUDED.name,
                   tier = EXCLUDED.tier,
                   cred_score = EXCLUDED.cred_score,
                   crawl_type = EXCLUDED.crawl_type,
                   feed_url = EXCLUDED.feed_url,
                   language = EXCLUDED.language,
                   country = EXCLUDED.country,
                   category = EXCLUDED.category,
                   active = EXCLUDED.active,
                   ownership_chain = EXCLUDED.ownership_chain,
                   wire_source = EXCLUDED.wire_source
               RETURNING id, domain, name, tier, cred_score, COALESCE(crawl_type, 'rss') AS crawl_type,
                         feed_url, language, country, category, active, ownership_chain, wire_source,
                         correction_rate, last_accuracy_update, created_at""",
            body.domain.strip().lower(),
            body.name.strip(),
            body.tier,
            body.cred_score,
            crawl_type,
            body.feed_url,
            body.language,
            body.country,
            body.category,
            body.active,
            body.ownership_chain,
            body.wire_source,
        )
    except Exception as e:
        log.warning(f"Admin source create query (with crawl_type) failed, falling back: {e}")
        row = await db_fetchrow(
            """INSERT INTO sources
                   (domain, name, tier, cred_score, feed_url, language, country, category, active,
                    ownership_chain, wire_source)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (domain) DO UPDATE
               SET name = EXCLUDED.name,
                   tier = EXCLUDED.tier,
                   cred_score = EXCLUDED.cred_score,
                   feed_url = EXCLUDED.feed_url,
                   language = EXCLUDED.language,
                   country = EXCLUDED.country,
                   category = EXCLUDED.category,
                   active = EXCLUDED.active,
                   ownership_chain = EXCLUDED.ownership_chain,
                   wire_source = EXCLUDED.wire_source
               RETURNING id, domain, name, tier, cred_score,
                         CASE WHEN feed_url IS NOT NULL AND btrim(feed_url) <> '' THEN 'rss' ELSE 'html' END AS crawl_type,
                         feed_url, language, country, category, active, ownership_chain, wire_source,
                         correction_rate, last_accuracy_update, created_at""",
            body.domain.strip().lower(),
            body.name.strip(),
            body.tier,
            body.cred_score,
            body.feed_url,
            body.language,
            body.country,
            body.category,
            body.active,
            body.ownership_chain,
            body.wire_source,
        )
    try:
        await redis_client.delete(f"src_meta:{body.domain.strip().lower()}")
    except Exception as e:
        log.warning(f"source metadata cache clear failed for {body.domain.strip().lower()}: {e}")
    await log_pipeline_event(
        "source_add",
        actor="admin",
        new_value=body.domain.strip().lower(),
        reason="manual_source_create",
    )
    return row_to_dict(row) if row else {"ok": True}


@app.patch("/api/admin/sources/{source_id}")
async def admin_update_source(
    source_id: str,
    body: SourceUpdate,
    _: bool = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "crawl_type" in updates:
        crawl_type = str(updates["crawl_type"] or "").strip().lower()
        if crawl_type not in {"rss", "html"}:
            raise HTTPException(400, "crawl_type must be either 'rss' or 'html'")
        updates["crawl_type"] = crawl_type

    current = await db_fetchrow(
        "SELECT id, domain, active FROM sources WHERE id = $1",
        source_id,
    )
    if not current:
        raise HTTPException(404, "Source not found")

    set_parts = []
    params = [source_id]
    for i, (col, val) in enumerate(updates.items(), start=2):
        set_parts.append(f"{col} = ${i}")
        params.append(val)

    try:
        row = await db_fetchrow(
            f"""UPDATE sources SET {', '.join(set_parts)}
                WHERE id = $1
                RETURNING id, domain, name, tier, cred_score, COALESCE(crawl_type, 'rss') AS crawl_type,
                          feed_url, language, country,
                          category, active, ownership_chain, wire_source,
                          correction_rate, last_accuracy_update, created_at""",
            *params
        )
    except Exception as e:
        if "crawl_type" not in updates:
            raise
        log.warning(f"Admin source update query (with crawl_type) failed, retrying without crawl_type: {e}")
        updates.pop("crawl_type", None)
        if not updates:
            row = await db_fetchrow(
                """SELECT id, domain, name, tier, cred_score,
                          CASE WHEN feed_url IS NOT NULL AND btrim(feed_url) <> '' THEN 'rss' ELSE 'html' END AS crawl_type,
                          feed_url, language, country,
                          category, active, ownership_chain, wire_source,
                          correction_rate, last_accuracy_update, created_at
                   FROM sources WHERE id = $1""",
                source_id,
            )
        else:
            set_parts = []
            params = [source_id]
            for i, (col, val) in enumerate(updates.items(), start=2):
                set_parts.append(f"{col} = ${i}")
                params.append(val)
            row = await db_fetchrow(
                f"""UPDATE sources SET {', '.join(set_parts)}
                    WHERE id = $1
                    RETURNING id, domain, name, tier, cred_score,
                              CASE WHEN feed_url IS NOT NULL AND btrim(feed_url) <> '' THEN 'rss' ELSE 'html' END AS crawl_type,
                              feed_url, language, country,
                              category, active, ownership_chain, wire_source,
                              correction_rate, last_accuracy_update, created_at""",
                *params
            )
    domain = str(current["domain"])
    try:
        await redis_client.delete(f"src_meta:{domain}")
        keys = [k async for k in redis_client.scan_iter(match=f"src_prior:{domain}:*")]
        if keys:
            await redis_client.delete(*keys)
    except Exception as e:
        log.warning(f"source cache clear failed for {domain}: {e}")
    if "active" in updates:
        await log_pipeline_event(
            "source_pause" if not updates["active"] else "source_resume",
            actor="admin",
            new_value=domain,
            reason="manual_source_toggle",
        )
    return row_to_dict(row) if row else {"ok": True}


@app.post("/api/admin/cache/flush")
async def admin_flush_cache(_: bool = Depends(require_admin)):
    await invalidate_feed_cache()
    return {"ok": True}


@app.post("/api/admin/articles/purge-quarantine")
async def admin_purge_quarantine(_: bool = Depends(require_admin)):
    cfg = await load_admin_config()
    max_age_days = _safe_int(cfg.get("max_quarantine_age_days"), 7)
    rows = await db_fetch(
        """SELECT id FROM story_clusters
           WHERE status = 'quarantine'
             AND first_seen < NOW() - ($1::int * INTERVAL '1 day')""",
        max_age_days,
    )
    ids = [str(r["id"]) for r in rows]
    if ids:
        await db_execute(
            "DELETE FROM story_clusters WHERE id = ANY($1::uuid[])",
            ids,
        )
        await invalidate_feed_cache()
    await log_pipeline_event(
        "purge_quarantine",
        actor="admin",
        new_value=str(len(ids)),
        reason=f"older_than_{max_age_days}_days",
    )
    return {"deleted": len(ids), "ids": ids}


@app.post("/api/admin/rescore")
async def admin_rescore_articles(_: bool = Depends(require_admin)):
    cfg = await load_admin_config()
    p_verified_default = _safe_float(cfg.get("p_verified_default"), P_VERIFIED_DEFAULT)
    p_verified_high_stakes = _safe_float(cfg.get("p_verified_high_stakes"), P_VERIFIED_HIGH_STAKES)
    n_eff_default = _safe_float(cfg.get("n_eff_verified_default"), N_EFF_VERIFIED_DEFAULT)
    n_eff_high_stakes = _safe_float(cfg.get("n_eff_high_stakes"), N_EFF_VERIFIED_HIGH_STAKES)
    single_source_exception_min_p = _safe_float(
        cfg.get("single_source_exception_min_p"),
        SINGLE_SOURCE_EXCEPTION_MIN_P,
    )

    rows = await db_fetch(
        """SELECT c.id, c.article_probability, c.n_eff, c.domain, c.conflict,
                  c.status, c.source_count,
                  (
                    SELECT a.source_domain
                    FROM articles a
                    WHERE a.cluster_id = c.id
                    ORDER BY COALESCE(a.source_cred, 0) DESC,
                             a.published_at ASC NULLS LAST,
                                                         a.fetched_at ASC NULLS LAST
                    LIMIT 1
                  ) AS primary_source_domain
           FROM story_clusters c
           WHERE c.article_probability IS NOT NULL
           ORDER BY c.last_updated DESC
           LIMIT 1000"""
    )

    updated = 0
    for row in rows:
        article_p = float(row["article_probability"] or 0.0)
        n_eff = float(row["n_eff"] or 0.0)
        domain = str(row["domain"] or "general").lower()
        has_contradiction = bool(row["conflict"])
        source_count = int(row.get("source_count") or 0)
        primary_source_domain = str(row.get("primary_source_domain") or "")

        new_status, reason = _assign_label(
            article_p,
            n_eff,
            domain,
            has_contradiction,
            0.0,
            source_count=source_count,
            primary_source_domain=primary_source_domain,
            p_verified_default=p_verified_default,
            p_verified_high_stakes=p_verified_high_stakes,
            n_eff_verified_default=n_eff_default,
            n_eff_high_stakes=n_eff_high_stakes,
            single_source_exception_min_p=single_source_exception_min_p,
        )

        score = probability_to_truth_score(article_p)
        await db_execute(
            """UPDATE story_clusters
               SET truth_score = $2,
                   status = $3,
                   label_reason = $4,
                   last_updated = NOW()
               WHERE id = $1""",
            str(row["id"]),
            score,
            new_status,
            reason,
        )
        updated += 1

    await invalidate_feed_cache()
    await log_pipeline_event(
        "rescore",
        actor="admin",
        new_value=str(updated),
        reason="manual_rescore_trigger",
    )
    return {"updated": updated}

# ─── ADMIN ADS ────────────────────────────────────────────────────────────────

class AdCreate(BaseModel):
    position:     str
    image_url:    str = ""
    link_url:     str
    alt_text:     str = ""
    profession:   str = "all"
    domain:       str = "all"
    active_from:  str = ""
    active_until: str = ""
    label:        str = "ADVERTISEMENT"
# ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    user_id:  str
    plan:     str = "monthly"  # monthly | yearly
    currency: str = "INR"

@app.post("/api/subscriptions/create-checkout")
async def create_checkout(body: CheckoutRequest):
    """Create Razorpay checkout session. Configure RAZORPAY_KEY_ID in .env."""
    razorpay_key  = os.environ.get("RAZORPAY_KEY_ID", "")
    razorpay_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")

    amount_inr = 99 if body.plan == "monthly" else 799
    amount_paise = amount_inr * 100  # Razorpay uses paise

    if razorpay_key and razorpay_secret:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient() as client:
                r = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    auth=(razorpay_key, razorpay_secret),
                    json={"amount": amount_paise, "currency": "INR",
                          "receipt": f"dhara_{body.user_id[:8]}_{body.plan}"},
                    timeout=10,
                )
            if r.status_code == 200:
                order = r.json()
                return {
                    "razorpay_key": razorpay_key,
                    "order_id":     order["id"],
                    "amount":       amount_paise,
                    "currency":     "INR",
                    "user_id":      body.user_id,
                    "plan":         body.plan,
                }
        except Exception as e:
            log.warning(f"Razorpay error: {e}")

    # Fallback: no payment gateway configured
    log.info(f"Checkout attempted for {body.user_id} ({body.plan}) — no gateway configured")
    return {
        "checkout_url": None,
        "message": "Payment gateway not configured. Add RAZORPAY_KEY_ID to .env",
        "contact": "/contact",
    }

@app.post("/api/subscriptions/verify")
async def verify_payment(request: Request, authorization: str = Header(None)):
    """Verify Razorpay payment and activate Pro subscription."""
    body = await request.json()
    user_id    = body.get("user_id")
    payment_id = body.get("razorpay_payment_id", "")
    order_id = body.get("razorpay_order_id", "")
    provided_signature = body.get("razorpay_signature", "")
    plan       = body.get("plan", "monthly")

    if not user_id:
        raise HTTPException(400, "user_id required")

    _require_own_user(str(user_id), authorization)

    razorpay_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if razorpay_secret:
        if not (order_id and payment_id and provided_signature):
            raise HTTPException(400, "Missing Razorpay signature fields")
        payload = f"{order_id}|{payment_id}".encode("utf-8")
        expected = hmac.new(razorpay_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, str(provided_signature)):
            raise HTTPException(400, "Invalid payment signature")

    # Mark user as premium in DB
    try:
        from datetime import timedelta as _td
        expires = datetime.now(timezone.utc) + _td(days=30 if plan=="monthly" else 365)
        await db_execute(
            """UPDATE user_profiles
               SET is_premium=TRUE,
                   is_pro=TRUE,
                   premium_until=$2
               WHERE id=$1""",
            user_id, expires
        )
        import uuid as _uuid
        await db_execute(
            """INSERT INTO user_subscriptions (user_id, plan, status, billing_cycle, amount_inr, payment_ref, expires_at)
               VALUES ($1, $2, 'active', $3, $4, $5, $6)
               ON CONFLICT DO NOTHING""",
            user_id, "pro", plan, 99 if plan=="monthly" else 799, payment_id, expires
        )
    except Exception as e:
        log.warning(f"Subscription activate error: {e}")

    return {"ok": True, "premium_until": expires.isoformat() if expires else None}


@app.post("/api/subscriptions/webhook")
async def razorpay_webhook(request: Request):
    body_bytes = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

    # Fail closed in all environments unless explicitly overridden for local workflows.
    if not secret and not ALLOW_INSECURE_WEBHOOKS:
        raise HTTPException(503, "Webhook secret is not configured")

    if secret:
        expected = hmac.new(
            secret.encode(),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(400, "Invalid webhook signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_type = event.get("event", "")
    payload = event.get("payload", {})

    # Replay protection: persist processed event receipts and ignore duplicates.
    replay_id = (
        str(event.get("id") or "").strip()
        or str(request.headers.get("X-Razorpay-Event-Id") or "").strip()
        or hashlib.sha256(body_bytes).hexdigest()
    )
    payload_hash = hashlib.sha256(body_bytes).hexdigest()
    try:
        await db_execute(
            """INSERT INTO webhook_event_receipts (provider, event_id, payload_hash)
               VALUES ($1, $2, $3)""",
            "razorpay",
            replay_id,
            payload_hash,
        )
    except asyncpg.UniqueViolationError:
        log.info(f"Webhook replay ignored: {replay_id}")
        return {"ok": True, "action": "replay_ignored"}

    if event_type == "payment.captured":
        payment = payload.get("payment", {}).get("entity", {})
        payment_id = payment.get("id", "")
        notes = payment.get("notes", {})
        user_id = notes.get("user_id")
        plan = notes.get("plan", "monthly")

        if not user_id:
            log.warning(f"Razorpay webhook: payment {payment_id} has no user_id in notes")
            return {"ok": True, "action": "skipped_no_user"}

        try:
            expires = datetime.now(timezone.utc) + timedelta(days=30 if plan == "monthly" else 365)
            await db_execute(
                "UPDATE user_profiles SET is_pro=TRUE, premium_until=$2 WHERE id=$1",
                user_id,
                expires,
            )
            await db_execute(
                """INSERT INTO user_subscriptions
                       (user_id, plan, status, billing_cycle, amount_inr, payment_ref, expires_at)
                   VALUES ($1, 'pro', 'active', $2, $3, $4, $5)
                   ON CONFLICT (user_id) DO UPDATE
                   SET status='active', expires_at=$5, payment_ref=$4""",
                user_id,
                plan,
                99 if plan == "monthly" else 799,
                payment_id,
                expires,
            )
            try:
                await redis_client.delete(f"profile:{user_id}")
            except Exception as e:
                log.warning(f"webhook profile cache clear failed for {user_id}: {e}")
            log.info(f"Webhook: activated Pro for {user_id} via {payment_id}")
        except Exception as e:
            log.error(f"Webhook: failed to activate {user_id}: {e}")
            return {"ok": False, "error": str(e)}

        return {"ok": True, "action": "subscription_activated"}

    if event_type in ("subscription.halted", "subscription.cancelled"):
        subscription = payload.get("subscription", {}).get("entity", {})
        sub_id = subscription.get("id", "")
        notes = subscription.get("notes", {})
        user_id = notes.get("user_id")

        if user_id:
            await db_execute(
                "UPDATE user_profiles SET is_pro=FALSE WHERE id=$1",
                user_id,
            )
            log.info(f"Webhook: deactivated Pro for {user_id} (sub {sub_id})")

        return {"ok": True, "action": "subscription_deactivated"}

    return {"ok": True, "action": "ignored", "event": event_type}
