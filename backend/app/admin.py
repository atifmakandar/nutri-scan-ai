"""Explicit local-only administrative migrations.

Usage (run from backend, only after reviewing the target):
    python -m app.admin assign-legacy --username owner --farm-id demo-farm
"""

import argparse

from .storage import SQLiteRepository


def main() -> None:
    parser = argparse.ArgumentParser(description="Nutri-Scan local administration")
    subparsers = parser.add_subparsers(dest="command", required=True)
    assign = subparsers.add_parser("assign-legacy", help="assign an unowned legacy farm to an existing owner")
    assign.add_argument("--username", required=True)
    assign.add_argument("--farm-id", required=True)
    args = parser.parse_args()
    if args.command == "assign-legacy":
        moved = SQLiteRepository().assign_legacy(args.username.strip().lower(), args.farm_id)
        print(f"assigned {moved} legacy scans")


if __name__ == "__main__":
    main()
