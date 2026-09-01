const API_URL = "http://localhost:5000";


// ==========================================
// GET LOGGED-IN STUDENT
// ==========================================

const studentId =
    localStorage.getItem("studentId");


if (!studentId) {

    window.location.href = "index.html";

}


// ==========================================
// SELECTED CATEGORY
// ==========================================

let selectedCategory = "";


// ==========================================
// LOAD BALANCE
// ==========================================

async function loadBalance() {

    try {

        const response =
            await fetch(
                API_URL +
                "/api/wallet/" +
                studentId
            );


        const wallet =
            await response.json();


        if (!response.ok) {

            console.error(
                wallet.message
            );

            return;
        }


        document.getElementById(
            "balance"
        ).innerText =
            "₹" +
            Number(wallet.balance)
                .toFixed(2);


    } catch (error) {

        console.error(
            "Balance error:",
            error
        );

    }

}


// ==========================================
// SELECT CATEGORY
// ==========================================

function selectCategory(button) {

    const buttons =
        document.querySelectorAll(
            ".category-btn"
        );


    buttons.forEach(btn => {

        btn.classList.remove(
            "active"
        );

    });


    button.classList.add(
        "active"
    );


    selectedCategory =
        button.dataset.category;

}


// ==========================================
// PAY NOW
// ==========================================

async function payNow() {

    const amountInput =
        document.getElementById(
            "amount"
        );


    const descriptionInput =
        document.getElementById(
            "description"
        );


    const amount =
        parseFloat(
            amountInput.value
        );


    const description =
        descriptionInput.value.trim();


    // ======================================
    // VALIDATION
    // ======================================

    if (
        isNaN(amount) ||
        amount <= 0
    ) {

        alert(
            "Please enter a valid payment amount."
        );

        amountInput.focus();

        return;
    }


    if (!selectedCategory) {

        alert(
            "Please select a payment category."
        );

        return;
    }


    if (!description) {

        alert(
            "Please enter a payment description."
        );

        descriptionInput.focus();

        return;
    }


    // ======================================
    // CONFIRM PAYMENT
    // ======================================

    const confirmPayment =
        confirm(
            "Confirm Payment\n\n" +

            "Category: " +
            selectedCategory +

            "\nAmount: ₹" +
            amount.toFixed(2) +

            "\nDescription: " +
            description
        );


    if (!confirmPayment) {

        return;
    }


    // ======================================
    // DISABLE PAY BUTTON
    // Prevent double payment
    // ======================================

    const payButton =
        document.querySelector(
            ".pay-btn"
        );


    if (payButton) {

        payButton.disabled = true;

        payButton.innerText =
            "Processing...";

    }


    try {

        // ==================================
        // SEND PAYMENT TO BACKEND
        // ==================================

        const response =
            await fetch(
                API_URL +
                "/api/wallet/pay",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        studentId:
                            studentId,

                        amount:
                            amount,

                        category:
                            selectedCategory,

                        description:
                            description

                    })

                }
            );


        const result =
            await response.json();


        // ==================================
        // ERROR
        // ==================================

        if (!response.ok) {

            alert(
                result.message ||
                "Payment failed."
            );

            resetPayButton();

            return;
        }


        // ==================================
        // CURRENT DATE & TIME
        // ==================================

        const now =
            new Date();


        const dateTime =
            now.toLocaleString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );


        // ==================================
        // SUCCESS MODAL
        // ==================================

        document.getElementById(
            "successDetails"
        ).innerHTML =

            `
            <div class="success-details">

                <p>
                    Payment of
                    <strong>
                        ₹${amount.toFixed(2)}
                    </strong>
                    was successful.
                </p>

                <p>
                    <strong>Category:</strong>
                    ${escapeHTML(selectedCategory)}
                </p>

                <p>
                    <strong>Description:</strong>
                    ${escapeHTML(description)}
                </p>

                <p>
                    <strong>Date & Time:</strong>
                    ${dateTime}
                </p>

                <p>
                    <strong>Remaining Balance:</strong>
                    ₹${Number(result.balance).toFixed(2)}
                </p>

            </div>
            `;


        document.getElementById(
            "successModal"
        ).classList.add("show");


        // Update balance

        document.getElementById(
            "balance"
        ).innerText =
            "₹" +
            Number(result.balance)
                .toFixed(2);


    } catch (error) {

        console.error(
            "Payment error:",
            error
        );


        alert(
            "Unable to connect to server."
        );


        resetPayButton();

    }

}


// ==========================================
// RESET PAY BUTTON
// ==========================================

function resetPayButton() {

    const payButton =
        document.querySelector(
            ".pay-btn"
        );


    if (payButton) {

        payButton.disabled = false;

        payButton.innerHTML =
            "<span>💳</span> Pay Now";

    }

}


// ==========================================
// CLOSE SUCCESS
// ==========================================

function closeSuccess() {

    document.getElementById(
        "successModal"
    ).classList.remove("show");


    // Clear form

    document.getElementById(
        "amount"
    ).value = "";


    document.getElementById(
        "description"
    ).value = "";


    document.querySelectorAll(
        ".category-btn"
    ).forEach(btn => {

        btn.classList.remove(
            "active"
        );

    });


    selectedCategory = "";


    // Go dashboard

    window.location.href =
        "dashboard.html";

}


// ==========================================
// BACK
// ==========================================

function goBack() {

    window.location.href =
        "dashboard.html";

}


// ==========================================
// ESCAPE HTML
// Security
// ==========================================

function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value;

    return div.innerHTML;

}


// ==========================================
// PAGE LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadBalance();

    }
);