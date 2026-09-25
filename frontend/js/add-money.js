// =====================================================
// SMART ID WALLET - ADD MONEY CONTROLLER
// =====================================================

let activeOrder = null;
const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");

document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireAuth("student")) return;
    await loadCurrentBalance();
    updateSummary();
});

async function loadCurrentBalance() {
    try {
        const res = await apiRequest(`/api/wallet/${studentId}`);
        if (res.ok && res.data) {
            const bal = Number(res.data.balance) || 0;
            const balEl = document.getElementById("currentBalance");
            if (balEl) balEl.innerText = formatCurrency(bal);
        }
    } catch (e) {
        console.error("Error loading balance:", e);
    }
}

function setAmount(val) {
    const input = document.getElementById("amountInput");
    if (input) {
        input.value = val;
        updateSummary();
    }

    // Highlight selected chip
    document.querySelectorAll(".preset-chips .chip").forEach(c => {
        c.classList.remove("active");
        if (c.innerText.includes(val.toString())) {
            c.classList.add("active");
        }
    });
}

function updateSummary() {
    const input = document.getElementById("amountInput");
    const val = Number(input ? input.value : 0) || 0;

    const sumTopup = document.getElementById("summaryTopup");
    const sumTotal = document.getElementById("summaryTotal");

    if (sumTopup) sumTopup.innerText = formatCurrency(val);
    if (sumTotal) sumTotal.innerText = formatCurrency(val);

    const proceedBtn = document.getElementById("proceedBtn");
    if (proceedBtn) {
        proceedBtn.disabled = val <= 0;
    }
}

async function initiatePayment() {
    const input = document.getElementById("amountInput");
    const amount = Number(input ? input.value : 0) || 0;

    if (amount <= 0) {
        showToast("Please enter an amount greater than ₹0", "error");
        return;
    }

    const proceedBtn = document.getElementById("proceedBtn");
    if (proceedBtn) proceedBtn.disabled = true;

    try {
        // Call backend payment abstraction layer to create verifiable order
        const res = await apiRequest("/api/wallet/topup/create", {
            method: "POST",
            body: JSON.stringify({
                studentId: studentId,
                amount: amount
            })
        });

        if (!res.ok || !res.data.success) {
            showToast(res.data.message || "Unable to create payment order", "error");
            if (proceedBtn) proceedBtn.disabled = false;
            return;
        }

        activeOrder = res.data;
        openGatewayModal(activeOrder);

    } catch (e) {
        console.error("Payment initiation error:", e);
        showToast("Failed to connect to payment service", "error");
    } finally {
        if (proceedBtn) proceedBtn.disabled = false;
    }
}

function openGatewayModal(order) {
    const modal = document.getElementById("gatewayModal");
    const orderIdEl = document.getElementById("gatewayOrderId");
    const amtEl = document.getElementById("gatewayAmount");
    const gwBtnText = document.getElementById("gwBtnText");

    if (orderIdEl) orderIdEl.innerText = `ORDER_ID: ${order.order_id}`;
    if (amtEl) amtEl.innerText = formatCurrency(order.amount);
    if (gwBtnText) gwBtnText.innerText = `Authorize Payment (${formatCurrency(order.amount)})`;

    if (modal) modal.style.display = "flex";
}

function closeGatewayModal() {
    const modal = document.getElementById("gatewayModal");
    if (modal) modal.style.display = "none";
}

async function confirmPaymentGateway() {
    if (!activeOrder) return;

    const confirmBtn = document.getElementById("gwConfirmBtn");
    const spinner = document.getElementById("gwSpinner");
    const btnText = document.getElementById("gwBtnText");

    if (confirmBtn) confirmBtn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (btnText) btnText.innerText = "Verifying with server...";

    try {
        // Send order verification to backend
        const res = await apiRequest("/api/wallet/topup/verify", {
            method: "POST",
            body: JSON.stringify({
                studentId: studentId,
                orderId: activeOrder.order_id,
                paymentId: `PAY_${Date.now()}`,
                signature: activeOrder.mock_signature
            })
        });

        if (!res.ok || !res.data.success) {
            showToast(res.data.message || "Payment verification failed", "error");
            return;
        }

        // Close gateway modal
        closeGatewayModal();

        // Show Success Receipt Modal
        openReceiptModal(res.data);
        await loadCurrentBalance();

    } catch (e) {
        console.error("Verification error:", e);
        showToast("Payment verification request failed", "error");
    } finally {
        if (confirmBtn) confirmBtn.disabled = false;
        if (spinner) spinner.style.display = "none";
        if (btnText) btnText.innerText = `Authorize Payment (${formatCurrency(activeOrder ? activeOrder.amount : 0)})`;
    }
}

function openReceiptModal(data) {
    const modal = document.getElementById("receiptModal");
    if (!modal) return;

    document.getElementById("rcptTxnId").innerText = data.display_txn_id || `TXN${10000 + (data.transaction_id || 1)}`;
    document.getElementById("rcptStudentId").innerText = studentId;
    document.getElementById("rcptAmount").innerText = `+${formatCurrency(data.amount)}`;
    document.getElementById("rcptPrevBal").innerText = formatCurrency(data.previous_balance);
    document.getElementById("rcptNewBal").innerText = formatCurrency(data.new_balance);
    document.getElementById("rcptRef").innerText = data.payment_reference || "VERIFIED_GATEWAY";
    document.getElementById("rcptDate").innerText = formatDateTime(data.created_at);

    modal.style.display = "flex";
}
