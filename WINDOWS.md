# Running Dhara News on Windows

## Quick Start (recommended)

1. Install **Docker Desktop for Windows** → https://docker.com/products/docker-desktop
2. Open Docker Desktop. Wait for the whale icon in the taskbar to stop animating.
3. Open **PowerShell** or **Command Prompt** and navigate to the `dhara-full` folder:
   ```
   cd "C:\Users\YourName\Downloads\dhara-complete-final\dhara-full"
   ```
4. Run setup:
   ```
   py scripts/setup.py
   ```

That's it. The script handles everything else automatically.

---

## Alternative: Double-click to start

After the first setup, you can just double-click **`scripts/start.bat`** to start the platform anytime.

- **`scripts/start.bat`** → starts everything, opens browser
- **`scripts/stop.bat`** → stops all containers
- **`scripts/logs.bat`** → view live pipeline logs

---

## Common Windows Issues

### "py not found" or "python not found"
Install Python from https://python.org/downloads
During install, **check "Add Python to PATH"**.
Then try `py scripts/setup.py` or `python scripts/setup.py`.

### "Docker is not running"
Open Docker Desktop from the Start Menu.
Wait ~60 seconds for it to fully start (the whale icon in the taskbar stops moving).
Then run setup again.

### "Port 3000 is already in use"
Something else is using that port. Either:
- Close the other app, OR
- Change the port in `docker-compose.yml`: replace `"3000:3000"` with `"3001:3000"`
- Then access the app at `http://localhost:3001`

### "Access denied" or permission errors
Right-click PowerShell → "Run as Administrator".
Or give Docker Desktop access to your Downloads folder:
Docker Desktop → Settings → Resources → File Sharing → Add your Downloads folder.

### Long path errors (Windows)
Windows has a 260-character path limit by default. If you see path errors:
1. Extract the zip to `C:\dhara\` instead of deep inside Downloads
2. Run: `cd C:\dhara\dhara-full` then `py scripts/setup.py`

Or enable long paths in Windows:
- Open PowerShell as Administrator
- Run: `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`

### Windows Firewall popup
Click "Allow" when Windows asks about Docker network access.

### ANSI colour codes showing as garbage characters
This is a display issue in old CMD. Use **Windows Terminal** or **PowerShell** instead.
Download Windows Terminal free from the Microsoft Store.

---

## WSL2 Alternative (best performance on Windows)

For the best performance, run Dhara inside WSL2 (Windows Subsystem for Linux):

```powershell
# In PowerShell as Administrator:
wsl --install          # installs Ubuntu
wsl --set-default-version 2

# Then in the WSL Ubuntu terminal:
cd /mnt/c/Users/YourName/Downloads/dhara-complete-final/dhara-full
python3 scripts/setup.py
```

With WSL2, the platform runs at near-native Linux speed and all `make` commands work.

---

## After Setup

Once running, open your browser:

| URL | What it is |
|-----|-----------|
| http://localhost:3000 | 🌐 The Dhara News app |
| http://localhost:8000/docs | 🔌 API documentation |
| http://localhost:3003 | 📊 Grafana (admin/admin) |
| http://localhost:15672 | 🐰 RabbitMQ (dhara/dhara_local) |
| http://localhost:9200 | 🔍 Elasticsearch |
| http://localhost:9001 | 📦 MinIO storage |

First articles appear within **15 minutes** (first RSS crawl cycle).

To stop everything: `docker compose down`
To start again later: `docker compose up -d` (much faster after first setup)
