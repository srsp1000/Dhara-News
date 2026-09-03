@echo off
title Dhara — Clear All Data & Restart Fresh
cd /d "%~dp0.."
color 0C

echo.
echo ============================================================
echo  WARNING: This will DELETE all articles, sources, and data
echo  The platform will restart fresh with new articles in 15min
echo  Tip: run backup first - docker compose exec -T postgres pg_dump -U dhara -d dhara ^> backup.sql
echo ============================================================
echo.
set /p CONFIRM=Type YES to confirm: 
if not "%CONFIRM%"=="YES" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Clearing all article data...
docker compose exec -T postgres psql -U dhara -d dhara -c "TRUNCATE story_clusters, articles, story_events, article_views, article_seo, article_translations, claims, comments, saved_articles RESTART IDENTITY CASCADE;"
echo.
echo Clearing Redis caches...
docker compose exec -T redis redis-cli FLUSHALL
echo.
echo Clearing RabbitMQ queues...
py scripts\reset_queues.py <<< y
echo.
echo Restarting all agents...
docker compose restart agent-rss-feed agent-web-crawler agent-summarization agent-story-cluster agent-truth-score
echo.
echo ============================================================
echo  Done! New articles will appear in ~15 minutes.
echo  Open http://localhost:3000
echo ============================================================
pause
