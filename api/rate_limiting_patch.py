"""
api/rate_limiting_patch.py

FIX #20  /api/feed, /api/search, /api/trending, /api/live/stream have no
         rate limiting. A bot can send 10,000 requests/minute per endpoint.

HOW TO APPLY
─────────────
1. pip install slowapi

2. In api/main.py, add to imports section:
       from slowapi import Limiter, _rate_limit_exceeded_handler
       from slowapi.util import get_remote_address
       from slowapi.errors import RateLimitExceeded

3. After `app = FastAPI(...)`, add:
       limiter = Limiter(key_func=get_remote_address)
       app.state.limiter = limiter
       app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

4. Add the @limiter.limit() decorator to each public endpoint as shown below.
   The Request parameter is required by slowapi — add it if not already present.

RATE LIMITS CHOSEN
──────────────────
/api/feed       60/minute   — normal reader browsing pace
/api/search     30/minute   — search is DB-expensive; 30 is generous for a human
/api/trending   30/minute   — static-ish data; 30 is plenty
/api/live/stream 10/minute  — SSE stream; reconnects should be infrequent
/api/article    120/minute  — article reads can be bursty (pagination)
/api/feed.rss    20/minute  — RSS readers poll; most poll at most every 5 min
"""

# ── Paste these lines into api/main.py imports ──────────────────────────────
IMPORT_BLOCK = """
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
"""

# ── Paste these lines after app = FastAPI(...) ───────────────────────────────
APP_INIT_BLOCK = """
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
"""

# ── Annotated endpoint signatures — replace existing signatures in main.py ──
ENDPOINT_PATCHES = {
    "/api/feed": """
@app.get("/api/feed")
@limiter.limit("60/minute")
async def get_feed(request: Request, ...):
""",
    "/api/search": """
@app.get("/api/search")
@limiter.limit("30/minute")
async def search_articles(request: Request, ...):
""",
    "/api/trending": """
@app.get("/api/trending")
@limiter.limit("30/minute")
async def get_trending(request: Request, ...):
""",
    "/api/live/stream": """
@app.get("/api/live/stream")
@limiter.limit("10/minute")
async def live_stream(request: Request, ...):
""",
    "/api/article/{article_id}": """
@app.get("/api/article/{article_id}")
@limiter.limit("120/minute")
async def get_article(request: Request, article_id: str, ...):
""",
}

# ── docker-compose.yml addition for LibreTranslate (FIX #22) ────────────────
# Add this service block to docker-compose.yml under `services:`
LIBRETRANSLATE_SERVICE = """
  libretranslate:
    image: libretranslate/libretranslate:latest
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - LT_LOAD_ONLY=en,hi,ta,te,bn,mr,gu,kn,ml,pa,or,ur
      - LT_UPDATE_MODELS=true
    volumes:
      - libretranslate_models:/home/libretranslate/.local
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/languages"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s    # Model downloads take time on first run
"""

LIBRETRANSLATE_VOLUME = """
  libretranslate_models:
    driver: local
"""
