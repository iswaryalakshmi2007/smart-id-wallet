// =====================================================
// SMART ID WALLET - SCAN & PAY CONTROLLER
// =====================================================

let currentBalance = 0;
let selectedCategory = "Canteen";
const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");

document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireAuth("student")) return;
    await loadBalance();
});

async function loadBalance() {
    try {
        const res = await apiRequest(`/api/wallet/${studentId}`);
        if (res.ok && res.data) {
            currentBalance = Number(res.data.balance) || 0;
            const balEl = document.getElementById("availableBalance");
            if (balEl) balEl.innerText = formatCurrency(currentBalance);
        }
    } catch (e) {
        console.error("Error loading balance:", e);
    }
}

function selectCategory(btn) {
    document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCategory = btn.getAttribute("data-category") || "Other";
    hideError();
}

async function executePayment() {
    const amountInput = document.getElementById("paymentAmount");
    const descInput = document.getElementById("paymentDesc");
    const payBtn = document.getElementById("payButton");
    const payText = document.getElementById("payBtnText");
    const paySpinner = document.getElementById("paySpinner");

    const amount = Number(amountInput ? amountInput.value : 0) || 0;
    const description = descInput ? descInput.value.trim() : "";

    hideError();

    // 1. Amount validation
    if (amount <= 0) {
        showError("Please enter a valid payment amount greater than ₹0");
        if (amountInput) amountInput.focus();
        return;
    }

    // 2. Client-side balance check
    if (amount > currentBalance) {
        showError(`Insufficient wallet balance. Available: ${formatCurrency(currentBalance)}, Required: ${formatCurrency(amount)}`);
        return;
    }

    // 3. UI Loading
    if (payBtn) payBtn.disabled = true;
    if (paySpinner) paySpinner.style.display = "inline-block";
    if (payText) payText.innerText = "Processing Payment...";

    try {
        const res = await apiRequest("/api/wallet/pay", {
            method: "POST",
            body: JSON.stringify({
                studentId: studentId,
                amount: amount,
                category: selectedCategory,
                description: description || `${selectedCategory} Payment`
            })
        });

        if (!res.ok || !res.data.success) {
            showError(res.data.message || "Payment could not be completed.");
            return;
        }

        // Success - Open Modal
        openSuccessModal(res.data, amount);
        await loadBalance();

    } catch (e) {
        console.error("Payment execution error:", e);
        showError("Unable to complete payment. Please check your network.");
    } finally {
        if (payBtn) payBtn.disabled = false;
        if (paySpinner) paySpinner.style.display = "none";
        if (payText) payText.innerText = "Pay Now";
    }
}

function openSuccessModal(data, paidAmount) {
    const modal = document.getElementById("successModal");
    if (!modal) return;

    document.getElementById("modalTxnId").innerText = data.display_txn_id || `TXN${10000 + (data.transaction_id || 1)}`;
    document.getElementById("modalCategory").innerText = data.category || selectedCategory;
    document.getElementById("modalDescription").innerText = data.description || selectedCategory;
    document.getElementById("modalAmount").innerText = `-${formatCurrency(paidAmount)}`;
    const prevBalEl = document.getElementById("modalPreviousBalance");
    if (prevBalEl) prevBalEl.innerText = formatCurrency(data.previous_balance !== undefined ? data.previous_balance : currentBalance);
    document.getElementById("modalRemaining").innerText = formatCurrency(data.balance !== undefined ? data.balance : (data.remaining_balance || 0));
    document.getElementById("modalDateTime").innerText = formatDateTime(data.created_at);

    modal.style.display = "flex";
}

function showError(msg) {
    const errBox = document.getElementById("errorMessage");
    if (!errBox) return;
    errBox.innerText = msg;
    errBox.style.display = "block";
}

function hideError() {
    const errBox = document.getElementById("errorMessage");
    if (errBox) errBox.style.display = "none";
}