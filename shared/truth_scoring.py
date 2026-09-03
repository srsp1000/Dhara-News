from __future__ import annotations

from typing import Optional

# Domain sensitivity
HIGH_STAKES_DOMAINS = frozenset({"health", "judiciary", "defence", "security"})

# Probabilistic gating thresholds
P_VERIFIED_DEFAULT = 0.85
P_VERIFIED_HIGH_STAKES = 0.90
P_DEVELOPING_MIN = 0.55
N_EFF_VERIFIED_DEFAULT = 2.0
N_EFF_VERIFIED_HIGH_STAKES = 3.0
MANIPULATION_QUARANTINE_THRESHOLD = 0.7
SINGLE_SOURCE_EXCEPTION_MIN_P = 0.95

# Narrow allowlist for official primary sources eligible for single-source verify.
OFFICIAL_PRIMARY_SOURCE_ALLOWLIST = frozenset(
    {
        "pib.gov.in",
        "pib.nic.in",
        "rbi.org.in",
        "eci.gov.in",
        "egazette.gov.in",
        "supremecourt.gov.in",
        "indiacode.nic.in",
    }
)

# Legacy integer thresholds kept for backward compatibility with callers/tests.
HIGH_STAKES_VERIFIED_THRESHOLD = int(P_VERIFIED_HIGH_STAKES * 100)
DEFAULT_VERIFIED_THRESHOLD = int(P_VERIFIED_DEFAULT * 100)
DEFAULT_DEVELOPING_THRESHOLD = int(P_DEVELOPING_MIN * 100)


def probability_to_truth_score(probability: float) -> int:
    """Convert [0,1] probability to integer truth score [0,100] using half-up rounding."""
    p = max(0.0, min(1.0, float(probability)))
    return int(p * 100.0 + 0.5)


def assign_label(
    article_p: float,
    n_eff: float,
    domain: str,
    has_contradiction: bool,
    manipulation_score: float = 0.0,
    source_count: int = 2,
    primary_source_domain: Optional[str] = None,
    p_verified_default: Optional[float] = None,
    p_verified_high_stakes: Optional[float] = None,
    n_eff_verified_default: Optional[float] = None,
    n_eff_high_stakes: Optional[float] = None,
    single_source_exception_min_p: Optional[float] = None,
) -> tuple[str, str]:
    """Canonical truth-label assignment logic shared by verification, monitoring, and API."""
    domain = str(domain or "").strip().lower()
    is_high_stakes = domain in HIGH_STAKES_DOMAINS
    p_default = p_verified_default if p_verified_default is not None else P_VERIFIED_DEFAULT
    p_high = p_verified_high_stakes if p_verified_high_stakes is not None else P_VERIFIED_HIGH_STAKES
    n_default = (
        n_eff_verified_default if n_eff_verified_default is not None else N_EFF_VERIFIED_DEFAULT
    )
    n_high = n_eff_high_stakes if n_eff_high_stakes is not None else N_EFF_VERIFIED_HIGH_STAKES
    single_source_p = (
        single_source_exception_min_p
        if single_source_exception_min_p is not None
        else SINGLE_SOURCE_EXCEPTION_MIN_P
    )
    p_threshold = p_high if is_high_stakes else p_default
    n_threshold = n_high if is_high_stakes else n_default
    source_domain = str(primary_source_domain or "").strip().lower()

    if manipulation_score >= MANIPULATION_QUARANTINE_THRESHOLD:
        return "quarantine", "strong_manipulation_signal"

    if article_p < P_DEVELOPING_MIN:
        return "quarantine", f"low_confidence_{article_p:.2f}"

    if has_contradiction:
        return "developing", "unresolved_contradiction"

    if article_p >= p_threshold and n_eff >= n_threshold:
        return "verified", f"p={article_p:.2f}_n={n_eff:.2f}"

    # Exception path: allow single-source verification only for official
    # primary sources and only in non-high-stakes domains.
    if (
        source_count == 1
        and not is_high_stakes
        and source_domain in OFFICIAL_PRIMARY_SOURCE_ALLOWLIST
        and article_p >= single_source_p
        and n_eff >= 0.95
    ):
        return "verified", f"single_source_official p={article_p:.2f}_n={n_eff:.2f}_{source_domain}"

    return "developing", f"p={article_p:.2f}_n={n_eff:.2f}_threshold_not_met"
