"""
agents/truth_scoring.py

DUPLICATE FIX (Section 02 of audit):
    This file was a verbatim copy of shared/truth_scoring.py.
    All logic now lives in shared/truth_scoring.py.
    This stub re-exports everything so existing imports keep working.
"""

from shared.truth_scoring import (  # noqa: F401
    HIGH_STAKES_DOMAINS,
    P_VERIFIED_DEFAULT,
    P_VERIFIED_HIGH_STAKES,
    P_DEVELOPING_MIN,
    N_EFF_VERIFIED_DEFAULT,
    N_EFF_VERIFIED_HIGH_STAKES,
    MANIPULATION_QUARANTINE_THRESHOLD,
    SINGLE_SOURCE_EXCEPTION_MIN_P,
    OFFICIAL_PRIMARY_SOURCE_ALLOWLIST,
    HIGH_STAKES_VERIFIED_THRESHOLD,
    DEFAULT_VERIFIED_THRESHOLD,
    DEFAULT_DEVELOPING_THRESHOLD,
    probability_to_truth_score,
    assign_label,
)
