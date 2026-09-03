"""
Dhara News — NLP & Content Cluster (9 Agents)
All LLM calls use local Ollama (free) — swap for Anthropic API on launch.
"""
import asyncio
import ast
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
try:
    from agents.base import BaseAgent, Q, GROQ_KEY_POOL
except ModuleNotFoundError:
    from base import BaseAgent, Q, GROQ_KEY_POOL
try:
    from .prompt_fixes import (
        TOPIC_CLASSIFIER_DOMAIN_PROMPT_TEMPLATE,
        TOPIC_CLASSIFIER_PROFESSION_PROMPT_TEMPLATE,
        HEADLINE_GENERATOR_PROMPT_TEMPLATE,
    )
except ImportError:
    from prompt_fixes import (
        TOPIC_CLASSIFIER_DOMAIN_PROMPT_TEMPLATE,
        TOPIC_CLASSIFIER_PROFESSION_PROMPT_TEMPLATE,
        HEADLINE_GENERATOR_PROMPT_TEMPLATE,
    )

log = logging.getLogger(__name__)

# ── Profession → Topic mapping matrix ────────────────────────────────────────
PROFESSION_TOPICS = {
    "upsc":        ["politics","governance","economy","environment","science","international","history","social","defence"],
    "medical":     ["health","science","research","governance","social"],
    "law":         ["judiciary","legislation","politics","governance","social"],
    "technology":  ["technology","startups","science","business","cybersecurity"],
    "finance":     ["business","economy","markets","governance","startups","international"],
    "student":     ["general","awards","sports","governance","science","social"],
    "defence":     ["defence","international","politics","governance","technology"],
    "agriculture": ["agriculture","environment","economy","governance","social"],
    "environment": ["environment","climate","science","governance","agriculture"],
    "education":   ["education","governance","social","science"],
    "research":    ["science","technology","research","health","environment"],
    "general":     ["politics","sports","entertainment","lifestyle","social","general"],
}

DOMAIN_KEYWORDS = {
    "politics":      ["parliament","election","minister","BJP","Congress","Modi","CM","PM","Lok Sabha","Rajya Sabha","vote","party","political","coalition","mandate"],
    "economy":       ["GDP","inflation","RBI","budget","fiscal","rupee","tax","market","finance","trade","recession","growth","revenue","deficit","monetary"],
    "health":        ["hospital","disease","drug","vaccine","health","medical","cancer","virus","AIIMS","ICMR","WHO","pandemic","clinical","treatment","patient"],
    "technology":    ["artificial intelligence","machine learning","semiconductor","quantum computing","5G network","cybersecurity breach","software platform","cloud computing","data breach","algorithm","blockchain","drone technology","chip"],
    "judiciary":     ["court","judge","verdict","law","CJI","bench","petition","PIL","Supreme Court","High Court","constitution","judgement","acquit","convict","bail","FIR","arrested","custody","chargesheet","accused","murder case","rape case","crime"],
    "environment":   ["climate","pollution","forest","wildlife","carbon","green","flood","cyclone","landslide","earthquake","drought","AQI","biodiversity","emissions","renewable","solar","wind","cloudburst","disaster","tsunami","wildfire"],
    "sports":        ["cricket","IPL","Olympics","football","hockey","chess","athlete","tournament","medal","World Cup","league","match","player","score","stadium","champion","squad","batting","bowling"],
    "science":       ["research","space","ISRO","NASA","Chandrayaan","Gaganyaan","Mangalyaan","Aditya-L1","launch vehicle","rocket launch","orbital","satellite launch","Lagrange","PSLV","GSLV","discovery","study","experiment","journal","quantum","nuclear","genetics","machine learning","AI model","breakthrough","findings","published","space mission"],
    "international": ["USA","China","Pakistan","Russia","UN","G20","NATO","bilateral","treaty","foreign policy","diplomacy","sanctions","geopolitical","embassy","summit","ceasefire","war","conflict","Iran","Israel","Ukraine"],
    "business":      ["company","IPO","stock","Sensex","Nifty","merger","acquisition","revenue","profit","startup","unicorn","funding","investment","valuation","quarterly","earnings","shareholder"],
    "agriculture":   ["farmer","crop","MSP","rainfall","kharif","rabi","agriculture","food","grain","soil","irrigation","fertilizer","harvest","drought","flood"],
    "defence":       ["army","navy","airforce","missile","border","LAC","LoC","DRDO","defence","military","weapon","soldier","exercise","procurement","strategic"],
    "education":     ["university","exam","CBSE","school","NEP","scholarship","JEE","NEET","rank","student","college","teacher","curriculum","admission","result"],
    "social":        ["welfare","poverty","women","gender","caste","tribal","scheme","Aadhaar","ration","nutrition","housing","sanitation","rights","marginalized","lynching","mob","protest","riot","killed","dead","death","victim"],
    "entertainment": ["film","movie","Bollywood","actor","actress","director","OTT","Netflix","Prime","web series","award","Filmfare","Oscar","music album","singer","celebrity","box office","sequel","trailer"],
    "general":       ["news","latest","update","India","government","national","report","announced","today"],
}

# ── Hard-override rules: checked BEFORE keyword scoring ────────────────────────
# Ordered by priority: disasters > space > crime > accidents
FORCE_DOMAIN_RULES = [
    # Tier-1a: Natural disasters — takes absolute precedence
    (["flood","floods","flooding","flooded","cyclone","landslide","earthquake",
      "tsunami","cloudburst","drought","heat wave","forest fire","wildfire",
      "glacial lake","avalanche","storm surge","disaster zone","death toll",
      "rescue operation","disaster relief","inundated"],
     "title", "environment"),

    # Tier-1b: Space/science programmes — before generic scoring
    (["Chandrayaan","Gaganyaan","Mangalyaan","Aditya-L1","PSLV","GSLV",
      "space mission","lunar orbit","Mars mission","Lagrange point","spacewalk",
      "rocket launch","satellite launch"],
     "title", "science"),

    # Tier-1c: Explicit crime — NOT bare "kills" (too ambiguous: "cyclone kills 5")
    (["murdered","murder","stabbed","shot dead","beheaded","lynched","lynching",
      "mob lynching","beaten to death","custodial death","honour killing",
      "acid attack","rape case","gang rape","homicide","manslaughter",
      "encounter killing","fake encounter","custodial murder"],
     "title", "judiciary"),

    # Tier-1d: Accidents/tragedies
    (["train accident","air crash","road accident","bus accident","stampede",
      "building collapse","fire tragedy","burned alive","drowned","derailment"],
     "title", "social"),
]

# Minimum keyword score to hold technology/entertainment primary
# Prevents single weak tokens ("app", "award") from winning
DOMAIN_MIN_SCORE = {
    "technology":    3,   # needs compound signals (not bare "app", "digital", "AI")
    "entertainment": 2,   # Filmfare + award = 2 signals, that's enough
}

# Post-scoring corrections: if wrong domain won despite scoring, fix it
DOMAIN_CORRECTION_RULES = [
    ("technology",    ["murdered","killed","arrested","FIR","crime","rape","fraud","scam"], "judiciary"),
    ("entertainment", ["flood","floods","cyclone","earthquake","killed","dead","disaster","crash"], "environment"),
    ("entertainment", ["murdered","arrested","FIR","crime","rape","scam"],                  "judiciary"),
    ("technology",    ["ISRO","NASA","space mission","satellite launch","Chandrayaan"],      "science"),
]

TRAGEDY_KEYWORDS = [
    "death", "died", "dead", "killed", "fatal", "murder", "homicide", "suicide",
    "body found", "postmortem", "post-mortem", "accident", "crash",
    "flood", "cyclone", "landslide", "earthquake", "tsunami", "cloudburst",
    "disaster", "stampede", "explosion", "blast", "derailment", "lynching",
]

STRONG_TECH_KEYWORDS = [
    "artificial intelligence", "machine learning", "semiconductor", "cyberattack",
    "cyber security", "data breach", "satellite", "isro", "nasa", "5g",
]


def _contains_keyword(text: str, keyword: str) -> bool:
    """Match keyword as a token/phrase, not an arbitrary substring."""
    kw = (keyword or "").strip().lower()
    if not kw:
        return False

    if " " in kw:
        # Phrase match with flexible whitespace — proper \b word boundaries.
        parts = [re.escape(p) for p in kw.split() if p]
        if not parts:
            return False
        pattern = r"\b" + r"\s+".join(parts) + r"\b"
        return re.search(pattern, text, flags=re.IGNORECASE) is not None

    # Short acronyms/tokens like "UN", "PM", "AI" must be standalone words.
    if len(kw) <= 3:
        return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text, flags=re.IGNORECASE) is not None

    return re.search(rf"\b{re.escape(kw)}\b", text, flags=re.IGNORECASE) is not None

EXAM_KEYWORD_MAP = {
    "upsc_prelims":   ["election","parliament","constitution","RBI","GDP","biodiversity","ISRO","treaty","convention","commission","tribunal","amendment","schedule","article"],
    "upsc_mains_gs1": ["history","culture","society","geography","disaster","colonial","freedom","movement","post-independence","urbanization","globalization"],
    "upsc_mains_gs2": ["governance","constitution","polity","international","bilateral","ministry","welfare","social justice","health","education","parliament","federalism"],
    "upsc_mains_gs3": ["economy","budget","agriculture","science","environment","security","infrastructure","technology","energy","growth","development","internal security"],
    "upsc_mains_gs4": ["ethics","integrity","civil service","values","accountability","transparency","aptitude","attitude","corruption","whistleblower"],
    "neet":           ["disease","drug","clinical","hospital","health","medicine","biology","ICMR","anatomy","physiology","pharmacology","microbiology","pathology"],
    "jee":            ["physics","chemistry","mathematics","iit","engineering","thermodynamics","electromagnetism","organic","inorganic","calculus","algebra"],
    "clat":           ["supreme court","high court","judgement","law","constitution","legislation","PIL","fundamental rights","IPC","CrPC","contract","tort"],
    "gate":           ["engineering","technology","iit","research","computer science","electronics","mechanical","civil","electrical","thermodynamics","algorithm"],
    "cat":            ["business","MBA","management","market","economy","startup","corporate","strategy","finance","marketing","HR","operations","case study"],
    "ssc":            ["general knowledge","current affairs","india","government","history","geography","science","math","english","reasoning"],
}

INDIAN_STATES = {
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
    "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
    "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
    "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
    "Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh",
    "Puducherry","Chandigarh","Andaman and Nicobar Islands",
    "Dadra and Nagar Haveli and Daman and Diu","Lakshadweep",
}
INDIAN_STATES_NORMALIZED = {s.lower(): s for s in INDIAN_STATES}

STATE_ALIASES = {
    "up": "Uttar Pradesh",
    "u.p.": "Uttar Pradesh",
    "mp": "Madhya Pradesh",
    "m.p.": "Madhya Pradesh",
    "ap": "Andhra Pradesh",
    "a.p.": "Andhra Pradesh",
    "tn": "Tamil Nadu",
    "t.n.": "Tamil Nadu",
    "wb": "West Bengal",
    "w.b.": "West Bengal",
    "uk": "Uttarakhand",
    "u.k.": "Uttarakhand",
    "jk": "Jammu and Kashmir",
    "j&k": "Jammu and Kashmir",
    "nct delhi": "Delhi",
}

MAJOR_CITIES = [
    "Mumbai","Delhi","Bengaluru","Bangalore","Chennai","Hyderabad","Kolkata","Pune",
    "Ahmedabad","Jaipur","Lucknow","Surat","Kanpur","Nagpur","Patna","Indore",
    "Bhopal","Visakhapatnam","Kochi","Coimbatore","Chandigarh","Guwahati","Bhubaneswar",
]
MAJOR_CITIES_NORMALIZED = {c.lower(): c for c in MAJOR_CITIES}

MAJOR_CITY_TO_STATE = {
    "mumbai": "Maharashtra",
    "pune": "Maharashtra",
    "nagpur": "Maharashtra",
    "delhi": "Delhi",
    "bengaluru": "Karnataka",
    "bangalore": "Karnataka",
    "chennai": "Tamil Nadu",
    "hyderabad": "Telangana",
    "kolkata": "West Bengal",
    "ahmedabad": "Gujarat",
    "jaipur": "Rajasthan",
    "lucknow": "Uttar Pradesh",
    "patna": "Bihar",
    "bhopal": "Madhya Pradesh",
    "chandigarh": "Chandigarh",
    "guwahati": "Assam",
    "bhubaneswar": "Odisha",
}

COUNTRY_ALIASES = {
    "india": "IN",
    "indian": "IN",
    "usa": "US",
    "united states": "US",
    "uk": "GB",
    "united kingdom": "GB",
    "china": "CN",
    "russia": "RU",
    "japan": "JP",
    "pakistan": "PK",
    "france": "FR",
    "germany": "DE",
    "australia": "AU",
    "canada": "CA",
    "israel": "IL",
    "iran": "IR",
    "ukraine": "UA",
    "bangladesh": "BD",
    "sri lanka": "LK",
    "nepal": "NP",
    "myanmar": "MM",
    "europe": "EU",
}


try:
    from shared.location_utils import (
        _location_key,
        _load_district_catalog,
        DISTRICT_TO_STATE,
        DISTRICT_CANONICAL,
        STATE_TO_DISTRICTS,
    )
    _SHARED_LOCATION_UTILS = True
except Exception:
    _SHARED_LOCATION_UTILS = False


if not _SHARED_LOCATION_UTILS:
    def _location_key(name: str) -> str:
        key = (name or "").strip().strip(".,")
        key = re.sub(r"\s+", " ", key)
        return key.lower()


    def _load_district_catalog():
        district_to_state = {}
        district_canonical = {}
        state_to_districts = {}
        try:
            path = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "districts.js"
            raw = path.read_text(encoding="utf-8")
            raw = re.sub(r"(?m)//.*$", "", raw)
            match = re.search(r"export\s+const\s+INDIA_DISTRICTS\s*=\s*\{(.*?)\};", raw, flags=re.S)
            if not match:
                return district_to_state, district_canonical, state_to_districts
            body = match.group(1)
            for item in re.finditer(r'"([^"]+)"\s*:\s*\[(.*?)\]\s*,?', body, flags=re.S):
                state = item.group(1).strip()
                districts = [d.strip() for d in re.findall(r'"([^"]+)"', item.group(2))]
                if not districts:
                    continue
                state_to_districts[state] = districts
                for district in districts:
                    key = _location_key(district)
                    district_canonical.setdefault(key, district)
                    district_to_state.setdefault(key, state)
        except Exception:
            log.warning("EntityExtraction: could not load district catalog", exc_info=True)
        return district_to_state, district_canonical, state_to_districts


if not _SHARED_LOCATION_UTILS:
    DISTRICT_TO_STATE, DISTRICT_CANONICAL, STATE_TO_DISTRICTS = _load_district_catalog()

# ════════════════════════════════════════════════════════════════════════════
# ENTITY EXTRACTION AGENT
# ════════════════════════════════════════════════════════════════════════════
class EntityExtractionAgent(BaseAgent):
    name          = "entity-extraction"
    input_queue   = Q.NLP_ENTITIES
    output_queue  = Q.NLP_TOPICS
    _nlp          = None

    async def on_start(self):
        """Load spaCy model once."""
        import spacy
        try:
            self._nlp = spacy.load("en_core_web_sm")
        except OSError:
            import subprocess
            subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
            self._nlp = spacy.load("en_core_web_sm")
        log.info("EntityExtraction: spaCy model loaded")

    async def process(self, payload: dict) -> dict | None:
        title = payload.get("title", "")
        body  = payload.get("full_body") or payload.get("description", "")
        text  = f"{title}. {body}"[:5000]

        # Run spaCy in thread pool (CPU bound)
        loop = asyncio.get_running_loop()
        entities = await loop.run_in_executor(None, self._extract_entities, text)

        # Fix: extract location from TITLE + first 500 chars of body only.
        # Using the full body caused random mid-article place names (e.g. a quoted
        # foreign location) to overwrite the actual story location.
        title_lead = f"{title}. {body[:500]}"
        location = self._extract_location(title_lead, entities, title)

        payload["entities"] = entities
        payload.update(location)
        return payload

    def _extract_entities(self, text: str) -> list[dict]:
        doc = self._nlp(text)
        entities = []
        seen = set()
        for ent in doc.ents:
            key = f"{ent.label_}:{ent.text.lower()}"
            if key in seen:
                continue
            seen.add(key)
            if ent.label_ in ("PERSON","ORG","GPE","LOC","EVENT","LAW","MONEY","DATE","NORP"):
                entities.append({
                    "text":  ent.text,
                    "label": ent.label_,
                    "start": ent.start_char,
                    "end":   ent.end_char,
                })
        return entities[:20]  # Limit

    def _extract_location(self, text: str, entities: list, title: str = "") -> dict:
        result = {
            "loc_country": None,
            "loc_state":   None,
            "loc_city":    None,
            "loc_district": None,
            "loc_global":  False,
        }

        def normalize_state(name: str) -> str | None:
            key = _location_key(name)
            if not key:
                return None
            if key in INDIAN_STATES_NORMALIZED:
                return INDIAN_STATES_NORMALIZED[key]
            return STATE_ALIASES.get(key)

        def normalize_district(name: str, state_hint: str | None = None) -> tuple[str | None, str | None]:
            key = _location_key(name)
            if not key:
                return None, None
            if state_hint and state_hint in STATE_TO_DISTRICTS:
                for district in STATE_TO_DISTRICTS[state_hint]:
                    if _location_key(district) == key:
                        return district, state_hint
            canonical = DISTRICT_CANONICAL.get(key)
            if not canonical:
                return None, None
            return canonical, DISTRICT_TO_STATE.get(key)

        title_lower = (title or "").lower()

        # Separate entities found in the title (high confidence) vs rest of text.
        # Only known district/state/country matches are accepted as article locations.
        title_gpe: list[str] = []
        body_gpe:  list[str] = []
        for ent in entities:
            if ent["label"] not in ("GPE", "LOC"):
                continue
            ent_text = (ent.get("text") or "").strip()
            if not ent_text:
                continue
            if ent_text.lower() in title_lower:
                title_gpe.append(ent_text)
            else:
                body_gpe.append(ent_text)

        # Process title GPEs first (most trustworthy), then body GPEs
        for ent_text in (title_gpe + body_gpe):
            state_match = normalize_state(ent_text)
            if state_match:
                if not result["loc_state"]:   # first clear match wins
                    result["loc_state"] = state_match
                result["loc_country"] = "IN"
                continue

            district_match, district_state = normalize_district(ent_text, result["loc_state"])
            if district_match:
                if not result["loc_district"]:
                    result["loc_district"] = district_match
                if not result["loc_state"]:
                    result["loc_state"] = district_state
                result["loc_country"] = "IN"
                continue

            country_code = COUNTRY_ALIASES.get(_location_key(ent_text))
            if country_code:
                result["loc_country"] = country_code
                result["loc_global"] = country_code != "IN"

        # District phrase hint: "<n> district" — from title+lead text only (sliced upstream)
        m = re.search(r"\b([A-Za-z][A-Za-z .\'-]{1,60})\s+district\b", text, flags=re.IGNORECASE)
        if m:
            district_name = re.sub(r"\s+", " ", m.group(1)).strip(" .,-")
            district_match, district_state = normalize_district(district_name, result["loc_state"])
            if district_match:
                result["loc_district"] = district_match
                if not result["loc_state"]:
                    result["loc_state"] = district_state
                result["loc_country"] = "IN"

        if result["loc_state"] or result["loc_district"]:
            result["loc_country"] = "IN"
            result["loc_global"] = False

        return result


# ════════════════════════════════════════════════════════════════════════════
# TOPIC CLASSIFIER AGENT
# ════════════════════════════════════════════════════════════════════════════
class TopicClassifierAgent(BaseAgent):
    name          = "topic-classifier"
    input_queue   = Q.NLP_TOPICS
    output_queue  = Q.NLP_EXAM_TAGS

    DOMAIN_LABELS = list(DOMAIN_KEYWORDS.keys())
    PROFESSION_LABELS = list(PROFESSION_TOPICS.keys())

    def _llm_enabled(self) -> bool:
        return os.environ.get("DOMAIN_LLM_ENABLE", "1").strip().lower() in ("1", "true", "yes", "on")

    def _profession_llm_enabled(self) -> bool:
        return os.environ.get("PROFESSION_LLM_ENABLE", "1").strip().lower() in ("1", "true", "yes", "on")

    def _is_ambiguous(self, primary: str, scores: dict, forced: str | None) -> bool:
        if forced:
            return False
        ranked = sorted(scores.values(), reverse=True)
        top = ranked[0] if ranked else 0
        second = ranked[1] if len(ranked) > 1 else 0
        margin = top - second
        if primary == "general":
            return True
        if top <= 2:
            return True
        return margin <= 1

    @staticmethod
    def _normalize_llm_json(resp: str) -> str:
        text = (resp or "").strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
        return text.strip()

    async def _refine_domain_with_llm(
        self,
        title: str,
        body: str,
        primary: str,
        secondary: list[str],
        scores: dict,
    ) -> tuple[str, float, str]:
        import hashlib

        cache_key = f"domain_llm:v1:{hashlib.md5((title + body[:400]).encode()).hexdigest()}"
        cached = await self.cache_get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                domain = str(data.get("domain", "")).strip().lower()
                confidence = float(data.get("confidence", 0.0))
                if domain in self.DOMAIN_LABELS:
                    return domain, confidence, "llm_cached"
            except Exception:
                pass

                prompt = TOPIC_CLASSIFIER_DOMAIN_PROMPT_TEMPLATE.format(
                        allowed_domains=", ".join(self.DOMAIN_LABELS),
                        title=title[:300],
                        body=body[:2200],
                )

        resp = await self.llm(prompt, json_mode=True, max_tokens=120, temperature=0.0)
        data = json.loads(self._normalize_llm_json(resp))
        domain = str(data.get("domain", "")).strip().lower()
        confidence = float(data.get("confidence", 0.0))
        if domain not in self.DOMAIN_LABELS:
            raise ValueError("invalid domain from llm")
        confidence = max(0.0, min(1.0, confidence))
        await self.cache_set(
            cache_key,
            json.dumps({"domain": domain, "confidence": confidence}),
            6 * 3600,
        )
        return domain, confidence, "llm"

    def _build_rule_professions(self, primary: str, secondary: list[str]) -> tuple[list[str], dict]:
        prof_scores = {}
        for prof, topics in PROFESSION_TOPICS.items():
            score = 0
            if primary in topics:
                score += 3
            score += sum(1 for s in secondary if s in topics)
            if score > 0:
                prof_scores[prof] = score

        ranked = sorted(prof_scores.items(), key=lambda x: -x[1])
        strong = [p for p, s in ranked if s >= 3]
        if strong:
            professions = strong[:3]
        else:
            professions = [p for p, _ in ranked[:2]]

        if not professions:
            professions = ["general"]
        return professions, prof_scores

    def _is_profession_ambiguous(self, rule_professions: list[str], prof_scores: dict) -> bool:
        if rule_professions == ["general"]:
            return True
        ranked = sorted(prof_scores.values(), reverse=True)
        top = ranked[0] if ranked else 0
        second = ranked[1] if len(ranked) > 1 else 0
        if top <= 2:
            return True
        return (top - second) <= 1

    async def _refine_professions_with_llm(
        self,
        title: str,
        body: str,
        primary: str,
        secondary: list[str],
        rule_professions: list[str],
    ) -> tuple[list[str], float, str]:
        import hashlib

        cache_key = f"profession_llm:v1:{hashlib.md5((title + body[:400] + primary).encode()).hexdigest()}"
        cached = await self.cache_get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                profs = [str(p).strip().lower() for p in data.get("professions", [])]
                profs = [p for p in profs if p in self.PROFESSION_LABELS]
                confidence = float(data.get("confidence", 0.0))
                if profs:
                    return profs[:3], confidence, "llm_cached"
            except Exception:
                pass

                prompt = TOPIC_CLASSIFIER_PROFESSION_PROMPT_TEMPLATE.format(
                        allowed_professions=", ".join(self.PROFESSION_LABELS),
                        title=title[:300],
                        body=body[:2200],
                )

        resp = await self.llm(prompt, json_mode=True, max_tokens=120, temperature=0.0)
        data = json.loads(self._normalize_llm_json(resp))
        profs = [str(p).strip().lower() for p in data.get("professions", [])]
        profs = [p for p in profs if p in self.PROFESSION_LABELS]
        if not profs:
            raise ValueError("invalid professions from llm")
        confidence = float(data.get("confidence", 0.0))
        confidence = max(0.0, min(1.0, confidence))
        await self.cache_set(
            cache_key,
            json.dumps({"professions": profs[:3], "confidence": confidence}),
            6 * 3600,
        )
        return profs[:3], confidence, "llm"

    async def process(self, payload: dict) -> dict | None:
        title = payload.get("title", "")
        body  = payload.get("full_body") or payload.get("description", "")
        title_text = f"{title}".lower()
        text = f"{title} {body}".lower()

        # ── Step 1: Tier-1 force rules — title-based, checked before scoring ────
        forced = None
        for keywords, position, domain in FORCE_DOMAIN_RULES:
            check = title_text if position == "title" else text
            if any(_contains_keyword(check, kw) for kw in keywords):
                forced = domain
                break

        # ── Step 2: Keyword scoring (title match = 2×, body = 1×) ─────────────
        scores = {}
        for domain, keywords in DOMAIN_KEYWORDS.items():
            score = 0
            for kw in keywords:
                if _contains_keyword(text, kw):
                    score += 2 if _contains_keyword(title_text, kw) else 1
            scores[domain] = score

        # ── Step 3: Suppress weak-signal domains ──────────────────────────────
        for domain, min_score in DOMAIN_MIN_SCORE.items():
            if scores.get(domain, 0) < min_score:
                scores[domain] = 0

        # ── Step 4: Pick primary from scores ──────────────────────────────────
        primary = max(scores, key=scores.get) if any(scores.values()) else "general"
        if scores.get(primary, 0) == 0:
            primary = "general"

        # ── Step 5: Apply force override (disasters/crime beat scoring) ────────
        if forced:
            primary = forced

        # ── Step 6: Tier-2 post-scoring corrections ───────────────────────────
        for wrong, evidence, correction in DOMAIN_CORRECTION_RULES:
            if primary == wrong and any(_contains_keyword(title_text, kw) for kw in evidence):
                primary = correction
                break

        # Secondary domains (score > 0, not primary)
        secondary = [d for d, s in sorted(scores.items(), key=lambda x: -x[1])
                    if s > 0 and d != primary][:2]

        selected_by = "rules"
        domain_confidence = 1.0
        llm_threshold = float(os.environ.get("DOMAIN_LLM_CONFIDENCE_THRESHOLD", "0.65"))

        if self._llm_enabled() and self._is_ambiguous(primary, scores, forced):
            try:
                llm_domain, llm_confidence, llm_source = await self._refine_domain_with_llm(
                    title=title,
                    body=body,
                    primary=primary,
                    secondary=secondary,
                    scores=scores,
                )
                if llm_confidence >= llm_threshold:
                    primary = llm_domain
                    secondary = [d for d in secondary if d != primary][:2]
                    selected_by = llm_source
                    domain_confidence = llm_confidence
            except Exception as e:
                log.debug(f"TopicClassifier LLM refinement skipped: {e}")

        professions, prof_scores = self._build_rule_professions(primary, secondary)
        profession_selected_by = "rules"
        profession_confidence = 1.0
        profession_llm_threshold = float(os.environ.get("PROFESSION_LLM_CONFIDENCE_THRESHOLD", "0.60"))

        if self._profession_llm_enabled() and self._is_profession_ambiguous(professions, prof_scores):
            try:
                llm_professions, llm_prof_conf, llm_prof_source = await self._refine_professions_with_llm(
                    title=title,
                    body=body,
                    primary=primary,
                    secondary=secondary,
                    rule_professions=professions,
                )
                if llm_prof_conf >= profession_llm_threshold:
                    professions = llm_professions
                    profession_selected_by = llm_prof_source
                    profession_confidence = llm_prof_conf
            except Exception as e:
                log.debug(f"TopicClassifier profession LLM refinement skipped: {e}")

        payload["domain"]      = primary
        payload["domains_all"] = [primary] + secondary
        payload["professions"] = professions
        payload["domain_confidence"] = domain_confidence
        payload["domain_selected_by"] = selected_by
        payload["profession_confidence"] = profession_confidence
        payload["profession_selected_by"] = profession_selected_by
        return payload


# ════════════════════════════════════════════════════════════════════════════
# EXAM TAGGER AGENT
# ════════════════════════════════════════════════════════════════════════════
class ExamTaggerAgent(BaseAgent):
    name          = "exam-tagger"
    input_queue   = Q.NLP_EXAM_TAGS
    output_queue  = Q.NLP_SUMMARIZE

    async def process(self, payload: dict) -> dict | None:
        title = payload.get("title", "")
        body  = payload.get("full_body") or payload.get("description", "")
        text  = f"{title} {body}".lower()

        tags = []
        for exam, keywords in EXAM_KEYWORD_MAP.items():
            matches = sum(1 for kw in keywords if _contains_keyword(text, kw))
            if matches >= 2:
                tags.append(exam)

        payload["exam_tags"] = tags
        return payload


# ════════════════════════════════════════════════════════════════════════════
# SUMMARIZATION AGENT — Uses local Ollama (FREE)
# ════════════════════════════════════════════════════════════════════════════
class SummarizationAgent(BaseAgent):
    name          = "summarization"
    input_queue   = Q.NLP_SUMMARIZE
    output_queue  = Q.NLP_REWRITE

    @staticmethod
    def _sanitize_article_text(value: str) -> str:
        text = str(value or "")
        if not text:
            return ""
        text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", text)
        text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"(?is)\bvar\s+dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]\s*;?", " ", text)
        text = re.sub(r"(?is)dataLayer\.push\s*\(\s*\{.*?\}\s*\)\s*;?", " ", text)
        text = re.sub(r"(?im)\b(WhatsApp|X\s*\(Twitter\)|LinkedIn|Telegram|Facebook)\b", " ", text)
        text = re.sub(r"\\[nrt]", " ", text)
        text = re.sub(r"\s{2,}", " ", text).strip()
        return text

    @staticmethod
    def _extractive_summary(title: str, body: str) -> dict:
        """Fast extractive summary — no LLM needed. First 2-3 sentences as brief."""
        import re
        text = body.strip() if body else title
        # Split into sentences
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 20]
        brief = " ".join(sentences[:3]) if sentences else title
        brief = brief[:500]  # cap at 500 chars
        return {
            "summary_headline": title[:120],
            "summary_brief":    brief,
            "summary_deep":     " ".join(sentences[:8])[:1500] if sentences else body[:1500],
        }

    @staticmethod
    def _normalize_deep_summary(value) -> str:
        """
        Ensure summary_deep is always clean readable prose.
        - Accepts: dict, JSON string, plain string, None.
        - Returns: plain text paragraphs separated by double newlines.
        - Strips **markdown bold** and section-label prefixes that leaked from old prompts.
        - Does NOT add 'Lead:' / 'Background:' labels — the frontend renders those.
        """
        import re as _re

        if value is None:
            return ""

        if isinstance(value, dict):
            parts = []
            for key in ("lead", "background", "development", "reactions", "impact"):
                text = str(value.get(key) or "").strip()
                if text:
                    parts.append(text)
            return "\n\n".join(parts).strip()

        text = str(value).strip()
        if not text:
            return ""

        # Try JSON / Python-literal parsing for historical malformed outputs.
        parsed = None
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
            except Exception:
                try:
                    parsed = ast.literal_eval(text)
                except Exception:
                    parsed = None

        if isinstance(parsed, dict):
            return SummarizationAgent._normalize_deep_summary(parsed)

        # Strip markdown bold/italic markers and section-label prefixes
        text = _re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = _re.sub(r'\*([^*]+)\*',   r'\1', text)
        text = _re.sub(
            r'^(Lead|Overview|Background|Development|Reactions|Impact[^:]*)\s*:\s*',
            '', text, flags=_re.IGNORECASE | _re.MULTILINE
        )
        return SummarizationAgent._sanitize_article_text(text)[:3000]

    async def process(self, payload: dict) -> dict | None:
        article_id = payload.get("article_id", "")
        title  = payload.get("title", "")
        body   = self._sanitize_article_text(payload.get("full_body") or payload.get("description", ""))
        domain = payload.get("domain", "general")
        profs  = payload.get("professions", ["general"])

        # FAST PATH: use extractive summary immediately so articles aren't blocked
        # This ensures all articles get published quickly even without LLM
        extractive = self._extractive_summary(title, body)
        payload.update(extractive)

        # Cache key by content hash
        import hashlib
        content_hash = hashlib.md5(f"{title}{body[:200]}".encode()).hexdigest()
        cache_key = f"summary:{content_hash}"
        cached = await self.cache_get(cache_key)
        if cached:
            cached_data = json.loads(cached)
            # Only update if LLM summary is longer/better than extractive
            if len(cached_data.get("summary_brief","")) > len(extractive["summary_brief"]):
                payload.update(cached_data)
            return payload

        # TRY LLM in background — if it works, great; if it times out, extractive is used
        try:
            # Separate timeouts: Groq is fast (~2-4s), Ollama needs much longer (15-90s)
            groq_timeout   = float(os.environ.get("SUMMARIZATION_GROQ_TIMEOUT",   "15"))
            ollama_timeout = float(os.environ.get("SUMMARIZATION_OLLAMA_TIMEOUT", "90"))
            # Use the longer timeout so Ollama can complete; Groq will finish well inside it
            llm_timeout = ollama_timeout if not GROQ_KEY_POOL else groq_timeout
            summaries = await asyncio.wait_for(
                self._generate_summaries(title, body, domain, profs),
                timeout=llm_timeout,
            )
            if summaries.get("summary_brief") and len(summaries["summary_brief"]) > 50:
                await self.cache_set(cache_key, json.dumps(summaries), 48 * 3600)
                payload.update(summaries)
        except Exception:
            pass  # Extractive summary already in payload — safe to continue

        return payload

    async def _generate_summaries(self, title: str, body: str, domain: str, professions: list) -> dict:
        # Build profession-aware but non-preachy instruction
        prof_note = ""
        if professions and professions[0] not in ("general", "student"):
            prof_map = {
                "upsc": "relevant facts for Civil Services",
                "medical": "medical/health implications",
                "law": "legal angle and precedents",
                "technology": "tech implications",
                "finance": "financial/economic impact",
            }
            prof_note = prof_map.get(professions[0], "")

        prompt = f"""You are a wire-agency subeditor. Your ONLY job is to compress the article below into a structured summary. You do not add analysis, context, or opinions.

Article title: {title}
Article text: {body[:3000]}

Return ONLY this JSON — no markdown fences, no preamble, no trailing text:
{{
  "summary_headline": "string",
  "summary_brief": "string",
  "summary_deep": {{
    "lead": "string",
    "background": "string",
    "development": "string",
    "reactions": "string",
    "impact": "string"
  }}
}}

━━━ STRICT RULES — violations will break downstream rendering ━━━

summary_headline (max 14 words):
  • State the key fact exactly as in the article.
  • No clickbait words (shocking, explosive, game-changer, bombshell).
  • No question headlines. No "Here's why..." constructions.

summary_brief (exactly 2 sentences):
  • Sentence 1: who did what + when/where — facts only, no adjectives.
  • Sentence 2: the direct consequence stated in the article — NOT your inference.
  • Wire-agency register: no "is seen as", "is expected to", "marks a milestone".

summary_deep fields — each is one paragraph of 2–4 sentences:
  lead:        Core facts. Must stand alone. No interpretation.
  background:  ONLY context explicitly stated in the article.
               DO NOT add history you know from training data.
               If the article contains no background, write "".
  development: Specific details: decisions made, statements quoted, numbers.
               Quote figures exactly — never round or approximate.
  reactions:   Named reactions ONLY (with attribution: "Ministry said...", "X said...").
               If no reactions are in the article, write "".
  impact:      Forward-looking facts stated in the article only.
               DO NOT predict, speculate, or add "is expected to", "will likely".
               If no impact statements are in the article, write "".

━━━ FORBIDDEN PHRASES — never use these ━━━
  "seen as a relief"   "potential game-changer"   "marks a milestone"
  "is expected to"     "will likely"              "experts say" (unless article says it)
  "is poised to"       "is set to"                "could have"
  "has the potential"  "significant milestone"    "eagerly waiting"
  Any word not supported by the source article text above.

{f"Profession context (use only if relevant angles appear in the article): {prof_note}" if prof_note else ""}"""



        try:
            resp = await self.llm(prompt, json_mode=True, max_tokens=1200)
            # Strip markdown fences if LLM wraps in ```json ... ```
            resp = resp.strip()
            if resp.startswith("```"):
                resp = resp.split("```")[1]
                if resp.startswith("json"):
                    resp = resp[4:]
                resp = resp.strip()
            data = json.loads(resp)
            # LLM sometimes returns a list instead of object — unwrap it
            if isinstance(data, list) and len(data) > 0:
                data = data[0]
            if not isinstance(data, dict):
                raise ValueError(f"Unexpected LLM response type: {type(data)}")
            deep_raw = data.get("summary_deep")
            # New structured format: dict with lead/background/development/reactions/impact
            # Store as JSON so ArticleModal can render each paragraph separately
            if isinstance(deep_raw, dict):
                import json as _json
                deep_stored = _json.dumps(deep_raw)  # store as JSON string for DB
            else:
                deep_stored = self._normalize_deep_summary(deep_raw)
            return {
                "summary_headline": str(data.get("summary_headline") or title)[:300],
                "summary_brief":    str(data.get("summary_brief") or "")[:1000],
                "summary_deep":     deep_stored,
            }
        except Exception as e:
            log.warning(f"Summarization failed: {e}")
            sentences = re.split(r'(?<=[.!?])\s+', body)[:3] if body else []
            return {
                "summary_headline": title,
                "summary_brief": " ".join(sentences),
                "summary_deep": self._sanitize_article_text(body)[:2000],
            }


# ════════════════════════════════════════════════════════════════════════════
# REWRITE AGENT — Creates platform-original article (avoids copyright)
# ════════════════════════════════════════════════════════════════════════════
class RewriteAgent(BaseAgent):
    name          = "rewrite"
    input_queue   = Q.NLP_REWRITE
    output_queue  = Q.NLP_HEADLINE

    @staticmethod
    def _normalize_rewrite_text(value: str) -> str:
        """Ensure rewrite output is plain article prose and not JSON-like blobs."""
        text = (value or "").strip()
        if not text:
            return ""
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                if isinstance(data, dict):
                    for k in ("article", "rewritten", "body"):
                        if data.get(k):
                            return SummarizationAgent._sanitize_article_text(str(data[k]))[:5000]
            except Exception:
                pass
        return SummarizationAgent._sanitize_article_text(text)[:5000]

    @staticmethod
    def _is_meaningful_rewrite(text: str, brief: str = "", deep: str = "") -> bool:
        cleaned = SummarizationAgent._sanitize_article_text(text)
        if not cleaned:
            return False
        raw = str(text or "").strip()
        if raw.startswith("{") or raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, (dict, list)):
                    return False
            except Exception:
                pass
        if len(cleaned) < 600 or len(cleaned.split()) < 110:
            return False
        if brief and cleaned == SummarizationAgent._sanitize_article_text(brief):
            return False
        if deep and cleaned == SummarizationAgent._sanitize_article_text(deep):
            return False
        return True

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        title      = payload.get("title", "")
        body       = SummarizationAgent._sanitize_article_text(payload.get("full_body") or payload.get("description", ""))
        summaries  = {k: payload.get(k, "") for k in ["summary_headline","summary_brief","summary_deep"]}
        source_domain = payload.get("source_domain", "")

        if not body:
            payload["platform_body"] = ""
            return payload

        prompt = f"""Rewrite this news article in a neutral, factual, platform-original voice.
Source: {source_domain}
Original headline: {title}
Original article: {body[:3000]}

Rules:
- Do not copy phrases directly from the source
- Maintain all facts and named entities exactly
- Add attribution: "According to [source]..." for key facts
- Neutral, professional tone (not opinionated)
- If the source text is in Hindi or any non-English language, translate to clear English while rewriting.
- 400-600 words across 5-8 short paragraphs
- Start with the most important fact
- End with context or implications

Write the rewritten article directly in English (no heading, no intro, no JSON)."""

        try:
            rewritten = await self.llm(prompt, max_tokens=1200, temperature=0.4)
            rewritten_text = self._normalize_rewrite_text(rewritten)
            if not self._is_meaningful_rewrite(rewritten_text, summaries["summary_brief"], summaries["summary_deep"]):
                raise ValueError("rewrite output too short or summary-like")
            payload["platform_body"] = rewritten_text
        except Exception as e:
            log.warning(f"Rewrite failed: {e}")
            payload["platform_body"] = ""

        return payload


# ════════════════════════════════════════════════════════════════════════════
# HEADLINE GENERATOR AGENT
# ════════════════════════════════════════════════════════════════════════════
class HeadlineGeneratorAgent(BaseAgent):
    name          = "headline-generator"
    input_queue   = Q.NLP_HEADLINE
    output_queue  = Q.NLP_TRANSLATE

    @staticmethod
    def _headline_anchored(new_headline: str, source_title: str) -> bool:
        """
        Validate that the generated headline retained the non-substitutable tokens
        from the source: ALL-CAPS acronyms (ISRO, BJP, RBI, CBI) and explicit
        numbers/percentages (₹500 crore, 12%, 47 killed).

        Common title-case words like "Government", "Ministry", "India" are
        deliberately excluded — a paraphrase may legitimately substitute them.
        Only factual anchors that a reader would notice if changed are checked.
        """
        import re as _re
        if not source_title or not new_headline:
            return False
        # ALL-CAPS tokens ≥ 2 chars  →  abbreviations / acronyms
        acronyms = _re.findall(r'\b[A-Z]{2,}\b', source_title)
        # Bare numbers, currency figures, percentages
        numbers  = _re.findall(r'\b\d[\d,./]*(?:%|crore|lakh|billion|million|km|kg)?\b',
                               source_title, flags=_re.IGNORECASE)
        must_keep = acronyms + numbers
        if not must_keep:
            return True   # No hard anchors — accept any coherent paraphrase
        hl_lower = new_headline.lower()
        missing  = [t for t in must_keep if t.lower() not in hl_lower]
        # All hard anchors must survive verbatim
        return len(missing) == 0

    async def process(self, payload: dict) -> dict | None:
        title  = payload.get("title", "")
        body   = payload.get("platform_body") or payload.get("summary_brief", "")
        domain = payload.get("domain", "general")

        prompt = HEADLINE_GENERATOR_PROMPT_TEMPLATE.format(
            domain=domain,
            title=title,
            body_snippet=body[:400],
        )

        try:
            resp = await self.llm(prompt, json_mode=True, max_tokens=100)
            data = json.loads(resp)
            primary  = (data.get("primary")  or "").strip()[:300]
            ab_var   = (data.get("ab_variant") or "").strip()[:300]

            # Anchor check: if LLM dropped key proper nouns, fall back to source title
            if primary and self._headline_anchored(primary, title):
                payload["platform_headline"]   = primary
            else:
                payload["platform_headline"]   = (title or "").strip() or "Untitled Article"

            if ab_var and self._headline_anchored(ab_var, title):
                payload["headline_ab_variant"] = ab_var
            else:
                payload["headline_ab_variant"] = payload["platform_headline"]

        except Exception:
            payload["platform_headline"]   = (title or "").strip() or "Untitled Article"
            payload["headline_ab_variant"] = (title or "").strip() or "Untitled Article"

        return payload


# ════════════════════════════════════════════════════════════════════════════
# LANGUAGE TRANSLATION AGENT
# Uses free LibreTranslate (self-hosted) or Google Translate API
# ════════════════════════════════════════════════════════════════════════════
class TranslationAgent(BaseAgent):
    name          = "translation"
    input_queue   = Q.NLP_TRANSLATE
    output_queue  = Q.NLP_TERMINOLOGY
    TARGET_LANGS  = ["hi", "ta", "te", "bn", "mr"]  # FIX: all 5 regional languages

    async def process(self, payload: dict) -> dict | None:
        headline = payload.get("platform_headline") or payload.get("title", "")
        brief    = payload.get("summary_brief", "")
        translations = {}

        for lang in self.TARGET_LANGS:
            # Check cache
            cache_key = f"trans:{lang}:{hash(headline)}"
            cached = await self.cache_get(cache_key)
            if cached:
                translations[lang] = json.loads(cached)
                continue
            t = await self._translate(headline, brief, lang)
            if t:
                translations[lang] = t
                await self.cache_set(cache_key, json.dumps(t), 7 * 24 * 3600)

        payload["translations"] = translations
        return payload

    async def _translate(self, headline: str, brief: str, lang: str) -> dict | None:
        """
        Use LibreTranslate (free, self-hosted) or Google Translate API.
        For dev: use Google Translate free tier (500K chars/month free).
        """
        import httpx
        LIBRE_URL = os.environ.get("LIBRETRANSLATE_URL", "http://libretranslate:5000")  # FIX: read from env
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # Try LibreTranslate first (completely free, self-hosted)
                resp = await client.post(f"{LIBRE_URL}/translate", json={
                    "q": f"{headline}\n\n{brief}",
                    "source": "en",
                    "target": lang,
                    "format": "text"
                })
                if resp.status_code == 200:
                    translated = resp.json().get("translatedText", "")
                    parts = translated.split("\n\n", 1)
                    return {
                        "headline": parts[0] if parts else "",
                        "brief":    parts[1] if len(parts) > 1 else "",
                    }
        except Exception:
            pass  # LibreTranslate not running — skip translation in dev
        return None


# ════════════════════════════════════════════════════════════════════════════
# TERMINOLOGY EXPLAINER AGENT
# ════════════════════════════════════════════════════════════════════════════
class TerminologyExplainerAgent(BaseAgent):
    name          = "terminology-explainer"
    input_queue   = Q.NLP_TERMINOLOGY
    output_queue  = Q.NLP_TIMELINE

    TERM_PATTERNS = {
        "economy":  r'\b(GDP|fiscal deficit|current account|monetary policy|repo rate|CRR|SLR|inflation|deflation|recession|stagflation|quantitative easing|FDI|FPI|BoP|FEMA|SEBI|NBFC|NPAs|SARFAESI)\b',
        "law":      r'\b(PIL|writ petition|certiorari|mandamus|habeas corpus|suo motu|ex parte|injunction|stay order|FIR|chargesheet|bail|anticipatory bail|acquittal|conviction|judicial review|basic structure)\b',
        "health":   r'\b(mRNA|antibody|antigen|pathogen|endemic|epidemic|pandemic|herd immunity|ICU|ventilator|clinical trial|Phase [123]|FDA|CDSCO|pharmacokinetics|comorbidity|etiology|prognosis)\b',
        "science":  r'\b(quantum|dark matter|black hole|neutrino|CRISPR|genomics|proteomics|neural network|transformer model|diffusion model|reinforcement learning|LLM|AGI)\b',
    }

    async def process(self, payload: dict) -> dict | None:
        text       = payload.get("platform_body") or payload.get("summary_deep", "")
        domain     = payload.get("domain", "general")
        professions = payload.get("professions", ["general"])

        if not text:
            return payload

        # Find terms in article
        terms_to_explain = set()
        for dom, pattern in self.TERM_PATTERNS.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            terms_to_explain.update(matches)

        if not terms_to_explain:
            payload["terminology"] = {}
            return payload

        # Generate explanations for each profession
        glossary = {}
        for term in list(terms_to_explain)[:8]:  # Limit to 8 terms per article
            term_key = f"term:{term.lower()}:{professions[0]}"
            cached = await self.cache_get(term_key)
            if cached:
                glossary[term] = json.loads(cached)
                continue

            explanation = await self._explain_for_profession(term, professions[0], domain)
            glossary[term] = explanation
            await self.cache_set(term_key, json.dumps(explanation), 30 * 24 * 3600)

        payload["terminology"] = glossary
        return payload

    async def _explain_for_profession(self, term: str, profession: str, domain: str) -> dict:
        prompt = f"""Explain "{term}" in 30 words or less, specifically for a {profession} professional reading a {domain} news article.
Be precise and contextually relevant. Return JSON: {{"explanation": "...", "context": "why relevant to {profession}"}}"""
        try:
            resp = await self.llm(prompt, json_mode=True, max_tokens=150)
            return json.loads(resp)
        except Exception:
            return {"explanation": f"{term}: technical term in {domain}", "context": ""}


# ════════════════════════════════════════════════════════════════════════════
# STORY TIMELINE AGENT
# ════════════════════════════════════════════════════════════════════════════
class StoryTimelineAgent(BaseAgent):
    name          = "story-timeline"
    input_queue   = Q.NLP_TIMELINE
    output_queue  = Q.PERS_PROFESSION

    async def process(self, payload: dict) -> dict | None:
        cluster_id = payload.get("cluster_id")
        title      = payload.get("platform_headline") or payload.get("title", "")
        source     = payload.get("source_domain", "")

        # Parse published date — RSS gives RFC 2822 strings like "Thu, 19 Mar 2026 15:20:44 +0530"
        raw_date = payload.get("published", "")
        published = datetime.now(timezone.utc)
        if raw_date:
            try:
                from email.utils import parsedate_to_datetime
                published = parsedate_to_datetime(raw_date)
            except Exception:
                try:
                    published = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                except Exception:
                    published = datetime.now(timezone.utc)

        if not cluster_id:
            return None

        # Extract key event from this article addition
        event_text = await self._extract_event(title, payload.get("summary_brief", ""))

        # Insert into story_events; keep pipeline moving even if timeline storage is unavailable.
        try:
            await self.db_execute(
                """INSERT INTO story_events (cluster_id, event_text, event_date, source_name)
                   SELECT $1, $2, $3, $4
                   WHERE NOT EXISTS (
                     SELECT 1
                     FROM story_events se
                     WHERE se.cluster_id = $1
                       AND lower(regexp_replace(btrim(se.event_text), '\\s+', ' ', 'g')) =
                           lower(regexp_replace(btrim($2), '\\s+', ' ', 'g'))
                       AND se.event_date = $3
                   )""",
                cluster_id, event_text, published, source
            )
        except Exception as e:
            log.warning(f"[story-timeline] failed to persist event for {cluster_id}: {e}")
        return payload

    async def _extract_event(self, title: str, brief: str) -> str:
        prompt = f"""From this news headline and brief, extract the KEY EVENT in one sentence (past tense, factual).
Headline: {title}
Brief: {brief[:200]}
Return just the event sentence, nothing else."""
        try:
            event = await self.llm(prompt, max_tokens=60, temperature=0)
            return event.strip()[:300]
        except Exception:
            return title[:300]
