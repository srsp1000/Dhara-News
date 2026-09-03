"""
api/location_utils.py

DUPLICATE FIX (Section 02 of audit):
    This file was a near-copy of shared/location_utils.py with slight divergence
    (missing the FIX #7 docstring and a few helper functions).
    Any change to district mapping had to be applied in two places independently.

    This module is now a thin re-export stub. All logic lives in
    shared/location_utils.py (the single source of truth).

    Callers that did `from location_utils import X` continue to work unchanged.
"""

from shared.location_utils import (  # noqa: F401  re-export everything
    INDIAN_STATES_NORMALIZED,
    _location_key,
    _load_district_catalog,
    normalize_state_name,
    normalize_district_name,
)

# Lazy-load the catalog on first access (same behaviour as before)
try:
    DISTRICT_TO_STATE, DISTRICT_CANONICAL, STATE_TO_DISTRICTS = _load_district_catalog()
except Exception:
    DISTRICT_TO_STATE, DISTRICT_CANONICAL, STATE_TO_DISTRICTS = {}, {}, {}
