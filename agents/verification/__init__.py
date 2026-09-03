"""
agents/verification/__init__.py

BAYESIAN EVIDENCE FUSION ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replaces the heuristic point system (base + cred_b + multi ± penalties)
with a probabilistic Bayesian model operating at claim level.

WHY THE OLD SYSTEM WAS INSUFFICIENT
─────────────────────────────────────
1. Article-centric, not claim-centric.
   A single article could have a PIB quote (true) and an unverified statistic
   (false) — and the old system averaged them into one score. Claims are the
   atomic unit of truth; articles aggregate claims.

2. Raw source_count inflated by syndication.
   If 8 outlets republish the same PTI wire story, old code counted 8
   "independent" sources. The Bayesian model computes N_eff (effective
   independent sources), discounting correlated sources via ρ (rho).

3. Subtractive penalties were arbitrary and gameable.
   "Sensational word → -10" has no probabilistic basis. The new model treats
   fake signals as likelihood multipliers that shift the posterior downward,
   not as fixed deductions from an opaque score.

4. No uncertainty output.
   A score of 72 and a score of 72 look identical but one might have N=1
   high-quality source (low uncertainty) and the other N=6 conflicting
   sources (high uncertainty). The new model outputs a confidence interval.

THE MODEL
──────────
For each article:
  1. Extract 3–7 atomic claims (done by ClaimExtractionAgent, unchanged).
  2. For each claim, collect supporting evidence vectors from Qdrant.
  3. Compute N_eff = Σ wᵢ · (1 − ρᵢ)
     where wᵢ = source credibility weight, ρᵢ = correlation with already-
     counted sources (same wire, syndication, shared ownership, near-
     duplicate language).
  4. Look up dynamic source reliability prior θ(s,d,t) = P(source s is
     correct in domain d at time t), stored in Redis and updated when
     corrections are published.
  5. Update claim truth posterior using evidence likelihoods:
       P(T|E) ∝ P(T) · Π_j P(e_j | T, θ_sj,d,t, independence)
  6. Aggregate claim posteriors into article verification probability.
  7. Apply strict gating rules for label assignment.

LABELS (replacing the 0–100 integer score for decisions)
─────────────────────────────────────────────────────────
Verified:   P ≥ 0.85, N_eff ≥ 2.0, no unresolved high-conf contradiction
            For high-stakes (health/judiciary/defence): P ≥ 0.90, N_eff ≥ 3.0
Developing: 0.55 ≤ P < 0.85, or unresolved contradiction
Quarantine: P < 0.55, or strong manipulation signal

The 0–100 integer score exposed in the API is computed as:
    truth_score = round(P * 100)
so existing frontend/API contracts are unchanged.

SOURCE OWNERSHIP GRAPH (ρ computation)
──────────────────────────────────────
Known syndication/ownership chains are encoded in SOURCE_OWNERSHIP_GRAPH.
When two sources are in the same chain, ρ = 0.85 (highly correlated).
When they share the same wire feed origin, ρ = 0.60.
Otherwise ρ = 0.0 (assumed independent — the safe default).
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from datetime import datetime, timezone, timedelta

try:
    from shared.truth_scoring import (
        DEFAULT_DEVELOPING_THRESHOLD,
        DEFAULT_VERIFIED_THRESHOLD,
        HIGH_STAKES_DOMAINS,
        HIGH_STAKES_VERIFIED_THRESHOLD,
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_DEVELOPING_MIN,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
        probability_to_truth_score,
    )
except Exception:
    from truth_scoring import (
        DEFAULT_DEVELOPING_THRESHOLD,
        DEFAULT_VERIFIED_THRESHOLD,
        HIGH_STAKES_DOMAINS,
        HIGH_STAKES_VERIFIED_THRESHOLD,
        N_EFF_VERIFIED_DEFAULT,
        N_EFF_VERIFIED_HIGH_STAKES,
        P_DEVELOPING_MIN,
        P_VERIFIED_DEFAULT,
        P_VERIFIED_HIGH_STAKES,
        SINGLE_SOURCE_EXCEPTION_MIN_P,
        assign_label as _assign_label,
        probability_to_truth_score,
    )

try:
    from agents.base import BaseAgent, Q
except ModuleNotFoundError:
    from base import BaseAgent, Q

log = logging.getLogger(__name__)

# ── Satire detection ──────────────────────────────────────────────────────────
SATIRE_DOMAINS = frozenset({
    "theonion.com", "babylonbee.com", "fauxy.net", "thefauxy.com",
    "cracked.com", "clickhole.com", "reductress.com",
})

# ── Source ownership / syndication correlation graph ─────────────────────────
# ρ_ij: correlation between source i and source j (0=independent, 1=identical)
# Only non-zero pairs need to be listed; the graph is symmetric.
SOURCE_OWNERSHIP_GRAPH: dict[tuple[str, str], float] = {
    # Times of India group
    ("timesofindia.com", "economictimes.com"):    0.75,
    ("timesofindia.com", "navbharattimes.com"):   0.80,
    ("economictimes.com", "navbharattimes.com"):  0.70,
    # HT Media
    ("hindustantimes.com", "livemint.com"):       0.75,
    ("hindustantimes.com", "htschool.com"):       0.85,
    # Network18
    ("cnbctv18.com", "moneycontrol.com"):         0.80,
    ("cnbctv18.com", "news18.com"):               0.75,
    ("news18.com", "moneycontrol.com"):           0.70,
    ("firstpost.com", "news18.com"):              0.75,
    # NDTV group
    ("ndtv.com", "ndtvcooking.com"):              0.90,
    # Wire services (all derived from same PTI/ANI wire get high ρ)
    ("timesofindia.com", "hindustantimes.com"):   0.55,  # both use PTI
    ("ndtv.com", "hindustantimes.com"):           0.50,
    # Government / PIB syndication
    ("pib.gov.in", "pib.nic.in"):                 0.95,
    # Reuters content syndicated to many
    ("reuters.com", "thehindu.com"):              0.40,  # partial syndication
    ("reuters.com", "ndtv.com"):                  0.40,
}


def _get_source_correlation(domain_a: str, domain_b: str) -> float:
    """Return ρ (correlation) between two source domains."""
    if domain_a == domain_b:
        return 1.0
    key = (min(domain_a, domain_b), max(domain_a, domain_b))
    return SOURCE_OWNERSHIP_GRAPH.get(key, 0.0)


def _compute_n_eff(evidence_list: list[dict]) -> float:
    """
    Compute N_eff = Σᵢ wᵢ · (1 − ρᵢ)

    evidence_list: list of {"domain": str, "cred": float, "tier": int}
    Returns the effective number of independent credible sources.

    Algorithm:
    - Process sources in descending credibility order.
    - For each source, compute its contribution weight wᵢ = cred_score.
    - Penalise by the maximum correlation ρᵢ with any already-counted source.
    - Accumulate into N_eff.
    """
    if not evidence_list:
        return 0.0

    # Sort by credibility descending (highest quality sources counted first)
    sorted_ev = sorted(evidence_list, key=lambda x: x.get("cred", 0.5), reverse=True)
    counted_evidence: list[dict] = []
    n_eff = 0.0

    for ev in sorted_ev:
        domain = ev.get("domain", "")
        cred   = float(ev.get("cred", 0.5))
        ownership_chain = str(ev.get("ownership_chain") or "").strip().lower()
        wire_source = str(ev.get("wire_source") or "").strip().lower()

        # Maximum correlation with any already-counted source
        if counted_evidence:
            rho = 0.0
            for counted in counted_evidence:
                counted_domain = str(counted.get("domain", ""))
                rho = max(rho, _get_source_correlation(domain, counted_domain))

                counted_chain = str(counted.get("ownership_chain") or "").strip().lower()
                if ownership_chain and counted_chain and ownership_chain == counted_chain:
                    rho = max(rho, 0.75)

                counted_wire = str(counted.get("wire_source") or "").strip().lower()
                if wire_source and counted_wire and wire_source == counted_wire:
                    rho = max(rho, 0.60)
        else:
            rho = 0.0

        contribution = cred * (1.0 - rho)
        n_eff += contribution
        counted_evidence.append(ev)

    return round(n_eff, 3)


# ── Dynamic source reliability prior management ───────────────────────────────
# θ(s,d,t) = P(source s is correct in domain d at time t)
# Stored in Redis as "src_prior:{domain}:{domain_tag}" → float
# Updated by correction events and accuracy tracking.

DOMAIN_PRIORS_DEFAULT: dict[str, float] = {
    "government": 0.95,
    "wire":       0.92,
    "national":   0.82,
    "business":   0.80,
    "law":        0.85,
    "science":    0.87,
    "sports":     0.88,
    "startups":   0.72,
    "satire":     0.00,
}

RUNTIME_CONFIG_DEFAULTS: dict[str, str] = {
    "p_verified_default": str(P_VERIFIED_DEFAULT),
    "p_verified_high_stakes": str(P_VERIFIED_HIGH_STAKES),
    "n_eff_verified_default": str(N_EFF_VERIFIED_DEFAULT),
    "n_eff_high_stakes": str(N_EFF_VERIFIED_HIGH_STAKES),
    "single_source_exception_min_p": str(SINGLE_SOURCE_EXCEPTION_MIN_P),
}


def _safe_float(value, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _evidence_likelihood(
    e_consistent: bool,
    source_prior: float,
    claim_prior_given_true: float = 0.9,
    claim_prior_given_false: float = 0.1,
    fake_penalty: float = 0.0,
) -> float:
    """
    Compute P(evidence | T) — the likelihood that this evidence would appear
    if the claim is true.

    e_consistent = True  → this source supports the claim
    e_consistent = False → this source contradicts the claim

    fake_penalty ∈ [0, 1]: manipulation/sensational signal strength.
    Higher fake_penalty → evidence is less trustworthy as support.
    """
    if e_consistent:
        raw = source_prior * claim_prior_given_true
        # Fake signal reduces the strength of supporting evidence
        return raw * (1.0 - fake_penalty * 0.5)
    else:
        # Contradicting evidence: P(e|False) > P(e|True)
        return source_prior * claim_prior_given_false * (1.0 + fake_penalty * 0.3)


def _update_posterior(
    prior: float,
    evidence_list: list[dict],
    fake_penalty: float = 0.0,
) -> tuple[float, float]:
    """
    Bayesian posterior update for a single claim.

    P(T|E) ∝ P(T) · Π_j P(e_j | T, θ_sj, independence)

    Returns (posterior_probability, uncertainty_width).
    """
    if not evidence_list:
        return prior, 0.4  # high uncertainty with no evidence

    log_ratio = math.log(prior / max(1e-9, 1.0 - prior))  # log-odds of prior

    counted_domains: list[str] = []

    for ev in evidence_list:
        domain        = ev.get("domain", "")
        source_prior  = float(ev.get("prior", 0.80))
        consistent    = bool(ev.get("consistent", True))

        # Discount for correlation (independence penalty)
        if counted_domains:
            rho = max(_get_source_correlation(domain, d) for d in counted_domains)
        else:
            rho = 0.0
        independence_factor = 1.0 - rho

        lh = _evidence_likelihood(consistent, source_prior, fake_penalty=fake_penalty)
        # Weight the log-odds update by independence
        log_update = math.log(max(1e-9, lh) / max(1e-9, 1.0 - lh))
        log_ratio += log_update * independence_factor * source_prior

        counted_domains.append(domain)

    posterior = 1.0 / (1.0 + math.exp(-log_ratio))
    posterior = max(0.0, min(1.0, posterior))

    # Uncertainty: wider when few evidence items or when evidence is conflicting
    n = len(evidence_list)
    conflicting = sum(1 for e in evidence_list if not e.get("consistent", True))
    uncertainty = max(0.05, 0.5 / max(1, n) + 0.15 * (conflicting / max(1, n)))

    return round(posterior, 4), round(min(0.5, uncertainty), 4)


def _aggregate_claim_posteriors(
    claim_posteriors: list[tuple[float, float]],
    claim_weights: list[float] | None = None,
) -> tuple[float, float]:
    """
    Aggregate per-claim posteriors into an article-level verification probability.

    Uses weighted geometric mean of posteriors (conservative — a single
    very-low-confidence claim pulls the article score down significantly).

    Returns (article_probability, article_uncertainty).
    """
    if not claim_posteriors:
        return 0.5, 0.5

    weights = claim_weights or [1.0] * len(claim_posteriors)
    total_w = sum(weights)

    # Geometric mean in log space
    log_sum = sum(w * math.log(max(1e-9, p)) for (p, _), w in zip(claim_posteriors, weights))
    article_p = math.exp(log_sum / total_w)
    article_p = max(0.0, min(1.0, article_p))

    # Combined uncertainty (pooled)
    avg_uncertainty = sum(u * w for (_, u), w in zip(claim_posteriors, weights)) / total_w

    return round(article_p, 4), round(avg_uncertainty, 4)


# ════════════════════════════════════════════════════════════════════════════
# 1. CLAIM EXTRACTION AGENT  (unchanged — already uses few-shot prompts)
# ════════════════════════════════════════════════════════════════════════════
class ClaimExtractionAgent(BaseAgent):
    name         = "claim-extraction"
    input_queue  = Q.VERIFY_CLAIMS
    output_queue = Q.VERIFY_XREF
    CACHE_TTL    = 3600 * 6

    async def process(self, payload: dict) -> dict | None:
        title      = payload.get("platform_headline") or payload.get("title", "")
        text       = payload.get("full_body") or payload.get("description", "")
        article_id = payload.get("article_id", "")
        cache_key  = f"claims:{article_id}"

        cached = await self.cache_get(cache_key)
        if cached:
            payload["claims"] = json.loads(cached)
            return payload

        claims = await self._extract_claims(title, text)
        await self.cache_set(cache_key, json.dumps(claims), self.CACHE_TTL)
        payload["claims"] = claims
        return payload

    async def _extract_claims(self, title: str, text: str) -> list[dict]:
        prompt = f"""Extract 3–7 atomic, independently verifiable factual claims from this article.
Each claim must be a single verifiable assertion — not compound, not vague.

TYPE (use one): announcement | event | statistic | appointment | allegation | denial | numerical-claim | attribution

FEW-SHOT EXAMPLES:
"RBI raised repo rate to 6.75% on Friday, its third hike this year."
→ [{{"text":"RBI raised the repo rate to 6.75%.","subject":"RBI","type":"statistic","confidence":0.97}},
   {{"text":"The 6.75% rate is RBI's third hike this year.","subject":"RBI","type":"numerical-claim","confidence":0.93}}]

"ISRO launched NISAR satellite from Sriharikota at 6:30 AM IST."
→ [{{"text":"ISRO launched the NISAR satellite from Sriharikota.","subject":"ISRO","type":"event","confidence":0.98}},
   {{"text":"The launch occurred at 6:30 AM IST.","subject":"NISAR","type":"numerical-claim","confidence":0.96}}]

NOW EXTRACT:
Title: {title}
Body: {text[:3000]}

Return ONLY a JSON array. Claims with confidence < 0.70 → omit.
[{{"text":"...","subject":"...","type":"...","confidence":0.0}}]"""

        try:
            resp   = await self.llm(prompt, json_mode=True)
            parsed = json.loads(resp)
            if isinstance(parsed, list):
                return [c for c in parsed[:7] if float(c.get("confidence", 0)) >= 0.70]
        except Exception as e:
            log.debug(f"Claim extraction failed: {e}")
        return [{"text": title, "subject": "", "type": "event", "confidence": 0.50}]


# ════════════════════════════════════════════════════════════════════════════
# 2. BAYESIAN CROSS-REFERENCE AGENT
#    Replaces the raw confirmations counter with N_eff computation and
#    per-claim posterior estimates.
# ════════════════════════════════════════════════════════════════════════════
class CrossReferenceAgent(BaseAgent):
    """
    For each extracted claim, searches Qdrant for supporting/contradicting
    evidence from other articles.

    Computes:
    - Per-claim posterior probabilities using Bayesian evidence fusion
    - N_eff (effective independent source count) using ownership-aware ρ
    - Article-level verification probability (geometric mean of claim posteriors)
    - Uncertainty interval

    Stores both the Bayesian outputs AND a legacy cross_ref_boost (0–30)
    so the old TruthScoreAgent still works during migration.
    """
    name                 = "cross-reference"
    input_queue          = Q.VERIFY_XREF
    output_queue         = Q.VERIFY_CREDIBILITY
    SIMILARITY_THRESHOLD = 0.80   # slightly lower for recall
    CONTRADICTION_THRESHOLD = 0.70  # lower threshold to catch near-contradictions
    SOURCE_METADATA_CACHE_TTL = 3600

    async def on_start(self):
        try:
            await self.qdrant.get_collection("claims")
        except Exception:
            from qdrant_client.models import Distance, VectorParams
            await self.qdrant.create_collection(
                collection_name="claims",
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )

    async def _get_source_metadata(self, domain: str) -> dict:
        if not domain:
            return {}

        cache_key = f"src_meta:{domain}"
        try:
            cached = await self.redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass

        try:
            row = await self.db_fetchrow(
                """SELECT cred_score, category, ownership_chain, wire_source
                   FROM sources WHERE domain = $1""",
                domain,
            )
            if row:
                data = {
                    "cred_score": float(row["cred_score"] or 0.5),
                    "category": str(row["category"] or "national"),
                    "ownership_chain": str(row["ownership_chain"] or ""),
                    "wire_source": str(row["wire_source"] or ""),
                }
                try:
                    await self.redis_client.setex(cache_key, self.SOURCE_METADATA_CACHE_TTL, json.dumps(data))
                except Exception:
                    pass
                return data
        except Exception:
            pass

        return {}

    async def _get_source_prior(self, domain: str, topic_domain: str) -> float:
        """Fetch θ(s,d,t) from Redis, fall back to category default."""
        try:
            key = f"src_prior:{domain}:{topic_domain}"
            val = await self.redis_client.get(key)
            if val:
                return float(val)
        except Exception:
            pass
        meta = await self._get_source_metadata(domain)
        if meta:
            base_prior = float(meta.get("cred_score") or DOMAIN_PRIORS_DEFAULT.get(str(meta.get("category") or "national"), 0.78))
            try:
                await self.redis_client.setex(
                    f"src_prior:{domain}:{topic_domain}", 3600, str(base_prior)
                )
            except Exception:
                pass
            return base_prior
        return DOMAIN_PRIORS_DEFAULT.get("national", 0.78)

    async def process(self, payload: dict) -> dict | None:
        claims      = payload.get("claims", [])
        article_id  = payload.get("article_id", "")
        source_domain = payload.get("source_domain", "")
        source_tier = int(payload.get("source_tier", 3))
        source_cred = float(payload.get("source_cred", 0.5))
        topic_domain = str(payload.get("domain", "national")).lower()
        fake_penalty = float(payload.get("fake_penalty", 0)) / 100.0  # normalise to [0,1]

        claim_posteriors: list[tuple[float, float]] = []
        claim_weights:    list[float]               = []
        all_evidence:     list[dict]                = []
        has_contradiction = False

        for claim in claims[:7]:
            claim_text = claim.get("text", "")
            if not claim_text:
                continue

            # Prior: novelty check — fresh uncorroborated claims start at 0.60
            claim_confidence = float(claim.get("confidence", 0.7))
            prior = 0.55 + (claim_confidence * 0.15)  # [0.55, 0.70]

            try:
                embedding = await self.embed(claim_text)

                # Search for supporting evidence
                support_results = await self.qdrant.search(
                    collection_name="claims",
                    query_vector=embedding,
                    limit=8,
                    score_threshold=self.SIMILARITY_THRESHOLD,
                )

                # Search for contradicting evidence (opposite polarity)
                # We do this by checking for near-matches that have contradicting metadata
                evidence_list: list[dict] = []

                for hit in support_results:
                    hit_article_id = hit.payload.get("article_id", "")
                    hit_domain     = hit.payload.get("source_domain", "")
                    hit_cred       = float(hit.payload.get("source_cred", 0.5))
                    hit_tier       = int(hit.payload.get("source_tier", 3))
                    hit_contradicts = bool(hit.payload.get("contradicts_claim", False))

                    if hit_article_id == article_id:
                        continue  # skip self-reference

                    source_meta = await self._get_source_metadata(hit_domain)
                    prior_for_source = await self._get_source_prior(hit_domain, topic_domain)

                    ev = {
                        "domain":     hit_domain,
                        "cred":       hit_cred,
                        "tier":       hit_tier,
                        "prior":      prior_for_source,
                        "consistent": not hit_contradicts,
                        "sim_score":  float(hit.score),
                        "ownership_chain": source_meta.get("ownership_chain", ""),
                        "wire_source": source_meta.get("wire_source", ""),
                    }
                    evidence_list.append(ev)
                    all_evidence.append(ev)

                    if hit_contradicts and hit.score >= self.CONTRADICTION_THRESHOLD:
                        has_contradiction = True

                # Bayesian posterior for this claim
                claim_p, claim_u = _update_posterior(prior, evidence_list, fake_penalty)
                claim_posteriors.append((claim_p, claim_u))

                # Weight by claim confidence (higher-confidence claims matter more)
                claim_weights.append(claim_confidence)

                # Store claim vector for future cross-referencing
                await self.qdrant.upsert(
                    collection_name="claims",
                    points=[{
                        "id":      hash(f"{article_id}:{claim_text}") % (2 ** 53),
                        "vector":  embedding,
                        "payload": {
                            "article_id":         article_id,
                            "claim":              claim_text,
                            "source_tier":        source_tier,
                            "source_cred":        source_cred,
                            "source_domain":      source_domain,
                            "contradicts_claim":  False,
                            "domain":             topic_domain,
                            "created_at":         datetime.now(timezone.utc).isoformat(),
                        },
                    }]
                )

            except Exception as e:
                log.debug(f"CrossRef claim processing failed: {e}")
                # Add prior-only estimate when embedding fails
                claim_posteriors.append((prior, 0.4))
                claim_weights.append(claim_confidence)

        # Article-level aggregation
        if claim_posteriors:
            article_p, article_u = _aggregate_claim_posteriors(claim_posteriors, claim_weights)
        else:
            article_p, article_u = 0.55, 0.45

        # Compute N_eff from all evidence collected
        n_eff = _compute_n_eff(all_evidence)

        # Legacy cross_ref_boost for backward compatibility
        cross_ref_boost = min(30, round(n_eff * 6))

        payload["article_probability"]  = article_p
        payload["article_uncertainty"]  = article_u
        payload["n_eff"]                = n_eff
        payload["claim_posteriors"]     = [{"p": p, "u": u} for p, u in claim_posteriors]
        payload["has_contradiction"]    = has_contradiction
        payload["cross_ref_boost"]      = cross_ref_boost  # legacy compat
        payload["confirmation_count"]   = len([e for e in all_evidence if e.get("consistent")])

        log.debug(
            f"CrossRef: P={article_p:.3f} ±{article_u:.3f} "
            f"N_eff={n_eff:.2f} contradiction={has_contradiction}"
        )
        return payload


# ════════════════════════════════════════════════════════════════════════════
# 3. SOURCE CREDIBILITY AGENT
#    Now emits a source_prior for use in Bayesian updates.
# ════════════════════════════════════════════════════════════════════════════
class SourceCredibilityAgent(BaseAgent):
    name         = "source-credibility"
    input_queue  = Q.VERIFY_CREDIBILITY
    output_queue = Q.VERIFY_SCORE

    TIER_BASE_SCORES  = {1: 85, 2: 65, 3: 40}
    SINGLE_SOURCE_CAPS = {1: 78, 2: 70, 3: 55}

    async def process(self, payload: dict) -> dict | None:
        source_tier  = int(payload.get("source_tier", 3))
        source_cred  = float(payload.get("source_cred", 0.5))
        source_count = int(payload.get("source_count", 1))

        base   = self.TIER_BASE_SCORES.get(source_tier, 40)
        cred_b = int(source_cred * 15)
        multi  = min(15, (source_count - 1) * 5)
        score  = min(100, base + cred_b + multi)

        if source_count < 2:
            cap   = self.SINGLE_SOURCE_CAPS.get(source_tier, 55)
            score = min(score, cap)

        # Emit source prior for Bayesian use
        payload["source_prior"]      = source_cred
        payload["credibility_score"] = score
        payload["truth_score"]       = score
        return payload


# ════════════════════════════════════════════════════════════════════════════
# 4. TRUTH SCORE AGENT  (BAYESIAN VERSION)
#    Uses article_probability from CrossReferenceAgent when available,
#    falls back to the heuristic score for articles that bypass cross-ref.
# ════════════════════════════════════════════════════════════════════════════
class TruthScoreAgent(BaseAgent):
    name         = "truth-score"
    input_queue  = Q.VERIFY_SCORE
    output_queue = Q.NLP_ENTITIES

    async def _load_runtime_config(self) -> dict[str, str]:
        cfg = dict(RUNTIME_CONFIG_DEFAULTS)
        try:
            cached = await self.redis_client.get("admin:config")
            if cached:
                data = json.loads(cached)
                if isinstance(data, dict):
                    return {**cfg, **{str(k): str(v) for k, v in data.items()}}
        except Exception:
            pass

        try:
            rows = await self.db_fetch("SELECT key, value FROM admin_config")
            for row in rows:
                cfg[str(row["key"])] = str(row["value"])
        except Exception:
            pass
        return cfg

    async def process(self, payload: dict) -> dict | None:
        runtime_cfg = await self._load_runtime_config()
        p_verified_default = _safe_float(runtime_cfg.get("p_verified_default"), P_VERIFIED_DEFAULT)
        p_verified_high_stakes = _safe_float(runtime_cfg.get("p_verified_high_stakes"), P_VERIFIED_HIGH_STAKES)
        n_eff_verified_default = _safe_float(runtime_cfg.get("n_eff_verified_default"), N_EFF_VERIFIED_DEFAULT)
        n_eff_high_stakes = _safe_float(runtime_cfg.get("n_eff_high_stakes"), N_EFF_VERIFIED_HIGH_STAKES)
        single_source_exception_min_p = _safe_float(
            runtime_cfg.get("single_source_exception_min_p"),
            SINGLE_SOURCE_EXCEPTION_MIN_P,
        )
        # ── Bayesian path (cross-reference has run) ──────────────────────
        article_p = payload.get("article_probability")
        n_eff     = payload.get("n_eff")

        domain            = str(payload.get("domain", "")).lower().strip()
        has_contradiction = bool(payload.get("has_contradiction", False))
        fake_penalty_raw  = float(payload.get("fake_penalty", 0))
        manipulation_score = min(1.0, fake_penalty_raw / 30.0)  # normalise 0–30 → 0–1
        source_count      = int(payload.get("source_count", 1))
        source_tier       = int(payload.get("source_tier", 3))

        if article_p is not None and n_eff is not None:
            # Bayesian path
            # Apply manipulation penalty as a likelihood modifier on article_p
            if manipulation_score > 0:
                # Bayesian: P(T|manipulation) = P(T) * (1 - manipulation_scale)
                article_p = article_p * (1.0 - manipulation_score * 0.4)
                article_p = max(0.0, min(1.0, article_p))

            status, reason = _assign_label(
                article_p,
                n_eff,
                domain,
                has_contradiction,
                manipulation_score,
                source_count=source_count,
                primary_source_domain=payload.get("source_domain"),
                p_verified_default=p_verified_default,
                p_verified_high_stakes=p_verified_high_stakes,
                n_eff_verified_default=n_eff_verified_default,
                n_eff_high_stakes=n_eff_high_stakes,
                single_source_exception_min_p=single_source_exception_min_p,
            )
            final_score = probability_to_truth_score(article_p)

            payload["_score_meta"] = {
                "model":            "bayesian",
                "article_p":        article_p,
                "article_u":        payload.get("article_uncertainty", 0.3),
                "n_eff":            n_eff,
                "domain":           domain,
                "is_high_stakes":   domain in HIGH_STAKES_DOMAINS,
                "has_contradiction": has_contradiction,
                "manipulation_score": manipulation_score,
                "label_reason":     reason,
                "p_threshold":      p_verified_high_stakes if domain in HIGH_STAKES_DOMAINS else p_verified_default,
                "n_threshold":      n_eff_high_stakes if domain in HIGH_STAKES_DOMAINS else n_eff_verified_default,
            }

        else:
            # ── Heuristic fallback (when cross-ref didn't run) ───────────
            cred_score   = int(payload.get("credibility_score", payload.get("truth_score", 50)))
            xref_boost   = int(payload.get("cross_ref_boost", 0))
            fake_penalty = int(payload.get("fake_penalty", 0))

            if has_contradiction:
                fake_penalty = min(100, fake_penalty + 10)

            final_score = max(0, min(100, cred_score + xref_boost - fake_penalty))
            xref_lifts_cap = xref_boost >= 15

            if source_count < 2:
                cap = SourceCredibilityAgent.SINGLE_SOURCE_CAPS.get(source_tier, 55)
                if xref_lifts_cap:
                    cap += 8
                final_score = min(final_score, cap)

            article_p = final_score / 100.0
            is_high_stakes = domain in HIGH_STAKES_DOMAINS
            verified_threshold = round((p_verified_high_stakes if is_high_stakes else p_verified_default) * 100)

            can_verify = (
                not has_contradiction
                and source_count >= 2
                and final_score >= verified_threshold
            )

            if can_verify:
                status = "verified"
            elif final_score >= DEFAULT_DEVELOPING_THRESHOLD:
                status = "developing"
            else:
                status = "quarantine"

            reason = f"heuristic_fallback score={final_score}"
            payload["_score_meta"] = {
                "model":             "heuristic",
                "cred_score":        cred_score,
                "xref_boost":        xref_boost,
                "fake_penalty":      fake_penalty,
                "final":             final_score,
                "domain":            domain,
                "is_high_stakes":    is_high_stakes,
                "has_contradiction": has_contradiction,
            }

        payload["truth_score"]      = final_score
        payload["article_probability"] = article_p
        payload["status"]           = status
        payload["label_reason"]     = reason

        # ── Breaking news velocity flag ────────────────────────────────────
        # Set is_breaking if: verified + multiple rapid sources + high score
        # Full breaking news detection is in BreakingNewsDetectorAgent (monitoring)
        # This just sets a lightweight flag for the notification pipeline.
        if (
            status == "verified"
            and source_count >= 2
            and final_score >= 85
            and not has_contradiction
        ):
            first_seen = payload.get("first_seen")
            if first_seen:
                try:
                    age_minutes = (
                        datetime.now(timezone.utc) - datetime.fromisoformat(
                            str(first_seen).replace("Z", "+00:00")
                        )
                    ).total_seconds() / 60
                    payload["candidate_breaking"] = age_minutes <= 30
                except Exception:
                    pass

        log.debug(
            f"TruthScore: score={final_score} status={status} "
            f"P={article_p:.3f} domain={domain}"
        )
        return payload


# ════════════════════════════════════════════════════════════════════════════
# 5. CONTRADICTION DETECTOR  (enhanced with Bayesian reason chain)
# ════════════════════════════════════════════════════════════════════════════
class ContradictionDetectorAgent(BaseAgent):
    name         = "contradiction-detector"
    input_queue  = Q.VERIFY_CONTRADICTION
    output_queue = ""
    CONTRADICTION_CONFIDENCE_THRESHOLD = 0.75

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        if not cluster_id:
            return None

        rows = await self.db_fetch(
            """SELECT c.claim_text, a.source_domain, a.source_cred, a.source_tier
               FROM claims c
               JOIN articles a ON c.article_id = a.id
               WHERE c.cluster_id = $1
               ORDER BY a.source_cred DESC
               LIMIT 20""",
            cluster_id,
        )
        claims = [(r["claim_text"], r["source_domain"], float(r["source_cred"] or 0.5))
                  for r in rows if r["claim_text"]]

        if len(claims) < 2:
            return None

        for i in range(len(claims) - 1):
            for j in range(i + 1, min(i + 4, len(claims))):
                c1_text, c1_domain, c1_cred = claims[i]
                c2_text, c2_domain, c2_cred = claims[j]
                result = await self._check_contradiction(c1_text, c2_text)
                if result["contradicts"] and result["confidence"] >= self.CONTRADICTION_CONFIDENCE_THRESHOLD:
                    # Store contradicting evidence in Qdrant for future articles
                    try:
                        emb = await self.embed(c2_text)
                        await self.qdrant.upsert(
                            collection_name="claims",
                            points=[{
                                "id":      hash(f"contra:{cluster_id}:{c2_text}") % (2 ** 53),
                                "vector":  emb,
                                "payload": {
                                    "contradicts_claim":  True,
                                    "source_domain":      c2_domain,
                                    "source_cred":        c2_cred,
                                    "cluster_id":         cluster_id,
                                    "contradiction_type": result["type"],
                                },
                            }]
                        )
                    except Exception:
                        pass

                    await self.db_execute(
                        """UPDATE story_clusters
                           SET conflict=true, conflict_reason=$2, conflict_type=$3
                           WHERE id=$1""",
                        cluster_id,
                        result["reason"][:500],
                        result["type"],
                    )
                    return None
        return None

    async def _check_contradiction(self, claim1: str, claim2: str) -> dict:
        prompt = f"""Analyze whether these two news claims contradict each other.

Claim A: {claim1}
Claim B: {claim2}

Think step by step:
1. What is Claim A asserting?
2. What is Claim B asserting?
3. Same subject, timeframe, and scope?
4. Mutually exclusive, or could both be true?

Types: direct | temporal | scope | none

Return ONLY JSON, no markdown:
{{"contradicts":bool,"confidence":0.0-1.0,"reason":"≤20 words","type":"direct|temporal|scope|none"}}"""
        try:
            resp = await self.llm(prompt, json_mode=True, max_tokens=120, temperature=0)
            data = json.loads(resp)
            return {
                "contradicts": bool(data.get("contradicts", False)),
                "confidence":  max(0.0, min(1.0, float(data.get("confidence", 0.0)))),
                "reason":      str(data.get("reason", ""))[:500],
                "type":        str(data.get("type", "none")),
            }
        except Exception as e:
            log.debug(f"Contradiction LLM failed: {e}")
            return {"contradicts": False, "confidence": 0.0, "reason": "", "type": "none"}


# ════════════════════════════════════════════════════════════════════════════
# 6. SOURCE RELIABILITY UPDATER  (NEW)
#    Updates θ(s,d,t) when corrections are published.
#    Triggered by admin correction events or automated accuracy tracking.
# ════════════════════════════════════════════════════════════════════════════
class SourceReliabilityUpdater(BaseAgent):
    """
    Updates dynamic source reliability priors in Redis when:
    - An admin marks an article as corrected/retracted
    - A verification outcome is confirmed accurate/inaccurate over time
    - A source's correction rate history changes

    The prior θ(s,d,t) decays toward the global category default over time
    if no recent updates are available (Bayesian forgetting).
    """
    name         = "source-reliability-updater"
    input_queue  = Q.VERIFY_RELIABILITY
    output_queue = ""
    DECAY_FACTOR = 0.95  # per-day decay toward global prior

    async def process(self, payload: dict) -> dict | None:
        # This agent processes correction events passed through the pipeline
        if payload.get("event_type") != "correction":
            return None

        domain      = payload.get("source_domain", "")
        topic_dom   = payload.get("domain", "national")
        was_correct = bool(payload.get("was_correct", True))

        if not domain:
            return None

        key = f"src_prior:{domain}:{topic_dom}"
        try:
            current_val = await self.redis_client.get(key)
            current = float(current_val) if current_val else 0.80

            # Bayesian update: correct → prior increases, incorrect → decreases
            learning_rate = 0.05
            if was_correct:
                new_prior = current + learning_rate * (1.0 - current)
            else:
                new_prior = current - learning_rate * current

            new_prior = max(0.1, min(0.99, new_prior))
            await self.redis_client.setex(key, 86400 * 7, str(round(new_prior, 4)))

            # Also update DB for persistence
            await self.db_execute(
                """UPDATE sources
                   SET accuracy_history = array_append(
                       COALESCE(accuracy_history, '{}'), $2::float
                   )
                   WHERE domain = $1""",
                domain, float(was_correct),
            )
            cluster_id = payload.get("cluster_id")
            try:
                await self.db_execute(
                    """INSERT INTO source_reliability_history
                          (source_domain, topic_domain, prior_value, event_type, cluster_id)
                       VALUES ($1, $2, $3, $4, $5)""",
                    domain,
                    topic_dom,
                    float(round(new_prior, 4)),
                    "correction",
                    cluster_id,
                )
            except Exception:
                pass
            log.info(
                f"SourceReliability: {domain}/{topic_dom} "
                f"{current:.3f} → {new_prior:.3f} (correct={was_correct})"
            )
        except Exception as e:
            log.debug(f"SourceReliabilityUpdater failed: {e}")
        return None


# ════════════════════════════════════════════════════════════════════════════
# 7–9. UNCHANGED AGENTS (FakeSignal, SatireDetector, ImageVerification)
# ════════════════════════════════════════════════════════════════════════════
class SatireDetectorAgent(BaseAgent):
    name         = "satire-detector"
    input_queue  = Q.VERIFY_SATIRE
    output_queue = Q.VERIFY_FAKE_SIGNAL

    SATIRE_PHRASES = [
        "reports the onion", "according to satire", "parody news",
        "not real news", "fictional story",
    ]

    async def process(self, payload: dict) -> dict | None:
        domain = payload.get("source_domain", "").lower()
        title  = payload.get("title", "").lower()
        body   = (payload.get("full_body") or payload.get("description", "")).lower()

        if any(sat in domain for sat in SATIRE_DOMAINS):
            return None

        text = f"{title} {body}"
        satire_signals = sum(1 for p in self.SATIRE_PHRASES if p in text)
        if satire_signals >= 2:
            return None
        if satire_signals == 1 and await self._llm_satire_check(title, body[:500]):
            return None

        payload["is_satire"] = False
        return payload

    async def _llm_satire_check(self, title: str, body: str) -> bool:
        try:
            resp = await self.llm(
                f"Is this satire or parody?\nTitle: {title}\nExcerpt: {body}\nAnswer: YES or NO",
                max_tokens=5, temperature=0,
            )
            return "YES" in resp.upper()
        except Exception:
            return False


class FakeSignalAgent(BaseAgent):
    name         = "fake-signal"
    input_queue  = Q.VERIFY_FAKE_SIGNAL
    output_queue = Q.VERIFY_CLAIMS

    SENSATIONAL = [
        "SHOCKING", "BREAKING EXCLUSIVE", "YOU WON'T BELIEVE",
        "WATCH VIRAL", "LEAKED", "SECRET REVEALED", "HIDDEN TRUTH",
        "THEY DON'T WANT YOU TO KNOW", "MUST WATCH", "SHARE BEFORE DELETED",
    ]

    async def process(self, payload: dict) -> dict | None:
        title = payload.get("title", "").upper()
        score = sum(1 for phrase in self.SENSATIONAL if phrase in title)
        # Store as raw count 0–30 (normalised to [0,1] in TruthScoreAgent)
        payload["fake_penalty"] = min(30, score * 10)
        return payload


class ImageVerificationAgent(BaseAgent):
    name         = "image-verification"
    input_queue  = Q.VERIFY_IMAGE
    output_queue = ""

    async def process(self, payload: dict) -> dict | None:
        phash = payload.get("image_phash", "")
        if not phash:
            return None
        is_known_fake = await self.redis_client.sismember("known_fake_images", phash)
        if is_known_fake:
            article_url = payload.get("article_url")
            if article_url:
                await self.db_execute(
                    "UPDATE articles SET image_flagged=true WHERE url=$1", article_url
                )
        return None


if __name__ == "__main__":
    import sys
    {
        "claims":        ClaimExtractionAgent,
        "xref":          CrossReferenceAgent,
        "credibility":   SourceCredibilityAgent,
        "truth":         TruthScoreAgent,
        "contradiction": ContradictionDetectorAgent,
        "reliability":   SourceReliabilityUpdater,
        "satire":        SatireDetectorAgent,
        "fake":          FakeSignalAgent,
        "image":         ImageVerificationAgent,
    }.get(sys.argv[1] if len(sys.argv) > 1 else "truth", TruthScoreAgent).run()
