"""
api/truth_scoring.py

DUPLICATE FIX (Section 02 of audit):
    This file was a verbatim copy of shared/truth_scoring.py.
    Having three copies means any algorithm change applied to one
    leaves the others stale — a silent scoring divergence.

    This module is now a thin re-export stub. All logic lives in
    shared/truth_scoring.py (the single source of truth).

    Callers that did `from truth_scoring import X` continue to work
    without any change.
"""

from shared.truth_scoring import (  # noqa: F401  re-export everything
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
