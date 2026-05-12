#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(json.dumps({"error": msg}), end="")
    raise SystemExit(1)


if len(sys.argv) != 4:
    fail("usage: sqlite-query.py <db-path> <sql> <params-json>")

DB_PATH = Path(sys.argv[1])
SQL = sys.argv[2]

try:
    params = json.loads(sys.argv[3])
    if not isinstance(params, list):
        fail("params must be JSON array")
except Exception:
    fail("invalid params json")

if not DB_PATH.exists():
    print(json.dumps([]), end="")
    raise SystemExit(0)

try:
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    try:
        cur = con.execute(SQL, params)
        rows = [dict(row) for row in cur.fetchall()]
        out = []
        for row in rows:
            fixed: dict[str, object | str | int | float | None] = {}
            for key, value in row.items():
                if isinstance(value, (bytes, bytearray)):
                    fixed[key] = value.decode('utf-8', errors='ignore')
                else:
                    fixed[key] = value
            out.append(fixed)
        print(json.dumps(out))
    finally:
        con.close()
except Exception as exc:
    fail(str(exc))
