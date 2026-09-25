// =====================================================
// SMART ID WALLET - SHOPKEEPER POS CONTROLLER
// =====================================================

let currentShopkeeper = null;
let activeStudent = null;
let shopProducts = [];
let cart = []; // Array of { product, quantity }
let isSubmitting = false;
let cameraStream = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Enforce shopkeeper role authentication
    if (typeof Auth !== "undefined" && !Auth.requireAuth("shopkeeper")) {
        return;
    }

    // 2. Load shopkeeper profile & initial datasets
    await loadShopkeeperProfile();
    await loadProducts();
    await loadSalesHistory();
});

// -----------------------------------------------------
// NAVIGATION & VIEW SWITCHING
// -----------------------------------------------------
function switchView(viewName) {
    const views = {
        pos: document.getElementById("viewPos"),
        sales: document.getElementById("viewSales"),
        products: document.getElementById("viewProducts")
    };
    const btns = {
        pos: document.getElementById("navPosBtn"),
        sales: document.getElementById("navSalesBtn"),
        products: document.getElementById("navProductsBtn")
    };

    Object.keys(views).forEach(key => {
        if (views[key]) views[key].style.display = (key === viewName) ? "block" : "none";
        if (btns[key]) btns[key].classList.toggle("active", key === viewName);
    });

    if (viewName === "sales") loadSalesHistory();
    if (viewName === "products") renderInventoryTable();
}

// -----------------------------------------------------
// PROFILE & DASHBOARD DATA
// -----------------------------------------------------
async function loadShopkeeperProfile() {
    const user = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
    const shopkeeperId = user ? (user.user_id || user.shopkeeper_id || "shop01") : "shop01";

    try {
        const res = await apiRequest(`/api/shopkeeper/profile?shopkeeperId=${encodeURIComponent(shopkeeperId)}`);
        if (res.ok && res.data && res.data.shopkeeper) {
            currentShopkeeper = res.data.shopkeeper;
        } else {
            // Fallback to local session
            currentShopkeeper = {
                shopkeeper_id: shopkeeperId,
                name: user ? user.name : "Shop Operator",
                shop_name: user ? (user.shop_name || "Campus Store") : "Campus Store",
                category: user ? (user.category || "General Store") : "General Store"
            };
        }

        updateHeaderUI();
    } catch (e) {
        console.error("Failed to load shopkeeper profile:", e);
    }
}

function updateHeaderUI() {
    if (!currentShopkeeper) return;

    const headingEl = document.getElementById("shopNameHeading") || document.getElementById("shopNameHeader");
    const operatorEl = document.getElementById("operatorName") || document.getElementById("shopkeeperName");
    const categoryEl = document.getElementById("shopCategory") || document.getElementById("shopSubtitle");

    if (headingEl) headingEl.innerText = currentShopkeeper.shop_name || "Campus Store";
    if (operatorEl) operatorEl.innerText = currentShopkeeper.name || "Operator";
    if (categoryEl) categoryEl.innerText = currentShopkeeper.category || "General Store";
}

// -----------------------------------------------------
// PRODUCTS & INVENTORY
// -----------------------------------------------------
async function loadProducts() {
    const shopId = currentShopkeeper ? currentShopkeeper.shopkeeper_id : (Auth.getShopkeeperId() || "shop01");
    try {
        const res = await apiRequest(`/api/shopkeeper/products?shopkeeperId=${encodeURIComponent(shopId)}`);
        if (res.ok && Array.isArray(res.data)) {
            shopProducts = res.data;
            const badge = document.getElementById("productCountBadge");
            if (badge) badge.innerText = `${shopProducts.length} Products`;
            renderProductsGrid(shopProducts);
            renderInventoryTable();
        }
    } catch (e) {
        console.error("Failed to load products:", e);
    }
}

function renderProductsGrid(products) {
    const grid = document.getElementById("productGrid") || document.getElementById("productsGrid");
    if (!grid) return;

    if (!products || products.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#64748b;">No products available for this shop.</div>`;
        return;
    }

    grid.innerHTML = products.map(p => {
        const cartItem = cart.find(ci => ci.product.product_id === p.product_id);
        const inCartCount = cartItem ? cartItem.quantity : 0;
        const isOutOfStock = p.stock_status === "OUT_OF_STOCK" || p.active === 0;

        return `
            <div class="product-item-card ${inCartCount > 0 ? 'selected' : ''}" style="${inCartCount > 0 ? 'border-color:#0d9488; background:#f0fdfa;' : ''}">
                <div class="product-meta">
                    <h4>${escapeHtml(p.product_name)}</h4>
                    <span class="prod-cat-badge">${escapeHtml(p.category || 'General')}</span>
                </div>
                <div class="prod-price">${formatCurrency(p.price)}</div>
                ${isOutOfStock ? `
                    <div style="text-align:center; font-size:12px; font-weight:700; color:#ef4444; padding:6px;">Out of Stock</div>
                ` : `
                    <div class="qty-stepper">
                        <button type="button" class="step-btn" onclick="updateCartQty(${p.product_id}, -1)">−</button>
                        <span class="qty-val">${inCartCount}</span>
                        <button type="button" class="step-btn" onclick="addToCart(${p.product_id})">+</button>
                    </div>
                `}
            </div>
        `;
    }).join("");
}

function renderInventoryTable() {
    const tbody = document.getElementById("inventoryTableBody");
    if (!tbody) return;

    if (!shopProducts || shopProducts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">No inventory items found.</td></tr>`;
        return;
    }

    tbody.innerHTML = shopProducts.map(p => `
        <tr>
            <td>PRD${p.product_id}</td>
            <td><strong>${escapeHtml(p.product_name)}</strong></td>
            <td><span class="category-pill">${escapeHtml(p.category || 'General')}</span></td>
            <td><strong>${formatCurrency(p.price)}</strong></td>
            <td><span class="status-badge ${p.stock_status === 'IN_STOCK' ? 'status-active' : 'status-inactive'}">${p.stock_status || 'IN_STOCK'}</span></td>
            <td><span class="badge ${p.active ? 'badge-success' : 'badge-danger'}">${p.active ? 'Active' : 'Inactive'}</span></td>
        </tr>
    `).join("");
}

// -----------------------------------------------------
// STUDENT SCAN & LOOKUP
// -----------------------------------------------------
async function searchStudent() {
    const input = document.getElementById("studentScanInput") || document.getElementById("studentSearchInput");
    const val = input ? input.value.trim() : "";
    if (!val) {
        showToast("Please enter or scan a Student ID or Barcode", "error");
        return;
    }

    try {
        const res = await apiRequest("/api/shopkeeper/scan-student", {
            method: "POST",
            body: JSON.stringify({ barcode: val, studentId: val })
        });

        if (!res.ok || !res.data.success) {
            showToast(res.data.message || "Student not found or inactive", "error");
            clearActiveStudent();
            return;
        }

        setActiveStudent(res.data.student);
        showToast(`Student ${res.data.student.name} identified successfully`, "success");
    } catch (e) {
        console.error("Student lookup error:", e);
        showToast("Error connecting to server for student lookup", "error");
    }
}

function quickSelectStudent(studentId) {
    const input = document.getElementById("studentScanInput") || document.getElementById("studentSearchInput");
    if (input) input.value = studentId;
    searchStudent();
}

function setActiveStudent(student) {
    activeStudent = student;

    const banner = document.getElementById("studentBanner") || document.getElementById("studentActiveCard");
    const nameEl = document.getElementById("identifiedName") || document.getElementById("activeStudentName");
    const idEl = document.getElementById("identifiedId") || document.getElementById("activeStudentId");
    const deptEl = document.getElementById("identifiedDept") || document.getElementById("activeStudentDept");
    const balEl = document.getElementById("identifiedBalance") || document.getElementById("activeStudentBalance");

    if (banner) banner.style.display = "flex";
    if (nameEl) nameEl.innerText = student.name || "Student";
    if (idEl) idEl.innerText = student.student_id || "";
    if (deptEl) deptEl.innerText = `${student.department || 'Engineering'} • Batch: ${student.academic_year || '2025-2029'}`;
    if (balEl) balEl.innerText = formatCurrency(student.balance);

    updateCalculations();
}

function clearActiveStudent() {
    activeStudent = null;
    const banner = document.getElementById("studentBanner") || document.getElementById("studentActiveCard");
    if (banner) banner.style.display = "none";
    const input = document.getElementById("studentScanInput") || document.getElementById("studentSearchInput");
    if (input) input.value = "";
    updateCalculations();
}

// -----------------------------------------------------
// CART OPERATIONS
// -----------------------------------------------------
function addToCart(productId) {
    const product = shopProducts.find(p => p.product_id === productId);
    if (!product) return;

    const existing = cart.find(ci => ci.product.product_id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ product, quantity: 1 });
    }

    renderCart();
    renderProductsGrid(shopProducts);
}

function updateCartQty(productId, delta) {
    const item = cart.find(ci => ci.product.product_id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter(ci => ci.product.product_id !== productId);
    }

    renderCart();
    renderProductsGrid(shopProducts);
}

function removeFromCart(productId) {
    cart = cart.filter(ci => ci.product.product_id !== productId);
    renderCart();
    renderProductsGrid(shopProducts);
}

function clearCart() {
    cart = [];
    renderCart();
    renderProductsGrid(shopProducts);
}

function renderCart() {
    const container = document.getElementById("cartContainer") || document.getElementById("cartItemsContainer");
    const itemsCountEl = document.getElementById("billItemsCount") || document.getElementById("cartItemCount");
    const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);

    if (itemsCountEl) itemsCountEl.innerText = `${totalItems} Items`;
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-state">
                <span>🛒</span>
                <p>No items added yet.<br>Click [+] on products to add to bill.</p>
            </div>
        `;
    } else {
        container.innerHTML = cart.map(ci => {
            const lineTotal = Number(ci.product.price) * ci.quantity;
            return `
                <div class="cart-row">
                    <div>
                        <div class="cart-row-title">${escapeHtml(ci.product.product_name)}</div>
                        <div class="cart-row-calc">${ci.quantity} × ${formatCurrency(ci.product.price)}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="cart-row-total">${formatCurrency(lineTotal)}</span>
                        <button type="button" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:14px;" onclick="removeFromCart(${ci.product.product_id})" title="Remove item">✕</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    updateCalculations();
}

// -----------------------------------------------------
// BALANCE & WALLET IMPACT CALCULATIONS
// -----------------------------------------------------
function updateCalculations() {
    const totalAmount = cart.reduce((sum, ci) => sum + (Number(ci.product.price) * ci.quantity), 0);
    const totalAmountEl = document.getElementById("billTotalAmount") || document.getElementById("cartGrandTotal");
    const currentBalEl = document.getElementById("impactCurrentBal") || document.getElementById("impactWalletBal");
    const remBalEl = document.getElementById("impactRemainingBal");
    const alertBox = document.getElementById("posAlert");
    const confirmBtn = document.getElementById("confirmPurchaseBtn");

    if (totalAmountEl) totalAmountEl.innerText = formatCurrency(totalAmount);

    const currentBal = activeStudent ? Number(activeStudent.balance) : 0;
    if (currentBalEl) currentBalEl.innerText = activeStudent ? formatCurrency(currentBal) : "₹0.00";

    if (!activeStudent) {
        if (remBalEl) {
            remBalEl.innerText = "--";
            remBalEl.style.color = "#64748b";
        }
        if (alertBox) alertBox.style.display = "none";
        if (confirmBtn) confirmBtn.disabled = true;
        return;
    }

    const remainingBal = currentBal - totalAmount;
    if (remBalEl) {
        remBalEl.innerText = formatCurrency(remainingBal);
        remBalEl.style.color = (remainingBal < 0) ? "#ef4444" : "#0d9488";
    }

    if (totalAmount <= 0) {
        if (alertBox) alertBox.style.display = "none";
        if (confirmBtn) confirmBtn.disabled = true;
        return;
    }

    if (remainingBal < 0) {
        if (alertBox) {
            alertBox.style.display = "block";
            alertBox.className = "pos-alert alert-danger";
            alertBox.innerHTML = `⚠️ <strong>Insufficient Student Balance!</strong><br>Required: ${formatCurrency(totalAmount)}, Available: ${formatCurrency(currentBal)}. Shortage: ${formatCurrency(Math.abs(remainingBal))}.`;
        }
        if (confirmBtn) confirmBtn.disabled = true;
    } else {
        if (alertBox) {
            if (remainingBal <= 100) {
                alertBox.style.display = "block";
                alertBox.className = "pos-alert alert-warning";
                alertBox.innerHTML = `ℹ️ <em>Low balance warning:</em> Remaining balance after this purchase will be ${formatCurrency(remainingBal)}.`;
            } else {
                alertBox.style.display = "none";
            }
        }
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

// -----------------------------------------------------
// CONFIRM PURCHASE (ATOMIC POS TRANSACTION)
// -----------------------------------------------------
async function confirmPurchase() {
    if (isSubmitting) return;

    if (!activeStudent) {
        showToast("Please identify a student first before completing purchase", "error");
        const scanInput = document.getElementById("studentScanInput") || document.getElementById("studentSearchInput");
        if (scanInput) scanInput.focus();
        return;
    }

    if (cart.length === 0) {
        showToast("Cart is empty. Please select products to purchase.", "error");
        return;
    }

    const totalAmount = cart.reduce((sum, ci) => sum + (Number(ci.product.price) * ci.quantity), 0);
    if (Number(activeStudent.balance) < totalAmount) {
        showToast("Purchase rejected: Insufficient student balance", "error");
        return;
    }

    const confirmBtn = document.getElementById("confirmPurchaseBtn");
    const btnText = document.getElementById("confirmBtnText");
    const spinner = document.getElementById("confirmSpinner");

    isSubmitting = true;
    if (confirmBtn) confirmBtn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (btnText) btnText.innerText = "Deducting Wallet...";

    // Generate unique client idempotency key to prevent double submissions
    const idempotencyKey = `POS_${activeStudent.student_id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const payload = {
        shopkeeperId: currentShopkeeper ? currentShopkeeper.shopkeeper_id : "shop01",
        studentId: activeStudent.student_id,
        items: cart.map(ci => ({
            product_id: ci.product.product_id,
            quantity: ci.quantity
        })),
        idempotencyKey: idempotencyKey
    };

    try {
        const res = await apiRequest("/api/shopkeeper/purchase", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!res.ok || !res.data.success) {
            const errMsg = res.data.message || "Purchase failed";
            showToast(errMsg, "error");
            const alertBox = document.getElementById("posAlert");
            if (alertBox) {
                alertBox.style.display = "block";
                alertBox.className = "pos-alert alert-danger";
                alertBox.innerText = errMsg;
            }
            return;
        }

        // Show professional receipt modal
        showReceiptModal(res.data);
        showToast("Purchase completed & wallet deducted successfully!", "success");

        // Reload sales history and KPI banner
        await loadSalesHistory();

    } catch (e) {
        console.error("Purchase error:", e);
        showToast("Network error executing purchase", "error");
    } finally {
        isSubmitting = false;
        if (confirmBtn) confirmBtn.disabled = false;
        if (spinner) spinner.style.display = "none";
        if (btnText) btnText.innerText = "Confirm Purchase & Deduct Wallet";
    }
}

// -----------------------------------------------------
// RECEIPT MODAL
// -----------------------------------------------------
function showReceiptModal(receipt) {
    const modal = document.getElementById("purchaseSuccessModal");
    if (!modal) return;

    const rcptShop = document.getElementById("rcptShop");
    const rcptTxnId = document.getElementById("rcptTxnId");
    const rcptStudentId = document.getElementById("rcptStudentId");
    const rcptStudentName = document.getElementById("rcptStudentName");
    const rcptDateTime = document.getElementById("rcptDateTime");
    const rcptItemList = document.getElementById("rcptItemList");
    const rcptTotalPaid = document.getElementById("rcptTotalPaid");
    const rcptPrevBal = document.getElementById("rcptPrevBal");
    const rcptRemainingBal = document.getElementById("rcptRemainingBal");

    if (rcptShop) rcptShop.innerText = receipt.shop_name || (currentShopkeeper ? currentShopkeeper.shop_name : "Campus Store");
    if (rcptTxnId) rcptTxnId.innerText = receipt.display_txn_id || `TXN${10000 + (receipt.transaction_id || 1)}`;
    if (rcptStudentId) rcptStudentId.innerText = receipt.student_id;
    if (rcptStudentName) rcptStudentName.innerText = receipt.student_name || (activeStudent ? activeStudent.name : "");
    if (rcptDateTime) rcptDateTime.innerText = formatDateTime(receipt.created_at || Date.now());

    if (rcptItemList && receipt.items) {
        rcptItemList.innerHTML = receipt.items.map(it => `
            <div class="receipt-item-row" style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;">
                <span class="rcpt-item-name">${escapeHtml(it.product_name || it.product_name_snapshot)}</span>
                <span class="rcpt-item-qty" style="color:#64748b;">${it.quantity} × ${formatCurrency(it.unit_price)}</span>
                <strong class="rcpt-item-price">${formatCurrency(it.line_total)}</strong>
            </div>
        `).join("");
    }

    if (rcptTotalPaid) rcptTotalPaid.innerText = formatCurrency(receipt.total_amount || receipt.amount);
    if (rcptPrevBal) rcptPrevBal.innerText = formatCurrency(receipt.previous_balance !== undefined ? receipt.previous_balance : receipt.wallet_before);
    if (rcptRemainingBal) rcptRemainingBal.innerText = formatCurrency(receipt.remaining_balance !== undefined ? receipt.remaining_balance : receipt.wallet_after);

    modal.style.display = "flex";
}

function finishPurchaseAndReset() {
    const modal = document.getElementById("purchaseSuccessModal");
    if (modal) modal.style.display = "none";
    clearCart();
    clearActiveStudent();
    loadProducts();
}

// -----------------------------------------------------
// SALES HISTORY
// -----------------------------------------------------
async function loadSalesHistory() {
    const shopId = currentShopkeeper ? currentShopkeeper.shopkeeper_id : (Auth.getShopkeeperId() || "shop01");
    try {
        const res = await apiRequest(`/api/shopkeeper/sales?shopkeeperId=${encodeURIComponent(shopId)}`);
        if (res.ok && res.data) {
            const stats = res.data.stats || {};
            const sales = res.data.sales || [];

            // Update KPI Banner
            const kpiTodaySales = document.getElementById("kpiTodaySales");
            const kpiTodayTxns = document.getElementById("kpiTodayTxns");
            const kpiTotalCollected = document.getElementById("kpiTotalCollected") || document.getElementById("kpiLifetimeSales");
            const kpiTotalTxns = document.getElementById("kpiTotalTxns");
            const countBadge = document.getElementById("salesCountBadge");

            if (kpiTodaySales) kpiTodaySales.innerText = formatCurrency(stats.today_sales || 0);
            if (kpiTodayTxns) kpiTodayTxns.innerText = stats.today_transactions || 0;
            if (kpiTotalCollected) kpiTotalCollected.innerText = formatCurrency(stats.total_amount_collected || 0);
            if (kpiTotalTxns) kpiTotalTxns.innerText = stats.total_transactions || sales.length;
            if (countBadge) countBadge.innerText = `${sales.length} Sales`;

            renderSalesTable(sales);
        }
    } catch (e) {
        console.error("Failed to load sales history:", e);
    }
}

function renderSalesTable(sales) {
    const tbody = document.getElementById("salesTableBody");
    if (!tbody) return;

    if (!sales || sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:24px; color:#64748b;">No sales recorded yet today.</td></tr>`;
        return;
    }

    tbody.innerHTML = sales.map(s => {
        const dateStr = formatDateTime(s.created_at || s.transaction_date);
        const total = Number(s.total_amount || s.amount || 0);
        return `
            <tr>
                <td><strong>TXN${10000 + s.transaction_id}</strong></td>
                <td><code>${escapeHtml(s.student_id)}</code></td>
                <td>${escapeHtml(s.student_name || '--')}</td>
                <td><small style="color:#475569;">${escapeHtml(s.products_summary || 'Items')}</small></td>
                <td><strong class="text-accent" style="color:#0d9488;">${formatCurrency(total)}</strong></td>
                <td><small>${dateStr}</small></td>
                <td><span class="status-badge status-active">✓ SUCCESS</span></td>
                <td>
                    <button type="button" class="btn-receipt-view" onclick="viewTransactionReceipt(${s.transaction_id})">View Receipt</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function viewTransactionReceipt(txnId) {
    try {
        const res = await apiRequest(`/api/transaction/${txnId}`);
        if (res.ok && res.data && res.data.transaction) {
            const t = res.data.transaction;
            showReceiptModal({
                transaction_id: t.transaction_id,
                display_txn_id: `TXN${10000 + t.transaction_id}`,
                student_id: t.student_id,
                student_name: t.student_name,
                shop_name: t.shop_name,
                created_at: t.created_at,
                items: (t.items || []).map(it => ({
                    product_name: it.product_name_snapshot,
                    quantity: it.quantity,
                    unit_price: it.unit_price,
                    line_total: it.line_total
                })),
                total_amount: t.amount,
                previous_balance: t.wallet_before,
                remaining_balance: t.wallet_after
            });
        } else {
            showToast("Could not retrieve transaction receipt", "error");
        }
    } catch (e) {
        console.error("Failed to load receipt:", e);
        showToast("Error retrieving receipt details", "error");
    }
}

// -----------------------------------------------------
// CAMERA SCANNER TOGGLE
// -----------------------------------------------------
function toggleCameraScanner() {
    const camBox = document.getElementById("cameraBox") || document.getElementById("cameraScannerBox");
    const video = document.getElementById("scannerVideo");
    if (!camBox) return;

    const isVisible = camBox.style.display !== "none";

    if (isVisible) {
        camBox.style.display = "none";
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    } else {
        camBox.style.display = "block";
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                .then(stream => {
                    cameraStream = stream;
                    if (video) {
                        video.srcObject = stream;
                        video.play();
                    }
                    showToast("Camera active. Point at Student QR code.", "info");
                })
                .catch(err => {
                    console.warn("Camera access denied or unavailable:", err);
                    showToast("Camera access unavailable. Please use manual Student ID entry.", "warning");
                });
        } else {
            showToast("Camera not supported on this device. Use manual Student ID entry.", "warning");
        }
    }
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
}
