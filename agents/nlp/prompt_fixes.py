"""
agents/nlp/prompt_fixes.py

PROMPT PATCHES for agents/nlp/__init__.py

FIX #13  TopicClassifier._build_llm_domain() — removes rule-based scores and
         primary guess from the LLM prompt. Passing rule scores directly into
         the prompt anchors the model to potentially wrong rule results.
         The rule result is now used only as a post-LLM tiebreaker when the
         LLM confidence is below threshold.

FIX #14  HeadlineGeneratorAgent.process() — prompt now includes:
         - Positive and negative examples
         - Explicit verb-first construction requirement
         - Length constraint (6–12 words)
         - Expanded no-sensationalism word list matching the summarizer's list

These are drop-in replacements for the two methods. Apply by importing from
this module inside agents/nlp/__init__.py, or copy the methods directly.
"""


# ─────────────────────────────────────────────────────────────────────────────
# FIX #13 — TopicClassifier LLM domain prompt (unanchored)
# Replace the _build_llm_domain method body in TopicClassifierAgent.
# ─────────────────────────────────────────────────────────────────────────────

TOPIC_CLASSIFIER_DOMAIN_PROMPT_TEMPLATE = """\
Classify the article into exactly one domain from the allowed list.
Read the title and body carefully — classify by what the article is primarily ABOUT,
not by isolated keywords.

Allowed domains: {allowed_domains}

Classification rules:
- Crime / court cases / legal judgments → judiciary
- Climate / pollution / conservation / biodiversity → environment
- Space / research missions / laboratory findings → science
- Stock market / corporate earnings / banking / RBI policy → economy
- Election / party / parliament / legislation → politics
- Hospital / disease / medicine / public health → health
- Army / navy / air force / border / weapons → defence
- Farm / crop / irrigation / MSP / APMC → agriculture

Title: {title}
Body (first 2200 chars): {body}

Return ONLY this JSON. No markdown. No preamble:
{{
  "domain": "one allowed domain",
  "confidence": 0.0,
  "reason": "max 18 words"
}}
"""
# NOTE: The old prompt included:
#   Current rule-based guess: {primary}
#   Rule scores: {json.dumps(scores)}
# These lines are REMOVED. Passing the rule guess anchors the LLM to it even
# when the rule is wrong. The rule result should be a post-LLM tiebreaker:
#
#   if llm_confidence < LLM_THRESHOLD:
#       final_domain = rule_primary   # fall back to rule when LLM is unsure
#   else:
#       final_domain = llm_domain


# ─────────────────────────────────────────────────────────────────────────────
# FIX #13 — TopicClassifier LLM profession prompt (unanchored)
# ─────────────────────────────────────────────────────────────────────────────

TOPIC_CLASSIFIER_PROFESSION_PROMPT_TEMPLATE = """\
Select up to 3 relevant reader professions for this news article.
Choose only the professions who would genuinely need this news for their work or studies.

Allowed professions: {allowed_professions}

Assignment rules:
- If the article is directly relevant to the general public → include "general"
- For UPSC/civil-services angle: polity, governance, economy, environment, history, IR
- For "medical": clinical findings, drug approvals, health policy, ICMR, hospital data
- For "law": court judgments, legislation, constitutional matters, legal precedents
- For "finance": RBI, SEBI, markets, budgets, tax, corporate results
- For "technology": product launches, cybersecurity, AI/ML, ISRO tech, patents
- For "student": education policy, exam results, university news, scholarships

Title: {title}
Body (first 2200 chars): {body}

Return ONLY this JSON. No markdown. No preamble:
{{
  "professions": ["profession1", "profession2"],
  "confidence": 0.0,
  "reason": "max 18 words"
}}
"""
# NOTE: The old prompt included:
#   Primary domain: {primary}
#   Current rule-based professions: {rule_professions}
# These lines are REMOVED for the same anchoring reason as the domain prompt.


# ─────────────────────────────────────────────────────────────────────────────
# FIX #14 — HeadlineGeneratorAgent prompt
# Replace the prompt string inside HeadlineGeneratorAgent.process()
# ─────────────────────────────────────────────────────────────────────────────

HEADLINE_GENERATOR_PROMPT_TEMPLATE = """\
Rewrite the headline below as a clear, neutral, verb-first news headline.

Domain: {domain}
Original headline: {title}
Article summary: {body_snippet}

━━━ GOOD EXAMPLES ━━━
Original: "Announcement made regarding NEET exam postponement by NMC"
Rewrite:  "NMC postpones NEET exam by two weeks"

Original: "There are reports that RBI may hike rates"
Rewrite:  "RBI raises repo rate to 6.75% in surprise move"

Original: "SHOCKING: Minister caught on tape making controversial statement"
Rewrite:  "Minister defends farm-loan waiver in leaked audio recording"

━━━ BAD EXAMPLES (never do these) ━━━
❌ "Is this the end of India's cricket dominance?"         — no question headlines
❌ "Here's why the budget is a game-changer"              — no clickbait constructions
❌ "MASSIVE: Centre announces ₹5,000 crore package"       — no all-caps sensationalism
❌ "Government makes important announcement about roads"   — too vague, no fact

━━━ RULES ━━━
1. Verb-first or subject-verb construction: "RBI raises..." not "Rate hike announced by..."
2. Length: 6–12 words strictly
3. Keep ALL proper nouns, numbers, and acronyms from the original verbatim
4. No question format
5. No passive voice ("was announced" → use active)
6. Forbidden words: shocking, explosive, massive, game-changer, bombshell,
   breaking exclusive, you won't believe, incredible, stunning, unprecedented,
   leaked (unless factually in article), secret, hidden truth

Return JSON only: {{"primary": "headline here", "ab_variant": "alternative angle on same fact"}}
"""
