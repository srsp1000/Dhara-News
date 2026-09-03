import asyncio
import os

import asyncpg
try:
    from shared.location_utils import normalize_state_name, normalize_district_name
except Exception:
    from location_utils import normalize_state_name, normalize_district_name

PG_DSN = os.environ.get("PG_DSN", "postgresql://dhara:dhara_local_dev@postgres:5432/dhara")

async def main() -> None:
    conn = await asyncpg.connect(PG_DSN)
    rows = await conn.fetch(
        """
        SELECT id, loc_state, loc_city, loc_district
        FROM story_clusters
        WHERE (loc_district IS NULL OR BTRIM(loc_district) = '')
          AND (loc_city IS NOT NULL OR loc_state IS NOT NULL)
        """
    )

    updated = 0
    for row in rows:
        loc_state = row.get("loc_state")
        loc_district = row.get("loc_district")
        loc_city = row.get("loc_city")
        row_id = row.get("id")

        if row_id is None:
            continue

        state = normalize_state_name(loc_state) if loc_state else loc_state
        district, inferred_state = normalize_district_name(loc_district or loc_city, state)
        if not state and inferred_state:
            state = inferred_state

        if district:
            await conn.execute(
                "UPDATE story_clusters SET loc_state=$2, loc_district=$3 WHERE id=$1",
                row_id,
                state,
                district,
            )
            updated += 1

    total = await conn.fetchval("SELECT COUNT(*) FROM story_clusters WHERE loc_district IS NOT NULL")
    print(f"backfill_updated={updated}")
    print(f"loc_district_not_null={total}")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
