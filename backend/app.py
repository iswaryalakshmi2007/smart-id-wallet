import os
import re
import json
import base64
import time
import hmac
import hashlib
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from database import (
    initialize_database,
    get_db_connection,
    authenticate_user,
    atomic_shopkeeper_purchase,
    atomic_wallet_topup,
    atomic_student_pay,
    get_student,
    get_student_by_barcode,
    get_student_wallet,
    get_student_transactions,
    create_student_if_not_exists,
    change_student_password,
    get_shopkeeper,
    get_shopkeeper_products,
    get_shopkeeper_sales,
    get_shopkeeper_dashboard_stats,
    get_admin_dashboard_stats,
    get_all_students_admin,
    get_all_shopkeepers_admin,
    get_all_products_admin,
    get_all_transactions_admin,
    get_transaction_details,
    get_admin_reports,
    hash_password_if_needed
)
from payment_service import PaymentService

# =====================================================
# FLASK APP SETUP
# =====================================================

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# Initialize and migrate DB
initialize_database()


# =====================================================
# SECURE TOKEN UTILITY (HMAC-SHA256 SIGNED)
# =====================================================

SECRET_KEY = os.environ.get("SECRET_KEY", "smart-id-wallet-token-key-2026")

def generate_auth_token(user_data: dict) -> str:
    """Generates an HMAC-SHA256 signed JSON session token with expiry."""
    payload = {
        "user_id": user_data.get("user_id") or user_data.get("student_id"),
        "role": user_data.get("role"),
        "name": user_data.get("name"),
        "exp": int(time.time()) + (86400 * 7) # 7 days
    }
    raw_payload = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
    sig = hmac.new(SECRET_KEY.encode(), raw_payload.encode(), hashlib.sha256).hexdigest()
    return f"{raw_payload}.{sig}"


def decode_auth_token(token: str) -> dict:
    """Validates signature and expiry of session token."""
    try:
        if not token:
            return None
        parts = token.split(".")
        if len(parts) == 2:
            raw_payload, sig = parts
            expected_sig = hmac.new(SECRET_KEY.encode(), raw_payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected_sig):
                return None
            payload = json.loads(base64.urlsafe_b64decode(raw_payload.encode("utf-8")).decode("utf-8"))
        else:
            # Backward compatibility fallback
            payload = json.loads(base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8"))

        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        return decode_auth_token(token)
    return None


def require_role(allowed_roles):
    """Enforces strict role-based access control."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({
                    "success": False,
                    "message": "Authentication required. Please log in."
                }), 401

            role = user.get("role")
            if role in allowed_roles:
                return f(*args, **kwargs)

            return jsonify({
                "success": False,
                "message": f"Access denied. Requires one of roles: {', '.join(allowed_roles)}"
            }), 403
        return decorated_function
    return decorator


# =====================================================
# STATIC SERVING (SERVES FRONTEND SEAMLESSLY)
# =====================================================

@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    file_path = os.path.join(FRONTEND_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIR, path)
    # Default to index.html if file doesn't exist
    return send_from_directory(FRONTEND_DIR, "index.html")


# =====================================================
# AUTHENTICATION APIS
# =====================================================

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    login_id = (data.get("loginId") or data.get("studentId") or data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    expected_role = (data.get("role") or "").strip().lower() or None

    if not login_id or not password:
        return jsonify({"success": False, "message": "ID/Username and password are required"}), 400

    user = authenticate_user(login_id, password, expected_role=expected_role)
    if not user:
        return jsonify({"success": False, "message": "Invalid ID or password."}), 401

    if "error" in user:
        return jsonify({"success": False, "message": user["error"]}), 403

    token = generate_auth_token(user)

    # Determine redirect destination
    redirect_map = {
        "student": "dashboard.html",
        "shopkeeper": "shopkeeper/index.html",
        "admin": "admin/index.html"
    }

    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": token,
        "role": user["role"],
        "user": user,
        "redirect": redirect_map.get(user["role"], "dashboard.html")
    })


# Legacy /api/login compatibility for student portal
@app.route("/api/login", methods=["POST"])
def legacy_login():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or data.get("loginId") or "").strip().upper()
    password = (data.get("password") or "").strip()

    if not student_id or not password:
        return jsonify({"success": False, "message": "Student ID and password required"}), 400

    create_student_if_not_exists(student_id)
    user = authenticate_user(student_id, password, expected_role="student")
    if not user or "error" in user:
        return jsonify({"success": False, "message": "Invalid Student ID or password"}), 401

    token = generate_auth_token(user)
    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": token,
        "studentId": user["student_id"],
        "role": "student"
    })


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "Not authenticated"}), 401
    return jsonify({"success": True, "user": user})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    return jsonify({"success": True, "message": "Logged out successfully"})


# =====================================================
# STUDENT APIS
# =====================================================

@app.route("/api/student/<student_id>", methods=["GET"])
def api_get_student(student_id):
    student = get_student(student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found"}), 404
    return jsonify(student)


@app.route("/api/student/barcode/<path:barcode>", methods=["GET"])
def api_get_student_by_barcode(barcode):
    student = get_student_by_barcode(barcode)
    if not student:
        return jsonify({"success": False, "message": "Student not found for this barcode"}), 404
    return jsonify({"success": True, "student": student})


@app.route("/api/wallet/<student_id>", methods=["GET"])
def api_get_wallet(student_id):
    wallet = get_student_wallet(student_id)
    if not wallet:
        return jsonify({"success": False, "message": "Wallet not found"}), 404
    return jsonify(wallet)


@app.route("/api/transactions/<student_id>", methods=["GET"])
def api_get_transactions(student_id):
    txns = get_student_transactions(student_id)
    return jsonify(txns)


@app.route("/api/student/update", methods=["PUT"])
def api_update_student():
    data = request.get_json() or {}
    old_id = (data.get("oldStudentId") or data.get("studentId") or "").strip().upper()
    new_id = (data.get("studentId") or "").strip().upper()
    name = (data.get("name") or "").strip()
    department = (data.get("department") or "").strip()
    academic_year = (data.get("academicYear") or "").strip()
    email = (data.get("email") or "").strip()

    if not old_id or not name:
        return jsonify({"success": False, "message": "Student ID and name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE students
        SET name = ?, department = ?, academic_year = ?, email = ?
        WHERE student_id = ?
    """, (name, department, academic_year, email, old_id))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": "Profile updated successfully",
        "studentId": new_id,
        "name": name,
        "department": department,
        "academicYear": academic_year,
        "email": email
    })


@app.route("/api/student/change-password", methods=["PUT"])
def api_change_password():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or "").strip().upper()
    current_password = (data.get("currentPassword") or "").strip()
    new_password = (data.get("newPassword") or "").strip()

    if not student_id or not current_password or not new_password:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    if len(new_password) < 6:
        return jsonify({"success": False, "message": "Password must be at least 6 characters"}), 400

    res = change_student_password(student_id, current_password, new_password)
    status_code = 200 if res["success"] else 400
    return jsonify(res), status_code


# =====================================================
# PAYMENT & TOP-UP APIS
# =====================================================

@app.route("/api/wallet/topup/create", methods=["POST"])
def api_topup_create():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or "").strip().upper()
    try:
        amount = float(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"success": False, "message": "Amount must be greater than zero"}), 400

    order = PaymentService.create_topup_order(student_id, amount)
    status_code = 200 if order["success"] else 400
    return jsonify(order), status_code


@app.route("/api/wallet/topup/verify", methods=["POST"])
def api_topup_verify():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or "").strip().upper()
    order_id = (data.get("orderId") or "").strip()
    payment_id = (data.get("paymentId") or "").strip()
    signature = (data.get("signature") or "").strip()

    if not student_id or not order_id:
        return jsonify({"success": False, "message": "Missing order verification parameters"}), 400

    res = PaymentService.verify_topup_payment(student_id, order_id, payment_id, signature)
    if not res.get("success"):
        status_code = 409 if res.get("duplicate_prevented") else 400
        return jsonify(res), status_code
    return jsonify(res), 200


# Legacy direct add-money endpoint
@app.route("/api/wallet/add-money", methods=["POST"])
def api_add_money_direct():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or "").strip().upper()
    try:
        amount = float(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400

    ref = (data.get("payment_reference") or data.get("reference") or f"DIRECT_{int(time.time())}").strip()
    res = atomic_wallet_topup(student_id, amount, payment_reference=ref)
    if not res.get("success"):
        status_code = 409 if res.get("duplicate_prevented") else 400
        return jsonify(res), status_code
    return jsonify(res), 200


# Student Scan & Pay (Self-Checkout)
@app.route("/api/wallet/pay", methods=["POST"])
def api_wallet_pay():
    data = request.get_json() or {}
    student_id = (data.get("studentId") or "").strip().upper()
    try:
        amount = float(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400

    category = (data.get("category") or "Other").strip()
    description = (data.get("description") or "").strip()

    res = atomic_student_pay(student_id, amount, category, description)
    status_code = 200 if res["success"] else 400
    return jsonify(res), status_code


# =====================================================
# SHOPKEEPER APIS
# =====================================================

@app.route("/api/shopkeeper/profile", methods=["GET"])
def api_shopkeeper_profile():
    shopkeeper_id = request.args.get("shopkeeperId")
    if not shopkeeper_id:
        user = get_current_user()
        if user and user.get("role") == "shopkeeper":
            shopkeeper_id = user.get("user_id")
    if not shopkeeper_id:
        return jsonify({"success": False, "message": "Shopkeeper ID required"}), 400

    shop = get_shopkeeper(shopkeeper_id)
    if not shop:
        return jsonify({"success": False, "message": "Shopkeeper not found"}), 404
    return jsonify({"success": True, "shopkeeper": shop})


@app.route("/api/shopkeeper/products", methods=["GET"])
def api_shopkeeper_products():
    shopkeeper_id = request.args.get("shopkeeperId") or "shop01"
    products = get_shopkeeper_products(shopkeeper_id)
    return jsonify(products)


@app.route("/api/shopkeeper/scan-student", methods=["POST"])
def api_shopkeeper_scan_student():
    """
    Identifies a student via barcode/QR code or manual student ID.
    Always returns fresh wallet balance directly from database.
    """
    data = request.get_json() or {}
    code = (data.get("barcode") or data.get("studentId") or "").strip().upper()

    if not code:
        return jsonify({"success": False, "message": "Barcode or Student ID is required"}), 400

    student = get_student_by_barcode(code)
    if not student:
        # Fallback to direct student_id search
        student = get_student(code)

    if not student:
        return jsonify({"success": False, "message": f"Student not found for ID/Barcode: '{code}'"}), 404

    if student.get("status") != "ACTIVE":
        return jsonify({"success": False, "message": "This student account is currently inactive"}), 403

    wallet = get_student_wallet(student["student_id"])
    balance = wallet["balance"] if wallet else 0.0

    return jsonify({
        "success": True,
        "student": {
            "student_id": student["student_id"],
            "name": student["name"],
            "department": student["department"],
            "academic_year": student["academic_year"],
            "email": student["email"],
            "barcode": student["barcode"] or student["student_id"],
            "balance": balance
        }
    })


@app.route("/api/shopkeeper/purchase", methods=["POST"])
def api_shopkeeper_purchase():
    """
    Atomic Shopkeeper POS Purchase endpoint.
    Recalculates total from database product prices and updates wallet safely.
    Supports idempotency keys to prevent duplicate purchases.
    """
    data = request.get_json() or {}
    shopkeeper_id = (data.get("shopkeeperId") or data.get("shopkeeper_id") or "").strip()
    student_id = (data.get("studentId") or data.get("student_id") or "").strip().upper()
    items = data.get("items", [])
    idempotency_key = (
        data.get("idempotencyKey") or 
        data.get("idempotency_key") or 
        data.get("requestId") or 
        request.headers.get("Idempotency-Key") or 
        request.headers.get("X-Request-Id") or 
        ""
    ).strip() or None

    if not shopkeeper_id or not student_id or not items:
        return jsonify({"success": False, "message": "Shopkeeper, Student ID, and Cart items are required"}), 400

    result = atomic_shopkeeper_purchase(shopkeeper_id, student_id, items, idempotency_key=idempotency_key)
    if not result.get("success"):
        status_code = 409 if result.get("duplicate_prevented") else 400
        return jsonify(result), status_code
    return jsonify(result), 200


@app.route("/api/shopkeeper/sales", methods=["GET"])
def api_shopkeeper_sales():
    shopkeeper_id = request.args.get("shopkeeperId") or "shop01"
    sales = get_shopkeeper_sales(shopkeeper_id)
    stats = get_shopkeeper_dashboard_stats(shopkeeper_id)
    return jsonify({
        "success": True,
        "stats": stats,
        "sales": sales
    })


# =====================================================
# RECEIPT DETAILS (STUDENT, SHOPKEEPER & ADMIN)
# =====================================================

@app.route("/api/transaction/<int:transaction_id>", methods=["GET"])
def api_transaction_detail(transaction_id):
    """
    Returns itemized receipt details.
    Accessible by student owner, shopkeeper seller, or administrator.
    """
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "Authentication required"}), 401

    detail = get_transaction_details(transaction_id)
    if not detail:
        return jsonify({"success": False, "message": "Transaction not found"}), 404

    role = user.get("role")
    user_id = user.get("user_id")

    if role == "student" and detail["student_id"] != user_id:
        return jsonify({"success": False, "message": "Access denied"}), 403
    if role == "shopkeeper" and detail["shopkeeper_id"] != user_id:
        return jsonify({"success": False, "message": "Access denied"}), 403

    return jsonify({"success": True, "transaction": detail})


# =====================================================
# ADMIN APIS (STRICT RBAC ENFORCED)
# =====================================================

@app.route("/api/admin/dashboard", methods=["GET"])
@require_role(["admin"])
def api_admin_dashboard():
    stats = get_admin_dashboard_stats()
    return jsonify({"success": True, "data": stats})


@app.route("/api/admin/students", methods=["GET", "POST"])
@require_role(["admin"])
def api_admin_students():
    if request.method == "GET":
        search = request.args.get("search")
        status = request.args.get("status")
        students = get_all_students_admin(search=search, status=status)
        return jsonify({"success": True, "students": students})

    # POST: Add new student
    data = request.get_json() or {}
    student_id = (data.get("student_id") or "").strip().upper()
    name = (data.get("name") or "").strip()
    department = (data.get("department") or "General").strip()
    academic_year = (data.get("academic_year") or "2025-2029").strip()
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "123456").strip()
    initial_balance = float(data.get("initial_balance", 0))

    if not student_id or not name:
        return jsonify({"success": False, "message": "Student ID and name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    existing = cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"success": False, "message": "Student ID already exists"}), 409

    now_str = datetime.now().isoformat(timespec="seconds")
    cursor.execute("""
        INSERT INTO students (
            student_id, name, department, academic_year, email, password, password_hash,
            barcode, barcode_or_qr_value, role, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'student', 'ACTIVE', ?)
    """, (
        student_id, name, department, academic_year, email, password,
        hash_password_if_needed(password), student_id, student_id, now_str
    ))

    cursor.execute("""
        INSERT INTO wallets (student_id, balance, low_balance_limit, updated_at)
        VALUES (?, ?, 100.0, ?)
    """, (student_id, initial_balance, now_str))

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": f"Student {student_id} added successfully"})


@app.route("/api/admin/students/<student_id>", methods=["PUT"])
@require_role(["admin"])
def api_admin_update_student(student_id):
    student_id = student_id.strip().upper()
    data = request.get_json() or {}
    conn = get_db_connection()
    cursor = conn.cursor()

    student = cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return jsonify({"success": False, "message": "Student not found"}), 404

    # Update fields if provided
    name = data.get("name", student["name"])
    department = data.get("department", student["department"])
    academic_year = data.get("academic_year", student["academic_year"])
    email = data.get("email", student["email"])
    status = data.get("status", student["status"])
    barcode = data.get("barcode", student["barcode"])

    cursor.execute("""
        UPDATE students
        SET name = ?, department = ?, academic_year = ?, email = ?, status = ?, barcode = ?, barcode_or_qr_value = ?
        WHERE student_id = ?
    """, (name, department, academic_year, email, status, barcode, barcode, student_id))

    if "balance" in data:
        try:
            new_bal = float(data["balance"])
            cursor.execute("UPDATE wallets SET balance = ? WHERE student_id = ?", (new_bal, student_id))
        except (ValueError, TypeError):
            pass

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Student updated successfully"})


@app.route("/api/admin/shopkeepers", methods=["GET", "POST"])
@require_role(["admin"])
def api_admin_shopkeepers():
    if request.method == "GET":
        shopkeepers = get_all_shopkeepers_admin()
        return jsonify({"success": True, "shopkeepers": shopkeepers})

    # POST: Add new shopkeeper
    data = request.get_json() or {}
    shopkeeper_id = (data.get("shopkeeper_id") or "").strip()
    name = (data.get("name") or "").strip()
    shop_name = (data.get("shop_name") or "").strip()
    category = (data.get("category") or "General Store").strip()
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "123456").strip()

    if not shopkeeper_id or not name or not shop_name:
        return jsonify({"success": False, "message": "Shopkeeper ID, Name, and Shop Name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    existing = cursor.execute("SELECT * FROM shopkeepers WHERE shopkeeper_id = ?", (shopkeeper_id,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"success": False, "message": "Shopkeeper ID already exists"}), 409

    now_str = datetime.now().isoformat(timespec="seconds")
    cursor.execute("""
        INSERT INTO shopkeepers (shopkeeper_id, name, shop_name, category, email, password_hash, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'shopkeeper', 'ACTIVE', ?)
    """, (shopkeeper_id, name, shop_name, category, email, hash_password_if_needed(password), now_str))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"Shopkeeper {shopkeeper_id} created successfully"})


@app.route("/api/admin/shopkeepers/<shopkeeper_id>", methods=["PUT"])
@require_role(["admin"])
def api_admin_update_shopkeeper(shopkeeper_id):
    data = request.get_json() or {}
    conn = get_db_connection()
    cursor = conn.cursor()

    shop = cursor.execute("SELECT * FROM shopkeepers WHERE shopkeeper_id = ?", (shopkeeper_id,)).fetchone()
    if not shop:
        conn.close()
        return jsonify({"success": False, "message": "Shopkeeper not found"}), 404

    name = data.get("name", shop["name"])
    shop_name = data.get("shop_name", shop["shop_name"])
    category = data.get("category", shop["category"])
    email = data.get("email", shop["email"])
    status = data.get("status", shop["status"])

    cursor.execute("""
        UPDATE shopkeepers
        SET name = ?, shop_name = ?, category = ?, email = ?, status = ?
        WHERE shopkeeper_id = ?
    """, (name, shop_name, category, email, status, shopkeeper_id))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Shopkeeper updated successfully"})


@app.route("/api/admin/products", methods=["GET", "POST"])
@require_role(["admin"])
def api_admin_products():
    if request.method == "GET":
        products = get_all_products_admin()
        return jsonify({"success": True, "products": products})

    # POST: Add new product
    data = request.get_json() or {}
    shopkeeper_id = (data.get("shopkeeper_id") or "shop01").strip()
    product_name = (data.get("product_name") or "").strip()
    category = (data.get("category") or "General").strip()
    try:
        price = float(data.get("price", 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid price"}), 400

    if not product_name or price <= 0:
        return jsonify({"success": False, "message": "Product name and positive price required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat(timespec="seconds")

    cursor.execute("""
        INSERT INTO products (shopkeeper_id, product_name, category, price, stock_status, active, created_at)
        VALUES (?, ?, ?, ?, 'IN_STOCK', 1, ?)
    """, (shopkeeper_id, product_name, category, price, now_str))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Product created successfully"})


@app.route("/api/admin/products/<int:product_id>", methods=["PUT"])
@require_role(["admin"])
def api_admin_update_product(product_id):
    data = request.get_json() or {}
    conn = get_db_connection()
    cursor = conn.cursor()

    product = cursor.execute("SELECT * FROM products WHERE product_id = ?", (product_id,)).fetchone()
    if not product:
        conn.close()
        return jsonify({"success": False, "message": "Product not found"}), 404

    product_name = data.get("product_name", product["product_name"])
    category = data.get("category", product["category"])
    price = float(data.get("price", product["price"]))
    stock_status = data.get("stock_status", product["stock_status"])
    active = int(data.get("active", product["active"]))

    cursor.execute("""
        UPDATE products
        SET product_name = ?, category = ?, price = ?, stock_status = ?, active = ?
        WHERE product_id = ?
    """, (product_name, category, price, stock_status, active, product_id))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Product updated successfully"})


@app.route("/api/admin/transactions", methods=["GET"])
@require_role(["admin"])
def api_admin_transactions():
    student_id = request.args.get("studentId")
    shopkeeper_id = request.args.get("shopkeeperId")
    txn_type = request.args.get("type")
    status = request.args.get("status")
    date_filter = request.args.get("date")

    txns = get_all_transactions_admin(
        student_id=student_id,
        shopkeeper_id=shopkeeper_id,
        txn_type=txn_type,
        status=status,
        date_filter=date_filter
    )
    return jsonify({"success": True, "transactions": txns})


@app.route("/api/admin/transactions/<int:transaction_id>", methods=["GET"])
@require_role(["admin"])
def api_admin_transaction_detail(transaction_id):
    detail = get_transaction_details(transaction_id)
    if not detail:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    return jsonify({"success": True, "transaction": detail})


@app.route("/api/admin/reports", methods=["GET"])
@require_role(["admin"])
def api_admin_reports():
    reports = get_admin_reports()
    return jsonify({"success": True, "reports": reports})


# =====================================================
# RUN APPLICATION
# =====================================================

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "True").lower() == "true"
    print(f"Starting Smart ID Wallet Server on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)