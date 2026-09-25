import os
import sys

# Add backend directory to path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, backend_dir)

from database import (
    initialize_database,
    authenticate_user,
    get_student,
    get_student_wallet,
    atomic_shopkeeper_purchase,
    atomic_wallet_topup,
    get_transaction_details,
    get_shopkeeper_products
)

def run_tests():
    print("--- 1. Initializing Database & Seed Data ---")
    initialize_database()

    print("--- 2. Testing Authentication ---")
    admin_auth = authenticate_user("admin01", "admin123", "admin")
    assert admin_auth and admin_auth["role"] == "admin", f"Admin auth failed: {admin_auth}"
    print("✓ Admin authenticated successfully")

    student_auth = authenticate_user("23ECE001", "123456", "student")
    assert student_auth and student_auth["role"] == "student", f"Student auth failed: {student_auth}"
    print("✓ Student 23ECE001 authenticated successfully")

    shop_auth = authenticate_user("shop01", "123456", "shopkeeper")
    assert shop_auth and shop_auth["role"] == "shopkeeper", f"Shopkeeper auth failed: {shop_auth}"
    print("✓ Shopkeeper shop01 authenticated successfully")

    print("--- 3. Testing Initial Balance for 23ECE001 ---")
    wallet = get_student_wallet("23ECE001")
    print(f"Student wallet balance: ₹{wallet['balance']}")
    # Reset to 850 if modified by previous runs
    if wallet['balance'] != 850.0:
        from database import get_db_connection
        conn = get_db_connection()
        conn.execute("UPDATE wallets SET balance = 850.0 WHERE student_id = '23ECE001'")
        conn.commit()
        conn.close()
        wallet = get_student_wallet("23ECE001")
        print(f"Reset Student wallet balance to: ₹{wallet['balance']}")
    assert wallet["balance"] == 850.0, f"Expected ₹850, got {wallet['balance']}"

    print("--- 4. Testing Demonstration Scenario Purchase ---")
    # Fetch products for shop01
    products = get_shopkeeper_products("shop01")
    p_map = {p["product_name"]: p["product_id"] for p in products}
    print(f"Products available at shop01: {list(p_map.keys())}")

    # Purchase: Soap x 1 (₹40), Shampoo x 1 (₹120), Pen x 2 (₹20), Pencil x 2 (₹10) = ₹190
    cart = [
        {"product_id": p_map["Soap"], "quantity": 1},
        {"product_id": p_map["Shampoo"], "quantity": 1},
        {"product_id": p_map["Pen"], "quantity": 2},
        {"product_id": p_map["Pencil"], "quantity": 2},
    ]

    purchase_res = atomic_shopkeeper_purchase("shop01", "23ECE001", cart)
    assert purchase_res["success"], f"Purchase failed: {purchase_res}"
    print(f"✓ Purchase Succeeded!")
    print(f"  Total amount: ₹{purchase_res['total_amount']}")
    print(f"  Previous balance: ₹{purchase_res['previous_balance']}")
    print(f"  Remaining balance: ₹{purchase_res['remaining_balance']}")
    assert purchase_res["total_amount"] == 190.0, f"Expected ₹190.0, got {purchase_res['total_amount']}"
    assert purchase_res["previous_balance"] == 850.0, f"Expected ₹850.0, got {purchase_res['previous_balance']}"
    assert purchase_res["remaining_balance"] == 660.0, f"Expected ₹660.0, got {purchase_res['remaining_balance']}"

    print("--- 5. Verifying Transaction Details & Snapshot ---")
    txn_id = purchase_res["transaction_id"]
    detail = get_transaction_details(txn_id)
    assert detail, "Transaction details not found"
    print(f"✓ Transaction TXN{10000+txn_id} retrieved")
    print(f"  Shop: {detail['shop_name']}")
    print(f"  Wallet Before: ₹{detail['wallet_before']}")
    print(f"  Wallet After: ₹{detail['wallet_after']}")
    print(f"  Items count: {len(detail['items'])}")
    for item in detail["items"]:
        print(f"    - {item['product_name_snapshot']}: {item['quantity']} x ₹{item['unit_price']} = ₹{item['line_total']}")
    assert len(detail["items"]) == 4

    print("--- 6. Testing Add Money / Top-up ---")
    import time
    topup_ref = f"TOPUP_DEMO_{int(time.time()*1000)}"
    topup_res = atomic_wallet_topup("23ECE001", 500.0, topup_ref)
    assert topup_res["success"], f"Topup failed: {topup_res}"
    print(f"✓ Top-up ₹500 Succeeded! New balance: ₹{topup_res['new_balance']}")
    assert topup_res["new_balance"] == 1160.0

    print("\n==========================================")
    print("ALL BACKEND & DEMO FLOW TESTS PASSED! ✓✓✓")
    print("==========================================")

if __name__ == "__main__":
    run_tests()
