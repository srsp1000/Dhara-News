@echo off
cd /d "%~dp0.."
echo Stopping Dhara News...
docker compose down
echo Done. All containers stopped.
pause
