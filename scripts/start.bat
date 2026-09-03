@echo off
title Dhara News — Starting Platform
color 0A
cd /d "%~dp0.."

echo.
echo  ================================================================
echo    Dhara News — Starting...
echo  ================================================================
echo.

:: Check Docker
docker info >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Docker Desktop is not running.
    echo.
    echo  1. Open Docker Desktop from the Start Menu
    echo  2. Wait for the whale icon in the taskbar to stop animating
    echo  3. Double-click this file again
    echo.
    pause
    exit /b 1
)
echo  [OK] Docker is running

:: Create .env if missing
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [OK] Created .env
    )
)

:: Start all containers
echo  Starting all containers...
echo.
docker compose up -d

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Could not start containers.
    echo  Run this to see why: docker compose logs
    pause
    exit /b 1
)

echo.
echo  ================================================================
echo    Dhara News started!
echo  ================================================================
echo.
echo    App:       http://localhost:3000
echo    API:       http://localhost:8000/docs
echo    Grafana:   http://localhost:3003  (admin/admin)
echo    RabbitMQ:  http://localhost:15672 (dhara/dhara_local)
echo.
echo  Wait 2-3 minutes for all services to fully initialize.
echo  First articles appear within 15 minutes.
echo.
echo  Press any key to open the app in your browser...
pause >nul
start http://localhost:3000
