# धारा — Dhara News Platform

**Full-stack, 42-agent, AI-powered news platform. Runs entirely locally for free.**

## What this is

A complete news intelligence platform with:
- **42 autonomous AI agents** across 8 clusters
- **Verified news** — Truth Score (0–100) on every article
- **Fake news detection** — 8 verification agents working in parallel
- **Profession feeds** — 12 profession types (UPSC, Medical, Law, Tech, Finance, Students...)
- **Exam relevance tagging** — UPSC Prelims/Mains, NEET, JEE, Bar, CLAT, CAT, GATE
- **Location-based news** — Country → State → City hierarchy
- **Date archive** — Calendar heatmap, browse any date
- **Story timelines** — Ongoing events tracked across 50+ sources
- **Bias compass** — Left-right placement per article
- **Morning Brief** — Automated daily digest per profession (ad-free)
- **3-depth reading** — Headline / Brief / Deep Dive per article
- **Source graph** — See exactly who reported it and when
- **Terminology explainer** — Profession-specific term popups

## Prerequisites

1. **Docker Desktop** (free) — https://docker.com/products/docker-desktop
2. **8 GB RAM minimum** (16 GB recommended for full LLM)
3. **20 GB free disk** (Docker images ~8 GB, Ollama model ~5 GB)
4. **Python 3.8+** (for setup/health scripts)
5. **Git**

## Quick Start (3 commands)

```bash
git clone https://github.com/YOUR_USERNAME/dhara-news.git
cd dhara-news
python scripts/setup.py
```

That's it. The setup script handles everything:
- Pulls all Docker images
- Creates the database with full schema
- Downloads the Ollama LLM model (one-time, ~5 GB)
- Starts all 42 agents

**Platform is live at http://localhost:3000**

First articles appear within 15 minutes as the RSS crawler completes its first cycle.

---

## Manual Start (if you prefer Make)

```bash
# First time only
make setup

# Every time after
make start

# Check what's running
make status
python scripts/health.py

# Watch the pipeline
make logs
make logs-verify   # Only verification agents
make logs-pipeline # Only ingestion + publish

# Stop
make stop
```

---

## File Structure

```
dhara-full/
├── .cursorrules              ← AI context for Cursor/Claude Code
├── .env.example              ← Copy to .env and fill in API keys
├── docker-compose.yml        ← All 42 agents + full infra
├── Makefile                  ← make start / stop / logs / status
│
├── agents/
│   ├── base.py               ← BaseAgent class all 42 agents inherit from
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── ingestion/            ← 5 agents: RSS, Crawler, NewsAPI, Social, Images
│   ├── deduplication/        ← 3 agents: Fingerprint, Semantic, StoryCluster
│   ├── verification/         ← 8 agents: Claims, CrossRef, Credibility, TruthScore,
│   │                            Contradiction, Satire, FakeSignal, ImageVerify
│   ├── nlp/                  ← 9 agents: NER, Topics, ExamTagger, Summarize,
│   │                            Rewrite, Headline, Translate, Terminology, Timeline
│   ├── personalization/      ← 6 agents: ProfFeed, LocationFeed, Trending,
│   │                            MorningBrief, Notification, ReadingDepth
│   ├── monitoring/           ← 7 agents: SearchIndexer, TruthUpdater, Health,
│   │                            Bias, AdQuality (search agents included here)
│   └── publishing/           ← Publish gate, CDN, SEO, SocialShare
│
├── api/
│   ├── main.py               ← FastAPI: all routes
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── package.json
│   ├── Dockerfile.dev
│   └── app/
│       ├── page.js           ← Main feed
│       ├── layout.js         ← Root layout
│       ├── archive/page.js   ← Date archive with heatmap calendar
│       ├── search/page.js    ← Advanced search with all filters
│       ├── morning-brief/page.js
│       ├── trending/page.js
│       ├── profile/page.js
│       └── quarantine/page.js
│
├── infra/
│   ├── schema.sql            ← Complete PostgreSQL schema (15 tables + views + functions)
│   ├── init.sql              ← Docker init
│   └── prometheus.yml        ← Monitoring config
│
└── scripts/
    ├── setup.py              ← First-time setup
    └── health.py             ← Platform health check
```

---

## How Articles Flow Through the Pipeline

```
RSS / Web / API → Fingerprint dedup → Semantic dedup → Story Cluster
                                                              ↓
              Credibility → Satire check → Fake signal → Claim extraction
                                                              ↓
                              Cross-reference → Truth Score → Contradiction check
                                                              ↓
                          NER entities → Topic classifier → Exam tagger
                                                              ↓
                          Summarization (3 depths) → Rewrite → Headline
                                                              ↓
                          Translation → Terminology → Story timeline
                                                              ↓
                          Profession feed → Location feed → Publish gate
                                                              ↓
                             Search index → SEO → Social share → LIVE
```

Average time: 8–15 seconds for breaking news, 2–5 minutes for full enrichment.

---

## Environment Variables

All in `.env`. Only one is truly required for full features:

| Variable               | Required | Where to get                          |
|------------------------|----------|---------------------------------------|
| `GROQ_API_KEY`         | Optional | https://console.groq.com (free)       |
| `GROQ_MAX_RPS`         | Optional | Max shared Groq requests/sec (default: 2) |
| `GROQ_RETRIES`         | Optional | Retry attempts on 429 before Ollama fallback (default: 3) |
| `NEWSAPI_KEY`          | Optional | https://newsapi.org (100 req/day free)|
| `GOOGLE_TRANSLATE_KEY` | Optional | Google Cloud console (free tier)      |
| `RESEND_API_KEY`       | Optional | https://resend.com (3K emails/mo free)|
| `FCM_SERVER_KEY`       | Optional | Firebase console (free)               |

Everything else (PG, Redis, RabbitMQ, Qdrant, ES, Ollama) uses the defaults in `.env.example`.

**Without any API keys:** The platform runs fully. Ollama handles all LLM tasks locally.
Summaries may be slower but are generated entirely on your machine at zero cost.

---

## Using AI Agents to Complete Development (Cursor / Claude Code)

The `.cursorrules` file at the root gives every AI coding session full platform context.

### To build any remaining feature:

```bash
# Open Cursor in the project root
cursor .

# Press Cmd+I (Composer) and paste:
"Build [feature name] following .cursorrules. 
The agent inherits from BaseAgent in agents/base.py.
Input queue: [Q.CONSTANT]. Output queue: [Q.CONSTANT]."
```

### To run Claude Code on a specific agent:

```bash
cd agents/nlp
claude
# Type: "Review this agent for compliance with .cursorrules and add missing error handling"
```

---

## Scaling for Launch

When you have revenue and are ready to deploy:

| Current (Local)     | Production Upgrade          | Monthly Cost |
|---------------------|-----------------------------|--------------|
| Ollama local LLM    | Anthropic API (claude-sonnet)| ~$100-400    |
| PostgreSQL Docker   | Supabase Pro                | $25          |
| Redis Docker        | Upstash Redis               | ~$3          |
| RabbitMQ Docker     | CloudAMQP (1M msg free)     | $0           |
| Elasticsearch Docker| Elastic Cloud               | $16          |
| Qdrant Docker       | Qdrant Cloud (free 1GB)     | $0           |
| MinIO Docker        | Cloudflare R2               | $0.015/GB    |
| Frontend localhost  | Vercel (free)               | $0           |
| Backend localhost   | Render.com Starter          | $7           |
| Domain              | .news domain                | ₹1,200/year  |

**Total launch cost: ~₹1,800 + $51/month — covered by Google AdSense at 5,000+ daily users.**

---

## Revenue

Apply for Google AdSense immediately at launch. Replace the placeholder `<AdSlot />` 
in `frontend/app/page.js` with your actual publisher ID.

Expected AdSense revenue (India CPM ~₹15-25):
- 1,000 daily users → ₹3,000–8,000/month
- 5,000 daily users → ₹15,000–40,000/month  
- 10,000 daily users → ₹30,000–80,000/month

Growth channel with ₹0 budget: UPSC Telegram groups (500K+ aspirants looking for 
exactly this kind of daily current affairs + exam tagging). One post → 2,000 users.
