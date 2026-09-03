"""
shared/location_utils.py

FIX #7  _location_key() and _load_district_catalog() were duplicated between
        api/main.py (lines 202–260) and agents/nlp/__init__.py.
        Any bug fix had to be applied in both places independently.

        This module is the single canonical source. Both callers should import
        from here:

        api/main.py:
            from shared.location_utils import (
                _location_key, _load_district_catalog,
                normalize_state_name, normalize_district_name,
                DISTRICT_TO_STATE, DISTRICT_CANONICAL, STATE_TO_DISTRICTS,
            )

        agents/nlp/__init__.py:
            from shared.location_utils import _location_key, _load_district_catalog

HOW TO APPLY
─────────────
1. Copy this file to shared/location_utils.py
2. In api/main.py, delete lines 202–235 (the two function defs and
   the three module-level variables) and add the import above.
3. In agents/nlp/__init__.py, find the duplicate definitions of
   _location_key and _load_district_catalog and replace them with
   the import above.
"""

import re
import logging
from pathlib import Path

log = logging.getLogger(__name__)


# ── Indian state name normalisation map ─────────────────────────────────────
# Keys are lowercase stripped variants; values are canonical forms.
INDIAN_STATES_NORMALIZED: dict[str, str] = {
    "andhra pradesh": "Andhra Pradesh",
    "arunachal pradesh": "Arunachal Pradesh",
    "assam": "Assam",
    "bihar": "Bihar",
    "chhattisgarh": "Chhattisgarh",
    "delhi": "Delhi",
    "goa": "Goa",
    "gujarat": "Gujarat",
    "haryana": "Haryana",
    "himachal pradesh": "Himachal Pradesh",
    "jharkhand": "Jharkhand",
    "karnataka": "Karnataka",
    "kerala": "Kerala",
    "madhya pradesh": "Madhya Pradesh",
    "maharashtra": "Maharashtra",
    "manipur": "Manipur",
    "meghalaya": "Meghalaya",
    "mizoram": "Mizoram",
    "nagaland": "Nagaland",
    "odisha": "Odisha",
    "punjab": "Punjab",
    "rajasthan": "Rajasthan",
    "sikkim": "Sikkim",
    "tamil nadu": "Tamil Nadu",
    "telangana": "Telangana",
    "tripura": "Tripura",
    "uttar pradesh": "Uttar Pradesh",
    "uttarakhand": "Uttarakhand",
    "west bengal": "West Bengal",
}

STATE_ALIASES: dict[str, str] = {
    "up":       "Uttar Pradesh",
    "mp":       "Madhya Pradesh",
    "ap":       "Andhra Pradesh",
    "tn":       "Tamil Nadu",
    "wb":       "West Bengal",
    "hp":       "Himachal Pradesh",
    "j&k":      "Jammu & Kashmir",
    "jk":       "Jammu & Kashmir",
    "uk":       "Uttarakhand",
    "pb":       "Punjab",
    "hr":       "Haryana",
    "ncr":      "Delhi",
    "new delhi": "Delhi",
}


def _location_key(name: str) -> str:
    """Normalise a location name to a stable lowercase lookup key."""
    key = (name or "").strip().strip(".,")
    key = re.sub(r"\s+", " ", key)
    return key.lower()


def _load_district_catalog() -> tuple[dict, dict, dict]:
    """
    Parse the frontend districts.js file once at startup.
    Returns (district_to_state, district_canonical, state_to_districts).
    """
    district_to_state:   dict[str, str]       = {}
    district_canonical:  dict[str, str]       = {}
    state_to_districts:  dict[str, list[str]] = {}
    try:
        # Walk up from this file to repo root, then into frontend/lib/
        path = Path(__file__).resolve().parents[1] / "frontend" / "lib" / "districts.js"
        raw  = path.read_text(encoding="utf-8")
        # Strip JS line comments
        raw = re.sub(r"(?m)//.*$", "", raw)
        match = re.search(
            r"export\s+const\s+INDIA_DISTRICTS\s*=\s*\{(.*?)\};",
            raw, flags=re.S
        )
        if not match:
            log.warning("location_utils: Could not find INDIA_DISTRICTS in districts.js")
            return district_to_state, district_canonical, state_to_districts

        body = match.group(1)
        for item in re.finditer(r'"([^"]+)"\s*:\s*\[(.*?)\]\s*,?', body, flags=re.S):
            state     = item.group(1).strip()
            districts = [d.strip() for d in re.findall(r'"([^"]+)"', item.group(2))]
            if not districts:
                continue
            state_to_districts[state] = districts
            for district in districts:
                key = _location_key(district)
                district_canonical.setdefault(key, district)
                district_to_state.setdefault(key, state)

    except Exception:
        log.warning("location_utils: Could not load district catalog", exc_info=True)

    return district_to_state, district_canonical, state_to_districts


# Module-level singletons — loaded once at import time
DISTRICT_TO_STATE, DISTRICT_CANONICAL, STATE_TO_DISTRICTS = _load_district_catalog()


def normalize_state_name(name: str) -> str | None:
    key = _location_key(name)
    if not key:
        return None
    if key in INDIAN_STATES_NORMALIZED:
        return INDIAN_STATES_NORMALIZED[key]
    return STATE_ALIASES.get(key)


def normalize_district_name(
    name: str,
    state_hint: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (canonical_district, state) or (None, None) if not found."""
    key = _location_key(name)
    if not key:
        return None, None
    # State-scoped lookup first (avoids cross-state ambiguity for common names)
    if state_hint and state_hint in STATE_TO_DISTRICTS:
        for district in STATE_TO_DISTRICTS[state_hint]:
            if _location_key(district) == key:
                return district, state_hint
    canonical = DISTRICT_CANONICAL.get(key)
    if not canonical:
        return None, None
    return canonical, DISTRICT_TO_STATE.get(key)
