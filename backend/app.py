from flask import Flask, request, jsonify
from datetime import datetime
from flask_cors import CORS

from database import (
    initialize_database,
    get_db_connection,
    create_student_if_not_exists,
    change_student_password
)

import re


# =====================================================
# FLASK APP
# =====================================================

app = Flask(__name__)

CORS(app)


# =====================================================
# DATABASE INITIALIZATION
# =====================================================

initialize_database()


# =====================================================
# ENSURE BARCODE COLUMN EXISTS
# =====================================================

def ensure_barcode_column():

    connection = get_db_connection()

    cursor = connection.cursor()

    columns = cursor.execute(
        "PRAGMA table_info(students)"
    ).fetchall()

    column_names = [
        column["name"]
        for column in columns
    ]

    if "barcode" not in column_names:

        cursor.execute("""
            ALTER TABLE students
            ADD COLUMN barcode TEXT UNIQUE
        """)

        connection.commit()

        print("Barcode column added successfully.")


    connection.close()


# Run barcode column check
ensure_barcode_column()


# =====================================================
# HOME
# =====================================================

@app.route("/")
def home():

    return jsonify({

        "message":
            "Smart ID Wallet Backend is running!",

        "status":
            "SUCCESS"

    })


# =====================================================
# LOGIN
# =====================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def login():

    data = request.get_json() or {}

    student_id = (
        data.get("studentId", "")
        .strip()
        .upper()
    )

    password = (
        data.get("password", "")
        .strip()
    )


    if not student_id or not password:

        return jsonify({

            "success": False,

            "message":
                "Student ID and password required"

        }), 400


    # ================================================
    # STUDENT ID FORMAT
    # ================================================

    pattern = r"^\d{2}[A-Z]{2}\d{3,}$"

    if not re.match(
        pattern,
        student_id
    ):

        return jsonify({

            "success": False,

            "message":
                "Invalid Student ID format"

        }), 400


    # ================================================
    # CREATE STUDENT IF NEW
    # ================================================

    create_student_if_not_exists(
        student_id
    )


    connection = get_db_connection()


    student = connection.execute(
        """
        SELECT *
        FROM students
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    connection.close()


    if student is None:

        return jsonify({

            "success": False,

            "message":
                "Student not found"

        }), 404


    # ================================================
    # PASSWORD CHECK
    # ================================================

    if password != student["password"]:

        return jsonify({

            "success": False,

            "message":
                "Invalid password"

        }), 401


    return jsonify({

        "success": True,

        "message":
            "Login successful",

        "studentId":
            student["student_id"]

    })


# =====================================================
# STUDENT DETAILS
# =====================================================

@app.route(
    "/api/student/<student_id>",
    methods=["GET"]
)
def get_student(student_id):

    connection = get_db_connection()


    student = connection.execute(
        """
        SELECT
            student_id,
            name,
            department,
            academic_year,
            email,
            barcode
        FROM students
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    connection.close()


    if student is None:

        return jsonify({

            "message":
                "Student not found"

        }), 404


    return jsonify(
        dict(student)
    )


# =====================================================
# SCAN BARCODE - FIND STUDENT
# =====================================================

@app.route(
    "/api/student/barcode/<path:barcode>",
    methods=["GET"]
)
def get_student_by_barcode(barcode):

    # ================================================
    # CLEAN BARCODE
    # ================================================

    barcode = (
        barcode
        .strip()
        .upper()
    )


    if not barcode:

        return jsonify({

            "success": False,

            "message":
                "Barcode is required"

        }), 400


    connection = get_db_connection()


    # ================================================
    # SEARCH BY BARCODE
    # ================================================

    student = connection.execute(
        """
        SELECT
            student_id,
            name,
            department,
            academic_year,
            email,
            barcode
        FROM students
        WHERE barcode = ?
        """,
        (barcode,)
    ).fetchone()


    # ================================================
    # FALLBACK:
    # BARCODE MAY CONTAIN STUDENT ID
    # ================================================

    if student is None:

        student = connection.execute(
            """
            SELECT
                student_id,
                name,
                department,
                academic_year,
                email,
                barcode
            FROM students
            WHERE student_id = ?
            """,
            (barcode,)
        ).fetchone()


    connection.close()


    # ================================================
    # STUDENT NOT FOUND
    # ================================================

    if student is None:

        return jsonify({

            "success": False,

            "message":
                "Student not found for this barcode"

        }), 404


    # ================================================
    # RETURN STUDENT DETAILS
    # ================================================

    student_data = dict(student)


    # If barcode is empty in database,
    # show scanned barcode
    if not student_data.get("barcode"):

        student_data["barcode"] = barcode


    return jsonify({

        "success": True,

        "message":
            "Student found successfully",

        "student":
            student_data

    })


# =====================================================
# UPDATE STUDENT PROFILE
# =====================================================

@app.route(
    "/api/student/update",
    methods=["PUT"]
)
def update_student():

    data = request.get_json() or {}


    old_student_id = (
        data.get(
            "oldStudentId",
            ""
        )
        .strip()
        .upper()
    )


    new_student_id = (
        data.get(
            "studentId",
            ""
        )
        .strip()
        .upper()
    )


    name = (
        data.get(
            "name",
            ""
        )
        .strip()
    )


    department = (
        data.get(
            "department",
            ""
        )
        .strip()
    )


    academic_year = (
        data.get(
            "academicYear",
            ""
        )
        .strip()
    )


    email = (
        data.get(
            "email",
            ""
        )
        .strip()
    )


    # ================================================
    # VALIDATION
    # ================================================

    if not old_student_id:

        return jsonify({

            "success": False,

            "message":
                "Old student ID required"

        }), 400


    if not new_student_id:

        return jsonify({

            "success": False,

            "message":
                "Student ID required"

        }), 400


    if not name:

        return jsonify({

            "success": False,

            "message":
                "Student name required"

        }), 400


    if not department:

        return jsonify({

            "success": False,

            "message":
                "Department required"

        }), 400


    if not academic_year:

        return jsonify({

            "success": False,

            "message":
                "Academic year required"

        }), 400


    # ================================================
    # STUDENT ID FORMAT
    # ================================================

    pattern = r"^\d{2}[A-Z]{2}\d{3,}$"


    if not re.match(
        pattern,
        new_student_id
    ):

        return jsonify({

            "success": False,

            "message":
                "Invalid Student ID format"

        }), 400


    connection = get_db_connection()


    try:

        # ============================================
        # CHECK CURRENT STUDENT
        # ============================================

        student = connection.execute(
            """
            SELECT *
            FROM students
            WHERE student_id = ?
            """,
            (old_student_id,)
        ).fetchone()


        if student is None:

            connection.close()

            return jsonify({

                "success": False,

                "message":
                    "Student not found"

            }), 404


        # ============================================
        # STUDENT ID CHANGED
        # ============================================

        if old_student_id != new_student_id:

            existing = connection.execute(
                """
                SELECT student_id
                FROM students
                WHERE student_id = ?
                """,
                (new_student_id,)
            ).fetchone()


            if existing is not None:

                connection.close()

                return jsonify({

                    "success": False,

                    "message":
                        "Student ID already exists"

                }), 409


            # ----------------------------------------
            # GET WALLET
            # ----------------------------------------

            wallet = connection.execute(
                """
                SELECT
                    balance,
                    low_balance_limit
                FROM wallets
                WHERE student_id = ?
                """,
                (old_student_id,)
            ).fetchone()


            # ----------------------------------------
            # GET PASSWORD
            # ----------------------------------------

            password = student["password"]


            # ----------------------------------------
            # GET BARCODE
            # ----------------------------------------

            barcode = student["barcode"]


            # ----------------------------------------
            # DELETE OLD WALLET
            # ----------------------------------------

            connection.execute(
                """
                DELETE FROM wallets
                WHERE student_id = ?
                """,
                (old_student_id,)
            )


            # ----------------------------------------
            # UPDATE STUDENT
            # ----------------------------------------

            connection.execute(
                """
                UPDATE students
                SET
                    student_id = ?,
                    name = ?,
                    department = ?,
                    academic_year = ?,
                    email = ?,
                    password = ?,
                    barcode = ?
                WHERE student_id = ?
                """,
                (
                    new_student_id,
                    name,
                    department,
                    academic_year,
                    email,
                    password,
                    barcode,
                    old_student_id
                )
            )


            # ----------------------------------------
            # RECREATE WALLET
            # ----------------------------------------

            balance = (
                wallet["balance"]
                if wallet
                else 0
            )


            low_limit = (
                wallet["low_balance_limit"]
                if wallet
                else 100
            )


            connection.execute(
                """
                INSERT INTO wallets
                (
                    student_id,
                    balance,
                    low_balance_limit
                )
                VALUES (?, ?, ?)
                """,
                (
                    new_student_id,
                    balance,
                    low_limit
                )
            )


            # ----------------------------------------
            # UPDATE TRANSACTIONS
            # ----------------------------------------

            connection.execute(
                """
                UPDATE transactions
                SET student_id = ?
                WHERE student_id = ?
                """,
                (
                    new_student_id,
                    old_student_id
                )
            )


        else:

            # ========================================
            # ONLY UPDATE PROFILE DETAILS
            # ========================================

            connection.execute(
                """
                UPDATE students
                SET
                    name = ?,
                    department = ?,
                    academic_year = ?,
                    email = ?
                WHERE student_id = ?
                """,
                (
                    name,
                    department,
                    academic_year,
                    email,
                    old_student_id
                )
            )


        connection.commit()


    except Exception as error:

        connection.rollback()

        print(
            "Profile update error:",
            error
        )

        connection.close()

        return jsonify({

            "success": False,

            "message":
                "Unable to update profile"

        }), 500


    connection.close()


    return jsonify({

        "success": True,

        "message":
            "Profile updated successfully",

        "studentId":
            new_student_id,

        "name":
            name,

        "department":
            department,

        "academicYear":
            academic_year,

        "email":
            email

    })


# =====================================================
# CHANGE PASSWORD
# =====================================================

@app.route(
    "/api/student/change-password",
    methods=["PUT"]
)
def change_password():

    data = request.get_json() or {}


    student_id = (
        data.get(
            "studentId",
            ""
        )
        .strip()
        .upper()
    )


    current_password = (
        data.get(
            "currentPassword",
            ""
        )
        .strip()
    )


    new_password = (
        data.get(
            "newPassword",
            ""
        )
        .strip()
    )


    confirm_password = (
        data.get(
            "confirmPassword",
            ""
        )
        .strip()
    )


    if not student_id:

        return jsonify({

            "success": False,

            "message":
                "Student ID required"

        }), 400


    if not current_password:

        return jsonify({

            "success": False,

            "message":
                "Current password is required"

        }), 400


    if not new_password:

        return jsonify({

            "success": False,

            "message":
                "New password is required"

        }), 400


    if len(new_password) < 6:

        return jsonify({

            "success": False,

            "message":
                "New password must be at least 6 characters"

        }), 400


    if not confirm_password:

        return jsonify({

            "success": False,

            "message":
                "Please confirm your new password"

        }), 400


    if new_password != confirm_password:

        return jsonify({

            "success": False,

            "message":
                "New passwords do not match"

        }), 400


    if current_password == new_password:

        return jsonify({

            "success": False,

            "message":
                "New password must be different from current password"

        }), 400


    result = change_student_password(

        student_id,

        current_password,

        new_password

    )


    if not result["success"]:

        return jsonify(result), 401


    return jsonify({

        "success": True,

        "message":
            "Password changed successfully"

    })


# =====================================================
# WALLET BALANCE
# =====================================================

@app.route(
    "/api/wallet/<student_id>",
    methods=["GET"]
)
def get_wallet(student_id):

    connection = get_db_connection()


    wallet = connection.execute(
        """
        SELECT
            balance,
            low_balance_limit
        FROM wallets
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    connection.close()


    if wallet is None:

        return jsonify({

            "message":
                "Wallet not found"

        }), 404


    return jsonify(
        dict(wallet)
    )


# =====================================================
# ADD MONEY
# =====================================================

@app.route(
    "/api/wallet/add-money",
    methods=["POST"]
)
def add_money():

    data = request.get_json() or {}


    student_id = (
        data.get(
            "studentId",
            ""
        )
        .strip()
        .upper()
    )


    amount = data.get("amount")


    try:

        amount = float(amount)

    except:

        return jsonify({

            "success": False,

            "message":
                "Invalid amount"

        }), 400


    if amount <= 0:

        return jsonify({

            "success": False,

            "message":
                "Amount must be greater than zero"

        }), 400


    connection = get_db_connection()


    wallet = connection.execute(
        """
        SELECT balance
        FROM wallets
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    if wallet is None:

        connection.close()

        return jsonify({

            "success": False,

            "message":
                "Wallet not found"

        }), 404


    current_balance = float(
        wallet["balance"]
    )


    new_balance = (
        current_balance + amount
    )


    connection.execute(
        """
        UPDATE wallets
        SET balance = ?
        WHERE student_id = ?
        """,
        (
            new_balance,
            student_id
        )
    )


    created_at = datetime.now().isoformat(
        timespec="seconds"
    )


    connection.execute(
        """
        INSERT INTO transactions
        (
            student_id,
            transaction_type,
            category,
            amount,
            description,
            transaction_date,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            student_id,
            "CREDIT",
            "WALLET_RECHARGE",
            amount,
            "Wallet Recharge",
            created_at,
            "SUCCESS",
            created_at
        )
    )


    connection.commit()

    connection.close()


    return jsonify({

        "success": True,

        "message":
            "Money added successfully",

        "balance":
            new_balance

    })


# =====================================================
# SCAN & PAY
# =====================================================

@app.route(
    "/api/wallet/pay",
    methods=["POST"]
)
def pay():

    data = request.get_json() or {}


    student_id = (
        data.get(
            "studentId",
            ""
        )
        .strip()
        .upper()
    )


    amount = data.get("amount")


    category = (
        data.get(
            "category",
            ""
        )
        .strip()
    )


    description = (
        data.get(
            "description",
            ""
        )
        .strip()
    )


    try:

        amount = float(amount)

    except:

        return jsonify({

            "success": False,

            "message":
                "Invalid amount"

        }), 400


    if amount <= 0:

        return jsonify({

            "success": False,

            "message":
                "Amount must be greater than zero"

        }), 400


    allowed_categories = [

        "Canteen",
        "Stationery",
        "Printing",
        "Other"

    ]


    if category not in allowed_categories:

        return jsonify({

            "success": False,

            "message":
                "Please select a valid category"

        }), 400


    if description == "":

        description = category


    connection = get_db_connection()


    wallet = connection.execute(
        """
        SELECT balance
        FROM wallets
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    if wallet is None:

        connection.close()

        return jsonify({

            "success": False,

            "message":
                "Wallet not found"

        }), 404


    current_balance = float(
        wallet["balance"]
    )


    if amount > current_balance:

        connection.close()

        return jsonify({

            "success": False,

            "message":
                "Insufficient balance"

        }), 400


    new_balance = (
        current_balance - amount
    )


    connection.execute(
        """
        UPDATE wallets
        SET balance = ?
        WHERE student_id = ?
        """,
        (
            new_balance,
            student_id
        )
    )


    created_at = datetime.now().isoformat(
        timespec="seconds"
    )


    connection.execute(
        """
        INSERT INTO transactions
        (
            student_id,
            transaction_type,
            category,
            amount,
            description,
            transaction_date,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            student_id,
            "DEBIT",
            category,
            amount,
            description,
            created_at,
            "SUCCESS",
            created_at
        )
    )


    connection.commit()

    connection.close()


    return jsonify({

        "success": True,

        "message":
            "Payment successful",

        "balance":
            new_balance,

        "category":
            category,

        "description":
            description,

        "created_at":
            created_at

    })


# =====================================================
# TRANSACTION HISTORY
# =====================================================

@app.route(
    "/api/transactions/<student_id>",
    methods=["GET"]
)
def transactions(student_id):

    connection = get_db_connection()


    rows = connection.execute(
        """
        SELECT
            transaction_id,
            student_id,
            transaction_type,
            category,
            amount,
            description,
            transaction_date,
            status,
            created_at
        FROM transactions
        WHERE student_id = ?
        ORDER BY transaction_id DESC
        """,
        (student_id,)
    ).fetchall()


    connection.close()


    return jsonify([

        dict(row)

        for row in rows

    ])


# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":

    app.run(

        host="0.0.0.0",

        port=5000,

        debug=True

    )