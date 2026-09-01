import sqlite3
from pathlib import Path


# =====================================================
# DATABASE LOCATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

DATABASE = BASE_DIR / "wallet.db"


# =====================================================
# DATABASE CONNECTION
# =====================================================

def get_db_connection():

    connection = sqlite3.connect(DATABASE)

    connection.row_factory = sqlite3.Row

    # Enable foreign key support
    connection.execute(
        "PRAGMA foreign_keys = ON"
    )

    return connection


# =====================================================
# INITIALIZE DATABASE
# =====================================================

def initialize_database():

    connection = get_db_connection()

    cursor = connection.cursor()


    # =================================================
    # STUDENTS TABLE
    # =================================================

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (

            student_id TEXT PRIMARY KEY,

            name TEXT NOT NULL,

            department TEXT NOT NULL,

            academic_year TEXT NOT NULL,

            email TEXT,

            password TEXT NOT NULL,

            barcode TEXT UNIQUE

        )
    """)


    # =================================================
    # CHECK EXISTING STUDENTS COLUMNS
    # =================================================

    student_columns = cursor.execute(
        "PRAGMA table_info(students)"
    ).fetchall()


    student_column_names = [

        column["name"]

        for column in student_columns

    ]


    # =================================================
    # ADD BARCODE IF OLD DATABASE DOES NOT HAVE IT
    # =================================================

    if "barcode" not in student_column_names:

        cursor.execute("""
            ALTER TABLE students
            ADD COLUMN barcode TEXT
        """)


    # =================================================
    # WALLET TABLE
    # =================================================

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wallets (

            wallet_id INTEGER PRIMARY KEY AUTOINCREMENT,

            student_id TEXT UNIQUE NOT NULL,

            balance REAL DEFAULT 0,

            low_balance_limit REAL DEFAULT 100,

            FOREIGN KEY(student_id)
            REFERENCES students(student_id)

            ON DELETE CASCADE

        )
    """)


    # =================================================
    # TRANSACTIONS TABLE
    # =================================================

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (

            transaction_id
            INTEGER PRIMARY KEY AUTOINCREMENT,

            student_id
            TEXT NOT NULL,

            transaction_type
            TEXT NOT NULL,

            category
            TEXT NOT NULL,

            amount
            REAL NOT NULL,

            description
            TEXT,

            transaction_date
            TEXT,

            status
            TEXT DEFAULT 'SUCCESS',

            created_at
            TEXT,

            FOREIGN KEY(student_id)
            REFERENCES students(student_id)

            ON DELETE CASCADE

        )
    """)


    # =================================================
    # CHECK TRANSACTION COLUMNS
    # =================================================

    transaction_columns = cursor.execute(
        "PRAGMA table_info(transactions)"
    ).fetchall()


    transaction_column_names = [

        column["name"]

        for column in transaction_columns

    ]


    # =================================================
    # ADD created_at IF MISSING
    # =================================================

    if "created_at" not in transaction_column_names:

        cursor.execute("""
            ALTER TABLE transactions
            ADD COLUMN created_at TEXT
        """)


    # =================================================
    # ADD transaction_date IF MISSING
    # =================================================

    if "transaction_date" not in transaction_column_names:

        cursor.execute("""
            ALTER TABLE transactions
            ADD COLUMN transaction_date TEXT
        """)


    # =================================================
    # COMMIT
    # =================================================

    connection.commit()

    connection.close()


# =====================================================
# CREATE STUDENT AUTOMATICALLY
# =====================================================

def create_student_if_not_exists(
    student_id,
    barcode=None
):

    connection = get_db_connection()

    cursor = connection.cursor()


    # =================================================
    # CLEAN STUDENT ID
    # =================================================

    student_id = (
        student_id
        .strip()
        .upper()
    )


    # =================================================
    # CLEAN BARCODE
    # =================================================

    if barcode:

        barcode = (
            barcode
            .strip()
            .upper()
        )


    # =================================================
    # CHECK STUDENT
    # =================================================

    student = cursor.execute(
        """
        SELECT *
        FROM students
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    # =================================================
    # CREATE NEW STUDENT
    # =================================================

    if student is None:

        # =============================================
        # DEPARTMENT CODES
        # =============================================

        department_codes = {

            "AD":
                "Artificial Intelligence & Data Science",

            "AI":
                "Artificial Intelligence",

            "ME":
                "Mechanical Engineering",

            "EC":
                "Electronics & Communication Engineering",

            "CS":
                "Computer Science Engineering",

            "IT":
                "Information Technology",

            "EE":
                "Electrical & Electronics Engineering",

            "CE":
                "Civil Engineering"

        }


        # =============================================
        # GET DEPARTMENT CODE
        # =============================================

        code = student_id[2:4]


        department = department_codes.get(
            code,
            "General Department"
        )


        # =============================================
        # DEFAULT BARCODE
        # =============================================

        if not barcode:

            barcode = student_id


        # =============================================
        # CHECK BARCODE ALREADY EXISTS
        # =============================================

        barcode_exists = cursor.execute(
            """
            SELECT student_id
            FROM students
            WHERE barcode = ?
            """,
            (barcode,)
        ).fetchone()


        if barcode_exists is not None:

            # Use Student ID as fallback barcode
            barcode = student_id


        # =============================================
        # CREATE STUDENT
        # =============================================

        cursor.execute(
            """
            INSERT INTO students
            (
                student_id,
                name,
                department,
                academic_year,
                email,
                password,
                barcode
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (

                student_id,

                "Student " + student_id,

                department,

                "2025-2029",

                None,

                "123456",

                barcode

            )
        )


        # =============================================
        # CREATE WALLET
        # =============================================

        cursor.execute(
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

                student_id,

                0,

                100

            )
        )


        connection.commit()


    # =================================================
    # EXISTING STUDENT
    # =================================================

    else:

        # =============================================
        # BARCODE PROVIDED
        # =============================================

        if barcode:

            existing_barcode = cursor.execute(
                """
                SELECT student_id
                FROM students
                WHERE barcode = ?
                AND student_id != ?
                """,
                (
                    barcode,
                    student_id
                )
            ).fetchone()


            # =========================================
            # BARCODE AVAILABLE
            # =========================================

            if existing_barcode is None:

                cursor.execute(
                    """
                    UPDATE students
                    SET barcode = ?
                    WHERE student_id = ?
                    """,
                    (
                        barcode,
                        student_id
                    )
                )

                connection.commit()


        # =============================================
        # NO BARCODE IN EXISTING RECORD
        # =============================================

        else:

            current_barcode = student["barcode"]


            if not current_barcode:

                cursor.execute(
                    """
                    UPDATE students
                    SET barcode = ?
                    WHERE student_id = ?
                    """,
                    (
                        student_id,
                        student_id
                    )
                )

                connection.commit()


    # =================================================
    # CLOSE
    # =================================================

    connection.close()


# =====================================================
# GET STUDENT BY BARCODE
# =====================================================

def get_student_by_barcode(barcode):

    connection = get_db_connection()


    # =================================================
    # CLEAN BARCODE
    # =================================================

    barcode = (
        barcode
        .strip()
        .upper()
    )


    # =================================================
    # SEARCH BY BARCODE
    # =================================================

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


    # =================================================
    # FALLBACK
    # =================================================
    # Some college ID cards encode Student ID
    # directly inside the barcode.
    #
    # Example:
    # 25BEADME096
    #
    # So if barcode column doesn't match,
    # try student_id.
    # =================================================

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


    # =================================================
    # STUDENT NOT FOUND
    # =================================================

    if student is None:

        return None


    # =================================================
    # RETURN STUDENT DETAILS
    # =================================================

    return dict(student)


# =====================================================
# GET STUDENT BY STUDENT ID
# =====================================================

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

        return None


    return dict(student)


# =====================================================
# UPDATE STUDENT NAME
# =====================================================

def update_student_name(
    student_id,
    name
):

    connection = get_db_connection()

    cursor = connection.cursor()


    # =================================================
    # CLEAN NAME
    # =================================================

    name = name.strip()


    # =================================================
    # VALIDATE
    # =================================================

    if not name:

        connection.close()

        return False


    # =================================================
    # UPDATE
    # =================================================

    cursor.execute(
        """
        UPDATE students
        SET name = ?
        WHERE student_id = ?
        """,
        (
            name,
            student_id
        )
    )


    updated = cursor.rowcount > 0


    # =================================================
    # SAVE
    # =================================================

    connection.commit()

    connection.close()


    return updated


# =====================================================
# UPDATE STUDENT EMAIL
# =====================================================

def update_student_email(
    student_id,
    email
):

    connection = get_db_connection()

    cursor = connection.cursor()


    email = email.strip()


    cursor.execute(
        """
        UPDATE students
        SET email = ?
        WHERE student_id = ?
        """,
        (
            email,
            student_id
        )
    )


    updated = cursor.rowcount > 0


    connection.commit()

    connection.close()


    return updated


# =====================================================
# UPDATE STUDENT BARCODE
# =====================================================

def update_student_barcode(
    student_id,
    barcode
):

    connection = get_db_connection()

    cursor = connection.cursor()


    # =================================================
    # CLEAN BARCODE
    # =================================================

    barcode = (
        barcode
        .strip()
        .upper()
    )


    # =================================================
    # VALIDATE
    # =================================================

    if not barcode:

        connection.close()

        return {
            "success": False,
            "message": "Barcode is required"
        }


    # =================================================
    # CHECK DUPLICATE BARCODE
    # =================================================

    existing = cursor.execute(
        """
        SELECT student_id
        FROM students
        WHERE barcode = ?
        AND student_id != ?
        """,
        (
            barcode,
            student_id
        )
    ).fetchone()


    if existing is not None:

        connection.close()

        return {
            "success": False,
            "message":
                "Barcode already belongs to another student"
        }


    # =================================================
    # UPDATE BARCODE
    # =================================================

    cursor.execute(
        """
        UPDATE students
        SET barcode = ?
        WHERE student_id = ?
        """,
        (
            barcode,
            student_id
        )
    )


    updated = cursor.rowcount > 0


    # =================================================
    # SAVE
    # =================================================

    connection.commit()

    connection.close()


    if not updated:

        return {
            "success": False,
            "message": "Student not found"
        }


    return {
        "success": True,
        "message":
            "Barcode updated successfully"
    }


# =====================================================
# CHANGE STUDENT PASSWORD
# =====================================================

def change_student_password(
    student_id,
    current_password,
    new_password
):

    connection = get_db_connection()

    cursor = connection.cursor()


    # =================================================
    # GET CURRENT PASSWORD
    # =================================================

    student = cursor.execute(
        """
        SELECT password
        FROM students
        WHERE student_id = ?
        """,
        (student_id,)
    ).fetchone()


    # =================================================
    # STUDENT NOT FOUND
    # =================================================

    if student is None:

        connection.close()

        return {

            "success": False,

            "message":
                "Student not found"

        }


    # =================================================
    # CHECK CURRENT PASSWORD
    # =================================================

    if current_password != student["password"]:

        connection.close()

        return {

            "success": False,

            "message":
                "Current password is incorrect"

        }


    # =================================================
    # UPDATE PASSWORD
    # =================================================

    cursor.execute(
        """
        UPDATE students
        SET password = ?
        WHERE student_id = ?
        """,
        (
            new_password,
            student_id
        )
    )


    # =================================================
    # SAVE
    # =================================================

    connection.commit()

    connection.close()


    return {

        "success": True,

        "message":
            "Password changed successfully"

    }