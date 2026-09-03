# Dhara News — Enterprise Deployment Runbook
# From local dev → production on AWS with zero downtime

---

## Deployment Tiers

| Tier | Stack | Cost | When |
|------|-------|------|------|
| **Local Dev** | Docker Compose | ₹0 | Right now |
| **Cloud MVP** | Render.com + Supabase + Upstash | ~₹2,500/month | 0–5K users |
| **Growth** | Railway/Fly.io + Managed PG + Redis | ~₹8,000/month | 5K–50K users |
| **Enterprise** | AWS EKS + RDS + ElastiCache + CloudFront | ~₹40,000/month | 50K+ users |

---

## TIER 1: Local Dev → Working Platform (Today)

```bash
cd dhara-full
python3 scripts/setup.py          # one-time setup
make start                        # start all containers
open http://localhost:3000        # you're live locally
```

Platform is fully working. Articles appear within 15 min.

---

## TIER 2: Cloud MVP (~₹2,500/month, 30-minute deploy)

### Services used (all free tiers at start)
- **Frontend**: Vercel (free)
- **API**: Render.com Starter ($7/mo)
- **Database**: Supabase (free tier — 500MB, 2 projects)
- **Cache**: Upstash Redis (free — 10K req/day)
- **Queue**: CloudAMQP (free — 1M msg/month)
- **Search**: Qdrant Cloud (free — 1GB)
- **LLM**: Groq API (free — 14,400 req/day)

### Step 1: Supabase (Database + Auth)

```bash
# Go to supabase.com → New project → Singapore region
# Project name: dhara-news
# After creation, go to Settings → API:
#   - copy Project URL → NEXT_PUBLIC_SUPABASE_URL
#   - copy anon key   → NEXT_PUBLIC_SUPABASE_ANON_KEY
#   - copy service key → SUPABASE_SERVICE_KEY

# Apply schema in Supabase SQL editor:
# Open infra/schema.sql → copy → paste into Supabase SQL Editor → Run
# Apply infra/schema.sql addendum (at bottom of file) for comments + subscriptions
```

### Step 2: Groq (Free LLM — replaces local Ollama)

```bash
# Go to console.groq.com → Create API key
# Add to your .env:
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama3-8b-8192   # or llama3-70b-8192 for better quality
# In agents/base.py, the llm() method auto-detects GROQ_API_KEY
```

### Step 3: Deploy API to Render.com

```bash
# Go to render.com → New Web Service → Connect GitHub repo
# Settings:
#   Root Directory: api
#   Build Command: pip install -r requirements.txt
#   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2
#   Plan: Starter ($7/month)
#   Region: Singapore

# Add environment variables in Render dashboard:
PG_DSN=         # from Supabase: Settings → Database → URI
REDIS_URL=      # from Upstash: copy Redis URL
RABBITMQ_URL=   # from CloudAMQP: copy AMQP URL
QDRANT_URL=     # from Qdrant Cloud: copy cluster URL
GROQ_API_KEY=   # from Groq
SUPABASE_SERVICE_KEY=  # from Supabase Settings → API
SITE_URL=https://dhara.news
```

### Step 4: Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

cd frontend
vercel                    # follow prompts, select your Vercel account

# Set environment variables in Vercel dashboard → Settings → Environment Variables:
NEXT_PUBLIC_API_URL=https://dhara-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

vercel --prod             # deploy to production
```

### Step 5: Deploy Agent pipeline to Render (Background Worker)

```bash
# In Render dashboard → New Background Worker
# Root Directory: agents
# Build: pip install -r requirements.txt
# Start: python -m ingestion.rss_feed & python -m deduplication.fingerprint & 
#        python -m verification.truth_score & python -m nlp.summarization &
#        python -m publishing.publish_queue & wait
# Same environment variables as API

# Or split into separate workers for key agents:
#   Worker 1: ingestion (rss + crawler)
#   Worker 2: verification (truth score + cross ref)
#   Worker 3: nlp (summarization + headline)
#   Worker 4: publishing (queue + seo)
```

### Step 6: Domain (dhara.news)

```bash
# Buy on Namecheap or GoDaddy:
#   dhara.news      (~₹1,200/year)
#   dharanews.com   (~₹900/year)
#   dhara.in        (~₹600/year)

# Vercel: Settings → Domains → Add → dhara.news
# Follow DNS instructions (Vercel auto-provisions SSL via Let's Encrypt)

# For API subdomain (api.dhara.news):
# Render: Settings → Custom Domains → api.dhara.news
# Add CNAME in your DNS: api → dhara-api.onrender.com
```

### Verify your deployment

```bash
# Check everything is running:
curl https://dhara.news               # frontend loads
curl https://api.dhara.news/          # {"status":"ok","platform":"Dhara News"}
curl https://api.dhara.news/api/feed?profession=upsc&limit=3  # returns articles
```

---

## TIER 3: Growth Stage (5K–50K users, ~₹8K/month)

When you hit 5,000 daily users:

### Move to Railway.app (better than Render for scaling)

```bash
# railway.app → New Project → GitHub repo
# Each service becomes a separate Railway service:
#   dhara-api       → api/
#   dhara-agents    → agents/
#   dhara-frontend  → frontend/

# Railway provisions:
#   PostgreSQL     (auto-managed, daily backups)
#   Redis          (auto-managed)
#   Auto-scaling   (CPU-based, pay per use)
```

### Add dedicated services

```yaml
# Replace shared services with dedicated:
Elasticsearch: Elastic Cloud ($16/mo) → better search quality
RabbitMQ:     CloudAMQP Small ($20/mo) → 1M msg/day, management UI
MinIO:        Cloudflare R2 (free 10GB) → article images
Monitoring:   Grafana Cloud (free tier) → connect existing prometheus config
```

### Performance optimizations

```bash
# 1. Enable Next.js ISR for article pages (revalidate: 300)
# Already set in app/article/[id]/page.js

# 2. Enable Redis caching for all feed API calls
# Already in api/main.py — TTL 900s (15 min)

# 3. Add CDN caching headers
# nginx.conf already configured with 5-min cache for feed, 7-day for static

# 4. Pre-generate profession pages at build time
# generateStaticParams() already in app/[profession]/page.js
# generateStaticParams() already in app/location/[state]/page.js
```

---

## TIER 4: Enterprise AWS (50K+ users, ~₹40K/month)

### Prerequisites

```bash
# Install tools
brew install terraform kubectl helm awscli
aws configure   # add your AWS Access Key + Secret

# Create state bucket first
aws s3 mb s3://dhara-terraform-state --region ap-south-1
aws s3api put-bucket-versioning \
  --bucket dhara-terraform-state \
  --versioning-configuration Status=Enabled
```

### Deploy infrastructure

```bash
cd deploy/terraform

# Edit variables
cp terraform.tfvars.example terraform.tfvars
# Fill in: db_password, domain_name, environment

terraform init
terraform plan                    # review what will be created
terraform apply                   # takes ~20 minutes

# After apply, outputs show:
#   eks_cluster_name = "dhara-production"
#   rds_endpoint     = "dhara.xxx.ap-south-1.rds.amazonaws.com"
#   redis_endpoint   = "dhara.xxx.cache.amazonaws.com"
```

### Deploy to EKS

```bash
# Connect kubectl to your cluster
aws eks update-kubeconfig --name dhara-production --region ap-south-1

# Install dependencies
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx-ingress ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace

helm repo add cert-manager https://charts.jetstack.io
helm install cert-manager cert-manager/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace

# Update deploy/kubernetes/deployments.yaml:
# Replace YOUR_ORG with your GitHub org
# Replace connection strings with Terraform outputs

# Apply manifests
kubectl apply -f deploy/kubernetes/deployments.yaml

# Check all pods are running
kubectl get pods -n dhara

# Watch deployment
kubectl rollout status deployment/dhara-api -n dhara
```

### Build and push Docker images

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Build and push (or let CI/CD do this automatically)
docker build -t ghcr.io/YOUR_ORG/dhara-api:latest ./api
docker build -t ghcr.io/YOUR_ORG/dhara-agents:latest ./agents
docker build -t ghcr.io/YOUR_ORG/dhara-frontend:latest ./frontend -f frontend/Dockerfile.prod

docker push ghcr.io/YOUR_ORG/dhara-api:latest
docker push ghcr.io/YOUR_ORG/dhara-agents:latest
docker push ghcr.io/YOUR_ORG/dhara-frontend:latest
```

### Setup CI/CD (GitHub Actions — already configured)

```bash
# Add these secrets to GitHub → Settings → Secrets:
RENDER_API_DEPLOY_HOOK=     # from Render → Settings → Deploy Hook
RENDER_FRONTEND_DEPLOY_HOOK=
NEXT_PUBLIC_API_URL=https://api.dhara.news
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
PRODUCTION_URL=https://dhara.news

# Every push to main now:
# 1. Runs tests (pytest)
# 2. Lints frontend (ESLint)
# 3. Builds Docker images
# 4. Pushes to GHCR
# 5. Deploys to Render (or EKS via webhook)
# 6. Health checks production URL
```

---

## Monitoring & Alerting

### Grafana dashboards (already configured in infra/prometheus.yml)

```bash
# Access Grafana
kubectl port-forward svc/grafana 3003:3000 -n dhara
# Open http://localhost:3003 (admin/admin)
# Import dashboard: Grafana → Dashboards → Import → upload deploy/grafana/dhara-dashboard.json
```

### Key metrics to monitor
- `queue_depth{queue="verify.claims"}` > 500 → alert (verification backlog)
- `api_response_time_p99` > 2s → alert (API too slow)
- `truth_score_avg` < 40 → alert (source credibility problem)
- `articles_per_hour` < 10 → alert (ingestion stopped)
- `dlq_depth{queue="dlq.*"}` > 0 → alert (failed messages)

### PagerDuty alerting (optional)

```bash
# Add PAGERDUTY_KEY to .env
# PipelineHealthAgent already posts alerts when queues back up
# Alerts fire when: queue depth > 500, DLQ > 0, API down
```

---

## Database Backups

```bash
# Local: PostgreSQL backup
docker compose exec postgres pg_dump -U dhara dhara > backups/dhara_$(date +%Y%m%d).sql

# AWS RDS: automated — 7-day retention already configured in terraform
# Manual snapshot before major deployments:
aws rds create-db-snapshot \
  --db-instance-identifier dhara-production \
  --db-snapshot-identifier dhara-pre-deploy-$(date +%Y%m%d)
```

---

## Rollback Procedure

```bash
# Zero-downtime rollback to previous Docker image
kubectl set image deployment/dhara-api \
  api=ghcr.io/YOUR_ORG/dhara-api:PREVIOUS_SHA \
  -n dhara

kubectl rollout status deployment/dhara-api -n dhara

# Or rollback to previous k8s revision
kubectl rollout undo deployment/dhara-api -n dhara
```

---

## Cost Breakdown by Tier

### Tier 2 (Cloud MVP) — ~₹2,500/month
| Service | Cost |
|---------|------|
| Render API | $7/mo (~₹580) |
| Render Agent Worker | $7/mo (~₹580) |
| Vercel Frontend | Free |
| Supabase DB | Free |
| Upstash Redis | Free |
| CloudAMQP | Free |
| Qdrant Cloud | Free |
| Groq LLM | Free |
| dhara.news domain | ₹100/month |
| **Total** | **~₹1,360/month** |

### Tier 3 (Growth) — ~₹8,000/month
| Service | Cost |
|---------|------|
| Railway (API + Agents) | ~$40/mo |
| Railway PostgreSQL | ~$20/mo |
| Elastic Cloud Search | $16/mo |
| CloudAMQP Small | $20/mo |
| Cloudflare R2 | ~$1/mo |
| **Total** | **~₹8,000/month** |
*Covered by AdSense at 30,000+ daily users*

### Tier 4 (Enterprise AWS) — ~₹40,000/month
| Service | Cost |
|---------|------|
| EKS (3 m6i.xlarge spot nodes) | ~$120/mo |
| RDS Multi-AZ (t4g.medium) | ~$80/mo |
| ElastiCache Redis (2 shards) | ~$60/mo |
| CloudFront CDN | ~$20/mo |
| Data transfer | ~$30/mo |
| Route53 | $5/mo |
| S3 | ~$5/mo |
| **Total** | **~₹40,000/month** |
*At this scale, revenue should be ₹5L+/month*

---

## Launch Checklist

### Before going live
- [ ] Domain registered and DNS configured
- [ ] SSL certificate active (auto via Vercel/Render)
- [ ] Google AdSense application submitted
- [ ] Supabase Google OAuth configured
- [ ] Razorpay account created (for Pro subscriptions)
- [ ] DPDP compliance review done (no behavioral tracking — already compliant)
- [ ] At least 100 verified articles in DB before launching
- [ ] robots.txt in public/ folder
- [ ] sitemap.xml accessible at dhara.news/sitemap.xml
- [ ] OpenGraph images working (share to WhatsApp shows preview)
- [ ] Morning brief tested end-to-end
- [ ] Mobile layout verified on iPhone + Android

### Growth channels on Day 1 (zero budget)
1. Post in r/UPSC (500K members) — "Built a news platform that tags every story with UPSC paper relevance"
2. Post in UPSC Telegram groups — share morning brief as daily post with "Source: dhara.news"
3. NEET PG Telegram — post health news with medical terminology explanations
4. LinkedIn — post the Truth Score concept to tech/journalism community
5. ProductHunt — launch on Tuesday morning IST
