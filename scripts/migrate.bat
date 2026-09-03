@echo off
setlocal EnableDelayedExpansion
echo Dhara News - Running database migrations
echo.

for %%F in (schema_additions.sql schema_bayesian.sql migration_v2.sql) do (
    docker cp infra\%%F dhara_postgres:/tmp/%%F
    if !ERRORLEVEL! neq 0 (
        echo ERROR: Could not copy file. Run: docker compose up -d first.
        pause
        exit /b 1
    )
    docker exec dhara_postgres psql -U dhara -d dhara -f /tmp/%%F
)
echo.
echo Migrations complete. Check above for errors.
pause
