"""
Datenbankmodul – SQLite für Watchlist-Persistenz und Ergebnis-Caching.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "screener.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Erstellt die benötigten Tabellen beim ersten Start."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS watchlist (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker  TEXT NOT NULL UNIQUE,
            name    TEXT,
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS quote_cache (
            ticker      TEXT PRIMARY KEY,
            data_json   TEXT,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()
