# изменено 2026-10-17 01:30
"""Сборка базы склада из файлов схемы: schema/*.sql по порядку номеров + seed.sql."""
from __future__ import annotations

import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent


def schema_sql() -> str:
    """Все файлы схемы одним текстом, в порядке 01_…, 02_… ."""
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted((HERE / "schema").glob("*.sql")))


def build(conn: sqlite3.Connection, with_seed: bool = True) -> sqlite3.Connection:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_sql())
    if with_seed:
        conn.executescript((HERE / "seed.sql").read_text(encoding="utf-8"))
    return conn
