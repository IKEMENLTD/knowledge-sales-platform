"""
Knowledge Sales Platform - Migration Applier
============================================
.env.local の DATABASE_URL に対して manual/ 配下の SQL を順次適用する。

Round1 改修 (M3-1):
  - --dry-run / --only / --yes フラグ
  - public.schema_migrations テーブルで適用済み追跡
  - sha256 checksum で差分 warning
  - 本番 (DATABASE_URL に supabase.co を含む or RENDER_ENV=production) は
    --yes が無ければ確認プロンプト

usage:
    python scripts/apply_migrations.py
    python scripts/apply_migrations.py --dry-run
    python scripts/apply_migrations.py --only 0007_p1_extended_tables.sql
    python scripts/apply_migrations.py --yes
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parent.parent
MIG_DIR = REPO_ROOT / "packages" / "db" / "src" / "migrations" / "manual"

LEDGER_DDL = """
create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now(),
  checksum text not null
);
"""


def load_env_local() -> dict[str, str]:
    env_path = REPO_ROOT / ".env.local"
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def looks_like_production(db_url: str) -> bool:
    return (
        "supabase.co" in db_url
        or os.environ.get("RENDER_ENV") == "production"
        or os.environ.get("NODE_ENV") == "production"
    )


def confirm(prompt: str) -> bool:
    try:
        ans = input(f"{prompt} [y/N]: ").strip().lower()
    except EOFError:
        return False
    return ans in ("y", "yes")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Apply Knowledge Sales Platform DB migrations")
    p.add_argument("--dry-run", action="store_true", help="parse + checksum check, no DB writes")
    p.add_argument("--only", help="apply only this single file (e.g. 0007_p1_extended_tables.sql)")
    p.add_argument("--yes", action="store_true", help="skip production confirmation prompt")
    p.add_argument(
        "--verbose",
        action="store_true",
        help="echo each SQL file path before execution",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    env = load_env_local()
    db_url = env.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url and not args.dry_run:
        print("DATABASE_URL is not set in .env.local or env", file=sys.stderr)
        return 2

    files = sorted(MIG_DIR.glob("*.sql"))
    if not files:
        print(f"no SQL files under {MIG_DIR}", file=sys.stderr)
        return 2

    if args.only:
        files = [f for f in files if f.name == args.only]
        if not files:
            print(f"--only: {args.only} not found in {MIG_DIR}", file=sys.stderr)
            return 2

    # Pre-compute checksums
    file_checksums: dict[str, str] = {f.name: sha256_of(f) for f in files}

    if args.dry_run:
        print("[dry-run] migrations to apply (no DB writes):")
        for f in files:
            print(f"  - {f.name}  sha256={file_checksums[f.name][:16]}...")
        # Optionally check syntax via a transient connection if DATABASE_URL is set
        if db_url:
            print(f"[dry-run] target: {db_url.split('@')[-1]}")
        return 0

    assert db_url is not None  # for type checker

    # Production safety check
    if looks_like_production(db_url) and not args.yes:
        print(f"!! Target appears to be PRODUCTION ({db_url.split('@')[-1]})")
        if not confirm("Continue?"):
            print("aborted")
            return 1

    print(f"Applying up to {len(files)} migrations to {db_url.split('@')[-1]}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(LEDGER_DDL)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute("select filename, checksum from public.schema_migrations")
            applied = {r[0]: r[1] for r in cur.fetchall()}

        applied_count = 0
        skipped_count = 0
        for path in files:
            name = path.name
            checksum = file_checksums[name]

            # Skip already-applied with matching checksum
            if name in applied:
                if applied[name] != checksum:
                    print(
                        f"  -> {name} WARNING: checksum drift "
                        f"(db={applied[name][:12]}, file={checksum[:12]})",
                        file=sys.stderr,
                    )
                else:
                    if args.verbose:
                        print(f"  -> {name} (already applied, skip)")
                skipped_count += 1
                continue

            sql = path.read_text(encoding="utf-8")
            if args.verbose:
                print(f"  -> {name} ({len(sql):,} bytes)")
            else:
                print(f"  -> {name}")

            with conn.cursor() as cur:
                try:
                    cur.execute(sql)
                except Exception as e:  # noqa: BLE001
                    conn.rollback()
                    print(f"FAILED on {name}: {e}", file=sys.stderr)
                    return 1
                cur.execute(
                    "insert into public.schema_migrations (filename, checksum) values (%s, %s) "
                    "on conflict (filename) do update set "
                    "applied_at = now(), checksum = excluded.checksum",
                    (name, checksum),
                )
            conn.commit()
            applied_count += 1
            print("     ok")

        print(
            f"\nDone. applied={applied_count}, skipped={skipped_count}, total={len(files)}"
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
