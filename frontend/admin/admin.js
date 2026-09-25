// =====================================================
// SMART ID WALLET - ADMINISTRATOR PORTAL CONTROLLER
// =====================================================

let currentAdminTab = "dashboard";
let cachedStudents = [];
let cachedShopkeepers = [];
let cachedProducts = [];
let cachedTransactions = [];
let studentSearchTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Strict RBAC - Only Admin role allowed
    if (typeof Auth !== "undefined" && !Auth.requireAuth("admin")) {
        return;
    }

    // 2. Setup Admin details
    const user = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
    const nameEl = document.getElementById("adminName");
    const userEl = document.getElementById("adminUsername");
    if (nameEl) nameEl.innerText = user ? user.name : "System Administrator";
    if (userEl) userEl.innerText = user ? (user.username || user.user_id) : "admin01";

    // 3. Load initial dashboard data
    await loadDashboardStats();
});

// -----------------------------------------------------
// TAB SWITCHING
// -----------------------------------------------------
function switchAdminTab(tabName) {
    currentAdminTab = tabName;

    // Update active nav button
    document.querySelectorAll(".sidebar-nav .nav-link-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add("active");

    // Hide all sections, show active
    document.querySelectorAll(".tab-section").forEach(sec => {
        sec.style.display = "none";
    });
    const activeSec = document.getElementById(`section-${tabName}`);
    if (activeSec) activeSec.style.display = "block";

    // Update headings
    const headings = {
        dashboard: { title: "System Overview", sub: "Real-time ledger statistics, student wallets, and merchant accounts" },
        students: { title: "Student Management", sub: "Manage registered student wallets, credentials, and digital IDs" },
        shopkeepers: { title: "Shopkeeper Management", sub: "Manage campus merchant outlets, categories, and permissions" },
        products: { title: "Product Catalog", sub: "Inventory prices, stock availability, and merchant listings" },
        transactions: { title: "Audit Ledger", sub: "Immutable end-to-end ledger of campus wallet debits and credits" },
        reports: { title: "Financial Reports & Insights", sub: "Revenue aggregations, daily trends, and volume analytics" }
    };

    const h = headings[tabName] || headings.dashboard;
    const pageHeading = document.getElementById("pageHeading");
    const pageSubHeading = document.getElementById("pageSubHeading");
    if (pageHeading) pageHeading.innerText = h.title;
    if (pageSubHeading) pageSubHeading.innerText = h.sub;

    // Fetch tab-specific data
    switch (tabName) {
        case "dashboard":
            loadDashboardStats();
            break;
        case "students":
            loadStudents();
            break;
        case "shopkeepers":
            loadShopkeepers();
            break;
        case "products":
            loadProducts();
            break;
        case "transactions":
            loadAdminTransactions();
            break;
        case "reports":
            loadAdminReports();
            break;
    }
}

function refreshCurrentTab() {
    switchAdminTab(currentAdminTab);
    showToast("Data refreshed from live backend ledger", "info");
}

// -----------------------------------------------------
// 1. DASHBOARD
// -----------------------------------------------------
async function loadDashboardStats() {
    try {
        const res = await apiRequest("/api/admin/dashboard");
        if (!res.ok || !res.data.success) {
            showToast("Failed to load admin dashboard stats", "error");
            return;
        }

        const data = res.data.data;
        document.getElementById("dashTotalStudents").innerText = data.total_students || 0;
        document.getElementById("dashTotalShopkeepers").innerText = data.total_shopkeepers || 0;
        document.getElementById("dashTotalBalance").innerText = formatCurrency(data.total_wallet_balance || 0);
        document.getElementById("dashTodaySales").innerText = formatCurrency(data.today_sales_amount || 0);
        document.getElementById("dashTotalProducts").innerText = data.total_products || 0;
        document.getElementById("dashTodayTxns").innerText = data.today_transactions || 0;

        renderRecentTransactions(data.recent_transactions || []);

    } catch (e) {
        console.error("Dashboard error:", e);
        showToast("Error loading dashboard data", "error");
    }
}

function renderRecentTransactions(txns) {
    const tbody = document.getElementById("dashRecentTxnsBody");
    if (!tbody) return;

    if (!txns || txns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No transactions found in system.</td></tr>`;
        return;
    }

    tbody.innerHTML = txns.map(t => {
        const isTopup = t.transaction_type === "WALLET_TOPUP";
        const typeClass = isTopup ? "type-topup" : (t.transaction_type === "PURCHASE" ? "type-purchase" : "type-debit");
        const merchant = t.shop_name ? `🏪 ${escapeHtml(t.shop_name)}` : (isTopup ? "💳 Payment Gateway" : "Self Payment");

        return `
            <tr>
                <td><strong>TXN${10000 + t.transaction_id}</strong></td>
                <td>
                    <strong>${escapeHtml(t.student_name || t.student_id)}</strong>
                    <div style="font-size:11px; color:#94a3b8;">${escapeHtml(t.student_id)}</div>
                </td>
                <td><small>${merchant}</small></td>
                <td><span class="type-pill ${typeClass}">${t.transaction_type}</span></td>
                <td><strong style="color:${isTopup ? '#34d399' : '#f8fafc'};">${isTopup ? '+' : '-'}${formatCurrency(t.amount)}</strong></td>
                <td><span class="status-pill pill-active">✓ ${t.status}</span></td>
                <td><small style="color:#94a3b8;">${formatDateTime(t.created_at)}</small></td>
                <td>
                    <button type="button" class="btn-table-action" onclick="viewTransactionAudit(${t.transaction_id})">Inspect</button>
                </td>
            </tr>
        `;
    }).join("");
}

// -----------------------------------------------------
// 2. STUDENTS MANAGEMENT
// -----------------------------------------------------
function debounceStudentSearch() {
    clearTimeout(studentSearchTimer);
    studentSearchTimer = setTimeout(() => {
        loadStudents();
    }, 300);
}

async function loadStudents() {
    const search = (document.getElementById("studentSearchInput")?.value || "").trim();
    const status = (document.getElementById("studentStatusFilter")?.value || "").trim();

    let queryParams = [];
    if (search) queryParams.push(`search=${encodeURIComponent(search)}`);
    if (status) queryParams.push(`status=${encodeURIComponent(status)}`);
    const qStr = queryParams.length ? `?${queryParams.join("&")}` : "";

    try {
        const res = await apiRequest(`/api/admin/students${qStr}`);
        if (!res.ok || !res.data.success) {
            showToast("Failed to fetch students list", "error");
            return;
        }

        cachedStudents = res.data.students || [];
        renderStudentsTable(cachedStudents);

    } catch (e) {
        console.error("Failed to load students:", e);
        showToast("Error retrieving student accounts", "error");
    }
}

function renderStudentsTable(students) {
    const tbody = document.getElementById("studentsTableBody");
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">No student records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const isActive = s.status === "ACTIVE";
        return `
            <tr>
                <td><code>${escapeHtml(s.student_id)}</code></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.department || '--')}</td>
                <td>${escapeHtml(s.academic_year || '--')}</td>
                <td><small style="color:#94a3b8;">${escapeHtml(s.email || '--')}</small></td>
                <td><strong style="color:#2dd4bf;">${formatCurrency(s.balance)}</strong></td>
                <td>
                    <span class="status-pill ${isActive ? 'pill-active' : 'pill-inactive'}">${s.status}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="btn-table-action" onclick="openEditStudentModal('${s.student_id}')">Edit</button>
                        <button type="button" class="btn-table-action ${isActive ? 'danger' : ''}" onclick="toggleStudentStatus('${s.student_id}', '${isActive ? 'INACTIVE' : 'ACTIVE'}')">
                            ${isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function openAddStudentModal() {
    document.getElementById("asStudentId").value = "";
    document.getElementById("asName").value = "";
    document.getElementById("asDepartment").value = "ECE";
    document.getElementById("asAcademicYear").value = "2025-2029";
    document.getElementById("asEmail").value = "";
    document.getElementById("asPassword").value = "123456";
    document.getElementById("asBalance").value = "0";
    openModal("modalAddStudent");
}

async function submitAddStudent() {
    const student_id = document.getElementById("asStudentId").value.trim();
    const name = document.getElementById("asName").value.trim();
    const department = document.getElementById("asDepartment").value.trim();
    const academic_year = document.getElementById("asAcademicYear").value.trim();
    const email = document.getElementById("asEmail").value.trim();
    const password = document.getElementById("asPassword").value.trim();
    const initial_balance = Number(document.getElementById("asBalance").value) || 0;

    if (!student_id || !name) {
        showToast("Student ID and Name are required", "error");
        return;
    }

    const btn = document.getElementById("btnSubmitAddStudent");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest("/api/admin/students", {
            method: "POST",
            body: JSON.stringify({
                student_id, name, department, academic_year, email, password, initial_balance
            })
        });

        if (res.ok && res.data.success) {
            showToast(`Student ${student_id} added successfully!`, "success");
            closeModal("modalAddStudent");
            loadStudents();
        } else {
            showToast(res.data.message || "Failed to create student", "error");
        }
    } catch (e) {
        console.error("Add student error:", e);
        showToast("Error creating student record", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openEditStudentModal(studentId) {
    const student = cachedStudents.find(s => s.student_id === studentId);
    if (!student) return;

    document.getElementById("esStudentId").value = student.student_id;
    document.getElementById("esStudentIdDisplay").value = student.student_id;
    document.getElementById("esName").value = student.name;
    document.getElementById("esDepartment").value = student.department || "";
    document.getElementById("esAcademicYear").value = student.academic_year || "";
    document.getElementById("esEmail").value = student.email || "";
    document.getElementById("esBalance").value = student.balance || 0;
    document.getElementById("esStatus").value = student.status || "ACTIVE";

    openModal("modalEditStudent");
}

async function submitEditStudent() {
    const student_id = document.getElementById("esStudentId").value;
    const name = document.getElementById("esName").value.trim();
    const department = document.getElementById("esDepartment").value.trim();
    const academic_year = document.getElementById("esAcademicYear").value.trim();
    const email = document.getElementById("esEmail").value.trim();
    const balance = Number(document.getElementById("esBalance").value) || 0;
    const status = document.getElementById("esStatus").value;

    const btn = document.getElementById("btnSubmitEditStudent");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest(`/api/admin/students/${encodeURIComponent(student_id)}`, {
            method: "PUT",
            body: JSON.stringify({ name, department, academic_year, email, balance, status })
        });

        if (res.ok && res.data.success) {
            showToast(`Student ${student_id} updated successfully`, "success");
            closeModal("modalEditStudent");
            loadStudents();
        } else {
            showToast(res.data.message || "Failed to update student", "error");
        }
    } catch (e) {
        console.error("Update student error:", e);
        showToast("Error updating student record", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function toggleStudentStatus(studentId, newStatus) {
    if (!confirm(`Are you sure you want to set student ${studentId} to ${newStatus}?`)) return;

    try {
        const res = await apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}`, {
            method: "PUT",
            body: JSON.stringify({ status: newStatus })
        });

        if (res.ok && res.data.success) {
            showToast(`Student status changed to ${newStatus}`, "success");
            loadStudents();
        } else {
            showToast(res.data.message || "Failed to update status", "error");
        }
    } catch (e) {
        showToast("Error updating status", "error");
    }
}

// -----------------------------------------------------
// 3. SHOPKEEPERS MANAGEMENT
// -----------------------------------------------------
async function loadShopkeepers() {
    try {
        const res = await apiRequest("/api/admin/shopkeepers");
        if (!res.ok || !res.data.success) {
            showToast("Failed to fetch shopkeepers list", "error");
            return;
        }

        cachedShopkeepers = res.data.shopkeepers || [];
        renderShopkeepersTable(cachedShopkeepers);

    } catch (e) {
        console.error("Failed to load shopkeepers:", e);
        showToast("Error retrieving shopkeeper accounts", "error");
    }
}

function renderShopkeepersTable(shopkeepers) {
    const tbody = document.getElementById("shopkeepersTableBody");
    if (!tbody) return;

    if (!shopkeepers || shopkeepers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">No shopkeepers registered yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = shopkeepers.map(sh => {
        const isActive = sh.status === "ACTIVE";
        return `
            <tr>
                <td><code>${escapeHtml(sh.shopkeeper_id)}</code></td>
                <td><strong>${escapeHtml(sh.name)}</strong></td>
                <td><strong>${escapeHtml(sh.shop_name)}</strong></td>
                <td><span class="brand-badge">${escapeHtml(sh.category || 'General')}</span></td>
                <td><small style="color:#94a3b8;">${escapeHtml(sh.email || '--')}</small></td>
                <td>
                    <span class="status-pill ${isActive ? 'pill-active' : 'pill-inactive'}">${sh.status}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="btn-table-action" onclick="openEditShopkeeperModal('${sh.shopkeeper_id}')">Edit</button>
                        <button type="button" class="btn-table-action ${isActive ? 'danger' : ''}" onclick="toggleShopkeeperStatus('${sh.shopkeeper_id}', '${isActive ? 'INACTIVE' : 'ACTIVE'}')">
                            ${isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function openAddShopkeeperModal() {
    document.getElementById("askId").value = "";
    document.getElementById("askName").value = "";
    document.getElementById("askShopName").value = "";
    document.getElementById("askCategory").value = "General Store";
    document.getElementById("askEmail").value = "";
    document.getElementById("askPassword").value = "123456";
    openModal("modalAddShopkeeper");
}

async function submitAddShopkeeper() {
    const shopkeeper_id = document.getElementById("askId").value.trim();
    const name = document.getElementById("askName").value.trim();
    const shop_name = document.getElementById("askShopName").value.trim();
    const category = document.getElementById("askCategory").value.trim();
    const email = document.getElementById("askEmail").value.trim();
    const password = document.getElementById("askPassword").value.trim();

    if (!shopkeeper_id || !name || !shop_name) {
        showToast("Shopkeeper ID, Name, and Shop Name are required", "error");
        return;
    }

    const btn = document.getElementById("btnSubmitAddShopkeeper");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest("/api/admin/shopkeepers", {
            method: "POST",
            body: JSON.stringify({ shopkeeper_id, name, shop_name, category, email, password })
        });

        if (res.ok && res.data.success) {
            showToast(`Shopkeeper ${shopkeeper_id} created successfully!`, "success");
            closeModal("modalAddShopkeeper");
            loadShopkeepers();
        } else {
            showToast(res.data.message || "Failed to create shopkeeper", "error");
        }
    } catch (e) {
        console.error("Add shopkeeper error:", e);
        showToast("Error creating shopkeeper account", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openEditShopkeeperModal(shopkeeperId) {
    const shop = cachedShopkeepers.find(s => s.shopkeeper_id === shopkeeperId);
    if (!shop) return;

    document.getElementById("eskId").value = shop.shopkeeper_id;
    document.getElementById("eskIdDisplay").value = shop.shopkeeper_id;
    document.getElementById("eskName").value = shop.name;
    document.getElementById("eskShopName").value = shop.shop_name;
    document.getElementById("eskCategory").value = shop.category || "";
    document.getElementById("eskEmail").value = shop.email || "";
    document.getElementById("eskStatus").value = shop.status || "ACTIVE";

    openModal("modalEditShopkeeper");
}

async function submitEditShopkeeper() {
    const shopkeeper_id = document.getElementById("eskId").value;
    const name = document.getElementById("eskName").value.trim();
    const shop_name = document.getElementById("eskShopName").value.trim();
    const category = document.getElementById("eskCategory").value.trim();
    const email = document.getElementById("eskEmail").value.trim();
    const status = document.getElementById("eskStatus").value;

    const btn = document.getElementById("btnSubmitEditShopkeeper");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest(`/api/admin/shopkeepers/${encodeURIComponent(shopkeeper_id)}`, {
            method: "PUT",
            body: JSON.stringify({ name, shop_name, category, email, status })
        });

        if (res.ok && res.data.success) {
            showToast("Shopkeeper updated successfully", "success");
            closeModal("modalEditShopkeeper");
            loadShopkeepers();
        } else {
            showToast(res.data.message || "Failed to update shopkeeper", "error");
        }
    } catch (e) {
        console.error("Update shopkeeper error:", e);
        showToast("Error updating shopkeeper record", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function toggleShopkeeperStatus(shopkeeperId, newStatus) {
    if (!confirm(`Are you sure you want to change shopkeeper ${shopkeeperId} status to ${newStatus}?`)) return;

    try {
        const res = await apiRequest(`/api/admin/shopkeepers/${encodeURIComponent(shopkeeperId)}`, {
            method: "PUT",
            body: JSON.stringify({ status: newStatus })
        });

        if (res.ok && res.data.success) {
            showToast(`Shopkeeper status set to ${newStatus}`, "success");
            loadShopkeepers();
        } else {
            showToast(res.data.message || "Failed to update status", "error");
        }
    } catch (e) {
        showToast("Error updating shopkeeper status", "error");
    }
}

// -----------------------------------------------------
// 4. PRODUCTS MANAGEMENT
// -----------------------------------------------------
async function loadProducts() {
    try {
        const res = await apiRequest("/api/admin/products");
        if (!res.ok || !res.data.success) {
            showToast("Failed to fetch product catalog", "error");
            return;
        }

        cachedProducts = res.data.products || [];
        renderProductsTable(cachedProducts);

    } catch (e) {
        console.error("Failed to load products:", e);
        showToast("Error retrieving product catalog", "error");
    }
}

function filterProductsTable() {
    const q = (document.getElementById("productSearchInput")?.value || "").toLowerCase().trim();
    if (!q) {
        renderProductsTable(cachedProducts);
        return;
    }
    const filtered = cachedProducts.filter(p =>
        (p.product_name || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.shop_name || "").toLowerCase().includes(q)
    );
    renderProductsTable(filtered);
}

function renderProductsTable(products) {
    const tbody = document.getElementById("productsTableBody");
    if (!tbody) return;

    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">No products found in inventory.</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => {
        const isInStock = p.stock_status === "IN_STOCK";
        const isActive = p.active === 1;

        return `
            <tr>
                <td>PRD${p.product_id}</td>
                <td><strong>${escapeHtml(p.product_name)}</strong></td>
                <td>${escapeHtml(p.shop_name || p.shopkeeper_id)}</td>
                <td><span class="brand-badge">${escapeHtml(p.category || 'General')}</span></td>
                <td><strong style="color:#2dd4bf;">${formatCurrency(p.price)}</strong></td>
                <td>
                    <span class="status-pill ${isInStock ? 'pill-instock' : 'pill-outstock'}">${p.stock_status}</span>
                </td>
                <td>
                    <span class="status-pill ${isActive ? 'pill-active' : 'pill-inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="btn-table-action" onclick="openEditProductModal(${p.product_id})">Edit Price / Info</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function openAddProductModal() {
    // Populate shopkeepers select dropdown
    const select = document.getElementById("apShopkeeper");
    if (select) {
        if (!cachedShopkeepers.length) {
            const res = await apiRequest("/api/admin/shopkeepers");
            if (res.ok && res.data.success) {
                cachedShopkeepers = res.data.shopkeepers || [];
            }
        }
        select.innerHTML = cachedShopkeepers.map(s => `
            <option value="${s.shopkeeper_id}">${escapeHtml(s.shop_name)} (${s.shopkeeper_id})</option>
        `).join("");
    }

    document.getElementById("apName").value = "";
    document.getElementById("apCategory").value = "General";
    document.getElementById("apPrice").value = "";
    openModal("modalAddProduct");
}

async function submitAddProduct() {
    const shopkeeper_id = document.getElementById("apShopkeeper").value;
    const product_name = document.getElementById("apName").value.trim();
    const category = document.getElementById("apCategory").value.trim();
    const price = Number(document.getElementById("apPrice").value) || 0;

    if (!product_name || price <= 0) {
        showToast("Product name and valid price are required", "error");
        return;
    }

    const btn = document.getElementById("btnSubmitAddProduct");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest("/api/admin/products", {
            method: "POST",
            body: JSON.stringify({ shopkeeper_id, product_name, category, price })
        });

        if (res.ok && res.data.success) {
            showToast("Product created successfully!", "success");
            closeModal("modalAddProduct");
            loadProducts();
        } else {
            showToast(res.data.message || "Failed to create product", "error");
        }
    } catch (e) {
        console.error("Add product error:", e);
        showToast("Error creating product", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openEditProductModal(productId) {
    const product = cachedProducts.find(p => p.product_id === productId);
    if (!product) return;

    document.getElementById("epProductId").value = product.product_id;
    document.getElementById("epName").value = product.product_name;
    document.getElementById("epCategory").value = product.category || "";
    document.getElementById("epPrice").value = product.price;
    document.getElementById("epStockStatus").value = product.stock_status || "IN_STOCK";
    document.getElementById("epActive").value = product.active !== undefined ? product.active : "1";

    openModal("modalEditProduct");
}

async function submitEditProduct() {
    const product_id = document.getElementById("epProductId").value;
    const product_name = document.getElementById("epName").value.trim();
    const category = document.getElementById("epCategory").value.trim();
    const price = Number(document.getElementById("epPrice").value) || 0;
    const stock_status = document.getElementById("epStockStatus").value;
    const active = Number(document.getElementById("epActive").value);

    if (!product_name || price <= 0) {
        showToast("Product name and valid price are required", "error");
        return;
    }

    const btn = document.getElementById("btnSubmitEditProduct");
    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest(`/api/admin/products/${product_id}`, {
            method: "PUT",
            body: JSON.stringify({ product_name, category, price, stock_status, active })
        });

        if (res.ok && res.data.success) {
            showToast("Product and price updated successfully", "success");
            closeModal("modalEditProduct");
            loadProducts();
        } else {
            showToast(res.data.message || "Failed to update product", "error");
        }
    } catch (e) {
        console.error("Update product error:", e);
        showToast("Error updating product details", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// -----------------------------------------------------
// 5. TRANSACTIONS AUDIT LEDGER
// -----------------------------------------------------
async function loadAdminTransactions() {
    const studentId = (document.getElementById("txnStudentFilter")?.value || "").trim();
    const type = (document.getElementById("txnTypeFilter")?.value || "").trim();
    const status = (document.getElementById("txnStatusFilter")?.value || "").trim();

    let queryParams = [];
    if (studentId) queryParams.push(`studentId=${encodeURIComponent(studentId)}`);
    if (type) queryParams.push(`type=${encodeURIComponent(type)}`);
    if (status) queryParams.push(`status=${encodeURIComponent(status)}`);
    const qStr = queryParams.length ? `?${queryParams.join("&")}` : "";

    try {
        const res = await apiRequest(`/api/admin/transactions${qStr}`);
        if (!res.ok || !res.data.success) {
            showToast("Failed to fetch transaction ledger", "error");
            return;
        }

        cachedTransactions = res.data.transactions || [];
        const badge = document.getElementById("txnTotalCountBadge");
        if (badge) badge.innerText = `${cachedTransactions.length} records`;

        renderTransactionsTable(cachedTransactions);

    } catch (e) {
        console.error("Failed to load transactions:", e);
        showToast("Error retrieving ledger records", "error");
    }
}

function resetTxnFilters() {
    const s = document.getElementById("txnStudentFilter");
    const t = document.getElementById("txnTypeFilter");
    const st = document.getElementById("txnStatusFilter");
    if (s) s.value = "";
    if (t) t.value = "";
    if (st) st.value = "";
    loadAdminTransactions();
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById("transactionsTableBody");
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#94a3b8;">No matching transactions found in ledger.</td></tr>`;
        return;
    }

    tbody.innerHTML = transactions.map(t => {
        const isTopup = t.transaction_type === "WALLET_TOPUP";
        const typeClass = isTopup ? "type-topup" : (t.transaction_type === "PURCHASE" ? "type-purchase" : "type-debit");
        const merchant = t.shop_name ? `🏪 ${escapeHtml(t.shop_name)}` : (isTopup ? "💳 Payment Gateway" : "Direct Pay");
        const balBefore = t.wallet_before !== null && t.wallet_before !== undefined ? formatCurrency(t.wallet_before) : "--";
        const balAfter = t.wallet_after !== null && t.wallet_after !== undefined ? formatCurrency(t.wallet_after) : "--";

        return `
            <tr>
                <td><strong>TXN${10000 + t.transaction_id}</strong></td>
                <td>
                    <strong>${escapeHtml(t.student_name || t.student_id)}</strong>
                    <div style="font-size:11px; color:#94a3b8;">${escapeHtml(t.student_id)}</div>
                </td>
                <td><small>${merchant}</small></td>
                <td><span class="type-pill ${typeClass}">${t.transaction_type}</span></td>
                <td><strong style="color:${isTopup ? '#34d399' : '#f8fafc'};">${isTopup ? '+' : '-'}${formatCurrency(t.amount)}</strong></td>
                <td><small style="color:#94a3b8;">${balBefore} → <strong style="color:#2dd4bf;">${balAfter}</strong></small></td>
                <td><span class="status-pill pill-active">✓ ${t.status}</span></td>
                <td><small style="color:#94a3b8;">${formatDateTime(t.created_at)}</small></td>
                <td>
                    <button type="button" class="btn-table-action" onclick="viewTransactionAudit(${t.transaction_id})">Receipt</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function viewTransactionAudit(txnId) {
    const modal = document.getElementById("modalTxnDetail");
    const body = document.getElementById("txnDetailBody");
    if (!modal || !body) return;

    body.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">Fetching immutable audit receipt...</div>`;
    openModal("modalTxnDetail");

    try {
        const res = await apiRequest(`/api/admin/transactions/${txnId}`);
        if (!res.ok || !res.data.success || !res.data.transaction) {
            body.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">Transaction details not found.</div>`;
            return;
        }

        const t = res.data.transaction;
        const isTopup = t.transaction_type === "WALLET_TOPUP";
        const items = t.items || [];

        let itemsHtml = "";
        if (items.length > 0) {
            itemsHtml = `
                <div style="margin-top:16px;">
                    <strong style="font-size:11px; text-transform:uppercase; color:#64748b; letter-spacing:0.5px;">Purchased Items Snapshot:</strong>
                    <div style="margin-top:8px; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; background:#f8fafc;">
                        ${items.map(it => `
                            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #e2e8f0; font-size:12px;">
                                <span><strong>${escapeHtml(it.product_name_snapshot)}</strong> × ${it.quantity}</span>
                                <span>${it.quantity} × ${formatCurrency(it.unit_price)} = <strong>${formatCurrency(it.line_total)}</strong></span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        body.innerHTML = `
            <div class="receipt-paper-admin">
                <div style="text-align:center; margin-bottom:14px;">
                    <div style="font-size:28px;">${isTopup ? '💳' : '🧾'}</div>
                    <h2 style="font-size:20px; font-weight:800; color:#0f172a; margin-top:4px;">
                        ${isTopup ? '+' : '-'}${formatCurrency(t.amount)}
                    </h2>
                    <span style="font-size:12px; color:#64748b;">${escapeHtml(t.description || t.transaction_type)}</span>
                </div>

                <div class="rcpt-row">
                    <span>Transaction ID:</span>
                    <strong>TXN${10000 + t.transaction_id}</strong>
                </div>
                <div class="rcpt-row">
                    <span>Student ID:</span>
                    <strong>${escapeHtml(t.student_id)} (${escapeHtml(t.student_name || 'Student')})</strong>
                </div>
                ${t.shop_name ? `
                <div class="rcpt-row">
                    <span>Merchant Outlet:</span>
                    <strong>${escapeHtml(t.shop_name)} (${escapeHtml(t.shopkeeper_id)})</strong>
                </div>` : ''}
                <div class="rcpt-row">
                    <span>Transaction Type:</span>
                    <strong>${t.transaction_type}</strong>
                </div>
                <div class="rcpt-row">
                    <span>Payment Reference:</span>
                    <code>${escapeHtml(t.payment_reference || 'LEDGER_ATOMIC')}</code>
                </div>
                <div class="rcpt-row">
                    <span>Wallet Balance Before:</span>
                    <span>${t.wallet_before !== null && t.wallet_before !== undefined ? formatCurrency(t.wallet_before) : '--'}</span>
                </div>
                <div class="rcpt-row">
                    <span>Wallet Balance After:</span>
                    <strong style="color:#0d9488;">${t.wallet_after !== null && t.wallet_after !== undefined ? formatCurrency(t.wallet_after) : '--'}</strong>
                </div>
                <div class="rcpt-row">
                    <span>Timestamp:</span>
                    <span>${formatDateTime(t.created_at || t.transaction_date)}</span>
                </div>
                <div class="rcpt-row total-bold">
                    <span>FINAL SETTLEMENT</span>
                    <span>${formatCurrency(t.amount)}</span>
                </div>

                ${itemsHtml}
            </div>
        `;

    } catch (e) {
        console.error("View audit detail error:", e);
        body.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">Error loading receipt audit.</div>`;
    }
}

// -----------------------------------------------------
// 6. REPORTS & ANALYTICS
// -----------------------------------------------------
async function loadAdminReports() {
    try {
        const res = await apiRequest("/api/admin/reports");
        if (!res.ok || !res.data.success) {
            showToast("Failed to fetch admin financial reports", "error");
            return;
        }

        const rep = res.data.reports;
        document.getElementById("repTotalTopups").innerText = formatCurrency(rep.total_topups || 0);
        document.getElementById("repTotalPurchases").innerText = formatCurrency(rep.total_purchases || 0);
        document.getElementById("repTotalTxns").innerText = rep.total_transactions || 0;

        // Top products
        const topProductsEl = document.getElementById("repTopProductsList");
        if (topProductsEl) {
            const prods = rep.top_products || [];
            if (prods.length === 0) {
                topProductsEl.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No product sales recorded yet.</p>`;
            } else {
                const maxQty = Math.max(...prods.map(p => p.total_quantity || 1), 1);
                topProductsEl.innerHTML = prods.map(p => {
                    const pct = Math.round(((p.total_quantity || 0) / maxQty) * 100);
                    return `
                        <div class="report-bar-item">
                            <div class="report-bar-header">
                                <strong>${escapeHtml(p.product_name)}</strong>
                                <span style="color:#2dd4bf;">${p.total_quantity} sold • ${formatCurrency(p.total_revenue)}</span>
                            </div>
                            <div class="report-bar-track">
                                <div class="report-bar-fill" style="width: ${pct}%;"></div>
                            </div>
                        </div>
                    `;
                }).join("");
            }
        }

        // Top shops
        const topShopsEl = document.getElementById("repTopShopsList");
        if (topShopsEl) {
            const shops = rep.top_shops || [];
            if (shops.length === 0) {
                topShopsEl.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No shop transactions yet.</p>`;
            } else {
                topShopsEl.innerHTML = shops.map(s => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #334155; font-size:13px;">
                        <div>
                            <strong>${escapeHtml(s.shop_name)}</strong>
                            <div style="font-size:11px; color:#94a3b8;">${s.transaction_count} purchases</div>
                        </div>
                        <strong style="color:#2dd4bf;">${formatCurrency(s.total_revenue)}</strong>
                    </div>
                `).join("");
            }
        }

        // Daily sales table
        const dailyBody = document.getElementById("repDailySalesBody");
        if (dailyBody) {
            const daily = rep.daily_sales || [];
            if (daily.length === 0) {
                dailyBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#94a3b8;">No sales history found.</td></tr>`;
            } else {
                dailyBody.innerHTML = daily.map(d => `
                    <tr>
                        <td><strong>${d.sale_date}</strong></td>
                        <td>${d.txn_count} purchases</td>
                        <td><strong style="color:#2dd4bf;">${formatCurrency(d.total_amount)}</strong></td>
                    </tr>
                `).join("");
            }
        }

    } catch (e) {
        console.error("Reports error:", e);
        showToast("Error loading financial reports", "error");
    }
}

// -----------------------------------------------------
// MODAL CONTROLLERS
// -----------------------------------------------------
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "flex";
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "none";
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
