// =====================================================
// SMART ID WALLET - STUDENT DASHBOARD CONTROLLER
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Validate session & student role
    if (!Auth.requireAuth("student")) return;

    const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");
    if (!studentId) {
        window.location.href = "index.html";
        return;
    }

    // 2. Load dashboard data
    await loadStudentData(studentId);
    await loadWalletData(studentId);
    await loadRecentTransactions(studentId);
});

async function loadStudentData(studentId) {
    try {
        const res = await apiRequest(`/api/student/${studentId}`);
        if (res.ok && res.data) {
            const student = res.data;
            const nameEl = document.getElementById("studentName");
            const idEl = document.getElementById("studentId");
            const deptEl = document.getElementById("department");
            const yearEl = document.getElementById("academicYear");
            const badgeEl = document.getElementById("studentStatusBadge");

            if (nameEl) nameEl.innerText = student.name || "Student";
            if (idEl) idEl.innerText = student.student_id || studentId;
            if (deptEl) deptEl.innerText = student.department || "--";
            if (yearEl) yearEl.innerText = student.academic_year || "--";
            if (badgeEl) {
                badgeEl.innerText = student.status || "ACTIVE";
                badgeEl.className = `status-badge ${student.status === "ACTIVE" ? "active" : "inactive"}`;
            }
        }
    } catch (e) {
        console.error("Error loading student profile:", e);
    }
}

async function loadWalletData(studentId) {
    try {
        const res = await apiRequest(`/api/wallet/${studentId}`);
        if (res.ok && res.data) {
            const wallet = res.data;
            const balance = Number(wallet.balance) || 0;
            const limit = Number(wallet.low_balance_limit) || CONFIG.DEFAULT_LOW_BALANCE_LIMIT;

            const balEl = document.getElementById("balance");
            if (balEl) balEl.innerText = formatCurrency(balance);

            const syncEl = document.getElementById("lastSyncTime");
            if (syncEl) syncEl.innerText = "Synced: " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Low Balance Alert handling
            const alertBox = document.getElementById("lowBalanceAlert");
            const alertText = document.getElementById("lowBalanceText");
            if (alertBox) {
                if (balance <= limit) {
                    alertBox.style.display = "flex";
                    if (alertText) {
                        alertText.innerText = `Balance is ${formatCurrency(balance)} (below ${formatCurrency(limit)}). Add funds to continue campus shopping.`;
                    }
                } else {
                    alertBox.style.display = "none";
                }
            }
        }
    } catch (e) {
        console.error("Error loading wallet balance:", e);
    }
}

async function loadRecentTransactions(studentId) {
    const listEl = document.getElementById("recentTransactions");
    if (!listEl) return;

    try {
        const res = await apiRequest(`/api/transactions/${studentId}`);
        if (!res.ok || !Array.isArray(res.data)) {
            listEl.innerHTML = `<div class="empty-state">Unable to load transactions</div>`;
            return;
        }

        const txns = res.data.slice(0, 5); // Latest 5 transactions
        if (txns.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <span>🧾</span>
                    <p style="margin-top:6px;">No transactions yet. Add money or make a purchase!</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = txns.map(t => {
            const isCredit = t.transaction_type === "WALLET_TOPUP" || t.transaction_type === "CREDIT";
            const icon = isCredit ? "💳" : (t.category === "Canteen" ? "🍽️" : t.category === "Printing" ? "🖨️" : "🛍️");
            const sign = isCredit ? "+" : "-";
            const amtClass = isCredit ? "credit" : "debit";
            const title = t.description || (isCredit ? "Wallet Recharge" : `${t.category} Purchase`);

            return `
                <div class="txn-card" onclick="window.location.href='history.html'">
                    <div class="txn-left">
                        <div class="txn-icon-box ${amtClass}">
                            <span>${icon}</span>
                        </div>
                        <div class="txn-info">
                            <h4>${escapeHtml(title)}</h4>
                            <span class="txn-date">${formatDateTime(t.created_at || t.transaction_date)}</span>
                        </div>
                    </div>
                    <div class="txn-amount ${amtClass}">
                        ${sign}${formatCurrency(t.amount)}
                    </div>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("Error loading transactions:", e);
        listEl.innerHTML = `<div class="empty-state">Error loading recent transactions</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}