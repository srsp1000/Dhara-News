"""
api/routes/civic_gov.py
─────────────────────────────────────────────────────────────────────────────
Two new route groups:

  /api/civic        — Parliament & Court tracker, government-sources-only,
                      with Central/State split and date-wise results.

  /api/government   — Dedicated government news portal endpoint.
                      Filters by ministry category or state/UT gov sources.

Included in main.py via:
    from routes.civic_gov import router as civic_gov_router
    app.include_router(civic_gov_router)

All queries are READ-ONLY and additive — they do not modify any existing
tables or break any existing routes.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query

log = logging.getLogger(__name__)
router = APIRouter()

# ─── Government source domain lists ──────────────────────────────────────────

CENTRAL_GOV_DOMAINS = [
    # Parliamentary / Legislative
    "pib.gov.in", "sansad.in", "loksabha.nic.in",
    "rajyasabha.nic.in", "prsindia.org",
    # Judiciary
    "sci.gov.in", "doj.gov.in",
    # Core ministries
    "mea.gov.in", "mha.gov.in", "mod.gov.in", "finmin.nic.in",
    "mohfw.gov.in", "education.gov.in", "mhrd.gov.in",
    "agricoop.nic.in", "moef.gov.in", "dst.gov.in", "meity.gov.in",
    "indianrailways.gov.in", "dot.gov.in", "msme.gov.in",
    # Regulatory bodies
    "rbi.org.in", "sebi.gov.in", "irdai.gov.in", "trai.gov.in",
    "isro.gov.in", "icmr.nic.in", "ugc.ac.in", "nha.gov.in",
    "nabard.org", "nhb.org.in", "uidai.gov.in",
    "eci.gov.in", "cag.gov.in", "niti.gov.in", "mygov.in",
    "india.gov.in",
]

STATE_GOV_DOMAINS: dict = {
    "Andhra Pradesh":        ["apinformation.gov.in", "ap.gov.in"],
    "Arunachal Pradesh":     ["arunachalpradesh.gov.in"],
    "Assam":                 ["assam.gov.in"],
    "Bihar":                 ["state.bihar.gov.in"],
    "Chhattisgarh":          ["chhattisgarh.gov.in", "cginfo.nic.in"],
    "Delhi":                 ["delhi.gov.in", "dipr.delhigovt.nic.in"],
    "Goa":                   ["goa.gov.in"],
    "Gujarat":               ["gujaratinformation.gov.in", "gujarat.gov.in"],
    "Haryana":               ["haryana.gov.in"],
    "Himachal Pradesh":      ["hpinfo.nic.in", "himachal.nic.in"],
    "Jharkhand":             ["jharkhand.gov.in"],
    "Karnataka":             ["karnataka.gov.in"],
    "Kerala":                ["kerala.gov.in", "prd.kerala.gov.in"],
    "Madhya Pradesh":        ["mp.gov.in", "mpinfo.org"],
    "Maharashtra":           ["maharashtra.gov.in", "mahainfo.gov.in"],
    "Manipur":               ["manipur.gov.in"],
    "Meghalaya":             ["meghalaya.gov.in"],
    "Mizoram":               ["mizoram.gov.in"],
    "Nagaland":              ["nagaland.gov.in"],
    "Odisha":                ["odisha.gov.in"],
    "Punjab":                ["punjab.gov.in"],
    "Rajasthan":             ["rajasthan.gov.in", "dipr.rajasthan.gov.in"],
    "Sikkim":                ["sikkim.gov.in"],
    "Tamil Nadu":            ["tn.gov.in", "iprtn.nic.in"],
    "Telangana":             ["telangana.gov.in", "dipr.telangana.gov.in"],
    "Tripura":               ["tripura.gov.in"],
    "Uttar Pradesh":         ["up.gov.in", "information.up.nic.in"],
    "Uttarakhand":           ["uk.gov.in"],
    "West Bengal":           ["wb.gov.in", "wbdipr.gov.in"],
    # Union Territories
    "Jammu and Kashmir":     ["jk.gov.in"],
    "Ladakh":                ["ladakh.gov.in"],
    "Puducherry":            ["puducherry.gov.in"],
    "Chandigarh":            ["chandigarh.gov.in"],
    "Andaman and Nicobar Islands": ["and.nic.in"],
}

ALL_STATE_GOV_DOMAINS: list = [d for dlist in STATE_GOV_DOMAINS.values() for d in dlist]

# Ministry category → domain filter
MINISTRY_DOMAINS: dict = {
    "all":         CENTRAL_GOV_DOMAINS,
    "parliament":  ["sansad.in", "loksabha.nic.in", "rajyasabha.nic.in", "prsindia.org", "pib.gov.in"],
    "finance":     ["finmin.nic.in", "rbi.org.in", "sebi.gov.in", "nabard.org", "nhb.org.in", "irdai.gov.in"],
    "home":        ["mha.gov.in"],
    "defence":     ["mod.gov.in"],
    "health":      ["mohfw.gov.in", "icmr.nic.in", "nha.gov.in"],
    "education":   ["education.gov.in", "mhrd.gov.in", "ugc.ac.in"],
    "external":    ["mea.gov.in"],
    "agriculture": ["agricoop.nic.in", "nabard.org"],
    "science":     ["dst.gov.in", "isro.gov.in", "dbt.nic.in", "meity.gov.in"],
    "environment": ["moef.gov.in", "cpcb.nic.in"],
    "judiciary":   ["sci.gov.in", "doj.gov.in"],
    "railways":    ["indianrailways.gov.in"],
    "elections":   ["eci.gov.in"],
}

# Civic type → keyword sets for fallback when gov sources have no results
CIVIC_KEYWORDS: dict = {
    "parliament": [
        "lok sabha", "rajya sabha", "parliament", "sansad", "speaker",
        "budget session", "winter session", "monsoon session", "question hour",
        "bill passed", "constitution amendment", "minister", "cabinet",
        "union budget", "no confidence",
    ],
    "court": [
        "supreme court", "high court", "bench", "judgment", "verdict",
        "plea", "petition", "hearing", "collegium", "chief justice",
        "suo motu", "contempt", "habeas corpus", "constitution bench",
        "fundamental right",
    ],
    "bills": [
        "bill passed", "bill introduced", "amendment", "parliament passes",
        "lok sabha passes", "rajya sabha passes", "legislation", "ordinance",
        "act 20", "parliament approved",
    ],
}

# ─── DB helpers ── import from main lazily to avoid circular startup issues ──

def _get_redis():
    import main as _main
    return _main.redis_client

async def _fetch(q: str, *args):
    import main as _main
    return await _main.db_fetch(q, *args)

def _to_dict(row) -> dict:
    if row is None:
        return {}
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# ─── /api/civic ──────────────────────────────────────────────────────────────

@router.get("/api/civic")
async def get_civic_news(
    news_type:  str            = Query("parliament", alias="type"),
    gov_level:  str            = Query("central"),
    gov_state:  Optional[str]  = Query(None),
    from_date:  Optional[date] = Query(None),
    to_date:    Optional[date] = Query(None),
    limit:      int            = Query(30, le=50),
    offset:     int            = Query(0),
):
    """
    Parliament & Courts tracker — government sources only.

    ?type=parliament|court|bills
    ?gov_level=central|state
    ?gov_state=Maharashtra       (only used when gov_level=state)
    ?from_date=YYYY-MM-DD
    ?to_date=YYYY-MM-DD
    """
    # 1. Determine gov domain list
    if gov_level == "state":
        if gov_state and gov_state in STATE_GOV_DOMAINS:
            gov_domains = STATE_GOV_DOMAINS[gov_state]
        else:
            gov_domains = ALL_STATE_GOV_DOMAINS
    else:
        gov_domains = CENTRAL_GOV_DOMAINS

    # 2. Keyword set for this civic type
    kws = CIVIC_KEYWORDS.get(news_type, CIVIC_KEYWORDS["parliament"])

    # 3. Build query parameters dynamically (mirrors main.py pattern)
    params: list = []
    idx = 1
    conditions: list = ["c.status IN ('verified','developing')"]

    # Gov-sources filter: cluster must have at least one article from a gov domain
    params.append(gov_domains)          # $1 — list, asyncpg sends as PostgreSQL array
    conditions.append(f"""EXISTS (
        SELECT 1 FROM articles _a
        WHERE _a.cluster_id = c.id
          AND _a.source_domain = ANY(${idx}::text[])
    )""")
    idx += 1

    # Keyword filter — OR across top 6 keywords for performance
    kw_parts = []
    for kw in kws[:6]:
        kw_parts.append(f"(c.headline ILIKE ${idx} OR c.summary_brief ILIKE ${idx})")
        params.append(f"%{kw}%")
        idx += 1
    conditions.append(f"({' OR '.join(kw_parts)})")

    # State filter for state-level results
    if gov_level == "state" and gov_state:
        conditions.append(f"c.loc_state = ${idx}")
        params.append(gov_state)
        idx += 1

    # Date range
    if from_date:
        conditions.append(f"c.first_seen >= ${idx}")
        params.append(datetime.combine(from_date, datetime.min.time()))
        idx += 1
    if to_date:
        conditions.append(f"c.first_seen <= ${idx}")
        params.append(datetime.combine(to_date, datetime.max.time()))
        idx += 1

    where = " AND ".join(conditions)

    try:
        rows = await _fetch(f"""
            SELECT
                c.id, c.headline, c.summary_brief, c.truth_score, c.status,
                c.source_count, c.domain, c.exam_tags, c.loc_state,
                c.first_seen, c.last_updated,
                (
                    SELECT _b.source_domain FROM articles _b
                    WHERE _b.cluster_id = c.id
                    ORDER BY _b.source_tier ASC NULLS LAST LIMIT 1
                ) AS primary_source
            FROM story_clusters c
            WHERE {where}
            ORDER BY c.first_seen DESC
            LIMIT {limit} OFFSET {offset}
        """, *params)

        result = [_to_dict(r) for r in rows]
        is_fallback = False

        # Graceful fallback: if no gov-only results, fall back to keyword search
        # on any source so the page is never empty
        if not result and offset == 0:
            is_fallback = True
            fb_kw_parts = []
            fb_params: list = []
            fb_idx = 1
            for kw in kws[:5]:
                fb_kw_parts.append(
                    f"(c.headline ILIKE ${fb_idx} OR c.summary_brief ILIKE ${fb_idx})"
                )
                fb_params.append(f"%{kw}%")
                fb_idx += 1
            fb_where = f"c.status IN ('verified','developing') AND ({' OR '.join(fb_kw_parts)})"
            if gov_level == "state" and gov_state:
                fb_where += f" AND c.loc_state = ${fb_idx}"
                fb_params.append(gov_state)
            fallback_rows = await _fetch(f"""
                SELECT c.id, c.headline, c.summary_brief, c.truth_score, c.status,
                       c.source_count, c.domain, c.exam_tags, c.loc_state,
                       c.first_seen, c.last_updated
                FROM story_clusters c
                WHERE {fb_where}
                ORDER BY c.first_seen DESC
                LIMIT 20
            """, *fb_params)
            result = [_to_dict(r) for r in fallback_rows]
            for r in result:
                r["_fallback"] = True

        return {
            "results":     result,
            "count":       len(result),
            "gov_level":   gov_level,
            "gov_state":   gov_state,
            "type":        news_type,
            "is_fallback": is_fallback,
        }

    except Exception as e:
        log.error(f"/api/civic error: {e}")
        return {"results": [], "count": 0, "error": str(e), "type": news_type}


# ─── /api/civic/states ────────────────────────────────────────────────────────

@router.get("/api/civic/states")
async def list_civic_states():
    """List Indian states that have government news coverage in the DB."""
    try:
        rows = await _fetch("""
            SELECT DISTINCT c.loc_state, COUNT(*) AS cnt
            FROM story_clusters c
            WHERE c.loc_state IS NOT NULL
              AND c.status IN ('verified','developing')
            GROUP BY c.loc_state
            ORDER BY cnt DESC
        """)
        return {
            "states": [{"state": r["loc_state"], "count": r["cnt"]} for r in rows],
            "gov_states": list(STATE_GOV_DOMAINS.keys()),
        }
    except Exception as e:
        log.error(f"/api/civic/states error: {e}")
        return {"states": [], "gov_states": list(STATE_GOV_DOMAINS.keys())}


# ─── /api/government ─────────────────────────────────────────────────────────

@router.get("/api/government")
async def get_government_news(
    gov_level:  str            = Query("central"),
    gov_state:  Optional[str]  = Query(None),
    ministry:   Optional[str]  = Query(None),   # key from MINISTRY_DOMAINS
    from_date:  Optional[date] = Query(None),
    to_date:    Optional[date] = Query(None),
    limit:      int            = Query(30, le=50),
    offset:     int            = Query(0),
):
    """
    Government news portal endpoint.

    Central: ?gov_level=central&ministry=finance
    State:   ?gov_level=state&gov_state=Maharashtra
    All:     ?gov_level=central  (all central ministry domains)
    """
    # Pick domain list
    if gov_level == "state":
        if gov_state and gov_state in STATE_GOV_DOMAINS:
            domains = STATE_GOV_DOMAINS[gov_state]
        else:
            domains = ALL_STATE_GOV_DOMAINS
    else:
        if ministry and ministry in MINISTRY_DOMAINS:
            domains = MINISTRY_DOMAINS[ministry]
        else:
            domains = CENTRAL_GOV_DOMAINS

    params: list = []
    idx = 1
    conditions: list = ["c.status IN ('verified','developing')"]

    # Gov domain filter
    params.append(domains)
    conditions.append(f"""EXISTS (
        SELECT 1 FROM articles _ga
        WHERE _ga.cluster_id = c.id
          AND _ga.source_domain = ANY(${idx}::text[])
    )""")
    idx += 1

    # State filter
    if gov_level == "state" and gov_state:
        conditions.append(f"c.loc_state = ${idx}")
        params.append(gov_state)
        idx += 1

    # Date range
    if from_date:
        conditions.append(f"c.first_seen >= ${idx}")
        params.append(datetime.combine(from_date, datetime.min.time()))
        idx += 1
    if to_date:
        conditions.append(f"c.first_seen <= ${idx}")
        params.append(datetime.combine(to_date, datetime.max.time()))
        idx += 1

    where = " AND ".join(conditions)

    try:
        rows = await _fetch(f"""
            SELECT
                c.id, c.headline, c.summary_brief, c.truth_score, c.status,
                c.source_count, c.domain, c.exam_tags, c.loc_state,
                c.first_seen, c.last_updated,
                (
                    SELECT _gb.source_domain FROM articles _gb
                    WHERE _gb.cluster_id = c.id
                    ORDER BY _gb.source_tier ASC NULLS LAST LIMIT 1
                ) AS primary_source
            FROM story_clusters c
            WHERE {where}
            ORDER BY c.first_seen DESC
            LIMIT {limit} OFFSET {offset}
        """, *params)

        result = [_to_dict(r) for r in rows]

        # Fallback for state tab: show by loc_state if no gov-domain results
        if not result and gov_level == "state" and gov_state and offset == 0:
            fallback_rows = await _fetch("""
                SELECT c.id, c.headline, c.summary_brief, c.truth_score, c.status,
                       c.source_count, c.domain, c.exam_tags, c.loc_state,
                       c.first_seen, c.last_updated
                FROM story_clusters c
                WHERE c.status IN ('verified','developing')
                  AND c.loc_state = $1
                  AND c.domain IN ('politics','government','national')
                ORDER BY c.first_seen DESC
                LIMIT 30
            """, gov_state)
            result = [_to_dict(r) for r in fallback_rows]
            for r in result:
                r["_fallback"] = True

        return {
            "results":   result,
            "count":     len(result),
            "gov_level": gov_level,
            "gov_state": gov_state,
            "ministry":  ministry,
        }

    except Exception as e:
        log.error(f"/api/government error: {e}")
        return {"results": [], "count": 0, "error": str(e)}


# ─── /api/government/ministry-stats ─────────────────────────────────────────

@router.get("/api/government/ministry-stats")
async def get_ministry_stats():
    """Return article counts per ministry category (for display badges)."""
    cache_key = "gov:ministry_stats"
    redis = _get_redis()
    try:
        import json
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    stats = {}
    try:
        for key, domains in MINISTRY_DOMAINS.items():
            if key == "all":
                continue
            rows = await _fetch("""
                SELECT COUNT(DISTINCT c.id) AS cnt
                FROM story_clusters c
                JOIN articles _ms ON _ms.cluster_id = c.id
                WHERE _ms.source_domain = ANY($1::text[])
                  AND c.status IN ('verified','developing')
            """, domains)
            stats[key] = rows[0]["cnt"] if rows else 0
    except Exception as e:
        log.warning(f"Ministry stats error: {e}")

    try:
        import json
        await redis.setex(cache_key, 3600, json.dumps(stats))
    except Exception:
        pass

    return stats
