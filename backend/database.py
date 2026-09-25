import sqlite3
from pathlib import Path
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# =====================================================
# DATABASE LOCATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "wallet.db"


# =====================================================
# DATABASE CONNECTION
# =====================================================

def get_db_connection():
    connection = sqlite3.connect(DATABASE, timeout=20.0)
    connection.row_factory = sqlite3.Row
    # Enable foreign key support
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def hash_password_if_needed(password: str) -> str:
    """Returns a werkzeug password hash."""
    if password.startswith("pbkdf2:") or password.startswith("scrypt:"):
        return password
    return generate_password_hash(password)


def verify_password(stored_password: str, provided_password: str) -> bool:
    """Verifies hashed password with fallback to plain text for legacy demo accounts."""
    if not stored_password:
        return False
    if stored_password.startswith("pbkdf2:") or stored_password.startswith("scrypt:"):
        return check_password_hash(stored_password, provided_password)
    # Plain text check for legacy development data
    return stored_password == provided_password


# =====================================================
# INITIALIZE DATABASE & SCHEMA MIGRATIONS
# =====================================================

def initialize_database():
    connection = get_db_connection()
    cursor = connection.cursor()

    # 1. ADMINS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            admin_id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            status TEXT DEFAULT 'ACTIVE',
            created_at TEXT
        )
    """)

    # 2. STUDENTS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            student_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            academic_year TEXT NOT NULL,
            email TEXT,
            password TEXT NOT NULL,
            password_hash TEXT,
            barcode TEXT UNIQUE,
            barcode_or_qr_value TEXT UNIQUE,
            role TEXT DEFAULT 'student',
            status TEXT DEFAULT 'ACTIVE',
            created_at TEXT
        )
    """)

    # Check and migrate students table columns
    student_cols = [col["name"] for col in cursor.execute("PRAGMA table_info(students)").fetchall()]
    if "password_hash" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN password_hash TEXT")
    if "barcode" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN barcode TEXT")
    if "barcode_or_qr_value" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN barcode_or_qr_value TEXT")
    if "role" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN role TEXT DEFAULT 'student'")
    if "status" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'ACTIVE'")
    if "created_at" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN created_at TEXT")

    # 3. SHOPKEEPERS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shopkeepers (
            shopkeeper_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            shop_name TEXT NOT NULL,
            category TEXT NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'shopkeeper',
            status TEXT DEFAULT 'ACTIVE',
            created_at TEXT
        )
    """)

    # 4. WALLETS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wallets (
            wallet_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT UNIQUE NOT NULL,
            balance REAL DEFAULT 0,
            low_balance_limit REAL DEFAULT 100,
            updated_at TEXT,
            FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
        )
    """)
    wallet_cols = [col["name"] for col in cursor.execute("PRAGMA table_info(wallets)").fetchall()]
    if "updated_at" not in wallet_cols:
        cursor.execute("ALTER TABLE wallets ADD COLUMN updated_at TEXT")

    # 5. PRODUCTS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            shopkeeper_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock_status TEXT DEFAULT 'IN_STOCK',
            active INTEGER DEFAULT 1,
            created_at TEXT,
            FOREIGN KEY(shopkeeper_id) REFERENCES shopkeepers(shopkeeper_id) ON DELETE CASCADE
        )
    """)

    # 6. TRANSACTIONS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            shopkeeper_id TEXT,
            transaction_type TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            total_amount REAL,
            description TEXT,
            payment_reference TEXT,
            wallet_before REAL,
            wallet_after REAL,
            transaction_date TEXT,
            status TEXT DEFAULT 'SUCCESS',
            created_at TEXT,
            FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE,
            FOREIGN KEY(shopkeeper_id) REFERENCES shopkeepers(shopkeeper_id)
        )
    """)
    txn_cols = [col["name"] for col in cursor.execute("PRAGMA table_info(transactions)").fetchall()]
    if "shopkeeper_id" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN shopkeeper_id TEXT")
    if "total_amount" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN total_amount REAL")
    if "payment_reference" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN payment_reference TEXT")
    if "wallet_before" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN wallet_before REAL")
    if "wallet_after" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN wallet_after REAL")
    if "created_at" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN created_at TEXT")
    if "transaction_date" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN transaction_date TEXT")
    if "idempotency_key" not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN idempotency_key TEXT")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL")

    # 7. TRANSACTION_ITEMS TABLE (Preserves price & product snapshot)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transaction_items (
            transaction_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name_snapshot TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            line_total REAL NOT NULL,
            FOREIGN KEY(transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(product_id)
        )
    """)

    # 8. PAYMENT_ORDERS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payment_orders (
            order_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'INR',
            status TEXT DEFAULT 'PENDING',
            provider TEXT DEFAULT 'SANDBOX_TEST',
            signature TEXT,
            created_at TEXT,
            verified_at TEXT,
            FOREIGN KEY(student_id) REFERENCES students(student_id)
        )
    """)

    # 9. SETTINGS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    connection.commit()
    connection.close()

    # Seed core demonstration and default data
    seed_initial_data()


# =====================================================
# SEED INITIAL DEMO DATA
# =====================================================

def seed_initial_data():
    connection = get_db_connection()
    cursor = connection.cursor()
    now_str = datetime.now().isoformat(timespec="seconds")

    # 1. ADMIN SEED
    admin = cursor.execute("SELECT * FROM admins WHERE username = 'admin01'").fetchone()
    if admin is None:
        cursor.execute("""
            INSERT INTO admins (admin_id, username, name, email, password_hash, role, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "admin01",
            "admin01",
            "System Administrator",
            "admin@campus.edu",
            hash_password_if_needed("admin123"),
            "admin",
            "ACTIVE",
            now_str
        ))

    # 2. STUDENTS SEED
    # Demo Student 1: 23ECE001 (Requested primary demo student, Initial Balance: ₹850)
    student1 = cursor.execute("SELECT * FROM students WHERE student_id = '23ECE001'").fetchone()
    if student1 is None:
        cursor.execute("""
            INSERT INTO students (
                student_id, name, department, academic_year, email, password, password_hash,
                barcode, barcode_or_qr_value, role, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "23ECE001",
            "Iswarya",
            "Electronics & Communication Engineering",
            "2025-2029",
            "iswarya@campus.edu",
            "123456",
            hash_password_if_needed("123456"),
            "23ECE001",
            "23ECE001",
            "student",
            "ACTIVE",
            now_str
        ))
        cursor.execute("""
            INSERT OR REPLACE INTO wallets (student_id, balance, low_balance_limit, updated_at)
            VALUES (?, ?, ?, ?)
        """, ("23ECE001", 850.0, 100.0, now_str))

    # Demo Student 2: 25EC060 (Preserved for compatibility)
    student2 = cursor.execute("SELECT * FROM students WHERE student_id = '25EC060'").fetchone()
    if student2 is None:
        cursor.execute("""
            INSERT INTO students (
                student_id, name, department, academic_year, email, password, password_hash,
                barcode, barcode_or_qr_value, role, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "25EC060",
            "Kavitha Raman",
            "Electronics & Communication Engineering",
            "2025-2029",
            "kavitha@campus.edu",
            "123456",
            hash_password_if_needed("123456"),
            "25EC060",
            "25EC060",
            "student",
            "ACTIVE",
            now_str
        ))
        cursor.execute("""
            INSERT OR REPLACE INTO wallets (student_id, balance, low_balance_limit, updated_at)
            VALUES (?, ?, ?, ?)
        """, ("25EC060", 450.0, 100.0, now_str))

    # Sync barcode & barcode_or_qr_value for any existing records
    cursor.execute("""
        UPDATE students
        SET barcode_or_qr_value = COALESCE(barcode_or_qr_value, barcode, student_id),
            barcode = COALESCE(barcode, barcode_or_qr_value, student_id)
        WHERE barcode_or_qr_value IS NULL OR barcode IS NULL
    """)

    # 3. SHOPKEEPERS SEED
    shopkeepers_data = [
        ("shop01", "Ramesh Kumar", "Campus General Store", "General Store", "shop01@campus.edu", "123456"),
        ("shop02", "Suresh Patel", "Campus Canteen", "Canteen", "shop02@campus.edu", "123456"),
        ("shop03", "Anita Sharma", "Campus Printing", "Printing", "shop03@campus.edu", "123456"),
        ("shop04", "Murugan Store", "Campus Stationery", "Stationery", "shop04@campus.edu", "123456")
    ]

    for sid, sname, sshop, scat, semail, spass in shopkeepers_data:
        existing = cursor.execute("SELECT * FROM shopkeepers WHERE shopkeeper_id = ?", (sid,)).fetchone()
        if existing is None:
            cursor.execute("""
                INSERT INTO shopkeepers (shopkeeper_id, name, shop_name, category, email, password_hash, role, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (sid, sname, sshop, scat, semail, hash_password_if_needed(spass), "shopkeeper", "ACTIVE", now_str))

    # 4. PRODUCTS SEED
    products_data = [
        # General Store (shop01)
        ("shop01", "Soap", "General Store", 40.0, "IN_STOCK"),
        ("shop01", "Shampoo", "General Store", 120.0, "IN_STOCK"),
        ("shop01", "Pen", "Stationery", 10.0, "IN_STOCK"),
        ("shop01", "Pencil", "Stationery", 5.0, "IN_STOCK"),
        ("shop01", "Notebook", "Stationery", 50.0, "IN_STOCK"),
        ("shop01", "Toothpaste", "General Store", 35.0, "IN_STOCK"),
        ("shop01", "Water Bottle", "General Store", 20.0, "IN_STOCK"),

        # Canteen (shop02)
        ("shop02", "Tea", "Canteen", 15.0, "IN_STOCK"),
        ("shop02", "Coffee", "Canteen", 20.0, "IN_STOCK"),
        ("shop02", "Sandwich", "Canteen", 50.0, "IN_STOCK"),
        ("shop02", "Snacks", "Canteen", 30.0, "IN_STOCK"),
        ("shop02", "Fruit Juice", "Canteen", 40.0, "IN_STOCK"),

        # Printing (shop03)
        ("shop03", "Black & White Print", "Printing", 2.0, "IN_STOCK"),
        ("shop03", "Color Print", "Printing", 10.0, "IN_STOCK"),
        ("shop03", "Photocopy", "Printing", 1.0, "IN_STOCK"),
        ("shop03", "Spiral Binding", "Printing", 30.0, "IN_STOCK"),

        # Stationery (shop04)
        ("shop04", "Geometry Box", "Stationery", 85.0, "IN_STOCK"),
        ("shop04", "Eraser", "Stationery", 5.0, "IN_STOCK"),
        ("shop04", "Scale (Ruler)", "Stationery", 15.0, "IN_STOCK"),
        ("shop04", "Highlighter", "Stationery", 25.0, "IN_STOCK")
    ]

    for sid, pname, pcat, pprice, pstock in products_data:
        existing_p = cursor.execute("""
            SELECT * FROM products WHERE shopkeeper_id = ? AND product_name = ?
        """, (sid, pname)).fetchone()
        if existing_p is None:
            cursor.execute("""
                INSERT INTO products (shopkeeper_id, product_name, category, price, stock_status, active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
            """, (sid, pname, pcat, pprice, pstock, now_str))

    # 5. DEFAULT SETTINGS
    settings_data = [
        ("college_name", "Smart College of Engineering"),
        ("currency_symbol", "₹"),
        ("default_low_balance", "100"),
        ("payment_mode", "SANDBOX_TEST")
    ]
    for k, v in settings_data:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    connection.commit()
    connection.close()


# =====================================================
# AUTHENTICATION HELPERS
# =====================================================

def authenticate_user(login_id: str, password: str, expected_role: str = None):
    """
    Authenticates across Admins, Students, or Shopkeepers.
    Returns user dict with 'role' if valid, else None.
    """
    login_id = login_id.strip()
    connection = get_db_connection()

    # 1. Try Admin (username or email or admin_id)
    if expected_role in (None, "admin"):
        admin = connection.execute("""
            SELECT admin_id, username, name, email, password_hash, role, status
            FROM admins
            WHERE (username = ? OR email = ? OR admin_id = ?) AND status = 'ACTIVE'
        """, (login_id, login_id, login_id)).fetchone()
        if admin and verify_password(admin["password_hash"], password):
            connection.close()
            return {
                "user_id": admin["admin_id"],
                "username": admin["username"],
                "name": admin["name"],
                "email": admin["email"],
                "role": "admin",
                "status": admin["status"]
            }

    # 2. Try Shopkeeper (shopkeeper_id or email)
    if expected_role in (None, "shopkeeper"):
        shopkeeper = connection.execute("""
            SELECT shopkeeper_id, name, shop_name, category, email, password_hash, role, status
            FROM shopkeepers
            WHERE (shopkeeper_id = ? OR email = ?) AND status = 'ACTIVE'
        """, (login_id, login_id)).fetchone()
        if shopkeeper and verify_password(shopkeeper["password_hash"], password):
            connection.close()
            return {
                "user_id": shopkeeper["shopkeeper_id"],
                "name": shopkeeper["name"],
                "shop_name": shopkeeper["shop_name"],
                "category": shopkeeper["category"],
                "email": shopkeeper["email"],
                "role": "shopkeeper",
                "status": shopkeeper["status"]
            }

    # 3. Try Student (student_id or email or barcode)
    if expected_role in (None, "student"):
        clean_id = login_id.upper()
        student = connection.execute("""
            SELECT student_id, name, department, academic_year, email, password, password_hash,
                   barcode_or_qr_value, role, status
            FROM students
            WHERE (student_id = ? OR email = ? OR barcode = ? OR barcode_or_qr_value = ?)
        """, (clean_id, login_id, clean_id, clean_id)).fetchone()

        if student:
            if student["status"] != "ACTIVE":
                connection.close()
                return {"error": "Your account is currently inactive."}
            # Check password against password_hash or legacy password
            hash_to_check = student["password_hash"] or student["password"]
            if verify_password(hash_to_check, password):
                connection.close()
                return {
                    "user_id": student["student_id"],
                    "student_id": student["student_id"],
                    "name": student["name"],
                    "department": student["department"],
                    "academic_year": student["academic_year"],
                    "email": student["email"],
                    "role": "student",
                    "barcode": student["barcode_or_qr_value"] or student["student_id"],
                    "status": student["status"]
                }

    connection.close()
    return None


# =====================================================
# ATOMIC SHOPKEEPER PURCHASE
# =====================================================

def atomic_shopkeeper_purchase(shopkeeper_id: str, student_id: str, items: list, idempotency_key: str = None):
    """
    Executes a purchase atomically inside a SQLite transaction:
    1. Validates active shopkeeper
    2. Validates active student
    3. Fetches fresh product prices from DB
    4. Calculates backend total
    5. Validates wallet balance
    6. Deducts balance
    7. Creates transaction record with wallet_before and wallet_after
    8. Inserts transaction_items with snapshot of product name and unit price
    9. Returns full receipt
    """
    if not items or len(items) == 0:
        return {"success": False, "message": "No items selected for purchase"}

    student_id = student_id.strip().upper()
    shopkeeper_id = shopkeeper_id.strip()
    idempotency_key = (idempotency_key.strip() if idempotency_key else None)

    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        # Start immediate transaction for strict serialization
        cursor.execute("BEGIN IMMEDIATE")

        # 0. Check duplicate purchase via idempotency key
        if idempotency_key:
            existing = cursor.execute("""
                SELECT transaction_id, wallet_before, wallet_after, total_amount, created_at
                FROM transactions
                WHERE (idempotency_key = ? OR payment_reference = ?) AND status = 'SUCCESS'
            """, (idempotency_key, idempotency_key)).fetchone()
            if existing:
                connection.rollback()
                connection.close()
                return {
                    "success": False,
                    "duplicate_prevented": True,
                    "message": "Duplicate purchase prevented. This transaction has already been processed.",
                    "transaction_id": existing["transaction_id"],
                    "display_txn_id": f"TXN{10000 + existing['transaction_id']}",
                    "total_amount": float(existing["total_amount"] or 0),
                    "previous_balance": float(existing["wallet_before"] or 0),
                    "remaining_balance": float(existing["wallet_after"] or 0)
                }

        # 1. Validate shopkeeper
        shop = cursor.execute("""
            SELECT shopkeeper_id, name, shop_name, category, status
            FROM shopkeepers
            WHERE shopkeeper_id = ?
        """, (shopkeeper_id,)).fetchone()

        if not shop or shop["status"] != "ACTIVE":
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Shopkeeper account is inactive or not found"}

        # 2. Validate student
        student = cursor.execute("""
            SELECT student_id, name, department, academic_year, status
            FROM students
            WHERE student_id = ?
        """, (student_id,)).fetchone()

        if not student:
            connection.rollback()
            connection.close()
            return {"success": False, "message": f"Student ID '{student_id}' not found"}

        if student["status"] != "ACTIVE":
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Student account is currently inactive"}

        # 3. Fetch current prices & calculate backend total
        prepared_items = []
        calculated_total = 0.0

        for item in items:
            pid = item.get("product_id")
            qty = int(item.get("quantity", 0))
            if qty <= 0:
                continue

            product = cursor.execute("""
                SELECT product_id, product_name, price, stock_status, active
                FROM products
                WHERE product_id = ? AND shopkeeper_id = ?
            """, (pid, shopkeeper_id)).fetchone()

            if not product or product["active"] != 1:
                connection.rollback()
                connection.close()
                return {"success": False, "message": f"Product ID {pid} is unavailable or does not belong to this shop"}

            unit_price = float(product["price"])
            line_total = round(unit_price * qty, 2)
            calculated_total = round(calculated_total + line_total, 2)

            prepared_items.append({
                "product_id": product["product_id"],
                "product_name": product["product_name"],
                "quantity": qty,
                "unit_price": unit_price,
                "line_total": line_total
            })

        if not prepared_items or calculated_total <= 0:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Invalid item selection or zero total amount"}

        # 4. Fetch current wallet balance
        wallet = cursor.execute("""
            SELECT balance
            FROM wallets
            WHERE student_id = ?
        """, (student_id,)).fetchone()

        if not wallet:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Student wallet not found"}

        current_balance = round(float(wallet["balance"]), 2)

        # 5. Check sufficient balance
        if current_balance < calculated_total:
            connection.rollback()
            connection.close()
            return {
                "success": False,
                "message": f"Insufficient wallet balance. Required: ₹{calculated_total:.2f}, Available: ₹{current_balance:.2f}",
                "insufficient_balance": True,
                "available_balance": current_balance,
                "required_amount": calculated_total
            }

        # 6. Deduct wallet
        new_balance = round(current_balance - calculated_total, 2)
        now_str = datetime.now().isoformat(timespec="seconds")

        cursor.execute("""
            UPDATE wallets
            SET balance = ?, updated_at = ?
            WHERE student_id = ?
        """, (new_balance, now_str, student_id))

        # 7. Create transaction record
        description = f"Purchase at {shop['shop_name']} ({len(prepared_items)} items)"
        ref = idempotency_key if idempotency_key else f"POS_{int(datetime.now().timestamp())}"
        cursor.execute("""
            INSERT INTO transactions (
                student_id, shopkeeper_id, transaction_type, category, amount, total_amount,
                description, payment_reference, wallet_before, wallet_after, transaction_date, status, created_at, idempotency_key
            )
            VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?)
        """, (
            student_id,
            shopkeeper_id,
            shop["category"],
            calculated_total,
            calculated_total,
            description,
            ref,
            current_balance,
            new_balance,
            now_str,
            now_str,
            idempotency_key
        ))

        transaction_id = cursor.lastrowid

        # 8. Create transaction_items snapshots
        for p in prepared_items:
            cursor.execute("""
                INSERT INTO transaction_items (
                    transaction_id, product_id, product_name_snapshot, quantity, unit_price, line_total
                )
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                transaction_id,
                p["product_id"],
                p["product_name"],
                p["quantity"],
                p["unit_price"],
                p["line_total"]
            ))

        # Commit transaction
        connection.commit()
        connection.close()

        return {
            "success": True,
            "message": "Purchase completed successfully",
            "transaction_id": transaction_id,
            "display_txn_id": f"TXN{10000 + transaction_id}",
            "student_id": student_id,
            "student_name": student["name"],
            "shop_name": shop["shop_name"],
            "items": prepared_items,
            "total_amount": calculated_total,
            "previous_balance": current_balance,
            "remaining_balance": new_balance,
            "created_at": now_str
        }

    except Exception as e:
        connection.rollback()
        connection.close()
        return {"success": False, "message": f"Purchase transaction failed: {str(e)}"}


# =====================================================
# ATOMIC WALLET TOP-UP
# =====================================================

def atomic_wallet_topup(student_id: str, amount: float, payment_reference: str = None):
    """
    Credits wallet after payment provider authorization/verification.
    Prevents duplicate payment execution by checking payment_reference.
    """
    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than zero"}

    student_id = student_id.strip().upper()
    payment_reference = (payment_reference.strip() if payment_reference else None)

    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("BEGIN IMMEDIATE")

        # Check duplicate payment reference
        if payment_reference:
            existing = cursor.execute("""
                SELECT transaction_id, wallet_before, wallet_after, amount
                FROM transactions
                WHERE payment_reference = ? AND transaction_type = 'WALLET_TOPUP' AND status = 'SUCCESS'
            """, (payment_reference,)).fetchone()
            if existing:
                connection.rollback()
                connection.close()
                return {
                    "success": False,
                    "duplicate_prevented": True,
                    "message": f"Duplicate payment rejected: reference '{payment_reference}' has already been credited.",
                    "transaction_id": existing["transaction_id"],
                    "display_txn_id": f"TXN{10000 + existing['transaction_id']}",
                    "amount": float(existing["amount"] or 0)
                }

        student = cursor.execute("SELECT student_id, name, status FROM students WHERE student_id = ?", (student_id,)).fetchone()
        if not student:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Student not found"}

        wallet = cursor.execute("SELECT balance FROM wallets WHERE student_id = ?", (student_id,)).fetchone()
        if not wallet:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Wallet not found"}

        current_balance = round(float(wallet["balance"]), 2)
        new_balance = round(current_balance + amount, 2)
        now_str = datetime.now().isoformat(timespec="seconds")

        cursor.execute("""
            UPDATE wallets
            SET balance = ?, updated_at = ?
            WHERE student_id = ?
        """, (new_balance, now_str, student_id))

        cursor.execute("""
            INSERT INTO transactions (
                student_id, shopkeeper_id, transaction_type, category, amount, total_amount,
                description, payment_reference, wallet_before, wallet_after, transaction_date, status, created_at
            )
            VALUES (?, NULL, 'WALLET_TOPUP', 'WALLET_RECHARGE', ?, ?, 'Wallet Top-up via Payment Gateway', ?, ?, ?, ?, 'SUCCESS', ?)
        """, (
            student_id,
            amount,
            amount,
            payment_reference,
            current_balance,
            new_balance,
            now_str,
            now_str
        ))

        transaction_id = cursor.lastrowid
        connection.commit()
        connection.close()

        return {
            "success": True,
            "message": "Wallet top-up successful",
            "transaction_id": transaction_id,
            "display_txn_id": f"TXN{10000 + transaction_id}",
            "previous_balance": current_balance,
            "new_balance": new_balance,
            "amount": amount,
            "payment_reference": payment_reference,
            "created_at": now_str
        }

    except Exception as e:
        connection.rollback()
        connection.close()
        return {"success": False, "message": f"Wallet top-up failed: {str(e)}"}


# =====================================================
# ATOMIC STUDENT DIRECT SCAN & PAY
# =====================================================

def atomic_student_pay(student_id: str, amount: float, category: str, description: str):
    """
    Self-payment initiated by a student (e.g. at a canteen counter).
    """
    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than zero"}

    student_id = student_id.strip().upper()
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("BEGIN IMMEDIATE")

        student = cursor.execute("SELECT student_id, name, status FROM students WHERE student_id = ?", (student_id,)).fetchone()
        if not student:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Student not found"}

        wallet = cursor.execute("SELECT balance FROM wallets WHERE student_id = ?", (student_id,)).fetchone()
        if not wallet:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Wallet not found"}

        current_balance = round(float(wallet["balance"]), 2)
        if current_balance < amount:
            connection.rollback()
            connection.close()
            return {"success": False, "message": "Insufficient wallet balance"}

        new_balance = round(current_balance - amount, 2)
        now_str = datetime.now().isoformat(timespec="seconds")

        cursor.execute("""
            UPDATE wallets
            SET balance = ?, updated_at = ?
            WHERE student_id = ?
        """, (new_balance, now_str, student_id))

        if not description:
            description = f"Payment for {category}"

        cursor.execute("""
            INSERT INTO transactions (
                student_id, shopkeeper_id, transaction_type, category, amount, total_amount,
                description, payment_reference, wallet_before, wallet_after, transaction_date, status, created_at
            )
            VALUES (?, NULL, 'DEBIT', ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
        """, (
            student_id,
            category,
            amount,
            amount,
            description,
            f"SELF_{int(datetime.now().timestamp())}",
            current_balance,
            new_balance,
            now_str,
            now_str
        ))

        transaction_id = cursor.lastrowid
        connection.commit()
        connection.close()

        return {
            "success": True,
            "message": "Payment successful",
            "transaction_id": transaction_id,
            "display_txn_id": f"TXN{10000 + transaction_id}",
            "balance": new_balance,
            "previous_balance": current_balance,
            "amount": amount,
            "category": category,
            "description": description,
            "created_at": now_str
        }

    except Exception as e:
        connection.rollback()
        connection.close()
        return {"success": False, "message": f"Payment failed: {str(e)}"}


# =====================================================
# QUERY HELPERS - STUDENT
# =====================================================

def get_student(student_id: str):
    connection = get_db_connection()
    student = connection.execute("""
        SELECT student_id, name, department, academic_year, email, barcode, barcode_or_qr_value, role, status, created_at
        FROM students
        WHERE student_id = ?
    """, (student_id.strip().upper(),)).fetchone()
    connection.close()
    return dict(student) if student else None


def get_student_by_barcode(barcode: str):
    connection = get_db_connection()
    barcode = barcode.strip().upper()
    student = connection.execute("""
        SELECT student_id, name, department, academic_year, email, barcode, barcode_or_qr_value, role, status
        FROM students
        WHERE barcode = ? OR barcode_or_qr_value = ? OR student_id = ?
    """, (barcode, barcode, barcode)).fetchone()
    connection.close()
    return dict(student) if student else None


def get_student_wallet(student_id: str):
    connection = get_db_connection()
    wallet = connection.execute("""
        SELECT balance, low_balance_limit, updated_at
        FROM wallets
        WHERE student_id = ?
    """, (student_id.strip().upper(),)).fetchone()
    connection.close()
    return dict(wallet) if wallet else None


def get_student_transactions(student_id: str):
    connection = get_db_connection()
    rows = connection.execute("""
        SELECT t.transaction_id, t.student_id, t.shopkeeper_id, t.transaction_type,
               t.category, COALESCE(t.total_amount, t.amount) as amount,
               t.description, t.payment_reference, t.wallet_before, t.wallet_after,
               t.transaction_date, t.status, t.created_at,
               s.shop_name
        FROM transactions t
        LEFT JOIN shopkeepers s ON t.shopkeeper_id = s.shopkeeper_id
        WHERE t.student_id = ?
        ORDER BY t.transaction_id DESC
    """, (student_id.strip().upper(),)).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def create_student_if_not_exists(student_id: str, barcode: str = None):
    student_id = student_id.strip().upper()
    connection = get_db_connection()
    cursor = connection.cursor()

    existing = cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,)).fetchone()
    if existing is None:
        department_codes = {
            "AD": "Artificial Intelligence & Data Science",
            "AI": "Artificial Intelligence",
            "ME": "Mechanical Engineering",
            "EC": "Electronics & Communication Engineering",
            "CS": "Computer Science Engineering",
            "IT": "Information Technology",
            "EE": "Electrical & Electronics Engineering",
            "CE": "Civil Engineering"
        }
        code = student_id[2:4] if len(student_id) >= 4 else "GEN"
        dept = department_codes.get(code, "General Department")
        bar = barcode or student_id
        now_str = datetime.now().isoformat(timespec="seconds")

        cursor.execute("""
            INSERT INTO students (
                student_id, name, department, academic_year, email, password, password_hash,
                barcode, barcode_or_qr_value, role, status, created_at
            )
            VALUES (?, ?, ?, ?, NULL, '123456', ?, ?, ?, 'student', 'ACTIVE', ?)
        """, (
            student_id,
            f"Student {student_id}",
            dept,
            "2025-2029",
            hash_password_if_needed("123456"),
            bar,
            bar,
            now_str
        ))

        cursor.execute("""
            INSERT INTO wallets (student_id, balance, low_balance_limit, updated_at)
            VALUES (?, 0.0, 100.0, ?)
        """, (student_id, now_str))

        connection.commit()

    connection.close()


def change_student_password(student_id: str, current_password: str, new_password: str):
    connection = get_db_connection()
    cursor = connection.cursor()

    student = cursor.execute("SELECT password, password_hash FROM students WHERE student_id = ?", (student_id,)).fetchone()
    if not student:
        connection.close()
        return {"success": False, "message": "Student not found"}

    hash_to_check = student["password_hash"] or student["password"]
    if not verify_password(hash_to_check, current_password):
        connection.close()
        return {"success": False, "message": "Current password is incorrect"}

    new_hash = generate_password_hash(new_password)
    cursor.execute("""
        UPDATE students
        SET password = ?, password_hash = ?
        WHERE student_id = ?
    """, (new_password, new_hash, student_id))

    connection.commit()
    connection.close()
    return {"success": True, "message": "Password changed successfully"}


# =====================================================
# QUERY HELPERS - SHOPKEEPER
# =====================================================

def get_shopkeeper(shopkeeper_id: str):
    connection = get_db_connection()
    row = connection.execute("""
        SELECT shopkeeper_id, name, shop_name, category, email, role, status, created_at
        FROM shopkeepers
        WHERE shopkeeper_id = ?
    """, (shopkeeper_id,)).fetchone()
    connection.close()
    return dict(row) if row else None


def get_shopkeeper_products(shopkeeper_id: str):
    connection = get_db_connection()
    rows = connection.execute("""
        SELECT product_id, shopkeeper_id, product_name, category, price, stock_status, active
        FROM products
        WHERE shopkeeper_id = ? AND active = 1
        ORDER BY product_name ASC
    """, (shopkeeper_id,)).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_shopkeeper_sales(shopkeeper_id: str):
    connection = get_db_connection()
    rows = connection.execute("""
        SELECT t.transaction_id, t.student_id, s.name as student_name,
               t.total_amount, t.amount, t.created_at, t.transaction_date, t.status,
               GROUP_CONCAT(ti.product_name_snapshot || ' × ' || ti.quantity, ', ') as products_summary
        FROM transactions t
        JOIN students s ON t.student_id = s.student_id
        LEFT JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
        WHERE t.shopkeeper_id = ?
        GROUP BY t.transaction_id
        ORDER BY t.transaction_id DESC
    """, (shopkeeper_id,)).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_shopkeeper_dashboard_stats(shopkeeper_id: str):
    connection = get_db_connection()
    today_prefix = datetime.now().strftime("%Y-%m-%d")

    # Today's sales & count
    row_today = connection.execute("""
        SELECT COUNT(transaction_id) as txn_count,
               COALESCE(SUM(COALESCE(total_amount, amount)), 0) as total_sales
        FROM transactions
        WHERE shopkeeper_id = ? AND status = 'SUCCESS' AND created_at LIKE ?
    """, (shopkeeper_id, f"{today_prefix}%")).fetchone()

    # Lifetime sales
    row_all = connection.execute("""
        SELECT COUNT(transaction_id) as txn_count,
               COALESCE(SUM(COALESCE(total_amount, amount)), 0) as total_sales
        FROM transactions
        WHERE shopkeeper_id = ? AND status = 'SUCCESS'
    """, (shopkeeper_id,)).fetchone()

    connection.close()
    return {
        "today_sales": float(row_today["total_sales"]) if row_today else 0.0,
        "today_transactions": int(row_today["txn_count"]) if row_today else 0,
        "total_amount_collected": float(row_all["total_sales"]) if row_all else 0.0,
        "total_transactions": int(row_all["txn_count"]) if row_all else 0
    }


# =====================================================
# QUERY HELPERS - ADMIN
# =====================================================

def get_admin_dashboard_stats():
    connection = get_db_connection()
    today_prefix = datetime.now().strftime("%Y-%m-%d")

    total_students = connection.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    total_shopkeepers = connection.execute("SELECT COUNT(*) FROM shopkeepers").fetchone()[0]
    total_products = connection.execute("SELECT COUNT(*) FROM products WHERE active = 1").fetchone()[0]
    total_balance = connection.execute("SELECT COALESCE(SUM(balance), 0) FROM wallets").fetchone()[0]

    # Today's transactions and sales
    row_today = connection.execute("""
        SELECT COUNT(transaction_id) as txns,
               COALESCE(SUM(CASE WHEN transaction_type = 'PURCHASE' THEN COALESCE(total_amount, amount) ELSE 0 END), 0) as sales
        FROM transactions
        WHERE created_at LIKE ? AND status = 'SUCCESS'
    """, (f"{today_prefix}%",)).fetchone()

    # Recent 10 transactions
    recent_txns = connection.execute("""
        SELECT t.transaction_id, t.student_id, s.name as student_name,
               t.shopkeeper_id, sh.shop_name, t.transaction_type,
               COALESCE(t.total_amount, t.amount) as amount,
               t.status, t.created_at
        FROM transactions t
        LEFT JOIN students s ON t.student_id = s.student_id
        LEFT JOIN shopkeepers sh ON t.shopkeeper_id = sh.shopkeeper_id
        ORDER BY t.transaction_id DESC
        LIMIT 10
    """, ()).fetchall()

    connection.close()
    return {
        "total_students": total_students,
        "total_shopkeepers": total_shopkeepers,
        "total_products": total_products,
        "total_wallet_balance": round(float(total_balance), 2),
        "today_transactions": int(row_today["txns"]) if row_today else 0,
        "today_sales_amount": round(float(row_today["sales"]), 2) if row_today else 0.0,
        "recent_transactions": [dict(r) for r in recent_txns]
    }


def get_all_students_admin(search=None, status=None):
    connection = get_db_connection()
    query = """
        SELECT s.student_id, s.name, s.department, s.academic_year, s.email,
               s.barcode_or_qr_value, s.role, s.status, s.created_at,
               COALESCE(w.balance, 0) as balance, COALESCE(w.low_balance_limit, 100) as low_balance_limit
        FROM students s
        LEFT JOIN wallets w ON s.student_id = w.student_id
        WHERE 1=1
    """
    params = []
    if search:
        query += " AND (s.student_id LIKE ? OR s.name LIKE ? OR s.department LIKE ? OR s.email LIKE ?)"
        s_param = f"%{search.strip()}%"
        params.extend([s_param, s_param, s_param, s_param])
    if status and status != "ALL":
        query += " AND s.status = ?"
        params.append(status)

    query += " ORDER BY s.student_id ASC"
    rows = connection.execute(query, params).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_all_shopkeepers_admin():
    connection = get_db_connection()
    rows = connection.execute("""
        SELECT sh.shopkeeper_id, sh.name, sh.shop_name, sh.category, sh.email, sh.role, sh.status, sh.created_at,
               COUNT(DISTINCT p.product_id) as total_products,
               COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN COALESCE(t.total_amount, t.amount) ELSE 0 END), 0) as total_sales
        FROM shopkeepers sh
        LEFT JOIN products p ON sh.shopkeeper_id = p.shopkeeper_id AND p.active = 1
        LEFT JOIN transactions t ON sh.shopkeeper_id = t.shopkeeper_id
        GROUP BY sh.shopkeeper_id
        ORDER BY sh.shopkeeper_id ASC
    """).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_all_products_admin():
    connection = get_db_connection()
    rows = connection.execute("""
        SELECT p.product_id, p.shopkeeper_id, sh.shop_name, p.product_name, p.category,
               p.price, p.stock_status, p.active, p.created_at
        FROM products p
        JOIN shopkeepers sh ON p.shopkeeper_id = sh.shopkeeper_id
        ORDER BY sh.shop_name ASC, p.product_name ASC
    """).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_all_transactions_admin(student_id=None, shopkeeper_id=None, txn_type=None, status=None, date_filter=None):
    connection = get_db_connection()
    query = """
        SELECT t.transaction_id, t.student_id, s.name as student_name,
               t.shopkeeper_id, sh.shop_name, t.transaction_type, t.category,
               COALESCE(t.total_amount, t.amount) as amount,
               t.description, t.payment_reference, t.wallet_before, t.wallet_after,
               t.status, t.created_at,
               GROUP_CONCAT(ti.product_name_snapshot || ' × ' || ti.quantity, ', ') as products_snapshot
        FROM transactions t
        LEFT JOIN students s ON t.student_id = s.student_id
        LEFT JOIN shopkeepers sh ON t.shopkeeper_id = sh.shopkeeper_id
        LEFT JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
        WHERE 1=1
    """
    params = []
    if student_id:
        query += " AND t.student_id = ?"
        params.append(student_id.strip().upper())
    if shopkeeper_id and shopkeeper_id != "ALL":
        query += " AND t.shopkeeper_id = ?"
        params.append(shopkeeper_id)
    if txn_type and txn_type != "ALL":
        query += " AND t.transaction_type = ?"
        params.append(txn_type)
    if status and status != "ALL":
        query += " AND t.status = ?"
        params.append(status)
    if date_filter:
        query += " AND t.created_at LIKE ?"
        params.append(f"{date_filter}%")

    query += " GROUP BY t.transaction_id ORDER BY t.transaction_id DESC"
    rows = connection.execute(query, params).fetchall()
    connection.close()
    return [dict(r) for r in rows]


def get_transaction_details(transaction_id: int):
    connection = get_db_connection()
    txn = connection.execute("""
        SELECT t.transaction_id, t.student_id, s.name as student_name, s.department, s.academic_year,
               t.shopkeeper_id, sh.shop_name, sh.name as shopkeeper_name,
               t.transaction_type, t.category, COALESCE(t.total_amount, t.amount) as amount,
               t.description, t.payment_reference, t.wallet_before, t.wallet_after,
               t.transaction_date, t.status, t.created_at
        FROM transactions t
        LEFT JOIN students s ON t.student_id = s.student_id
        LEFT JOIN shopkeepers sh ON t.shopkeeper_id = sh.shopkeeper_id
        WHERE t.transaction_id = ?
    """, (transaction_id,)).fetchone()

    if not txn:
        connection.close()
        return None

    items = connection.execute("""
        SELECT transaction_item_id, product_id, product_name_snapshot, quantity, unit_price, line_total
        FROM transaction_items
        WHERE transaction_id = ?
    """, (transaction_id,)).fetchall()

    connection.close()
    res = dict(txn)
    res["items"] = [dict(it) for it in items]
    return res


def get_admin_reports():
    connection = get_db_connection()

    # 1. Total top-up vs total purchase
    stats = connection.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'WALLET_TOPUP' AND status = 'SUCCESS' THEN COALESCE(total_amount, amount) ELSE 0 END), 0) as total_topups,
            COALESCE(SUM(CASE WHEN transaction_type = 'PURCHASE' AND status = 'SUCCESS' THEN COALESCE(total_amount, amount) ELSE 0 END), 0) as total_purchases,
            COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as total_success_transactions
        FROM transactions
    """).fetchone()

    # 2. Top selling products
    top_products = connection.execute("""
        SELECT ti.product_name_snapshot as product_name,
               SUM(ti.quantity) as total_quantity,
               SUM(ti.line_total) as total_revenue
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.transaction_id
        WHERE t.status = 'SUCCESS'
        GROUP BY ti.product_name_snapshot
        ORDER BY total_quantity DESC
        LIMIT 6
    """).fetchall()

    # 3. Top performing shops
    top_shops = connection.execute("""
        SELECT sh.shop_name,
               COUNT(t.transaction_id) as transaction_count,
               COALESCE(SUM(COALESCE(t.total_amount, t.amount)), 0) as total_revenue
        FROM shopkeepers sh
        LEFT JOIN transactions t ON sh.shopkeeper_id = t.shopkeeper_id AND t.status = 'SUCCESS'
        GROUP BY sh.shopkeeper_id
        ORDER BY total_revenue DESC
    """).fetchall()

    # 4. Daily sales (last 7 days)
    daily_sales = connection.execute("""
        SELECT SUBSTR(created_at, 1, 10) as sale_date,
               COUNT(transaction_id) as txn_count,
               COALESCE(SUM(COALESCE(total_amount, amount)), 0) as total_amount
        FROM transactions
        WHERE transaction_type = 'PURCHASE' AND status = 'SUCCESS'
        GROUP BY sale_date
        ORDER BY sale_date DESC
        LIMIT 7
    """).fetchall()

    connection.close()
    return {
        "total_topups": float(stats["total_topups"]),
        "total_purchases": float(stats["total_purchases"]),
        "total_transactions": int(stats["total_success_transactions"]),
        "top_products": [dict(r) for r in top_products],
        "top_shops": [dict(r) for r in top_shops],
        "daily_sales": [dict(r) for r in daily_sales]
    }