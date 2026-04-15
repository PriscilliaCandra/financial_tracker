from flask import Blueprint, request, jsonify, g
from database import get_db
from auth import require_auth

categories_bp = Blueprint("categories", __name__, url_prefix="/api/categories")


# ── GET /api/categories ──────────────────────────────────────────────────
@categories_bp.route("", methods=["GET"])
@require_auth
def get_categories():
    """Get all categories for the logged-in user"""
    conn = get_db()
    rows = conn.execute("""
        SELECT id, name, type, is_default, created_at
        FROM categories
        WHERE user_id = ?
        ORDER BY type, name
    """, (g.user_id,)).fetchall()
    conn.close()
    
    return jsonify([dict(r) for r in rows]), 200


# ── POST /api/categories ─────────────────────────────────────────────────
@categories_bp.route("", methods=["POST"])
@require_auth
def add_category():
    """Add a custom category for the user"""
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    cat_type = data.get("type", "").strip()
    
    if not name or cat_type not in ("income", "expense"):
        return jsonify({"error": "Valid name and type (income/expense) are required"}), 400
    
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO categories (user_id, name, type, is_default)
            VALUES (?, ?, ?, 0)
        """, (g.user_id, name, cat_type))
        conn.commit()
        category_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()
        return jsonify({"message": "Category added", "id": category_id, "name": name, "type": cat_type}), 201
    except Exception as e:
        conn.close()
        return jsonify({"error": "Category may already exist"}), 409


# ── DELETE /api/categories/<id> ──────────────────────────────────────────
@categories_bp.route("/<int:cat_id>", methods=["DELETE"])
@require_auth
def delete_category(cat_id):
    """Delete a custom category (only if not default and not in use)"""
    conn = get_db()
    
    # Check if category exists and belongs to user
    cat = conn.execute(
        "SELECT id, is_default FROM categories WHERE id = ? AND user_id = ?",
        (cat_id, g.user_id)
    ).fetchone()
    
    if not cat:
        conn.close()
        return jsonify({"error": "Category not found"}), 404
    
    if cat["is_default"] == 1:
        conn.close()
        return jsonify({"error": "Cannot delete default category"}), 403
    
    # Check if category is used in any transaction
    used = conn.execute(
        "SELECT id FROM transactions WHERE user_id = ? AND category = (SELECT name FROM categories WHERE id = ?)",
        (g.user_id, cat_id)
    ).fetchone()
    
    if used:
        conn.close()
        return jsonify({"error": "Cannot delete category that is in use"}), 409
    
    conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"message": "Category deleted"}), 200


# ── PUT /api/categories/<id> ─────────────────────────────────────────────
@categories_bp.route("/<int:cat_id>", methods=["PUT"])
@require_auth
def update_category(cat_id):
    """Rename an existing category"""
    data = request.get_json() or {}
    new_name = data.get("name", "").strip()
    
    if not new_name:
        return jsonify({"error": "New name is required"}), 400
    
    conn = get_db()
    
    cat = conn.execute(
        "SELECT id, is_default FROM categories WHERE id = ? AND user_id = ?",
        (cat_id, g.user_id)
    ).fetchone()
    
    if not cat:
        conn.close()
        return jsonify({"error": "Category not found"}), 404
    
    if cat["is_default"] == 1:
        conn.close()
        return jsonify({"error": "Cannot rename default category"}), 403
    
    try:
        conn.execute(
            "UPDATE categories SET name = ? WHERE id = ?",
            (new_name, cat_id)
        )
        # Also update existing transactions that use the old category name
        old_name = conn.execute("SELECT name FROM categories WHERE id = ?", (cat_id,)).fetchone()["name"]
        conn.execute(
            "UPDATE transactions SET category = ? WHERE user_id = ? AND category = ?",
            (new_name, g.user_id, old_name)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Category updated", "name": new_name}), 200
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500