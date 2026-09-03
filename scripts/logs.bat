@echo off
:: Dhara News — View logs on Windows
cd /d "%~dp0.."
docker compose logs -f --tail=50
