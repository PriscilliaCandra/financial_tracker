import sqlite3
import os

# DB file lives next to app.py inside backend/
DB_PATH = os.path.join(os.path.dirname(__file__), "financial_tracker.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            password   TEXT    NOT NULL,
            created_at TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date        TEXT    NOT NULL,
            type        TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
            category    TEXT    NOT NULL,
            amount      REAL    NOT NULL CHECK(amount > 0),
            note        TEXT    DEFAULT '',
            created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Safe migration for existing DBs that have no user_id column
    try:
        conn.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0")
        print("Migrated: added user_id column.")
    except Exception:
        pass

    conn.commit()
    conn.close()
    print("Database initialised.")
