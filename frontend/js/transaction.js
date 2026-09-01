// ==========================================
// SMART ID WALLET
// TRANSACTIONS
// ==========================================

const API_URL = "http://localhost:5000";


// Logged-in student

const studentId =
    localStorage.getItem("studentId");


// Store all transactions

let allTransactions = [];


// Current filter

let currentFilter = "ALL";


// ==========================================
// LOAD TRANSACTIONS
// ==========================================

async function loadTransactions() {

    const list =
        document.getElementById(
            "transactionList"
        );


    if (!studentId) {

        window.location.href =
            "login.html";

        return;
    }


    try {

        const response =
            await fetch(
                API_URL +
                "/api/transactions/" +
                encodeURIComponent(studentId)
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load transactions"
            );
        }


        const transactions =
            await response.json();


        allTransactions =
            Array.isArray(transactions)
                ? transactions
                : [];


        updateCount();


        displayTransactions(
            allTransactions
        );


    } catch (error) {

        console.error(
            "Transaction Error:",
            error
        );


        list.innerHTML = `

            <div class="error-message">

                ❌ Unable to load transactions.

                <br><br>

                Please make sure the
                backend server is running.

            </div>

        `;

    }

}


// ==========================================
// DISPLAY TRANSACTIONS
// ==========================================

function displayTransactions(
    transactions
) {

    const list =
        document.getElementById(
            "transactionList"
        );


    list.innerHTML = "";


    if (
        !transactions ||
        transactions.length === 0
    ) {

        list.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    🧾
                </div>

                <h3>
                    No transactions yet
                </h3>

                <p>
                    Your wallet activity
                    will appear here.
                </p>

            </div>

        `;

        updateVisibleCount(0);

        return;
    }


    // Sort newest first

    const sortedTransactions =
        [...transactions].sort(
            (a, b) => {

                const dateA =
                    getTransactionDate(a);

                const dateB =
                    getTransactionDate(b);

                return dateB - dateA;
            }
        );


    sortedTransactions.forEach(
        transaction => {

            const item =
                createTransactionItem(
                    transaction
                );


            list.appendChild(item);

        }
    );


    updateVisibleCount(
        sortedTransactions.length
    );

}


// ==========================================
// CREATE TRANSACTION ITEM
// ==========================================

function createTransactionItem(
    transaction
) {

    const item =
        document.createElement("div");


    item.className =
        "transaction-item";


    // Transaction type

    const type =
        String(
            transaction.transactionType ||
            transaction.type ||
            ""
        ).toUpperCase();


    const isCredit =
        type === "CREDIT";


    const sign =
        isCredit ? "+" : "-";


    const amount =
        Number(
            transaction.amount || 0
        );


    // Description

    const description =
        transaction.description ||
        transaction.category ||
        "Wallet Transaction";


    // Category

    const category =
        getCategory(description);


    // Icon

    const icon =
        getCategoryIcon(category);


    // Date & Time

    const dateTime =
        formatDateTime(
            getTransactionDateValue(
                transaction
            )
        );


    // Status

    const status =
        transaction.status ||
        "SUCCESS";


    item.innerHTML = `

        <div class="transaction-icon">
            ${icon}
        </div>


        <div class="transaction-details">

            <div class="transaction-name">
                ${escapeHTML(description)}
            </div>


            <span class="transaction-category">
                ${category}
            </span>


            <div class="transaction-date">
                📅 ${dateTime}
            </div>


            <div class="transaction-status">
                ✓ ${escapeHTML(
                    String(status)
                )}
            </div>

        </div>


        <div class="transaction-right">

            <div class="
                transaction-amount
                ${isCredit ? "credit" : "debit"}
            ">

                ${sign}
                ₹${amount.toFixed(2)}

            </div>

        </div>

    `;


    return item;
}


// ==========================================
// CATEGORY
// ==========================================

function getCategory(description) {

    const text =
        String(description)
            .toLowerCase();


    if (
        text.includes("canteen") ||
        text.includes("food") ||
        text.includes("lunch") ||
        text.includes("snack")
    ) {

        return "Canteen";
    }


    if (
        text.includes("stationery") ||
        text.includes("book") ||
        text.includes("pen") ||
        text.includes("notebook")
    ) {

        return "Stationery";
    }


    if (
        text.includes("printing") ||
        text.includes("print") ||
        text.includes("xerox")
    ) {

        return "Printing";
    }


    if (
        text.includes("recharge") ||
        text.includes("add money") ||
        text.includes("wallet")
    ) {

        return "Wallet Recharge";
    }


    return "Other";
}


// ==========================================
// CATEGORY ICON
// ==========================================

function getCategoryIcon(category) {

    switch (category) {

        case "Canteen":
            return "🍽️";

        case "Stationery":
            return "📚";

        case "Printing":
            return "🖨️";

        case "Wallet Recharge":
            return "💳";

        default:
            return "💰";
    }

}


// ==========================================
// DATE VALUE
// ==========================================

function getTransactionDateValue(
    transaction
) {

    return (
        transaction.createdAt ||
        transaction.created_at ||
        transaction.timestamp ||
        transaction.date ||
        transaction.transactionDate ||
        null
    );

}


// ==========================================
// DATE OBJECT
// ==========================================

function getTransactionDate(
    transaction
) {

    const value =
        getTransactionDateValue(
            transaction
        );


    if (!value) {

        return 0;
    }


    const date =
        new Date(value);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return 0;
    }


    return date.getTime();
}


// ==========================================
// FORMAT DATE + TIME
// ==========================================

function formatDateTime(
    dateValue
) {

    if (!dateValue) {

        return "Date & time unavailable";
    }


    const date =
        new Date(dateValue);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return "Date & time unavailable";
    }


    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",

            month: "short",

            year: "numeric",

            hour: "2-digit",

            minute: "2-digit",

            second: "2-digit",

            hour12: true
        }
    );

}


// ==========================================
// FILTER
// ==========================================

function filterTransactions(
    filter,
    button
) {

    currentFilter =
        filter;


    // Update active button

    document
        .querySelectorAll(
            ".filter-btn"
        )
        .forEach(btn => {

            btn.classList.remove(
                "active"
            );

        });


    if (button) {

        button.classList.add(
            "active"
        );

    }


    let filtered =
        allTransactions;


    if (filter === "CREDIT") {

        filtered =
            allTransactions.filter(
                transaction => {

                    const type =
                        String(
                            transaction.transactionType ||
                            transaction.type ||
                            ""
                        ).toUpperCase();

                    return type === "CREDIT";
                }
            );

    }


    if (filter === "DEBIT") {

        filtered =
            allTransactions.filter(
                transaction => {

                    const type =
                        String(
                            transaction.transactionType ||
                            transaction.type ||
                            ""
                        ).toUpperCase();

                    return type === "DEBIT";
                }
            );

    }


    displayTransactions(
        filtered
    );

}


// ==========================================
// TOTAL COUNT
// ==========================================

function updateCount() {

    const count =
        document.getElementById(
            "transactionCount"
        );


    if (count) {

        count.innerText =
            allTransactions.length;

    }

}


// ==========================================
// VISIBLE COUNT
// ==========================================

function updateVisibleCount(
    count
) {

    const element =
        document.getElementById(
            "transactionTotal"
        );


    if (!element) {
        return;
    }


    if (count === 1) {

        element.innerText =
            "1 transaction";

    } else {

        element.innerText =
            count +
            " transactions";

    }

}


// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHTML(value) {

    const div =
        document.createElement("div");


    div.textContent =
        value;


    return div.innerHTML;
}


// ==========================================
// BACK TO DASHBOARD
// ==========================================

function goBack() {

    window.location.href =
        "dashboard.html";
}


// ==========================================
// START
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadTransactions();

    }
);