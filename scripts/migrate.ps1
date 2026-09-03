Write-Host "Dhara News - Running database migrations" -ForegroundColor Cyan
Write-Host ""

foreach ($file in @("schema_additions.sql", "schema_bayesian.sql", "migration_v2.sql")) {
    docker cp "infra\$file" "dhara_postgres:/tmp/$file"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Is docker compose up -d running?" -ForegroundColor Red
        exit 1
    }
    docker exec dhara_postgres psql -U dhara -d dhara -f "/tmp/$file"
}
Write-Host ""
Write-Host "Migrations complete!" -ForegroundColor Green
