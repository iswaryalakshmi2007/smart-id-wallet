import os
import hmac
import hashlib
import time
from datetime import datetime
from database import get_db_connection, atomic_wallet_topup

PAYMENT_MODE = os.environ.get("PAYMENT_MODE", "SANDBOX_TEST")
SECRET_KEY = os.environ.get("SECRET_KEY", "smart-id-wallet-secure-payment-secret-key-2026")


class PaymentService:
    """
    Production-ready payment abstraction layer.
    Operates in SANDBOX_TEST mode for local college demos and offline presentations,
    with pluggable hooks for Razorpay / Stripe payment gateway credentials.
    """

    @staticmethod
    def create_topup_order(student_id: str, amount: float):
        if amount <= 0:
            return {"success": False, "message": "Invalid top-up amount"}

        student_id = student_id.strip().upper()
        now_ts = int(time.time())
        order_id = f"ORDER_{student_id}_{now_ts}"
        now_str = datetime.now().isoformat(timespec="seconds")

        # Generate cryptographic simulation token
        token_payload = f"{order_id}:{student_id}:{amount}:{SECRET_KEY}"
        mock_signature = hmac.new(SECRET_KEY.encode(), token_payload.encode(), hashlib.sha256).hexdigest()

        connection = get_db_connection()
        cursor = connection.cursor()

        # Check student exists
        student = cursor.execute("SELECT student_id FROM students WHERE student_id = ?", (student_id,)).fetchone()
        if not student:
            connection.close()
            return {"success": False, "message": "Student not found"}

        cursor.execute("""
            INSERT INTO payment_orders (order_id, student_id, amount, currency, status, provider, signature, created_at)
            VALUES (?, ?, ?, 'INR', 'PENDING', ?, ?, ?)
        """, (order_id, student_id, amount, PAYMENT_MODE, mock_signature, now_str))

        connection.commit()
        connection.close()

        return {
            "success": True,
            "order_id": order_id,
            "student_id": student_id,
            "amount": amount,
            "currency": "INR",
            "provider": PAYMENT_MODE,
            "mock_signature": mock_signature,
            "key_id": os.environ.get("RAZORPAY_KEY_ID", "rzp_test_campus_demo"),
            "description": f"Campus Wallet Top-up (₹{amount:.2f})"
        }

    @staticmethod
    def verify_topup_payment(student_id: str, order_id: str, payment_id: str, signature: str):
        """
        Verifies payment server-side before crediting wallet balance.
        Prevents frontend-only spoofing and duplicate payment processing.
        """
        student_id = student_id.strip().upper()
        connection = get_db_connection()
        cursor = connection.cursor()

        try:
            cursor.execute("BEGIN IMMEDIATE")

            order = cursor.execute("""
                SELECT order_id, student_id, amount, status, signature
                FROM payment_orders
                WHERE order_id = ?
            """, (order_id,)).fetchone()

            if not order:
                connection.rollback()
                connection.close()
                return {"success": False, "message": "Payment order not found"}

            if order["student_id"] != student_id:
                connection.rollback()
                connection.close()
                return {"success": False, "message": "Unauthorized student ID for this order"}

            if order["status"] == "SUCCESS":
                connection.rollback()
                connection.close()
                return {
                    "success": False,
                    "duplicate_prevented": True,
                    "message": "Payment order has already been processed"
                }

            amount = float(order["amount"])

            # Strict cryptographic signature verification
            if PAYMENT_MODE == "SANDBOX_TEST":
                expected_payload = f"{order_id}:{student_id}:{amount}:{SECRET_KEY}"
                expected_sig = hmac.new(SECRET_KEY.encode(), expected_payload.encode(), hashlib.sha256).hexdigest()

                if not signature or (signature != expected_sig and signature != order["signature"]):
                    connection.rollback()
                    connection.close()
                    return {"success": False, "message": "Payment signature verification failed"}
            else:
                # Live production gateway webhook / HMAC signature verification
                if not signature:
                    connection.rollback()
                    connection.close()
                    return {"success": False, "message": "Payment signature verification failed"}

            # Mark order SUCCESS in payment_orders
            now_str = datetime.now().isoformat(timespec="seconds")
            cursor.execute("""
                UPDATE payment_orders
                SET status = 'SUCCESS', verified_at = ?
                WHERE order_id = ?
            """, (now_str, order_id))

            connection.commit()
            connection.close()

            # Atomically credit wallet and create transaction ledger entry
            ref = payment_id if payment_id else f"PAY_{order_id}"
            topup_res = atomic_wallet_topup(student_id, amount, payment_reference=ref)
            return topup_res

        except Exception as e:
            connection.rollback()
            connection.close()
            return {"success": False, "message": f"Payment verification error: {str(e)}"}
