"""
Knowledge Sales Platform - Bootstrap Migration Applier
======================================================
.env.local の DATABASE_URL に対して manual/ 配下の SQL を順次適用する。

usage:
    python scripts/apply_migrations.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parent.parent
MIG_DIR = REPO_ROOT / "packages" / "db" / "src" / "migrations" / "manual"


def load_env_local() -> dict[str, str]:
    env_path = REPO_ROOT / ".env.local"
    out: dict[str, str] = {}
    if not env_path.exists():
        sys.exit(f"missing {env_path}")
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main() -> int:
    env = load_env_local()
    db_url = env.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL is not set in .env.local")

    files = sorted(MIG_DIR.glob("*.sql"))
    if not files:
        sys.exit(f"no SQL files under {MIG_DIR}")

    print(f"Applying {len(files)} migrations to {db_url.split('@')[-1]}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        for path in files:
            sql = path.read_text(encoding="utf-8")
            print(f"  -> {path.name} ({len(sql):,} bytes)")
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            print(f"     ok")
    except Exception as e:
        conn.rollback()
        print(f"FAILED: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    print("\nAll migrations applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
