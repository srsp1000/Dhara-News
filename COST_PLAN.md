# Dhara News — Cost Plan: Build for Free, Scale After Revenue

## Development (Right Now): ₹0/month
Everything runs locally in Docker. Zero cloud costs.

| Component        | Dev (Free)                  | Production (After Revenue)         |
|------------------|-----------------------------|------------------------------------|
| LLM              | Ollama local (llama3.1:8b)  | Anthropic Claude API               |
| Database         | PostgreSQL in Docker        | Supabase Pro ($25/mo)              |
| Cache            | Redis in Docker             | Upstash Redis (pay-per-use ~$3/mo) |
| Queue            | RabbitMQ in Docker          | CloudAMQP (free 1M msg/mo)         |
| Vector DB        | Qdrant in Docker            | Qdrant Cloud (free 1GB)            |
| Search           | Elasticsearch in Docker     | Elastic Cloud ($16/mo)             |
| Auth             | Simple JWT in FastAPI       | Supabase Auth (free)               |
| Storage          | MinIO in Docker             | Cloudflare R2 ($0.015/GB)          |
| Frontend hosting | Localhost                   | Vercel (free)                      |
| Backend hosting  | Localhost                   | Render.com ($7/mo)                 |
| Domain           | localhost:3000              | .news domain ₹1,200/year           |
| Monitoring       | Grafana + Prometheus local  | Same                               |
| Translation      | Skip / LibreTranslate local | Google Translate API (free 500K)   |
| Email            | Console.log it              | Resend (3,000/mo free)             |
| Push notifs      | Skip                        | FCM (free for Android)             |

## What You Need to Run Locally
1. Docker Desktop (free): https://docker.com/products/docker-desktop
2. 8GB RAM minimum (16GB recommended for Ollama + Elasticsearch)
3. 20GB free disk space (Ollama model ~5GB, Docker images ~10GB)
4. Git

## Machine Requirements
- Ollama llama3.1:8b: needs 8GB RAM (runs on CPU, slower but works)
- Ollama llama3.2:3b: needs 4GB RAM (faster, slightly lower quality)
- Elasticsearch: needs 512MB-1GB RAM (already limited in docker-compose.yml)
- Total: ~6-8GB RAM for full stack

## If Your Machine Is Weak (< 8GB RAM)
Option A: Skip Ollama, use Groq free API instead
  → Change OLLAMA_URL calls in base.py to use Groq's free API
  → groq.com → free tier → 14,400 requests/day free

Option B: Use smaller Ollama model
  → run: make pull-model-small
  → Set OLLAMA_MODEL=llama3.2:3b in .env

Option C: Skip local LLM entirely
  → Summaries fall back to extractive (first 3 sentences)
  → Still works, just less polished summaries
  → Platform is fully functional without LLM summaries

## Launch Cost Estimate (Month 1)
- Domain (.news or .in): ₹1,200
- Vercel Pro (only if >100GB bandwidth): $0 on free tier
- Render.com Starter: $7/month (₹600)
- Supabase free tier: $0 (500MB + 50K users)
- Cloudflare free: $0
- TOTAL LAUNCH COST: ~₹1,800 (domain) + ₹600/month

## Revenue Before Significant Costs
- Google AdSense: Apply at launch. 1,000 daily users → ₹3,000-8,000/month
- At 5,000 daily users: ₹15,000-40,000/month
- Your infra costs only exceed ₹5,000/month at ~30,000 daily users
- You're profitable from day one of any real traffic
