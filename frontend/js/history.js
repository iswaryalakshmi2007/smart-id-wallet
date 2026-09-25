// =====================================================
// SMART ID WALLET - TRANSACTION HISTORY CONTROLLER
// =====================================================

let allTransactions = [];
let currentFilter = "ALL";
const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");

document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireAuth("student")) return;

    await loadWalletBalance();
    await loadTransactions();
});

async function loadWalletBalance() {
    try {
        const res = await apiRequest(`/api/wallet/${studentId}`);
        if (res.ok && res.data) {
            const bal = Number(res.data.balance) || 0;
            const balEl = document.getElementById("summaryBalance");
            if (balEl) balEl.innerText = formatCurrency(bal);
        }
    } catch (e) {
        console.error("Error loading wallet balance:", e);
    }
}

async function loadTransactions() {
    const listContainer = document.getElementById("transactionsList");
    const countEl = document.getElementById("summaryCount");
    const badgeEl = document.getElementById("listBadge");

    try {
        const res = await apiRequest(`/api/transactions/${studentId}`);
        if (!res.ok || !Array.isArray(res.data)) {
            listContainer.innerHTML = `<div class="empty-state">Failed to load transactions</div>`;
            return;
        }

        allTransactions = res.data;
        if (countEl) countEl.innerText = allTransactions.length;
        renderTransactions();

    } catch (e) {
        console.error("Error loading transactions:", e);
        listContainer.innerHTML = `<div class="empty-state">Unable to load transactions</div>`;
    }
}

function filterTransactions(filterType, btn) {
    currentFilter = filterType;
    document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderTransactions();
}

function renderTransactions() {
    const listContainer = document.getElementById("transactionsList");
    const badgeEl = document.getElementById("listBadge");
    if (!listContainer) return;

    let filtered = allTransactions;
    if (currentFilter === "DEBIT") {
        filtered = allTransactions.filter(t => t.transaction_type === "DEBIT" || t.transaction_type === "PURCHASE");
    } else if (currentFilter === "CREDIT") {
        filtered = allTransactions.filter(t => t.transaction_type === "WALLET_TOPUP" || t.transaction_type === "CREDIT");
    }

    if (badgeEl) badgeEl.innerText = `${filtered.length} records`;

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span>🔍</span>
                <p style="margin-top:6px;">No transactions found for this filter.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(t => {
        const isCredit = t.transaction_type === "WALLET_TOPUP" || t.transaction_type === "CREDIT";
        const icon = isCredit ? "💳" : (t.category === "Canteen" ? "🍽️" : t.category === "Printing" ? "🖨️" : "🛍️");
        const sign = isCredit ? "+" : "-";
        const amtClass = isCredit ? "credit" : "debit";
        const title = t.description || (isCredit ? "Wallet Recharge" : `${t.category} Payment`);
        const txnDisplayId = `TXN${10000 + (t.transaction_id || 1)}`;

        return `
            <div class="txn-row-card" onclick="viewTransactionDetail(${t.transaction_id})">
                <div class="txn-main-left">
                    <div class="txn-badge-icon ${amtClass}">
                        <span>${icon}</span>
                    </div>
                    <div class="txn-title-meta">
                        <h4>${escapeHtml(title)}</h4>
                        ${t.shop_name ? `<span class="txn-shop-tag">🏪 ${escapeHtml(t.shop_name)}</span>` : ""}
                        <span class="txn-date-sub">${formatDateTime(t.created_at || t.transaction_date)} • ${txnDisplayId}</span>
                    </div>
                </div>
                <div class="txn-main-right">
                    <div class="txn-sum ${amtClass}">
                        ${sign}${formatCurrency(t.amount)}
                    </div>
                    <span class="txn-status-dot">✓ SUCCESS</span>
                </div>
            </div>
        `;
    }).join("");
}

async function viewTransactionDetail(txnId) {
    const modal = document.getElementById("detailModal");
    const bodyEl = document.getElementById("modalReceiptBody");
    if (!modal || !bodyEl) return;

    bodyEl.innerHTML = `<div style="text-align:center; padding:20px;">Loading receipt details...</div>`;
    modal.style.display = "flex";

    try {
        const res = await apiRequest(`/api/transaction/${txnId}`);
        if (!res.ok || !res.data.success) {
            bodyEl.innerHTML = `<div class="empty-state">Failed to load transaction details.</div>`;
            return;
        }

        const t = res.data.transaction;
        const isCredit = t.transaction_type === "WALLET_TOPUP" || t.transaction_type === "CREDIT";
        const displayId = `TXN${10000 + t.transaction_id}`;

        let itemsHtml = "";
        if (t.items && t.items.length > 0) {
            itemsHtml = `
                <div style="margin-top:14px;">
                    <strong style="font-size:12px; text-transform:uppercase; color:#64748b;">Purchased Items:</strong>
                    <div class="receipt-item-list">
                        ${t.items.map(it => `
                            <div class="receipt-item-line">
                                <span>${escapeHtml(it.product_name_snapshot)} × ${it.quantity}</span>
                                <strong>${formatCurrency(it.line_total)}</strong>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        bodyEl.innerHTML = `
            <div style="text-align:center; margin-bottom:16px;">
                <div style="font-size:32px;">${isCredit ? "💳" : "🛍️"}</div>
                <h2 style="font-size:24px; font-weight:800; color:${isCredit ? '#059669' : '#0f172a'}; margin-top:6px;">
                    ${isCredit ? '+' : '-'}${formatCurrency(t.amount)}
                </h2>
                <span style="font-size:12px; color:#64748b;">${escapeHtml(t.description || t.transaction_type)}</span>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:14px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Transaction ID:</span>
                    <strong>${displayId}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Type:</span>
                    <strong>${t.transaction_type}</strong>
                </div>
                ${t.shop_name ? `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Shop:</span>
                    <strong>${escapeHtml(t.shop_name)}</strong>
                </div>` : ''}
                ${t.wallet_before !== null && t.wallet_before !== undefined ? `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Previous Wallet:</span>
                    <span>${formatCurrency(t.wallet_before)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Remaining Wallet:</span>
                    <strong style="color:#0d9488;">${formatCurrency(t.wallet_after)}</strong>
                </div>` : ''}
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="color:#64748b;">Date & Time:</span>
                    <span>${formatDateTime(t.created_at || t.transaction_date)}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:#64748b;">Status:</span>
                    <strong style="color:#059669;">✓ ${t.status}</strong>
                </div>
            </div>

            ${itemsHtml}
        `;

    } catch (e) {
        console.error("Error viewing transaction detail:", e);
        bodyEl.innerHTML = `<div class="empty-state">Error loading transaction details.</div>`;
    }
}

function closeDetailModal() {
    const modal = document.getElementById("detailModal");
    if (modal) modal.style.display = "none";
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