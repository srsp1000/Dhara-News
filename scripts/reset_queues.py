#!/usr/bin/env python3
"""
Dhara News — RabbitMQ Queue Reset (fixed for Windows + auth)
Run: py scripts\reset_queues.py
"""
import sys, json, urllib.request, urllib.parse, urllib.error, base64

HOST = "localhost"
PORT = 15672
USER = "dhara"
PASS = "dhara_local"

def call(method, path, expect_error_ok=False):
    url   = f"http://{HOST}:{PORT}/api{path}"
    creds = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
    req   = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Basic {creds}")
    req.add_header("Content-Type",  "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            body = r.read()
            return True, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        if expect_error_ok:
            return True, {}
        return False, f"HTTP {e.code}: {body[:200]}"
    except Exception as e:
        return False, str(e)

print("\nDhara News — RabbitMQ Queue Reset")
print("=" * 44)

# Test connection
ok, result = call("GET", "/overview")
if not ok:
    print(f"\n✗  Cannot connect to RabbitMQ at {HOST}:{PORT}")
    print(f"   Error: {result}")
    print(f"\n   Is it running?  docker compose up -d rabbitmq")
    sys.exit(1)

# List queues
ok, queues = call("GET", "/queues/%2F")
if not ok or not isinstance(queues, list):
    print(f"\n✗  Could not list queues: {queues}")
    sys.exit(1)

if not queues:
    print("\n✓  No queues — already clean")
    sys.exit(0)

print(f"\nFound {len(queues)} queues:\n")
for q in sorted(queues, key=lambda x: x.get("name","")):
    msgs = q.get("messages", 0)
    tag  = "  ⚠ has messages" if msgs > 0 else ""
    print(f"  {q['name']:<50} {msgs} msgs{tag}")

print()
ans = input("Delete ALL queues? Agents will recreate them cleanly. [y/N]: ").strip().lower()
if ans != "y":
    print("Cancelled.")
    sys.exit(0)

deleted = 0
failed  = 0
for q in queues:
    name     = q["name"]
    encoded  = urllib.parse.quote(name, safe="")
    ok, err  = call("DELETE", f"/queues/%2F/{encoded}", expect_error_ok=True)
    if ok:
        print(f"  ✓ {name}")
        deleted += 1
    else:
        print(f"  ✗ {name}: {err}")
        failed += 1

print(f"\n{'='*44}")
print(f"Deleted {deleted}, failed {failed}")

if failed > 0:
    print("\n  Some queues couldn't be deleted via API.")
    print("  Delete them manually:")
    print(f"  → Open http://localhost:15672")
    print(f"  → Login: {USER} / {PASS}")
    print(f"  → Queues tab → click each queue → Delete")
else:
    print("\n✓  All queues deleted. Now restart agents:")
    print("   docker compose restart")
