import sqlite3

DB_PATH = "financial_tracker.db"


def get_db():
    """Open a database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Rows behave like dicts
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            type        TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
            category    TEXT    NOT NULL,
            amount      REAL    NOT NULL CHECK(amount > 0),
            note        TEXT,
            created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print("Database initialised.")