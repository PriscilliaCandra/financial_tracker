from flask import Blueprint, request, jsonify
from database import get_db

transactions_bp = Blueprint("transactions", __name__, url_prefix="/api")


# ── POST /api/transactions ─────────────────────────────────────────────────────
@transactions_bp.route("/transactions", methods=["POST"])
def add_transaction():
    """Add a new income or expense transaction."""
    data = request.get_json()

    # Validate required fields
    required = ("date", "type", "category", "amount")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    if data["type"] not in ("income", "expense"):
        return jsonify({"error": "type must be 'income' or 'expense'"}), 400

    try:
        amount = float(data["amount"])
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "amount must be a positive number"}), 400

    conn = get_db()
    cursor = conn.execute(
        """
        INSERT INTO transactions (date, type, category, amount, note)
        VALUES (?, ?, ?, ?, ?)
        """,
        (data["date"], data["type"], data["category"], amount, data.get("note", "")),
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return jsonify({"message": "Transaction added", "id": new_id}), 201


# ── GET /api/transactions ──────────────────────────────────────────────────────
@transactions_bp.route("/transactions", methods=["GET"])
def get_transactions():
    """
    Return all transactions, newest first.
    Optional query params:
      ?type=income|expense
      ?category=Food
      ?from=YYYY-MM-DD
      ?to=YYYY-MM-DD
    """
    conn = get_db()

    query = "SELECT * FROM transactions WHERE 1=1"
    params = []

    if t := request.args.get("type"):
        query += " AND type = ?"
        params.append(t)

    if cat := request.args.get("category"):
        query += " AND category = ?"
        params.append(cat)

    if from_date := request.args.get("from"):
        query += " AND date >= ?"
        params.append(from_date)

    if to_date := request.args.get("to"):
        query += " AND date <= ?"
        params.append(to_date)

    query += " ORDER BY date DESC, created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify([dict(row) for row in rows]), 200


# ── GET /api/summary ───────────────────────────────────────────────────────────
@transactions_bp.route("/summary", methods=["GET"])
def get_summary():
    """
    Return total income, total expense, and balance.
    Optional query params: ?from=YYYY-MM-DD  ?to=YYYY-MM-DD
    """
    conn = get_db()

    query = """
        SELECT
            COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE 1=1
    """
    params = []

    if from_date := request.args.get("from"):
        query += " AND date >= ?"
        params.append(from_date)

    if to_date := request.args.get("to"):
        query += " AND date <= ?"
        params.append(to_date)

    row = conn.execute(query, params).fetchone()
    conn.close()

    income  = row["total_income"]
    expense = row["total_expense"]

    return jsonify({
        "total_income":  income,
        "total_expense": expense,
        "balance":       round(income - expense, 2),
    }), 200