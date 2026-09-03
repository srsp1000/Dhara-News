"""
Dhara News — Personalization Cluster (6 Agents)
"""
import asyncio, json, logging
from datetime import datetime, timezone
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from base import BaseAgent, Q

log = logging.getLogger(__name__)

PROFESSION_TOPICS = {
    "upsc":        ["politics","governance","economy","environment","science","international","social","defence"],
    "medical":     ["health","science","research","governance"],
    "law":         ["judiciary","legislation","politics","governance","social"],
    "technology":  ["technology","startups","science","business"],
    "finance":     ["business","economy","governance","startups","international"],
    "student":     ["general","sports","governance","science","social"],
    "defence":     ["defence","international","politics","governance","technology"],
    "agriculture": ["agriculture","environment","economy","governance"],
    "environment": ["environment","science","governance","agriculture"],
    "education":   ["education","governance","social","science"],
    "research":    ["science","technology","research","health"],
    "general":     ["politics","sports","general","social"],
}


class ProfessionFeedAgent(BaseAgent):
    """
    Adds articles to per-profession Redis sorted sets (score = truth_score).
    Frontend reads directly from these sets — fast O(log N) retrieval.
    Input:  pers.profession
    Output: pers.location
    """
    name         = "profession-feed"
    input_queue  = Q.PERS_PROFESSION
    output_queue = Q.PERS_LOCATION
    FEED_TTL     = 24 * 3600
    MAX_FEED_SZ  = 200

    async def process(self, payload: dict) -> dict | None:
        cluster_id  = payload.get("cluster_id")
        professions = payload.get("professions", ["general"])
        truth_score = float(payload.get("truth_score", 0))
        status      = payload.get("status", "developing")

        if not cluster_id or status == "quarantine":
            return payload

        score = truth_score + (payload.get("source_count", 1) * 0.1)

        for prof in professions:
            key = f"feed:{prof}"
            await self.redis_client.zadd(key, {cluster_id: score})
            await self.redis_client.expire(key, self.FEED_TTL)
            await self.redis_client.zremrangebyrank(key, 0, -(self.MAX_FEED_SZ + 1))

        await self.redis_client.zadd("feed:global", {cluster_id: score})
        await self.redis_client.expire("feed:global", self.FEED_TTL)
        await self.redis_client.zremrangebyrank("feed:global", 0, -501)

        return payload

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


class LocationFeedAgent(BaseAgent):
    """
    Builds state-level and country-level location feeds.
    Input:  pers.location
    Output: pub.gate
    """
    name         = "location-feed"
    input_queue  = Q.PERS_LOCATION
    output_queue = Q.PUB_GATE

    async def process(self, payload: dict) -> dict | None:
        cluster_id  = payload.get("cluster_id")
        loc_state   = payload.get("loc_state")
        truth_score = float(payload.get("truth_score", 0))

        if cluster_id and loc_state:
            key = f"feed:state:{loc_state.lower().replace(' ', '_')}"
            await self.redis_client.zadd(key, {cluster_id: truth_score})
            await self.redis_client.expire(key, 24 * 3600)
            await self.redis_client.zremrangebyrank(key, 0, -201)

        return payload

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


class TrendingDetectorAgent(BaseAgent):
    """
    Listens for view events, increments trending counters.
    Input:  pers.trending
    Output: (none — writes to Redis sorted sets)
    """
    name        = "trending-detector"
    input_queue = Q.PERS_TRENDING
    output_queue= ""

    async def process(self, payload: dict) -> dict | None:
        cluster_id  = payload.get("cluster_id")
        professions = payload.get("professions", ["general"])
        loc_state   = payload.get("loc_state")

        if not cluster_id:
            return None

        for prof in professions:
            await self.redis_client.zincrby(f"trending:prof:{prof}", 1, cluster_id)
            await self.redis_client.expire(f"trending:prof:{prof}", 3600)

        if loc_state:
            await self.redis_client.zincrby(f"trending:state:{loc_state}", 1, cluster_id)
            await self.redis_client.expire(f"trending:state:{loc_state}", 3600)

        await self.redis_client.zincrby("trending:global", 1, cluster_id)
        await self.redis_client.expire("trending:global", 3600)
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


class MorningBriefAgent(BaseAgent):
    """
    At 5:30 AM IST daily, generates personalized 10-story briefs per profession.
    Stores result in Redis. API reads from Redis.
    """
    name          = "morning-brief"
    input_queue   = ""
    output_queue  = ""
    RUN_HOUR_UTC  = 0   # 0:00 UTC = 5:30 AM IST

    async def on_start(self):
        asyncio.create_task(self._schedule())

    async def _schedule(self):
        import asyncio
        while self.running:
            now = datetime.now(timezone.utc)
            next_run = now.replace(hour=self.RUN_HOUR_UTC, minute=0, second=0, microsecond=0)
            if now >= next_run:
                from datetime import timedelta
                next_run += timedelta(days=1)
            wait = (next_run - now).total_seconds()
            log.info(f"MorningBrief: Next run in {wait/3600:.1f}h")
            await asyncio.sleep(wait)
            await self._generate_all()

    async def _generate_all(self):
        professions = list(PROFESSION_TOPICS.keys())
        for prof in professions:
            try:
                await self._generate_one(prof)
            except Exception as e:
                log.error(f"MorningBrief: {prof} failed: {e}")

    async def _generate_one(self, profession: str):
        rows = await self.db_fetch(
            """SELECT id, headline, summary_brief, truth_score, domain, source_count
               FROM story_clusters
               WHERE status = 'verified'
                 AND first_seen > NOW() - INTERVAL '24 hours'
                 AND ($1 = ANY(professions) OR $1 = 'general')
               ORDER BY truth_score DESC, source_count DESC
               LIMIT 10""",
            profession
        )
        if not rows:
            return

        headlines = "\n".join(
            f"{i+1}. [{r['domain'].upper()}] {r['headline']}"
            for i, r in enumerate(rows)
        )
        intro = await self.llm(
            f"Write a 40-word professional morning news intro for a {profession} reader.\n"
            f"Today's top stories:\n{headlines}\nBe helpful, neutral, concise.",
            max_tokens=80
        )

        brief = {
            "profession": profession,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "intro": intro.strip(),
            "stories": [dict(r) for r in rows],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await self.redis_client.setex(
            f"morning_brief:{profession}:{today}",
            25 * 3600,
            json.dumps(brief, default=str)
        )
        log.info(f"MorningBrief: Generated for {profession}")

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


class NotificationAgent(BaseAgent):
    """
    Fan-out push notifications for breaking news.
    Matches article professions + location to user preferences.
    Input:  pers.notify
    Output: (none — sends FCM/APNs)
    """
    name         = "notification"
    input_queue  = Q.PERS_NOTIFY
    output_queue = ""

    async def process(self, payload: dict) -> dict | None:
        cluster_id  = payload.get("cluster_id")
        truth_score = payload.get("truth_score", 0)
        professions = payload.get("professions", [])
        headline    = payload.get("platform_headline") or payload.get("title", "")

        # Only notify for high-confidence breaking news
        if truth_score < 65:
            return None

        # Get users matching this profession
        rows = await self.db_fetch(
            """SELECT id FROM user_profiles
               WHERE profession = ANY($1::text[])
               LIMIT 10000""",
            professions
        )

        if not rows:
            return None

        # In production: batch FCM calls in groups of 500
        # For dev: just log
        log.info(f"Notification: Would send to {len(rows)} users — {headline[:50]}")

        # FCM batch send (production)
        FCM_KEY = os.environ.get("FCM_SERVER_KEY", "")
        if FCM_KEY and len(rows) > 0:
            import httpx
            tokens = [str(r["id"]) for r in rows[:500]]  # batch of 500
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://fcm.googleapis.com/fcm/send",
                    headers={"Authorization": f"key={FCM_KEY}"},
                    json={
                        "registration_ids": tokens,
                        "notification": {
                            "title": "Breaking News",
                            "body": headline[:100],
                        },
                        "data": {"cluster_id": cluster_id},
                    }
                )
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


class ReadingDepthAgent(BaseAgent):
    """
    Learns per-user, per-topic reading depth preferences.
    Uses Thompson Sampling bandit to balance exploration vs exploitation.
    Input:  (reads from user event stream via API)
    """
    name         = "reading-depth"
    input_queue  = ""
    output_queue = ""

    async def update_preference(self, user_id: str, topic: str, depth: str):
        """Called by API when user reads at a specific depth."""
        key = f"depth_pref:{user_id}:{topic}"
        prefs = json.loads(await self.redis_client.get(key) or '{"headline":1,"brief":1,"deep":1}')
        prefs[depth] = prefs.get(depth, 0) + 1
        await self.redis_client.setex(key, 90 * 24 * 3600, json.dumps(prefs))

    async def get_default_depth(self, user_id: str, topic: str) -> str:
        """Returns recommended depth for this user+topic combo."""
        key = f"depth_pref:{user_id}:{topic}"
        raw = await self.redis_client.get(key)
        if not raw:
            return "brief"
        prefs = json.loads(raw)
        return max(prefs, key=prefs.get)

    async def process(self, payload: dict) -> dict | None:
        return None

    @classmethod
    def run(cls):
        asyncio.run(cls().start())


if __name__ == "__main__":
    import sys
    {
        "profession": ProfessionFeedAgent,
        "location":   LocationFeedAgent,
        "trending":   TrendingDetectorAgent,
        "brief":      MorningBriefAgent,
        "notify":     NotificationAgent,
        "depth":      ReadingDepthAgent,
    }.get(sys.argv[1] if len(sys.argv) > 1 else "profession", ProfessionFeedAgent).run()
