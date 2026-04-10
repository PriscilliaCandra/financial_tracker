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


# ── PUT /api/transactions/<id> ────────────────────────────────────────────────
@transactions_bp.route("/transactions/<int:tx_id>", methods=["PUT"])
def edit_transaction(tx_id):
    """Update an existing transaction by ID."""
    conn = get_db()
    row = conn.execute("SELECT id FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Transaction not found"}), 404

    data = request.get_json()
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
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        conn.close()
        return jsonify({"error": "amount must be a positive number"}), 400

    conn.execute(
        "UPDATE transactions SET date=?, type=?, category=?, amount=?, note=? WHERE id=?",
        (data["date"], data["type"], data["category"], amount, data.get("note", ""), tx_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction updated", "id": tx_id}), 200


# ── DELETE /api/transactions/<id> ─────────────────────────────────────────────
@transactions_bp.route("/transactions/<int:tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
    """Delete a transaction by ID."""
    conn = get_db()
    row = conn.execute("SELECT id FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Transaction not found"}), 404

    conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction deleted", "id": tx_id}), 200


# ── GET /api/salary-summary ───────────────────────────────────────────────────
@transactions_bp.route("/salary-summary", methods=["GET"])
def salary_summary():
    """
    Detect salary transactions, group all transactions into salary cycles,
    and return per-cycle income, expenses, balance, and budget status.

    Cycle logic:
      - Each salary transaction (type=income, category=Salary) starts a new cycle.
      - A cycle runs from its salary date up to (but not including) the next salary date.
      - The most recent cycle has no fixed end — it runs to today (open cycle).
      - Transactions before the first salary are grouped into a "Pre-salary" cycle.
    """
    from datetime import date, timedelta

    conn  = get_db()
    today = date.today().isoformat()

    # ── 1. Fetch all salary transactions, oldest first ─────────────────────
    salary_rows = conn.execute("""
        SELECT id, date, amount
        FROM   transactions
        WHERE  type = 'income' AND LOWER(category) = 'salary'
        ORDER  BY date ASC, created_at ASC
    """).fetchall()

    # ── 2. Fetch every transaction, oldest first ───────────────────────────
    all_rows = conn.execute("""
        SELECT id, date, type, category, amount, note
        FROM   transactions
        ORDER  BY date ASC, created_at ASC
    """).fetchall()
    conn.close()

    all_txns = [dict(r) for r in all_rows]

    # ── 3. Build cycle date-range list ────────────────────────────────────
    #   Each entry: { cycle_label, start, end, salary_amount }
    #   'end' is inclusive last day of the cycle.
    if not salary_rows:
        return jsonify({
            "cycles": [],
            "message": "No salary transactions found. Add a transaction with type=income and category=Salary to start tracking."
        }), 200

    salaries = [dict(r) for r in salary_rows]

    cycles = []
    for i, sal in enumerate(salaries):
        start  = sal["date"]
        # End is the day before the next salary, or today for the last cycle
        if i + 1 < len(salaries):
            next_sal_date = salaries[i + 1]["date"]
            # Subtract one day from next salary date
            end = (date.fromisoformat(next_sal_date) - timedelta(days=1)).isoformat()
        else:
            # Open cycle: end is today, but never before start (guards against future-dated salaries)
            end = today if today >= start else start

        cycles.append({
            "label":          f"Cycle {i + 1}",
            "salary_date":    start,
            "start":          start,
            "end":            end,
            "salary_amount":  sal["amount"],
            "is_current":     (i + 1 == len(salaries)),
        })

    # ── 4. Assign transactions to cycles ──────────────────────────────────
    def find_cycle_index(tx_date):
        """Return which cycle index this date belongs to, or -1 (pre-salary)."""
        for idx, cyc in enumerate(cycles):
            if cyc["start"] <= tx_date <= cyc["end"]:
                return idx
        # Before the first salary
        return -1

    # Bucket: index → list of transactions
    buckets = {i: [] for i in range(len(cycles))}
    pre_salary_txns = []

    for tx in all_txns:
        idx = find_cycle_index(tx["date"])
        if idx == -1:
            pre_salary_txns.append(tx)
        else:
            buckets[idx].append(tx)

    # ── 5. Compute per-cycle totals and warning status ────────────────────
    def budget_status(salary_amount, expenses):
        """
        Returns 'ok' | 'warning' | 'critical' based on remaining balance.
        remaining < 10% of salary → critical
        remaining < 30% of salary → warning
        """
        if salary_amount <= 0:
            return "ok"
        remaining = salary_amount - expenses
        ratio     = remaining / salary_amount
        if ratio < 0.10:
            return "critical"
        elif ratio < 0.30:
            return "warning"
        return "ok"

    result_cycles = []
    for i, cyc in enumerate(cycles):
        txns          = buckets[i]
        total_income  = sum(t["amount"] for t in txns if t["type"] == "income")
        total_expense = sum(t["amount"] for t in txns if t["type"] == "expense")
        # Balance = salary + any other income in this cycle - expenses
        balance       = round(total_income - total_expense, 2)
        status        = budget_status(total_income, total_expense)

        result_cycles.append({
            "label":         cyc["label"],
            "salary_date":   cyc["salary_date"],
            "start":         cyc["start"],
            "end":           cyc["end"],
            "is_current":    cyc["is_current"],
            "total_income":  round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "balance":       balance,
            "status":        status,        # 'ok' | 'warning' | 'critical'
            "transactions":  txns,
        })

    # ── 6. Build response ─────────────────────────────────────────────────
    response = {
        "cycles":      result_cycles,
        "pre_salary":  pre_salary_txns,   # transactions before first salary
        "total_cycles": len(result_cycles),
    }

    # Attach current cycle summary at top level for quick access
    current = next((c for c in result_cycles if c["is_current"]), None)
    if current:
        response["current_cycle"] = {
            "label":         current["label"],
            "start":         current["start"],
            "end":           current["end"],
            "total_income":  current["total_income"],
            "total_expense": current["total_expense"],
            "balance":       current["balance"],
            "status":        current["status"],
        }

    return jsonify(response), 200