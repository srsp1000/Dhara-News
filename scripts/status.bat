@echo off
cd /d "%~dp0.."
echo.
echo Dhara News — Container Status
echo ===============================
docker compose ps
echo.
pause
