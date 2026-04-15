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

    # ── Users table (existing) ──────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            password   TEXT    NOT NULL,
            created_at TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Transactions table (ADD currency & exchange_rate columns) ───────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date        TEXT    NOT NULL,
            type        TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
            category    TEXT    NOT NULL,
            amount      REAL    NOT NULL CHECK(amount > 0),
            note        TEXT    DEFAULT '',
            currency    TEXT    DEFAULT 'IDR',
            exchange_rate REAL  DEFAULT 1.0,
            created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Budgets table (existing) ───────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            month        TEXT    NOT NULL,
            limit_amount REAL    NOT NULL CHECK(limit_amount > 0),
            created_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, month)
        )
    """)

    # ── NEW: Categories table (for custom categories) ───────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name        TEXT    NOT NULL,
            type        TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
            is_default  INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, name, type)
        )
    """)

    # ── NEW: Attachments table (for uploaded receipts/documents) ────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            filename        TEXT    NOT NULL,
            file_path       TEXT    NOT NULL,
            file_type       TEXT,
            file_size       INTEGER,
            extracted_text  TEXT,
            uploaded_at     TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Insert default categories for each user (will be added per user) ─
    #    (Default categories will be inserted when user registers)

    # ── Migrations for existing tables ──────────────────────────────────
    # Add currency column if not exists
    try:
        conn.execute("ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'IDR'")
        print("Migrated: added currency column.")
    except Exception:
        pass

    # Add exchange_rate column if not exists
    try:
        conn.execute("ALTER TABLE transactions ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        print("Migrated: added exchange_rate column.")
    except Exception:
        pass

    # Add user_id column if not exists (for existing DBs)
    try:
        conn.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0")
        print("Migrated: added user_id column.")
    except Exception:
        pass

    conn.commit()
    conn.close()
    print("Database initialised.")


# ── Helper function to insert default categories for new user ─────────────
def insert_default_categories(user_id):
    """Insert default RIASEC-based categories for a new user"""
    conn = get_db()
    
    default_income_cats = [
        ("Salary", "income", 1),
        ("Freelance", "income", 1),
        ("Investment", "income", 1),
        ("Other Income", "income", 1),
    ]
    
    default_expense_cats = [
        ("Food", "expense", 1),
        ("Transport", "expense", 1),
        ("Housing", "expense", 1),
        ("Health", "expense", 1),
        ("Entertainment", "expense", 1),
        ("Shopping", "expense", 1),
        ("Other Expense", "expense", 1),
    ]
    
    for name, cat_type, is_default in default_income_cats + default_expense_cats:
        conn.execute("""
            INSERT OR IGNORE INTO categories (user_id, name, type, is_default)
            VALUES (?, ?, ?, ?)
        """, (user_id, name, cat_type, is_default))
    
    conn.commit()
    conn.close()