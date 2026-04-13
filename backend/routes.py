from flask import Blueprint, request, jsonify, g
from database import get_db
from auth import require_auth

transactions_bp = Blueprint("transactions", __name__, url_prefix="/api")


# ── POST /api/transactions ────────────────────────────────────────────────────
@transactions_bp.route("/transactions", methods=["POST"])
@require_auth
def add_transaction():
    data = request.get_json() or {}
    required = ("date", "type", "category", "amount")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    if data["type"] not in ("income", "expense"):
        return jsonify({"error": "type must be 'income' or 'expense'"}), 400
    try:
        amount = float(data["amount"])
        if amount <= 0: raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "amount must be a positive number"}), 400

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO transactions (user_id, date, type, category, amount, note) VALUES (?,?,?,?,?,?)",
        (g.user_id, data["date"], data["type"], data["category"], amount, data.get("note", "")),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction added", "id": cursor.lastrowid}), 201


# ── GET /api/transactions ─────────────────────────────────────────────────────
@transactions_bp.route("/transactions", methods=["GET"])
@require_auth
def get_transactions():
    conn   = get_db()
    query  = "SELECT * FROM transactions WHERE user_id = ?"
    params = [g.user_id]

    if t := request.args.get("type"):
        query += " AND type = ?"; params.append(t)
    if cat := request.args.get("category"):
        query += " AND category = ?"; params.append(cat)
    if from_date := request.args.get("from"):
        query += " AND date >= ?"; params.append(from_date)
    if to_date := request.args.get("to"):
        query += " AND date <= ?"; params.append(to_date)

    query += " ORDER BY date DESC, created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows]), 200


# ── PUT /api/transactions/<id> ────────────────────────────────────────────────
@transactions_bp.route("/transactions/<int:tx_id>", methods=["PUT"])
@require_auth
def edit_transaction(tx_id):
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM transactions WHERE id = ? AND user_id = ?", (tx_id, g.user_id)
    ).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Transaction not found"}), 404

    data = request.get_json() or {}
    required = ("date", "type", "category", "amount")
    missing = [f for f in required if not data.get(f)]
    if missing:
        conn.close()
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    if data["type"] not in ("income", "expense"):
        conn.close()
        return jsonify({"error": "type must be 'income' or 'expense'"}), 400
    try:
        amount = float(data["amount"])
        if amount <= 0: raise ValueError
    except (ValueError, TypeError):
        conn.close()
        return jsonify({"error": "amount must be a positive number"}), 400

    conn.execute(
        "UPDATE transactions SET date=?, type=?, category=?, amount=?, note=? WHERE id=? AND user_id=?",
        (data["date"], data["type"], data["category"], amount, data.get("note", ""), tx_id, g.user_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction updated", "id": tx_id}), 200


# ── DELETE /api/transactions/<id> ─────────────────────────────────────────────
@transactions_bp.route("/transactions/<int:tx_id>", methods=["DELETE"])
@require_auth
def delete_transaction(tx_id):
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM transactions WHERE id = ? AND user_id = ?", (tx_id, g.user_id)
    ).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Transaction not found"}), 404
    conn.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", (tx_id, g.user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction deleted", "id": tx_id}), 200


# ── GET /api/summary ──────────────────────────────────────────────────────────
@transactions_bp.route("/summary", methods=["GET"])
@require_auth
def get_summary():
    conn   = get_db()
    query  = """
        SELECT
            COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions WHERE user_id = ?
    """
    params = [g.user_id]
    if from_date := request.args.get("from"):
        query += " AND date >= ?"; params.append(from_date)
    if to_date := request.args.get("to"):
        query += " AND date <= ?"; params.append(to_date)

    row     = conn.execute(query, params).fetchone()
    conn.close()
    income  = row["total_income"]
    expense = row["total_expense"]
    return jsonify({
        "total_income":  income,
        "total_expense": expense,
        "balance":       round(income - expense, 2),
    }), 200


# ── GET /api/salary-summary ───────────────────────────────────────────────────
@transactions_bp.route("/salary-summary", methods=["GET"])
@require_auth
def salary_summary():
    from datetime import date, timedelta
    conn  = get_db()
    today = date.today().isoformat()

    salary_rows = conn.execute("""
        SELECT id, date, amount FROM transactions
        WHERE user_id = ? AND type = 'income' AND LOWER(category) = 'salary'
        ORDER BY date ASC, created_at ASC
    """, (g.user_id,)).fetchall()

    all_rows = conn.execute("""
        SELECT id, date, type, category, amount, note FROM transactions
        WHERE user_id = ? ORDER BY date ASC, created_at ASC
    """, (g.user_id,)).fetchall()
    conn.close()

    all_txns = [dict(r) for r in all_rows]

    if not salary_rows:
        return jsonify({"cycles": [], "message": "No salary transactions found."}), 200

    salaries = [dict(r) for r in salary_rows]
    cycles   = []
    for i, sal in enumerate(salaries):
        start = sal["date"]
        if i + 1 < len(salaries):
            end = (date.fromisoformat(salaries[i + 1]["date"]) - timedelta(days=1)).isoformat()
        else:
            end = today if today >= start else start
        cycles.append({
            "label":         f"Cycle {i + 1}",
            "salary_date":   start,
            "start":         start,
            "end":           end,
            "salary_amount": sal["amount"],
            "is_current":    (i + 1 == len(salaries)),
        })

    def find_cycle(tx_date):
        for idx, c in enumerate(cycles):
            if c["start"] <= tx_date <= c["end"]: return idx
        return -1

    buckets = {i: [] for i in range(len(cycles))}
    pre     = []
    for tx in all_txns:
        idx = find_cycle(tx["date"])
        (buckets[idx] if idx >= 0 else pre).append(tx)

    def status(income, expense):
        if income <= 0: return "ok"
        ratio = (income - expense) / income
        return "critical" if ratio < 0.10 else "warning" if ratio < 0.30 else "ok"

    result = []
    for i, cyc in enumerate(cycles):
        txns    = buckets[i]
        income  = sum(t["amount"] for t in txns if t["type"] == "income")
        expense = sum(t["amount"] for t in txns if t["type"] == "expense")
        result.append({
            **cyc,
            "total_income":  round(income, 2),
            "total_expense": round(expense, 2),
            "balance":       round(income - expense, 2),
            "status":        status(income, expense),
            "transactions":  txns,
        })

    current = next((c for c in result if c["is_current"]), None)
    resp = {"cycles": result, "pre_salary": pre, "total_cycles": len(result)}
    if current:
        resp["current_cycle"] = {k: current[k] for k in
            ("label", "start", "end", "total_income", "total_expense", "balance", "status")}
    return jsonify(resp), 200


# ── GET /api/summary/daily ────────────────────────────────────────────────────
@transactions_bp.route("/summary/daily", methods=["GET"])
@require_auth
def daily_summary():
    """
    Returns income, expense, balance grouped by day.
    Optional: ?from=YYYY-MM-DD  ?to=YYYY-MM-DD
    """
    conn   = get_db()
    query  = """
        SELECT
            date,
            COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
    """
    params = [g.user_id]
 
    if from_date := request.args.get("from"):
        query += " AND date >= ?"; params.append(from_date)
    if to_date := request.args.get("to"):
        query += " AND date <= ?"; params.append(to_date)
 
    query += " GROUP BY date ORDER BY date DESC"
    rows   = conn.execute(query, params).fetchall()
    conn.close()
 
    result = []
    for row in rows:
        income  = row["total_income"]
        expense = row["total_expense"]
        result.append({
            "date":          row["date"],
            "total_income":  round(income, 2),
            "total_expense": round(expense, 2),
            "balance":       round(income - expense, 2),
        })
 
    return jsonify(result), 200
 
 
# ── GET /api/summary/monthly ──────────────────────────────────────────────────
@transactions_bp.route("/summary/monthly", methods=["GET"])
@require_auth
def monthly_summary():
    """
    Returns income, expense, balance grouped by month (YYYY-MM).
    Optional: ?from=YYYY-MM-DD  ?to=YYYY-MM-DD
    """
    conn   = get_db()
    query  = """
        SELECT
            strftime('%Y-%m', date) AS month,
            COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
    """
    params = [g.user_id]
 
    if from_date := request.args.get("from"):
        query += " AND date >= ?"; params.append(from_date)
    if to_date := request.args.get("to"):
        query += " AND date <= ?"; params.append(to_date)
 
    query += " GROUP BY month ORDER BY month DESC"
    rows   = conn.execute(query, params).fetchall()
    conn.close()
 
    result = []
    for row in rows:
        income  = row["total_income"]
        expense = row["total_expense"]
        result.append({
            "month":         row["month"],
            "total_income":  round(income, 2),
            "total_expense": round(expense, 2),
            "balance":       round(income - expense, 2),
        })
 
    return jsonify(result), 200