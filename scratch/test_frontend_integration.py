import sys
import os
import json
import urllib.request
import urllib.error

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:5000"

class ResponseWrapper:
    def __init__(self, status_code, body_text):
        self.status_code = status_code
        self.text = body_text

    def json(self):
        return json.loads(self.text)

def request(method, url, json_data=None, headers=None):
    if headers is None:
        headers = {}
    data_bytes = None
    if json_data is not None:
        data_bytes = json.dumps(json_data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return ResponseWrapper(resp.status, body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return ResponseWrapper(e.code, body)

def test_frontend_routes():
    print("==================================================")
    print("TESTING STATIC FRONTEND ASSETS AND PAGES")
    print("==================================================")

    pages = [
        ("/", 200, "Smart ID Wallet"),
        ("/index.html", 200, "Smart ID Wallet"),
        ("/dashboard.html", 200, "Student Dashboard"),
        ("/add-money.html", 200, "Add Money"),
        ("/my-id.html", 200, "Digital Student ID"),
        ("/scan-pay.html", 200, "Scan & Pay"),
        ("/history.html", 200, "Transactions"),
        ("/profile.html", 200, "My Profile"),
        ("/shopkeeper/index.html", 200, "Shopkeeper POS"),
        ("/admin/index.html", 200, "Administrator Portal"),
    ]

    for path, expected_status, text_check in pages:
        r = request("GET", f"{BASE_URL}{path}")
        assert r.status_code == expected_status, f"Failed for {path}: expected {expected_status}, got {r.status_code}"
        assert text_check in r.text, f"Text '{text_check}' not found in {path}"
        print(f"[PASS] Page served: {path} (HTTP {r.status_code})")

    scripts = [
        "/js/config.js",
        "/js/auth.js",
        "/js/login.js",
        "/js/dashboard.js",
        "/js/add-money.js",
        "/js/my-id.js",
        "/js/scan-pay.js",
        "/js/history.js",
        "/js/profile.js",
        "/shopkeeper/shopkeeper.js",
        "/shopkeeper/shopkeeper.css",
        "/admin/admin.js",
        "/admin/admin.css"
    ]

    for s in scripts:
        r = request("GET", f"{BASE_URL}{s}")
        assert r.status_code == 200, f"Script/CSS {s} failed with status {r.status_code}"
        assert len(r.text) > 50, f"Script/CSS {s} returned empty content"
        print(f"[PASS] Asset served: {s} ({len(r.text)} bytes)")

def test_api_workflows():
    print("\n==================================================")
    print("TESTING COMPLETE WORKFLOW INTEGRATION")
    print("==================================================")

    # 1. Student Login
    login_res = request("POST", f"{BASE_URL}/api/auth/login", json_data={
        "loginId": "23ECE001",
        "password": "123456",
        "role": "student"
    }).json()
    assert login_res["success"] is True, f"Student login failed: {login_res}"
    student_token = login_res["token"]
    assert "password" not in login_res["user"], "Password returned in user object!"
    assert "password_hash" not in login_res["user"], "Password hash returned in user object!"
    print(f"[PASS] 1. Student Auth Successful (Token: {student_token[:20]}...)")

    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Student Dashboard APIs
    me_res = request("GET", f"{BASE_URL}/api/auth/me", headers=student_headers).json()
    assert me_res["success"] is True
    assert me_res["user"]["user_id"] == "23ECE001"
    print("[PASS] 2. /api/auth/me returns student session")

    w_res = request("GET", f"{BASE_URL}/api/wallet/23ECE001", headers=student_headers).json()
    initial_bal = float(w_res["balance"])
    print(f"[PASS] 3. /api/wallet/23ECE001 balance: ₹{initial_bal}")

    txns_res = request("GET", f"{BASE_URL}/api/transactions/23ECE001", headers=student_headers).json()
    assert isinstance(txns_res, list)
    print(f"[PASS] 4. /api/transactions/23ECE001 returned {len(txns_res)} records")

    # 3. Add Money Sandbox Flow
    order_res = request("POST", f"{BASE_URL}/api/wallet/topup/create", headers=student_headers, json_data={
        "studentId": "23ECE001",
        "amount": 100.0
    }).json()
    assert order_res["success"] is True
    order_id = order_res["order_id"]
    sig = order_res["mock_signature"]
    print(f"[PASS] 5. Created topup order: {order_id}")

    verify_res = request("POST", f"{BASE_URL}/api/wallet/topup/verify", headers=student_headers, json_data={
        "studentId": "23ECE001",
        "orderId": order_id,
        "paymentId": f"PAY_{order_id}",
        "signature": sig
    }).json()
    assert verify_res["success"] is True
    assert verify_res["new_balance"] == round(initial_bal + 100.0, 2)
    print(f"[PASS] 6. Topup verified successfully! New balance: ₹{verify_res['new_balance']}")

    # 4. Student Direct Scan & Pay
    pay_res = request("POST", f"{BASE_URL}/api/wallet/pay", headers=student_headers, json_data={
        "studentId": "23ECE001",
        "amount": 25.0,
        "category": "Canteen",
        "description": "Integration Test Snack"
    }).json()
    assert pay_res["success"] is True
    assert pay_res["previous_balance"] == round(initial_bal + 100.0, 2)
    assert pay_res["balance"] == round(initial_bal + 75.0, 2)
    print(f"[PASS] 7. Scan & Pay successful! Previous: ₹{pay_res['previous_balance']}, Remaining: ₹{pay_res['balance']}")

    # 5. Shopkeeper Login & POS Workflow
    shop_login = request("POST", f"{BASE_URL}/api/auth/login", json_data={
        "loginId": "shop01",
        "password": "123456",
        "role": "shopkeeper"
    }).json()
    assert shop_login["success"] is True
    shop_token = shop_login["token"]
    shop_headers = {"Authorization": f"Bearer {shop_token}"}
    print("[PASS] 8. Shopkeeper Auth Successful")

    # Fetch products
    prods = request("GET", f"{BASE_URL}/api/shopkeeper/products?shopkeeperId=shop01", headers=shop_headers).json()
    assert len(prods) > 0
    soap = next(p for p in prods if p["product_name"] == "Soap")
    print(f"[PASS] 9. Fetched {len(prods)} products for shop01")

    # Scan student
    scan_student = request("POST", f"{BASE_URL}/api/shopkeeper/scan-student", headers=shop_headers, json_data={
        "studentId": "23ECE001"
    }).json()
    assert scan_student["success"] is True
    assert scan_student["student"]["student_id"] == "23ECE001"
    print(f"[PASS] 10. Student identified: {scan_student['student']['name']}, Balance: ₹{scan_student['student']['balance']}")

    # Shopkeeper Purchase
    purchase_res = request("POST", f"{BASE_URL}/api/shopkeeper/purchase", headers=shop_headers, json_data={
        "shopkeeperId": "shop01",
        "studentId": "23ECE001",
        "items": [{"product_id": soap["product_id"], "quantity": 1}],
        "idempotencyKey": f"TEST_INT_IDEMP_{int(os.getpid())}_{len(prods)}"
    }).json()
    assert purchase_res["success"] is True
    print(f"[PASS] 11. Shopkeeper purchase successful! Txn ID: {purchase_res['display_txn_id']}")

    # Sales history
    sales = request("GET", f"{BASE_URL}/api/shopkeeper/sales?shopkeeperId=shop01", headers=shop_headers).json()
    assert sales["success"] is True
    print(f"[PASS] 12. Shopkeeper sales retrieved: {len(sales['sales'])} sales, Today: ₹{sales['stats']['today_sales']}")

    # 6. Admin Login & Console
    admin_login = request("POST", f"{BASE_URL}/api/auth/login", json_data={
        "loginId": "admin01",
        "password": "admin123",
        "role": "admin"
    }).json()
    assert admin_login["success"] is True
    admin_token = admin_login["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] 13. Admin Auth Successful")

    dash = request("GET", f"{BASE_URL}/api/admin/dashboard", headers=admin_headers).json()
    assert dash["success"] is True
    assert dash["data"]["total_students"] > 0
    print(f"[PASS] 14. Admin Dashboard loaded! Students: {dash['data']['total_students']}, Products: {dash['data']['total_products']}")

    students_list = request("GET", f"{BASE_URL}/api/admin/students", headers=admin_headers).json()
    assert students_list["success"] is True
    print(f"[PASS] 15. Admin Students loaded: {len(students_list['students'])} students")

    shopkeepers_list = request("GET", f"{BASE_URL}/api/admin/shopkeepers", headers=admin_headers).json()
    assert shopkeepers_list["success"] is True
    print(f"[PASS] 16. Admin Shopkeepers loaded: {len(shopkeepers_list['shopkeepers'])} shopkeepers")

    products_list = request("GET", f"{BASE_URL}/api/admin/products", headers=admin_headers).json()
    assert products_list["success"] is True
    print(f"[PASS] 17. Admin Products loaded: {len(products_list['products'])} products")

    admin_txns = request("GET", f"{BASE_URL}/api/admin/transactions", headers=admin_headers).json()
    assert admin_txns["success"] is True
    assert len(admin_txns["transactions"]) > 0
    print(f"[PASS] 18. Admin Transactions loaded: {len(admin_txns['transactions'])} transactions")

    # Transaction detail audit
    latest_txn_id = admin_txns["transactions"][0]["transaction_id"]
    audit = request("GET", f"{BASE_URL}/api/admin/transactions/{latest_txn_id}", headers=admin_headers).json()
    assert audit["success"] is True
    assert audit["transaction"]["transaction_id"] == latest_txn_id
    print(f"[PASS] 19. Admin Transaction Audit for TXN{10000+latest_txn_id} verified")

    reports = request("GET", f"{BASE_URL}/api/admin/reports", headers=admin_headers).json()
    assert reports["success"] is True
    print(f"[PASS] 20. Admin Reports loaded: Topups: ₹{reports['reports']['total_topups']}, Purchases: ₹{reports['reports']['total_purchases']}")

    # 7. Security: Verify Role Guards
    # Student accessing admin endpoint -> 403
    unauth_admin = request("GET", f"{BASE_URL}/api/admin/dashboard", headers=student_headers)
    assert unauth_admin.status_code == 403, f"Expected 403, got {unauth_admin.status_code}"
    print("[PASS] 21. Security Role Guard: Student blocked from Admin API (HTTP 403)")

    # Unauthenticated accessing admin endpoint -> 401
    anon_admin = request("GET", f"{BASE_URL}/api/admin/dashboard")
    assert anon_admin.status_code == 401, f"Expected 401, got {anon_admin.status_code}"
    print("[PASS] 22. Security Role Guard: Unauthenticated blocked from Admin API (HTTP 401)")

    print("\n==================================================")
    print("ALL 22 FRONTEND INTEGRATION TESTS PASSED! \u2713\u2713\u2713")
    print("==================================================")

if __name__ == "__main__":
    test_frontend_routes()
    test_api_workflows()
