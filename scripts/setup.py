#!/usr/bin/env python3
"""
Dhara News — Setup Script
Works on Windows, macOS, and Linux.
Run: python scripts/setup.py   (from the dhara-full folder)
"""
import subprocess, sys, os, time, shutil, platform

IS_WINDOWS = platform.system() == "Windows"

# ── Cross-platform helpers ────────────────────────────────────────────────────

def run_silent(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def run_live(cmd):
    """Run command with visible output."""
    return subprocess.run(cmd, shell=True)

def copy_file(src, dst):
    """Cross-platform file copy."""
    shutil.copy2(src, dst)

def path(*parts):
    """Build OS-appropriate path."""
    return os.path.join(*parts)

# Windows doesn't support ANSI colours by default in old terminals.
# Enable them if possible, otherwise strip them.
try:
    if IS_WINDOWS:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    USE_COLOR = True
except Exception:
    USE_COLOR = False

def c(code, text):
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text

def ok(msg):   print(f"  {c(92,'✓')} {msg}")
def err(msg):  print(f"  {c(91,'✗')} {msg}")
def info(msg): print(f"  {c(94,'→')} {msg}")
def warn(msg): print(f"  {c(93,'⚠')} {msg}")
def head(msg): print(f"\n{c(1, msg)}")
def sep():     print("  " + "─" * 54)

# ── Ensure we're in the right directory ──────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)     # parent of scripts/

# Change to project root regardless of where user ran script from
os.chdir(PROJECT_DIR)

head("Dhara News Platform — Setup")
print(f"  Platform:  {platform.system()} {platform.release()}")
print(f"  Directory: {PROJECT_DIR}")

# ── 1. Check dependencies ─────────────────────────────────────────────────────
head("1. Checking dependencies")

for cmd, label, fix in [
    ("docker --version",       "Docker",        "https://docker.com/products/docker-desktop"),
    ("docker compose version", "Docker Compose","Update Docker Desktop to latest"),
    ("docker info",            "Docker daemon", "Open Docker Desktop and wait for it to start"),
]:
    r = run_silent(cmd)
    if r.returncode != 0:
        err(f"{label} not available")
        print(f"     Fix: {fix}")
        if label == "Docker daemon":
            print()
            print("  On Windows: Open Docker Desktop from the Start Menu.")
            print("  Wait for the whale icon in the taskbar to stop animating.")
        sys.exit(1)
    ok(label)

# ── 2. Create .env ───────────────────────────────────────────────────────────
head("2. Environment file")

env_file     = path(PROJECT_DIR, ".env")
env_example  = path(PROJECT_DIR, ".env.example")

if not os.path.exists(env_file):
    if not os.path.exists(env_example):
        err(".env.example not found — is the project folder complete?")
        info(f"Looking in: {PROJECT_DIR}")
        info("Expected: .env.example, docker-compose.yml, agents/, api/, frontend/")
        info("Download the latest zip from Claude and extract it fresh.")
        sys.exit(1)
    copy_file(env_example, env_file)
    ok("Created .env from .env.example")
    info("Optional: add GROQ_API_KEY to .env for better summaries (free at groq.com)")
else:
    ok(".env already exists")

# ── 3. Validate docker-compose.yml ───────────────────────────────────────────
head("3. Validating docker-compose.yml")

r = run_silent("docker compose config --quiet 2>&1")
if r.returncode != 0:
    err("docker-compose.yml has a problem:")
    print()
    # Show last 600 chars of error
    output = (r.stdout or r.stderr or "")[-600:]
    for line in output.splitlines():
        print(f"     {line}")
    sys.exit(1)
ok("docker-compose.yml is valid")

# ── 4. Start infrastructure ──────────────────────────────────────────────────
head("4. Starting infrastructure")
info("Starting: postgres, redis, rabbitmq, qdrant, minio, prometheus, grafana")
r = run_live(
    "docker compose up -d "
    "postgres redis rabbitmq qdrant minio prometheus grafana"
)
if r.returncode != 0:
    err("Could not start infrastructure.")
    info("Make sure Docker Desktop is fully started (whale icon stable in taskbar).")
    sys.exit(1)
ok("Infrastructure containers starting...")

# ── 5. Wait for PostgreSQL ────────────────────────────────────────────────────
head("5. Waiting for PostgreSQL")
for i in range(40):
    r = run_silent("docker compose exec -T postgres pg_isready -U dhara -d dhara")
    if r.returncode == 0:
        ok("PostgreSQL ready")
        break
    print(f"  waiting... {(i+1)*2}s", end="\r", flush=True)
    time.sleep(2)
else:
    err("PostgreSQL did not start in time.")
    info("Check logs:  docker compose logs postgres")
    sys.exit(1)

# ── 6. Apply schema ──────────────────────────────────────────────────────────
head("6. Applying database schema")

# Get postgres container ID
r = run_silent("docker compose ps -q postgres")
pg_id = r.stdout.strip()

schema_files = [
    path(PROJECT_DIR, "infra", "schema.sql"),
    path(PROJECT_DIR, "infra", "schema_additions.sql"),
    path(PROJECT_DIR, "infra", "schema_bayesian.sql"),
    path(PROJECT_DIR, "infra", "migration_v2.sql"),
]

if pg_id and os.path.exists(schema_files[0]):
    applied_all = True
    for schema_src in schema_files:
        target_name = os.path.basename(schema_src)
        run_silent(f'docker cp "{schema_src}" {pg_id}:/tmp/{target_name}')
        r = run_silent(
            f"docker compose exec -T postgres psql -U dhara -d dhara -f /tmp/{target_name}"
        )
        if r.returncode != 0:
            applied_all = False
            break

    if applied_all:
        ok("Schema applied")
    else:
        # Check if tables already exist
        r2 = run_silent(
            "docker compose exec -T postgres psql -U dhara -d dhara -tAc "
            "\"SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name='story_clusters'\""
        )
        if r2.stdout.strip() == "1":
            ok("Schema already exists — skipping")
        else:
            warn("Schema had issues — you can apply it manually later")
            info("docker compose exec postgres psql -U dhara -d dhara -f /tmp/schema.sql")
else:
    warn("Skipping schema (postgres not ready yet) — run  make db-setup  after start")

# ── 7. Start Elasticsearch ───────────────────────────────────────────────────
head("7. Starting Elasticsearch")
run_live("docker compose up -d elasticsearch")
info("Initialising in background (takes ~30s) — won't block setup")

# ── 8. Ollama LLM ────────────────────────────────────────────────────────────
head("8. Starting Ollama (local LLM)")
run_live("docker compose up -d ollama")
time.sleep(5)

print()
info("Downloading llama3.1:8b (~4.7 GB). One-time download, takes 5-20 min.")
info("Press Ctrl+C to skip — you can run this later:  make pull-model")
info("Low-RAM option: docker compose exec ollama ollama pull llama3.2:3b")
print()

try:
    run_live("docker compose exec ollama ollama pull llama3.1:8b")
    ok("LLM model ready")
except KeyboardInterrupt:
    print()
    warn("Skipped. Run later:  docker compose exec ollama ollama pull llama3.1:8b")

# ── 9. Build agent images ────────────────────────────────────────────────────
head("9. Building agent images  (3-5 min first time)")
r = run_live("docker compose build")
if r.returncode != 0:
    warn("Build had warnings — trying to start anyway")

# ── 10. Start everything ─────────────────────────────────────────────────────
head("10. Starting all services")
run_live("docker compose up -d")
time.sleep(4)

# ── Done ─────────────────────────────────────────────────────────────────────
print()
sep()
print(c(1, "  ✅  Dhara News is running!"))
sep()
print("""
  Open these in your browser:

  🌐 App         →  http://localhost:3000
  🔌 API docs    →  http://localhost:8000/docs
  📊 Grafana     →  http://localhost:3003   (login: admin / admin)
  🐰 RabbitMQ    →  http://localhost:15672  (login: dhara / dhara_local)
  🔍 Elastic     →  http://localhost:9200
  📦 MinIO       →  http://localhost:9001   (login: dhara_minio / dhara_minio_secret)

  First articles appear within 15 minutes (first RSS crawl cycle).

  Useful commands (from this folder):
    docker compose logs -f          ← watch the live pipeline
    docker compose ps               ← see all container statuses
    docker compose down             ← stop everything
    python scripts/health.py        ← detailed health check

  On Windows you can also double-click  scripts/start.bat  to start.
""")
