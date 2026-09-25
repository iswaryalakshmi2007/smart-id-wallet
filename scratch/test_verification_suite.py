import os
import sys
import json
import sqlite3

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, backend_dir)

from database import (
    initialize_database,
    get_db_connection,
    get_student,
    get_student_wallet,
    get_shopkeeper_products,
    atomic_shopkeeper_purchase,
    get_transaction_details,
    get_shopkeeper_sales,
    get_shopkeeper_dashboard_stats,
    get_admin_dashboard_stats,
    get_admin_reports,
    get_all_transactions_admin,
    atomic_wallet_topup
)
from payment_service import PaymentService
from app import app

test_results = {
    "passed": [],
    "failed": []
}

def record_pass(test_name, detail=""):
    print(f"[PASS] {test_name}" + (f": {detail}" if detail else ""))
    test_results["passed"].append(test_name)

def record_fail(test_name, err):
    print(f"[FAIL] {test_name}: {err}")
    test_results["failed"].append((test_name, str(err)))

def run_suite():
    print("=" * 70)
    print("SMART ID WALLET - AUTOMATED VERIFICATION SUITE")
    print("=" * 70)

    # 1. Initialize Database
    initialize_database()
    conn = get_db_connection()

    # Pre-condition: Set Student 23ECE001 balance to ₹850.0
    conn.execute("UPDATE wallets SET balance = 850.0 WHERE student_id = '23ECE001'")
    conn.commit()
    conn.close()

    init_wallet = get_student_wallet("23ECE001")
    assert init_wallet["balance"] == 850.0, f"Setup failed: expected 850, got {init_wallet['balance']}"
    print(f">> Initial Wallet State verified: 23ECE001 has ₹{init_wallet['balance']:.2f}")

    # Fetch product IDs for shop01
    products = get_shopkeeper_products("shop01")
    p_map = {p["product_name"]: p for p in products}

    req_products = ["Soap", "Shampoo", "Pen", "Pencil"]
    for rp in req_products:
        assert rp in p_map, f"Required product '{rp}' not found in shop01"

    soap = p_map["Soap"]
    shampoo = p_map["Shampoo"]
    pen = p_map["Pen"]
    pencil = p_map["Pencil"]

    print(f">> Product Prices: Soap=₹{soap['price']}, Shampoo=₹{shampoo['price']}, Pen=₹{pen['price']}, Pencil=₹{pencil['price']}")
    assert soap["price"] == 40.0, f"Soap expected 40.0, got {soap['price']}"
    assert shampoo["price"] == 120.0, f"Shampoo expected 120.0, got {shampoo['price']}"
    assert pen["price"] == 10.0, f"Pen expected 10.0, got {pen['price']}"
    assert pencil["price"] == 5.0, f"Pencil expected 5.0, got {pencil['price']}"

    # Capture initial stats before purchase
    init_stats_shop = get_shopkeeper_dashboard_stats("shop01")
    init_stats_admin = get_admin_dashboard_stats()
    init_reports_admin = get_admin_reports()

    # Setup the exact purchase cart:
    # Soap x 1 = 40, Shampoo x 1 = 120, Pen x 2 = 20, Pencil x 2 = 10 -> Total = ₹190
    cart = [
        {"product_id": soap["product_id"], "quantity": 1},
        {"product_id": shampoo["product_id"], "quantity": 1},
        {"product_id": pen["product_id"], "quantity": 2},
        {"product_id": pencil["product_id"], "quantity": 2},
    ]

    import time
    run_id = int(time.time() * 1000)
    purchase_idemp_key = f"IDEMP_EXACT_TEST_{run_id}"

    # EXECUTE PURCHASE
    print(f"\n--- Executing Purchase: ₹190 (Soap x1, Shampoo x1, Pen x2, Pencil x2) [Key: {purchase_idemp_key}] ---")
    purchase_res = atomic_shopkeeper_purchase(
        shopkeeper_id="shop01",
        student_id="23ECE001",
        items=cart,
        idempotency_key=purchase_idemp_key
    )

    try:
        assert purchase_res["success"] is True, f"Purchase failed: {purchase_res}"
        assert purchase_res["total_amount"] == 190.0, f"Expected total 190, got {purchase_res['total_amount']}"
        assert purchase_res["previous_balance"] == 850.0, f"Expected wallet_before 850, got {purchase_res['previous_balance']}"
        assert purchase_res["remaining_balance"] == 660.0, f"Expected wallet_after 660, got {purchase_res['remaining_balance']}"
        record_pass("Purchase Execution & Balance Math", f"₹850 - ₹190 = ₹660 (Txn ID: {purchase_res['transaction_id']})")
    except Exception as e:
        record_fail("Purchase Execution & Balance Math", e)

    txn_id = purchase_res["transaction_id"]

    # -------------------------------------------------------------
    # VERIFICATION 1: Student balance is ₹660
    # -------------------------------------------------------------
    try:
        w = get_student_wallet("23ECE001")
        assert w["balance"] == 660.0, f"Database wallet balance is {w['balance']}, expected 660.0"

        # Also verify via Flask API test client
        with app.test_client() as client:
            api_res = client.get("/api/wallet/23ECE001")
            assert api_res.status_code == 200
            api_data = api_res.get_json()
            assert float(api_data["balance"]) == 660.0, f"API balance is {api_data['balance']}, expected 660.0"

        record_pass("1. Student balance is ₹660", f"Verified via DB and /api/wallet/23ECE001 (Balance: ₹{w['balance']})")
    except Exception as e:
        record_fail("1. Student balance is ₹660", e)

    # -------------------------------------------------------------
    # VERIFICATION 2: One transaction is created
    # -------------------------------------------------------------
    try:
        conn = get_db_connection()
        txn_row = conn.execute("SELECT * FROM transactions WHERE transaction_id = ?", (txn_id,)).fetchone()
        conn.close()

        assert txn_row is not None, f"Transaction {txn_id} not found in database"
        assert txn_row["student_id"] == "23ECE001"
        assert txn_row["shopkeeper_id"] == "shop01"
        assert txn_row["transaction_type"] == "PURCHASE"
        assert txn_row["amount"] == 190.0
        assert txn_row["total_amount"] == 190.0
        assert txn_row["wallet_before"] == 850.0
        assert txn_row["wallet_after"] == 660.0
        assert txn_row["status"] == "SUCCESS"
        record_pass("2. One transaction is created", f"Transaction TXN{10000+txn_id} recorded with wallet_before=₹850 and wallet_after=₹660")
    except Exception as e:
        record_fail("2. One transaction is created", e)

    # -------------------------------------------------------------
    # VERIFICATION 3: Four transaction_items are created
    # -------------------------------------------------------------
    try:
        conn = get_db_connection()
        items_rows = conn.execute("SELECT * FROM transaction_items WHERE transaction_id = ?", (txn_id,)).fetchall()
        conn.close()

        assert len(items_rows) == 4, f"Expected 4 transaction_items, got {len(items_rows)}"
        record_pass("3. Four transaction_items are created", f"Found exactly {len(items_rows)} item rows for TXN{10000+txn_id}")
    except Exception as e:
        record_fail("3. Four transaction_items are created", e)

    # -------------------------------------------------------------
    # VERIFICATION 4: Product name and price snapshots are correct
    # -------------------------------------------------------------
    try:
        detail = get_transaction_details(txn_id)
        assert detail is not None, "get_transaction_details returned None"
        items_by_name = {it["product_name_snapshot"]: it for it in detail["items"]}

        assert "Soap" in items_by_name, "Soap missing in items"
        assert items_by_name["Soap"]["quantity"] == 1
        assert items_by_name["Soap"]["unit_price"] == 40.0
        assert items_by_name["Soap"]["line_total"] == 40.0

        assert "Shampoo" in items_by_name, "Shampoo missing in items"
        assert items_by_name["Shampoo"]["quantity"] == 1
        assert items_by_name["Shampoo"]["unit_price"] == 120.0
        assert items_by_name["Shampoo"]["line_total"] == 120.0

        assert "Pen" in items_by_name, "Pen missing in items"
        assert items_by_name["Pen"]["quantity"] == 2
        assert items_by_name["Pen"]["unit_price"] == 10.0
        assert items_by_name["Pen"]["line_total"] == 20.0

        assert "Pencil" in items_by_name, "Pencil missing in items"
        assert items_by_name["Pencil"]["quantity"] == 2
        assert items_by_name["Pencil"]["unit_price"] == 5.0
        assert items_by_name["Pencil"]["line_total"] == 10.0

        # Snapshot immutability test:
        # If product price in products table is modified later, transaction_items must remain unchanged!
        conn = get_db_connection()
        conn.execute("UPDATE products SET price = 99.0 WHERE product_name = 'Soap' AND shopkeeper_id = 'shop01'")
        conn.commit()
        # Verify transaction snapshot is STILL 40.0
        re_check_detail = get_transaction_details(txn_id)
        re_soap = [it for it in re_check_detail["items"] if it["product_name_snapshot"] == "Soap"][0]
        assert re_soap["unit_price"] == 40.0, f"Snapshot altered! Expected 40.0, got {re_soap['unit_price']}"
        # Restore Soap price
        conn.execute("UPDATE products SET price = 40.0 WHERE product_name = 'Soap' AND shopkeeper_id = 'shop01'")
        conn.commit()
        conn.close()

        record_pass("4. Product name and price snapshots are correct", "Soap ₹40x1, Shampoo ₹120x1, Pen ₹10x2, Pencil ₹5x2; snapshot is immutable")
    except Exception as e:
        record_fail("4. Product name and price snapshots are correct", e)

    # -------------------------------------------------------------
    # VERIFICATION 5: Shopkeeper sales history is updated
    # -------------------------------------------------------------
    try:
        sales = get_shopkeeper_sales("shop01")
        txn_in_sales = [s for s in sales if s["transaction_id"] == txn_id]
        assert len(txn_in_sales) == 1, "Transaction not found in shopkeeper sales history"
        s_record = txn_in_sales[0]
        assert s_record["student_id"] == "23ECE001"
        assert float(s_record["total_amount"]) == 190.0
        assert "Soap" in s_record["products_summary"]
        assert "Shampoo" in s_record["products_summary"]

        # Check dashboard stats
        after_stats_shop = get_shopkeeper_dashboard_stats("shop01")
        assert after_stats_shop["today_sales"] == init_stats_shop["today_sales"] + 190.0, \
            f"Expected today_sales to increase by 190, was {init_stats_shop['today_sales']} -> {after_stats_shop['today_sales']}"
        assert after_stats_shop["today_transactions"] == init_stats_shop["today_transactions"] + 1

        # Check API
        with app.test_client() as client:
            api_res = client.get("/api/shopkeeper/sales?shopkeeperId=shop01")
            assert api_res.status_code == 200
            data = api_res.get_json()
            assert any(s["transaction_id"] == txn_id for s in data["sales"])

        record_pass("5. Shopkeeper sales history is updated", f"Transaction appears in sales and today's sales increased by ₹190.0")
    except Exception as e:
        record_fail("5. Shopkeeper sales history is updated", e)

    # -------------------------------------------------------------
    # VERIFICATION 6: Admin transaction/report data is updated
    # -------------------------------------------------------------
    try:
        after_stats_admin = get_admin_dashboard_stats()
        after_reports_admin = get_admin_reports()

        # Admin dashboard stats
        assert after_stats_admin["today_sales_amount"] == init_stats_admin["today_sales_amount"] + 190.0, \
            f"Admin today_sales_amount didn't increase by 190: {init_stats_admin['today_sales_amount']} -> {after_stats_admin['today_sales_amount']}"
        assert after_stats_admin["today_transactions"] == init_stats_admin["today_transactions"] + 1

        # Admin reports
        assert after_reports_admin["total_purchases"] == init_reports_admin["total_purchases"] + 190.0, \
            f"Admin reports total_purchases didn't increase by 190: {init_reports_admin['total_purchases']} -> {after_reports_admin['total_purchases']}"

        # Check top products in reports
        prod_names = [p["product_name"] for p in after_reports_admin["top_products"]]
        assert any(p in prod_names for p in ["Soap", "Shampoo", "Pen", "Pencil"]), "Purchased items not reflected in top_products"

        # Check Admin API endpoints with Admin Auth Token
        from app import generate_auth_token
        admin_token = generate_auth_token({"user_id": "admin01", "role": "admin", "name": "System Administrator"})
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        with app.test_client() as client:
            dash_res = client.get("/api/admin/dashboard", headers=admin_headers)
            assert dash_res.status_code == 200, f"Dashboard failed with {dash_res.status_code}"
            rep_res = client.get("/api/admin/reports", headers=admin_headers)
            assert rep_res.status_code == 200, f"Reports failed with {rep_res.status_code}"
            txn_res = client.get(f"/api/admin/transactions/{txn_id}", headers=admin_headers)
            assert txn_res.status_code == 200, f"Transaction detail failed with {txn_res.status_code}"
            assert txn_res.get_json()["transaction"]["amount"] == 190.0

        record_pass("6. Admin transaction/report data is updated", "Admin dashboard, transaction lists, and revenue reports reflect ₹190 purchase")
    except Exception as e:
        record_fail("6. Admin transaction/report data is updated", e)

    # -------------------------------------------------------------
    # VERIFICATION 7: Insufficient balance is rejected
    # -------------------------------------------------------------
    try:
        # Current balance is ₹660.0. Let's attempt a purchase of 6 x Shampoo (6 * 120 = ₹720.0)
        excessive_cart = [
            {"product_id": shampoo["product_id"], "quantity": 6} # ₹720 > ₹660
        ]

        # 1. Direct function rejection
        fail_res = atomic_shopkeeper_purchase("shop01", "23ECE001", excessive_cart)
        assert fail_res["success"] is False, f"Expected purchase to fail, got {fail_res}"
        assert fail_res.get("insufficient_balance") is True, f"insufficient_balance flag missing: {fail_res}"

        # 2. API endpoint rejection
        with app.test_client() as client:
            api_res = client.post("/api/shopkeeper/purchase", json={
                "shopkeeperId": "shop01",
                "studentId": "23ECE001",
                "items": excessive_cart
            })
            assert api_res.status_code == 400, f"Expected HTTP 400, got {api_res.status_code}"
            assert api_res.get_json()["success"] is False

        # Verify wallet balance remained completely unchanged at ₹660.0
        w_check = get_student_wallet("23ECE001")
        assert w_check["balance"] == 660.0, f"Balance changed unexpectedly: {w_check['balance']}"

        record_pass("7. Insufficient balance is rejected", "Cart ₹720 rejected against balance ₹660 with HTTP 400; balance remains ₹660")
    except Exception as e:
        record_fail("7. Insufficient balance is rejected", e)

    # -------------------------------------------------------------
    # VERIFICATION 8: Duplicate payment/purchase is prevented
    # -------------------------------------------------------------
    try:
        # 8A. Duplicate Purchase Prevention (Idempotency Key)
        # We previously executed purchase with idempotency_key = "IDEMP_EXACT_TEST_DEMO_001".
        # Attempting the same purchase again MUST be rejected!
        dup_purchase_res = atomic_shopkeeper_purchase(
            shopkeeper_id="shop01",
            student_id="23ECE001",
            items=cart,
            idempotency_key=purchase_idemp_key
        )
        assert dup_purchase_res["success"] is False, f"Duplicate purchase was not rejected: {dup_purchase_res}"
        assert dup_purchase_res.get("duplicate_prevented") is True, f"duplicate_prevented flag missing: {dup_purchase_res}"

        # Verify API endpoint returns HTTP 409 Conflict for duplicate purchase
        with app.test_client() as client:
            dup_api_res = client.post("/api/shopkeeper/purchase", json={
                "shopkeeperId": "shop01",
                "studentId": "23ECE001",
                "items": cart,
                "idempotencyKey": purchase_idemp_key
            })
            assert dup_api_res.status_code == 409, f"Expected HTTP 409 for duplicate purchase, got {dup_api_res.status_code}"
            assert dup_api_res.get_json()["duplicate_prevented"] is True

        # Verify wallet balance was NOT deducted again
        w_dup_check = get_student_wallet("23ECE001")
        assert w_dup_check["balance"] == 660.0, f"Balance was deducted on duplicate! Current: {w_dup_check['balance']}"

        # 8B. Duplicate Payment / Top-up Prevention
        topup_ref = f"PAY_DUP_TEST_REF_{run_id}"
        first_topup = atomic_wallet_topup("23ECE001", 100.0, payment_reference=topup_ref)
        assert first_topup["success"] is True, f"First topup failed: {first_topup}"
        assert first_topup["new_balance"] == 760.0

        # Attempt second topup with SAME reference
        second_topup = atomic_wallet_topup("23ECE001", 100.0, payment_reference=topup_ref)
        assert second_topup["success"] is False, f"Duplicate topup was not rejected: {second_topup}"
        assert second_topup.get("duplicate_prevented") is True, f"duplicate_prevented missing on topup: {second_topup}"

        # Verify wallet balance was not credited twice (remains 760.0)
        w_topup_check = get_student_wallet("23ECE001")
        assert w_topup_check["balance"] == 760.0, f"Balance was double credited! Current: {w_topup_check['balance']}"

        # 8C. Payment Service Signature Verification & Fake Payment Prevention
        # Test: create verifiable order
        order_res = PaymentService.create_topup_order("23ECE001", 50.0)
        assert order_res["success"] is True
        order_id = order_res["order_id"]

        # Attempt fake payment with forged signature
        fake_verify = PaymentService.verify_topup_payment("23ECE001", order_id, "PAY_FAKE_1", "fake_signature_forged_hash")
        assert fake_verify["success"] is False, "Fake payment signature was accepted!"
        assert "signature verification failed" in fake_verify["message"].lower()

        # Legitimate verification
        legit_verify = PaymentService.verify_topup_payment("23ECE001", order_id, f"PAY_{order_id}", order_res["mock_signature"])
        assert legit_verify["success"] is True, f"Legitimate verification failed: {legit_verify}"
        assert legit_verify["new_balance"] == 810.0

        # Re-play verification of already SUCCESS order
        replay_verify = PaymentService.verify_topup_payment("23ECE001", order_id, f"PAY_{order_id}", order_res["mock_signature"])
        assert replay_verify["success"] is False, "Replay verification of order was accepted!"
        assert replay_verify.get("duplicate_prevented") is True

        # Reset wallet balance back to ₹660.0 to keep test state clean
        conn = get_db_connection()
        conn.execute("UPDATE wallets SET balance = 660.0 WHERE student_id = '23ECE001'")
        conn.commit()
        conn.close()

        record_pass("8. Duplicate payment/purchase is prevented", "Idempotency prevents duplicate purchase (HTTP 409), duplicate topup reference rejected, fake signatures rejected, and payment replay prevented")
    except Exception as e:
        record_fail("8. Duplicate payment/purchase is prevented", e)

    # -------------------------------------------------------------
    # FINAL SUMMARY
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    print("VERIFICATION SUMMARY REPORT")
    print("=" * 70)
    print(f"Total Tests Run: {len(test_results['passed']) + len(test_results['failed'])}")
    print(f"Tests Passed:    {len(test_results['passed'])}")
    print(f"Tests Failed:    {len(test_results['failed'])}")

    if test_results["failed"]:
        print("\nFAILED TESTS:")
        for name, err in test_results["failed"]:
            print(f"  - {name}: {err}")
        return False
    else:
        print("\nALL VERIFICATIONS PASSED SUCCESSFULLY! ✓✓✓")
        return True

if __name__ == "__main__":
    success = run_suite()
    sys.exit(0 if success else 1)
