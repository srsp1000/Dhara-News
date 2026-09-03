# Dhara — Clear all data and restart fresh
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "WARNING: This will delete ALL articles!" -ForegroundColor Red
Write-Host "Tip: run a backup first (docker compose exec -T postgres pg_dump -U dhara -d dhara > backup.sql)" -ForegroundColor Yellow
$confirm = Read-Host "Type YES to confirm"
if ($confirm -ne "YES") { Write-Host "Cancelled"; exit }

Write-Host "Clearing database..." -ForegroundColor Yellow
docker compose exec -T postgres psql -U dhara -d dhara -c "TRUNCATE story_clusters, articles, story_events, article_views, article_seo, article_translations, claims, comments, saved_articles RESTART IDENTITY CASCADE;"

Write-Host "Clearing Redis..." -ForegroundColor Yellow
docker compose exec -T redis redis-cli FLUSHALL

Write-Host "Clearing RabbitMQ queues..." -ForegroundColor Yellow
Write-Output "y" | py scripts\reset_queues.py

Write-Host "Rebuilding containers with fixed prompts..." -ForegroundColor Yellow
docker compose build --parallel api agent-summarization agent-web-crawler
docker compose up -d

Write-Host "Done! Articles appear in 15 minutes." -ForegroundColor Green
Write-Host "Open: http://localhost:3000" -ForegroundColor Cyan
