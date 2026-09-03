#!/usr/bin/env python3
"""
Dhara startup self-check.
Purpose: detect stale critical incident claims (for example require_admin import crash)
by validating current source, optional running container, and optional report file text.

Usage:
  py scripts/startup_self_check.py
  py scripts/startup_self_check.py --report "C:\\path\\CONTAINER_ISSUES_CRITICAL_FINDINGS.md"
"""

from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class CheckResult:
    source_has_require_admin: bool
    source_has_depends_require_admin: bool
    source_order_ok: bool
    container_has_require_admin: bool | None
    container_has_depends_require_admin: bool | None
    report_mentions_require_admin_critical: bool | None


def _run(cmd: str) -> tuple[int, str]:
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


def _read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def check_source(api_main: pathlib.Path) -> tuple[bool, bool, bool]:
    text = _read(api_main)
    has_def = bool(re.search(r"^def\s+require_admin\s*\(", text, re.MULTILINE))
    has_dep = "Depends(require_admin)" in text

    def_idx = text.find("def require_admin(")
    dep_idx = text.find("Depends(require_admin)")
    order_ok = has_def and has_dep and (def_idx != -1 and dep_idx != -1 and def_idx < dep_idx)
    return has_def, has_dep, order_ok


def check_container() -> tuple[bool | None, bool | None]:
    rc, out = _run("docker ps --format \"{{.Names}}\"")
    if rc != 0:
        return None, None
    names = {line.strip() for line in out.splitlines() if line.strip()}
    if "dhara_api" not in names:
        return None, None

    rc1, out1 = _run("docker exec dhara_api sh -lc \"grep -n 'def require_admin' /app/main.py\"")
    rc2, out2 = _run("docker exec dhara_api sh -lc \"grep -n 'Depends(require_admin)' /app/main.py\"")
    return (rc1 == 0 and bool(out1.strip())), (rc2 == 0 and bool(out2.strip()))


def check_report(report_path: pathlib.Path | None) -> bool | None:
    if not report_path:
        return None
    if not report_path.exists():
        return None

    text = _read(report_path)
    unresolved_patterns = [
        r"\|\s*\*\*require_admin\s+undefined\*\*\s*\|\s*🔴\s*CRITICAL",
        r"Status:\s*🔴\s*CRITICAL\s*\|\s*\*\*Component:\s*dhara_api",
        r"CRITICAL\s+ISSUE\s*-\s*API\s+STARTUP\s+FAILURE",
        r"API\s+WILL\s+FAIL\s+ON\s+RESTART",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in unresolved_patterns)


def summarize(result: CheckResult) -> int:
    print("Dhara Startup Self-Check")
    print("========================")
    print(f"Source: require_admin defined .......... {'YES' if result.source_has_require_admin else 'NO'}")
    print(f"Source: Depends(require_admin) present . {'YES' if result.source_has_depends_require_admin else 'NO'}")
    print(f"Source: definition before usage ........ {'YES' if result.source_order_ok else 'NO'}")

    if result.container_has_require_admin is None:
        print("Container: dhara_api not checked ....... SKIPPED (docker unavailable or container not running)")
    else:
        print(f"Container: require_admin defined ....... {'YES' if result.container_has_require_admin else 'NO'}")
        print(f"Container: Depends(...) present ........ {'YES' if result.container_has_depends_require_admin else 'NO'}")

    if result.report_mentions_require_admin_critical is None:
        print("Report: stale-critical text check ...... SKIPPED")
    else:
        print(
            "Report: has require_admin critical text . "
            + ("YES" if result.report_mentions_require_admin_critical else "NO")
        )

    source_ok = (
        result.source_has_require_admin
        and result.source_has_depends_require_admin
        and result.source_order_ok
    )
    container_ok = (
        result.container_has_require_admin is None
        or (
            result.container_has_require_admin
            and bool(result.container_has_depends_require_admin)
        )
    )

    print()
    if source_ok and container_ok:
        if result.report_mentions_require_admin_critical:
            print("STALE-ALERT: report still claims a critical require_admin startup issue, but checks pass.")
            print("Action: update the report to RESOLVED/STale or rerun diagnostics before escalating.")
            return 2
        print("PASS: no require_admin startup blocker detected.")
        return 0

    print("FAIL: potential startup blocker detected. Investigate before deployment/restart.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Dhara startup self-check")
    parser.add_argument("--report", type=str, default="", help="Path to incident report markdown file")
    args = parser.parse_args()

    project_root = pathlib.Path(__file__).resolve().parents[1]
    api_main = project_root / "api" / "main.py"
    if not api_main.exists():
        print(f"ERROR: cannot find {api_main}")
        return 1

    source_def, source_dep, source_order_ok = check_source(api_main)
    c_def, c_dep = check_container()

    report_path = pathlib.Path(args.report).resolve() if args.report else None
    report_has_critical = check_report(report_path)

    result = CheckResult(
        source_has_require_admin=source_def,
        source_has_depends_require_admin=source_dep,
        source_order_ok=source_order_ok,
        container_has_require_admin=c_def,
        container_has_depends_require_admin=c_dep,
        report_mentions_require_admin_critical=report_has_critical,
    )
    return summarize(result)


if __name__ == "__main__":
    sys.exit(main())
