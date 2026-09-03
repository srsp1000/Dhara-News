#!/usr/bin/env python3
"""
Dhara — Duplicate Directory Cleanup
====================================
Removes two confirmed duplicate directory trees that cause import confusion:

  1. agents/dedup/
     ─ Stale copy of the deduplication cluster code.
     ─ Docker-compose runs  `python -m deduplication.*`  (agents/deduplication/)
       so agents/dedup/ is never used at runtime.
     ─ Having both means  `from dedup import ...`  and
       `from deduplication import ...`  resolve to DIFFERENT code versions,
       which can silently cause bugs if someone edits the wrong file.

  2. agents/civic/civic/
     ─ Byte-for-byte duplicate of agents/civic/ (confirmed by md5 check).
     ─ Python's import system, when searching for `from civic import ...`,
       may resolve to  agents/civic/civic/  instead of  agents/civic/
       depending on sys.path order, leading to hard-to-debug import errors.

Usage
-----
    python scripts/cleanup_duplicates.py            # dry-run (shows what would happen)
    python scripts/cleanup_duplicates.py --apply    # actually delete

The script backs up each directory to <dir>.bak before deletion so you can
recover if anything goes wrong.
"""
import argparse
import hashlib
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent   # scripts/ → project root
AGENTS    = REPO_ROOT / "agents"

DUPLICATES = [
    {
        "remove":   AGENTS / "dedup",
        "keep":     AGENTS / "deduplication",
        "reason":   (
            "docker-compose uses 'python -m deduplication.*'; "
            "agents/dedup/ is never executed at runtime."
        ),
    },
    {
        "remove":   AGENTS / "civic" / "civic",
        "keep":     AGENTS / "civic",
        "reason":   (
            "agents/civic/civic/ is a byte-for-byte duplicate of agents/civic/ "
            "(all files md5-verified identical)."
        ),
    },
]


def _dir_md5(path: Path) -> dict[str, str]:
    """Return {relative_path: md5hex} for every file under path."""
    result: dict[str, str] = {}
    for f in sorted(path.rglob("*")):
        if f.is_file() and "__pycache__" not in f.parts:
            rel = str(f.relative_to(path))
            result[rel] = hashlib.md5(f.read_bytes()).hexdigest()
    return result


def _verify_duplicate(entry: dict) -> list[str]:
    """
    Returns a list of warning strings if the two directories differ.
    Empty list means they are identical (safe to remove 'remove').
    """
    remove_dir: Path = entry["remove"]
    keep_dir:   Path = entry["keep"]
    warnings: list[str] = []

    if not remove_dir.exists():
        warnings.append(f"  [SKIP] {remove_dir} does not exist — nothing to do.")
        return warnings

    if not keep_dir.exists():
        warnings.append(f"  [ERROR] Canonical dir {keep_dir} is missing! Aborting for safety.")
        return warnings

    remove_hashes = _dir_md5(remove_dir)
    keep_hashes   = _dir_md5(keep_dir)

    # Files in remove but not in keep
    only_in_remove = set(remove_hashes) - set(keep_hashes)
    # Files present in both but with different content
    changed = {k for k in remove_hashes if k in keep_hashes and remove_hashes[k] != keep_hashes[k]}

    if only_in_remove:
        warnings.append(
            f"  [WARNING] {len(only_in_remove)} file(s) exist ONLY in {remove_dir} "
            f"(not in {keep_dir}):\n"
            + "\n".join(f"    • {f}" for f in sorted(only_in_remove))
        )
    if changed:
        warnings.append(
            f"  [WARNING] {len(changed)} file(s) DIFFER between the two directories:\n"
            + "\n".join(f"    • {f}" for f in sorted(changed))
        )

    return warnings


def main():
    parser = argparse.ArgumentParser(description="Remove duplicate agent directories.")
    parser.add_argument("--apply", action="store_true",
                        help="Actually delete directories (default: dry-run only).")
    args = parser.parse_args()

    dry_run = not args.apply
    if dry_run:
        print("═" * 60)
        print("  DRY RUN — pass --apply to make changes")
        print("═" * 60)

    any_problem = False

    for entry in DUPLICATES:
        remove_dir: Path = entry["remove"]
        keep_dir:   Path = entry["keep"]
        reason:     str  = entry["reason"]

        print(f"\n{'─'*60}")
        print(f"  Remove : {remove_dir.relative_to(REPO_ROOT)}")
        print(f"  Keep   : {keep_dir.relative_to(REPO_ROOT)}")
        print(f"  Reason : {reason}")

        warnings = _verify_duplicate(entry)

        if not remove_dir.exists():
            print("  ✓ Already clean — directory does not exist.")
            continue

        if warnings:
            for w in warnings:
                print(w)
            if any("[ERROR]" in w for w in warnings):
                print("  ✗ Skipping due to ERROR above.")
                any_problem = True
                continue
            if any("[WARNING]" in w for w in warnings):
                print("  ⚠  Directories are NOT identical. Manual review recommended.")
                print("     Skipping deletion for safety — inspect the files above first.")
                any_problem = True
                continue
        else:
            print("  ✓ Verified: directories are byte-for-byte identical.")

        if dry_run:
            print(f"  [DRY-RUN] Would delete: {remove_dir}")
        else:
            backup = remove_dir.with_suffix(".bak")
            if backup.exists():
                shutil.rmtree(backup)
            shutil.copytree(remove_dir, backup)
            shutil.rmtree(remove_dir)
            print(f"  ✓ Deleted {remove_dir.relative_to(REPO_ROOT)}")
            print(f"    (backup at {backup.relative_to(REPO_ROOT)} — delete when satisfied)")

    print(f"\n{'═'*60}")
    if dry_run:
        print("  Dry-run complete.  Run with --apply to delete.")
    elif any_problem:
        print("  Finished with warnings/errors — review output above.")
        sys.exit(1)
    else:
        print("  ✓ All duplicate directories cleaned up successfully.")


if __name__ == "__main__":
    main()
