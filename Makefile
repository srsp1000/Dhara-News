.PHONY: help setup start stop restart status logs logs-verify logs-api db-setup db-shell db-backup db-stats pull-model pull-model-sm test build push deploy-render deploy-k8s rollback-k8s health queues clean clean-all prod-start

help:
	@echo ""
	@echo "  धारा News — Commands"
	@echo "  Dev:      make setup | start | stop | restart | status | logs"
	@echo "  DB:       make db-setup | db-shell | db-backup | db-stats"
	@echo "  AI:       make pull-model | pull-model-sm"
	@echo "  Test:     make test"
	@echo "  Deploy:   make build | push | deploy-render | deploy-k8s"
	@echo "  Monitor:  make health | queues"
	@echo ""

setup:
	python3 scripts/setup.py

start:
	docker compose up -d
	@echo "✅ http://localhost:3000 | API: :8000 | Grafana: :3003 | RabbitMQ: :15672"

stop:
	docker compose down

restart: stop start

status:
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

logs:
	docker compose logs -f --tail=50

logs-verify:
	docker compose logs -f --tail=30 agent-claim-extraction agent-cross-reference agent-truth-score agent-satire agent-fake-signal

logs-api:
	docker compose logs -f --tail=50 api

logs-pipeline:
	docker compose logs -f --tail=30 agent-rss-feed agent-web-crawler agent-publish-queue

db-setup:
	@PG_ID=$$(docker compose ps -q postgres) && \
	for f in infra/schema.sql infra/schema_master_fix.sql; do \
	  docker cp $$f $$PG_ID:/tmp/$$(basename $$f) && \
	  docker compose exec -T postgres psql -U dhara -d dhara -f /tmp/$$(basename $$f) || exit 1; \
	done && \
	echo "✅ Schema applied"

db-shell:
	docker compose exec postgres psql -U dhara -d dhara

db-backup:
	@mkdir -p backups
	@docker compose exec -T postgres pg_dump -U dhara dhara > backups/dhara_$$(date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup saved"

db-stats:
	@docker compose exec -T postgres psql -U dhara -d dhara -c \
	  "SELECT status, COUNT(*) as count, ROUND(AVG(truth_score),1) as avg_score FROM story_clusters GROUP BY status ORDER BY count DESC;"

pull-model:
	docker compose exec ollama ollama pull llama3.1:8b

pull-model-sm:
	docker compose exec ollama ollama pull llama3.2:3b

test:
	pip install pytest pytest-asyncio httpx -q
	pytest tests/ -v --tb=short

build:
	docker compose build --parallel

REGISTRY ?= ghcr.io
ORG      ?= YOUR_ORG
SHA      := $(shell git rev-parse --short HEAD 2>/dev/null || echo local)

push:
	docker tag dhara-full-api:latest $(REGISTRY)/$(ORG)/dhara-api:latest
	docker tag dhara-full-agents:latest $(REGISTRY)/$(ORG)/dhara-agents:latest
	docker push $(REGISTRY)/$(ORG)/dhara-api:latest
	docker push $(REGISTRY)/$(ORG)/dhara-agents:latest

deploy-render:
	curl -s -X POST "$(RENDER_API_DEPLOY_HOOK)" | python3 -m json.tool

deploy-k8s:
	kubectl apply -f deploy/kubernetes/deployments.yaml
	kubectl rollout status deployment/dhara-api -n dhara

rollback-k8s:
	kubectl rollout undo deployment/dhara-api -n dhara
	kubectl rollout undo deployment/dhara-frontend -n dhara

health:
	python3 scripts/health.py

queues:
	@curl -s -u dhara:dhara_local http://localhost:15672/api/queues/%2F | \
	  python3 -c "import json,sys; data=json.load(sys.stdin); [print(f'  {q[\"name\"]:<40} {q.get(\"messages\",0):>6}') for q in sorted(data, key=lambda x:-x.get('messages',0))]" 2>/dev/null || echo "RabbitMQ not accessible"

clean:
	docker compose down -v --remove-orphans
	docker system prune -f

clean-all: clean
	docker volume prune -f

prod-start:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

migrate:
	@PG_ID=$$(docker compose ps -q postgres) && \
	docker cp infra/schema_master_fix.sql $$PG_ID:/tmp/schema_master_fix.sql && \
	docker compose exec -T postgres psql -U dhara -d dhara -f /tmp/schema_master_fix.sql && \
	echo "✅ Migration applied"
