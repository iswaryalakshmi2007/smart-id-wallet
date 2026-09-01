const API_URL = "http://localhost:5000";


// =====================================================
// STUDENT ID
// =====================================================

const studentId =
    localStorage.getItem("studentId");


if (!studentId) {

    window.location.href =
        "index.html";
}


// =====================================================
// STORE TRANSACTIONS
// =====================================================

let allTransactions = [];


// =====================================================
// LOAD HISTORY
// =====================================================

async function loadHistory() {

    try {

        // ---------------------------------------------
        // LOAD STUDENT
        // ---------------------------------------------

        const studentResponse =
            await fetch(
                API_URL +
                "/api/student/" +
                studentId
            );


        const student =
            await studentResponse.json();


        if (studentResponse.ok) {

            const nameElement =
                document.getElementById(
                    "studentName"
                );


            const idElement =
                document.getElementById(
                    "studentId"
                );


            if (nameElement) {

                nameElement.innerText =
                    student.name || "Student";

            }


            if (idElement) {

                idElement.innerText =
                    student.student_id ||
                    studentId;

            }

        }


        // ---------------------------------------------
        // LOAD BALANCE
        // ---------------------------------------------

        const walletResponse =
            await fetch(
                API_URL +
                "/api/wallet/" +
                studentId
            );


        const wallet =
            await walletResponse.json();


        if (walletResponse.ok) {

            const balanceElement =
                document.getElementById(
                    "balance"
                );


            if (balanceElement) {

                balanceElement.innerText =
                    "₹" +
                    Number(
                        wallet.balance || 0
                    ).toFixed(2);

            }

        }


        // ---------------------------------------------
        // LOAD TRANSACTIONS
        // ---------------------------------------------

        const transactionResponse =
            await fetch(
                API_URL +
                "/api/transactions/" +
                studentId
            );


        if (!transactionResponse.ok) {

            throw new Error(
                "Unable to load transactions"
            );
        }


        allTransactions =
            await transactionResponse.json();


        updateTransactionCount(
            allTransactions.length
        );


        displayTransactions(
            allTransactions
        );


    } catch (error) {

        console.error(
            "History Error:",
            error
        );


        const list =
            document.getElementById(
                "transactionList"
            );


        list.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    ⚠️
                </div>

                <h2>
                    Unable to Load
                </h2>

                <p>
                    Please make sure the
                    Flask server is running.
                </p>

            </div>

        `;

    }
}


// =====================================================
// DISPLAY TRANSACTIONS
// =====================================================

function displayTransactions(
    transactions
) {

    const list =
        document.getElementById(
            "transactionList"
        );


    const emptyState =
        document.getElementById(
            "emptyState"
        );


    list.innerHTML = "";


    // ---------------------------------------------
    // NO TRANSACTIONS
    // ---------------------------------------------

    if (
        !transactions ||
        transactions.length === 0
    ) {

        list.style.display =
            "none";


        emptyState.style.display =
            "block";


        return;
    }


    list.style.display =
        "block";


    emptyState.style.display =
        "none";


    // ---------------------------------------------
    // CREATE CARDS
    // ---------------------------------------------

    transactions.forEach(
        transaction => {

            const isCredit =
                transaction.transaction_type
                === "CREDIT";


            const sign =
                isCredit
                ? "+"
                : "-";


            const icon =
                getCategoryIcon(
                    transaction.category,
                    isCredit
                );


            const category =
                transaction.category ||
                "Wallet";


            const description =
                transaction.description ||
                category;


            const date =
                transaction.created_at ||
                transaction.transaction_date;


            const formattedDate =
                formatDateTime(
                    date
                );


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "transaction-card";


            card.innerHTML = `

                <div class="
                    transaction-icon
                    ${
                        isCredit
                        ? "credit-icon"
                        : "debit-icon"
                    }
                ">

                    ${icon}

                </div>


                <div class="transaction-info">

                    <h3>
                        ${escapeHTML(
                            description
                        )}
                    </h3>


                    <span class="category">

                        ${escapeHTML(
                            category
                        )}

                    </span>


                    <span class="date">

                        📅 ${formattedDate}

                    </span>

                </div>


                <div class="transaction-amount">

                    <div class="
                        amount
                        ${
                            isCredit
                            ? "credit"
                            : "debit"
                        }
                    ">

                        ${sign}₹${
                            Number(
                                transaction.amount || 0
                            ).toFixed(2)
                        }

                    </div>


                    <span class="status">

                        ✓ ${
                            transaction.status ||
                            "SUCCESS"
                        }

                    </span>

                </div>

            `;


            list.appendChild(
                card
            );

        }
    );
}


// =====================================================
// FILTER
// =====================================================

function filterTransactions(
    type,
    button
) {

    // ---------------------------------------------
    // UPDATE BUTTON
    // ---------------------------------------------

    document
        .querySelectorAll(
            ".filter-btn"
        )
        .forEach(
            btn => {

                btn.classList.remove(
                    "active"
                );

            }
        );


    button.classList.add(
        "active"
    );


    // ---------------------------------------------
    // FILTER DATA
    // ---------------------------------------------

    let filtered =
        allTransactions;


    if (type === "CREDIT") {

        filtered =
            allTransactions.filter(
                transaction =>
                    transaction.transaction_type
                    === "CREDIT"
            );

    }


    if (type === "DEBIT") {

        filtered =
            allTransactions.filter(
                transaction =>
                    transaction.transaction_type
                    === "DEBIT"
            );

    }


    updateTransactionCount(
        filtered.length
    );


    displayTransactions(
        filtered
    );
}


// =====================================================
// TRANSACTION COUNT
// =====================================================

function updateTransactionCount(
    count
) {

    const element =
        document.getElementById(
            "transactionCount"
        );


    if (!element) return;


    if (count === 1) {

        element.innerText =
            "1 transaction";

    } else {

        element.innerText =
            count +
            " transactions";
    }
}


// =====================================================
// CATEGORY ICON
// =====================================================

function getCategoryIcon(
    category,
    isCredit
) {

    if (isCredit) {

        return "💰";
    }


    switch (category) {

        case "Canteen":

            return "🍽️";


        case "Stationery":

            return "📚";


        case "Printing":

            return "🖨️";


        case "Other":

            return "📦";


        default:

            return "💳";
    }
}


// =====================================================
// DATE + TIME
// =====================================================

function formatDateTime(
    dateString
) {

    if (!dateString) {

        return "Date unavailable";
    }


    try {

        let date =
            new Date(
                dateString
            );


        // SQLite compatibility
        if (
            isNaN(
                date.getTime()
            )
        ) {

            date =
                new Date(
                    dateString.replace(
                        " ",
                        "T"
                    )
                );
        }


        if (
            isNaN(
                date.getTime()
            )
        ) {

            return dateString;
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


    } catch (error) {

        return dateString;
    }
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.innerText =
        value;


    return div.innerHTML;
}


// =====================================================
// NAVIGATION
// =====================================================

function goBack() {

    window.location.href =
        "dashboard.html";
}


function goHome() {

    window.location.href =
        "dashboard.html";
}


function viewID() {

    window.location.href =
        "my-id.html";
}


function profile() {

    window.location.href =
        "profile.html";
}


// =====================================================
// START
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadHistory();

    }
);