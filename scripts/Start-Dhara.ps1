# scripts/Start-Dhara.ps1
# PowerShell script to start Dhara News
# Right-click → Run with PowerShell

$host.UI.RawUI.WindowTitle = "Dhara News — Startup"
$ErrorActionPreference = "Stop"

# Go to project root (parent of scripts/)
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Dhara News Platform — Starting" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Directory: $ProjectDir" -ForegroundColor Gray

# 1. Check Docker
Write-Host ""
Write-Host "  Checking Docker..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    Write-Host "  OK: Docker is running" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker Desktop is not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Fix: Open Docker Desktop from the Start Menu." -ForegroundColor Yellow
    Write-Host "       Wait for the whale icon in the taskbar to stop moving." -ForegroundColor Yellow
    Write-Host "       Then run this script again." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Create .env if missing
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  OK: Created .env from .env.example" -ForegroundColor Green
    }
}

# 3. Start containers
Write-Host ""
Write-Host "  Starting all containers..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: Could not start containers." -ForegroundColor Red
    Write-Host "  Run: docker compose logs" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# 4. Wait and check
Write-Host ""
Write-Host "  Waiting for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Show status
Write-Host ""
Write-Host "  Container status:" -ForegroundColor Yellow
docker compose ps --format "table {{.Name}}`t{{.Status}}"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Dhara News is starting up!" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  App:        http://localhost:3000" -ForegroundColor Cyan
Write-Host "  API docs:   http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Grafana:    http://localhost:3003   (admin / admin)" -ForegroundColor Cyan
Write-Host "  RabbitMQ:   http://localhost:15672  (dhara / dhara_local)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Wait 2-3 min for full startup. First articles in 15 min." -ForegroundColor Gray
Write-Host ""

$open = Read-Host "Open browser now? [Y/n]"
if ($open -ne "n" -and $open -ne "N") {
    Start-Process "http://localhost:3000"
}
