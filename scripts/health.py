#!/usr/bin/env python3
"""
Dhara News — Platform Health Check
Works on Windows, macOS, Linux.
Run: py scripts/health.py
"""
import subprocess, json, sys, os, platform, time
from datetime import datetime

IS_WIN = platform.system() == "Windows"

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip()

def run2(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

# ── Colors ────────────────────────────────────────────────────────────────────
try:
    if IS_WIN:
        import ctypes
        ctypes.windll.kernel32.SetConsoleMode(ctypes.windll.kernel32.GetStdHandle(-11), 7)
    USE_COLOR = True
except Exception:
    USE_COLOR = False

def c(code, t): return f"\033[{code}m{t}\033[0m" if USE_COLOR else t
def green(t):   return c(92, t)
def red(t):     return c(91, t)
def yellow(t):  return c(93, t)
def bold(t):    return c(1, t)
def dim(t):     return c(2, t)

# ── Get compose project dir ────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
os.chdir(PROJECT_DIR)

print(f"\n{bold('Dhara News — Platform Health Check')}")
print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Dir:  {PROJECT_DIR}")

# ── Get all running containers via docker compose ps ──────────────────────────
def get_running_containers():
    """Returns set of running container names using docker compose ps."""
    # Try JSON format first (Docker Compose v2.7+)
    r = run2("docker compose ps --format json 2>&1")
    if r.returncode == 0 and r.stdout.strip():
        running = set()
        for line in r.stdout.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                name   = obj.get("Name", "")
                state  = obj.get("State", obj.get("Status", ""))
                if "running" in state.lower():
                    running.add(name)
            except (json.JSONDecodeError, KeyError):
                pass
        if running:
            return running

    # Fallback: parse table output
    r2 = run2("docker compose ps 2>&1")
    running = set()
    if r2.returncode == 0:
        for line in r2.stdout.splitlines()[1:]:  # skip header
            parts = line.split()
            if len(parts) >= 2 and "running" in line.lower():
                running.add(parts[0])  # first column = name
    return running

def is_running(name, running_set):
    """Check if container name is in running set (exact or partial match)."""
    if name in running_set:
        return True
    # Partial match (handles prefix differences)
    name_lower = name.lower()
    for r in running_set:
        if name_lower in r.lower() or r.lower() in name_lower:
            return True
    return False

running = get_running_containers()

if not running:
    print(f"\n{red('⚠  No containers are running!')}")
    print(f"\n   To start Dhara News, run:")
    print(f"   {bold('docker compose up -d')}")
    print(f"\n   Or use the Windows batch file:")
    _start_bat_msg = bold('Double-click scripts\\start.bat')
    print(f"   {_start_bat_msg}")
    
    # Check if docker is even running
    r = run2("docker info 2>&1")
    if r.returncode != 0:
        print(f"\n   {red('Docker Desktop is not running!')} Open it first.")
    else:
        print(f"\n   Docker is running but no containers are up.")
        print(f"   Run: docker compose up -d")
    print()
    sys.exit(1)

# ── Infrastructure Services ───────────────────────────────────────────────────
print(f"\n{bold('Infrastructure Services:')}")

services = [
    ("PostgreSQL",     "dhara_postgres",       5432),
    ("Redis",          "dhara_redis",           6379),
    ("RabbitMQ",       "dhara_rabbitmq",       15672),
    ("Qdrant",         "dhara_qdrant",          6333),
    ("Elasticsearch",  "dhara_elasticsearch",   9200),
    ("Ollama (LLM)",   "dhara_ollama",         11434),
    ("MinIO",          "dhara_minio",           9001),
    ("API",            "dhara_api",             8000),
    ("Frontend",       "dhara_frontend",        3000),
    ("LibreTranslate", "dhara_libretranslate",  5001),
]

infra_up = 0
for name, container, port in services:
    up = is_running(container, running)
    if up:
        status = green(f"✓ running")
        infra_up += 1
    else:
        status = red(f"✗ stopped")
    print(f"  {status:<22} {name:<22} :{port}")

# ── Agent Clusters ─────────────────────────────────────────────────────────────
print(f"\n{bold('Agent Clusters:')}")

clusters = [
    ("Ingestion",       ["dhara_agent_rss","dhara_agent_crawler","dhara_agent_newsapi","dhara_agent_social","dhara_agent_images"]),
    ("Deduplication",   ["dhara_agent_fingerprint","dhara_agent_dedup","dhara_agent_cluster"]),
    ("Verification",    ["dhara-full-agent-claim-extraction-1","dhara_agent_xref","dhara_agent_cred","dhara_agent_truth","dhara_agent_contradiction","dhara_agent_satire","dhara_agent_fake","dhara_agent_img_verify"]),
    ("NLP & Content",   ["dhara_agent_topics","dhara_agent_rewrite","dhara_agent_headline","dhara_agent_translate","dhara_agent_terms","dhara_agent_exam","dhara_agent_timeline"]),
    ("Personalization", ["dhara_agent_profession","dhara_agent_location","dhara_agent_trending","dhara_agent_brief","dhara_agent_notify","dhara_agent_depth"]),
    ("Publishing",      ["dhara_agent_publish","dhara_agent_seo","dhara_agent_share","dhara_agent_indexer"]),
    ("Monitoring",      ["dhara_agent_truth_update","dhara_agent_health","dhara_agent_bias","dhara_agent_ads"]),
]

total_agents = 0
running_agents = 0
for cluster_name, containers in clusters:
    up_list   = [is_running(c, running) for c in containers]
    up        = sum(up_list)
    total     = len(containers)
    total_agents   += total
    running_agents += up
    if up == total:
        s = green(f"✓ {up}/{total} running")
    elif up > 0:
        s = yellow(f"⚠ {up}/{total} running")
    else:
        s = red(f"✗ {up}/{total} running")
    print(f"  {s:<28} {cluster_name}")

# ── Article stats from API ─────────────────────────────────────────────────────
print(f"\n{bold('Platform Stats:')}")
import urllib.request
try:
    with urllib.request.urlopen("http://localhost:8000/api/stats", timeout=3) as resp:
        stats = json.loads(resp.read())
    print(f"  {green(stats.get('verified_stories',0))} verified articles")
    print(f"  {stats.get('stories_today',0)} published today")
    print(f"  {stats.get('active_sources',0)} active news sources")
    pct = stats.get('verification_rate', 0)
    print(f"  {pct}% verification rate")
except Exception:
    print(f"  {dim('API not reachable — is it running?')}")
    print(f"  Try: {bold('http://localhost:8000/api/stats')}")

# ── Queue depths ───────────────────────────────────────────────────────────────
print(f"\n{bold('Queue Depths (via RabbitMQ):')}")
import base64
try:
    req = urllib.request.Request("http://localhost:15672/api/queues/%2F")
    creds = base64.b64encode(b"dhara:dhara_local").decode()
    req.add_header("Authorization", f"Basic {creds}")
    with urllib.request.urlopen(req, timeout=3) as resp:
        queues = json.loads(resp.read())

    # Show only queues with messages or all DLQs
    non_empty = [q for q in queues if q.get("messages", 0) > 0]
    dlq_msgs  = [q for q in queues if "dlq." in q.get("name","") and q.get("messages",0) > 0]

    total_q = len(queues)
    print(f"  {total_q} queues declared, {len(non_empty)} have messages")

    if dlq_msgs:
        print(f"\n  {red('⚠ Dead-letter queues have messages — some articles failed processing:')}")
        for q in dlq_msgs:
            depth = q["messages"]; qname = q["name"]; print(f"  {red(str(depth).rjust(5))}  {qname}")
        print(f"\n  Fix: docker compose logs agent-<name> --tail=20")
    else:
        print(f"  {green('✓ All DLQs empty — no failed messages')}")

    if non_empty:
        print(f"\n  Active queues (messages in flight):")
        for q in sorted(non_empty, key=lambda x: -x.get("messages",0))[:10]:
            depth = q["messages"]
            bar = "█" * min(depth // 5 + 1, 20)
            color_fn = red if depth > 200 else yellow if depth > 50 else green
            print(f"  {color_fn(f'{depth:>5}')}  {dim(bar):<22}  {q['name']}")
except Exception:
    print(f"  {dim('RabbitMQ not reachable on localhost:15672')}")

# ── Summary ────────────────────────────────────────────────────────────────────
print()
if infra_up >= 8 and running_agents >= 20:
    print(bold(green("✅ Platform is healthy!")))
    print(f"   {infra_up}/{len(services)} services running, {running_agents}/{total_agents} agents running")
    print(f"\n   Open: http://localhost:3000")
elif infra_up > 0:
    print(yellow(f"⚠  Partial — {infra_up}/{len(services)} services, {running_agents}/{total_agents} agents"))
    print(f"\n   To start missing services: docker compose up -d")
else:
    print(red("✗  Platform is DOWN"))
    print(f"\n   Start with: docker compose up -d")

print()
