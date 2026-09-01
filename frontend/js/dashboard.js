const API_URL = "http://localhost:5000";


// =====================================================
// LOGGED-IN STUDENT
// =====================================================

const studentId =
    localStorage.getItem("studentId");


if (!studentId) {

    window.location.href =
        "index.html";
}


// =====================================================
// LOAD DASHBOARD
// =====================================================

async function loadDashboard() {

    try {

        // ---------------------------------------------
        // STUDENT DETAILS
        // ---------------------------------------------

        const studentResponse =
            await fetch(
                API_URL +
                "/api/student/" +
                studentId
            );


        if (!studentResponse.ok) {

            throw new Error(
                "Unable to load student"
            );
        }


        const student =
            await studentResponse.json();


        const nameElement =
            document.getElementById(
                "studentName"
            );

        const idElement =
            document.getElementById(
                "studentId"
            );

        const departmentElement =
            document.getElementById(
                "department"
            );

        const academicYearElement =
            document.getElementById(
                "academicYear"
            );


        if (nameElement) {

            nameElement.innerText =
                student.name || "Student";
        }


        if (idElement) {

            idElement.innerText =
                student.student_id || studentId;
        }


        if (departmentElement) {

            departmentElement.innerText =
                student.department || "-";
        }


        if (academicYearElement) {

            academicYearElement.innerText =
                student.academic_year || "-";
        }


        // ---------------------------------------------
        // WALLET
        // ---------------------------------------------

        const walletResponse =
            await fetch(
                API_URL +
                "/api/wallet/" +
                studentId
            );


        if (!walletResponse.ok) {

            throw new Error(
                "Unable to load wallet"
            );
        }


        const wallet =
            await walletResponse.json();


        const balance =
            Number(wallet.balance || 0);


        const limit =
            Number(
                wallet.low_balance_limit || 100
            );


        const balanceElement =
            document.getElementById(
                "balance"
            );


        if (balanceElement) {

            balanceElement.innerText =
                "₹" +
                balance.toFixed(2);
        }


        // ---------------------------------------------
        // LOW BALANCE
        // ---------------------------------------------

        checkLowBalance(
            balance,
            limit
        );


        // ---------------------------------------------
        // RECENT TRANSACTIONS
        // ---------------------------------------------

        await loadRecentTransactions();


    } catch (error) {

        console.error(
            "Dashboard Error:",
            error
        );


        alert(
            "Unable to load dashboard. " +
            "Please check whether Flask server is running."
        );
    }
}


// =====================================================
// ADD MONEY
// =====================================================

async function addMoney() {

    const amount =
        prompt(
            "Enter amount to add:"
        );


    // User cancelled
    if (amount === null) {

        return;
    }


    const value =
        parseFloat(
            amount
        );


    // Validate
    if (
        isNaN(value) ||
        value <= 0
    ) {

        alert(
            "Please enter a valid amount."
        );

        return;
    }


    try {

        const response =
            await fetch(
                API_URL +
                "/api/wallet/add-money",
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
                            value

                    })

                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            alert(
                result.message ||
                "Unable to add money."
            );

            return;
        }


        alert(
            "Money Added Successfully! 💰\n\n" +

            "Added Amount: ₹" +
            value.toFixed(2) +

            "\nNew Balance: ₹" +
            Number(
                result.balance
            ).toFixed(2)
        );


        // Refresh dashboard
        await loadDashboard();


    } catch (error) {

        console.error(
            "Add Money Error:",
            error
        );


        alert(
            "Unable to connect to server."
        );
    }
}


// =====================================================
// SCAN & PAY
// =====================================================

async function scanPay() {

    // ---------------------------------------------
    // CATEGORY SELECTION
    // ---------------------------------------------

    const categoryInput =
        prompt(
            "SELECT PAYMENT CATEGORY\n\n" +

            "1. 🍽️ Canteen\n" +

            "2. 📚 Stationery\n" +

            "3. 🖨️ Printing\n" +

            "4. 📦 Other\n\n" +

            "Enter option (1-4):"
        );


    if (categoryInput === null) {

        return;
    }


    const categories = {

        "1": "Canteen",

        "2": "Stationery",

        "3": "Printing",

        "4": "Other"

    };


    const selected =
        categories[
            categoryInput.trim()
        ];


    if (!selected) {

        alert(
            "Please select a valid category."
        );

        return;
    }


    // ---------------------------------------------
    // AMOUNT
    // ---------------------------------------------

    const amount =
        prompt(
            "Enter " +
            selected +
            " payment amount:"
        );


    if (amount === null) {

        return;
    }


    const value =
        parseFloat(
            amount
        );


    if (
        isNaN(value) ||
        value <= 0
    ) {

        alert(
            "Please enter a valid amount."
        );

        return;
    }


    // ---------------------------------------------
    // DESCRIPTION
    // ---------------------------------------------

    const description =
        prompt(
            "Enter description:",
            selected
        );


    if (
        description === null
    ) {

        return;
    }


    const finalDescription =
        description.trim() ||
        selected;


    // ---------------------------------------------
    // CONFIRM PAYMENT
    // ---------------------------------------------

    const confirmPayment =
        confirm(

            "CONFIRM PAYMENT\n\n" +

            "Category: " +
            selected +

            "\nAmount: ₹" +
            value.toFixed(2) +

            "\nDescription: " +
            finalDescription +

            "\n\nDo you want to continue?"

        );


    if (!confirmPayment) {

        return;
    }


    // ---------------------------------------------
    // SEND PAYMENT TO BACKEND
    // ---------------------------------------------

    try {

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
                            value,

                        category:
                            selected,

                        description:
                            finalDescription

                    })

                }
            );


        const result =
            await response.json();


        // ---------------------------------------------
        // PAYMENT FAILED
        // ---------------------------------------------

        if (!response.ok) {

            alert(

                result.message ||
                "Payment failed."

            );

            return;
        }


        // ---------------------------------------------
        // PAYMENT SUCCESS
        // ---------------------------------------------

        alert(

            "Payment Successful! ✅\n\n" +

            "Category: " +
            selected +

            "\nAmount: ₹" +
            value.toFixed(2) +

            "\nNew Balance: ₹" +
            Number(
                result.balance
            ).toFixed(2)

        );


        // Refresh dashboard
        await loadDashboard();


    } catch (error) {

        console.error(
            "Payment Error:",
            error
        );


        alert(
            "Payment failed. " +
            "Please check the server."
        );
    }
}


// =====================================================
// RECENT TRANSACTIONS
// =====================================================

async function loadRecentTransactions() {

    const container =
        document.getElementById(
            "recentTransactions"
        );


    if (!container) {

        return;
    }


    try {

        const response =
            await fetch(
                API_URL +
                "/api/transactions/" +
                studentId
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load transactions"
            );
        }


        const transactions =
            await response.json();


        container.innerHTML = "";


        // ---------------------------------------------
        // NO TRANSACTIONS
        // ---------------------------------------------

        if (
            !transactions ||
            transactions.length === 0
        ) {

            container.innerHTML = `

                <div class="empty-state">

                    <div class="empty-icon">
                        💳
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

            return;
        }


        // ---------------------------------------------
        // SHOW LAST 5
        // ---------------------------------------------

        transactions
            .slice(0, 5)
            .forEach(
                transaction => {

                    const isCredit =
                        transaction.transaction_type
                        === "CREDIT";


                    const sign =
                        isCredit
                        ? "+"
                        : "-";


                    // ---------------------------------
                    // CATEGORY ICON
                    // ---------------------------------

                    let icon = "💳";


                    if (
                        transaction.category
                        === "Canteen"
                    ) {

                        icon = "🍽️";

                    } else if (
                        transaction.category
                        === "Stationery"
                    ) {

                        icon = "📚";

                    } else if (
                        transaction.category
                        === "Printing"
                    ) {

                        icon = "🖨️";

                    } else if (
                        transaction.category
                        === "WALLET_RECHARGE"
                    ) {

                        icon = "💰";

                    } else if (
                        transaction.category
                        === "Other"
                    ) {

                        icon = "📦";
                    }


                    // ---------------------------------
                    // DATE / TIME
                    // ---------------------------------

                    const dateTime =
                        transaction.created_at ||
                        transaction.transaction_date;


                    const formattedDate =
                        formatDateTime(
                            dateTime
                        );


                    // ---------------------------------
                    // CREATE ITEM
                    // ---------------------------------

                    const item =
                        document.createElement(
                            "div"
                        );


                    item.className =
                        "transaction-item";


                    item.innerHTML = `

                        <div class="transaction-icon">

                            ${icon}

                        </div>


                        <div class="transaction-info">

                            <strong>

                                ${
                                    transaction.description ||
                                    transaction.category ||
                                    "Transaction"
                                }

                            </strong>


                            <small>

                                ${
                                    transaction.category ||
                                    "Wallet"
                                }

                            </small>


                            <small class="transaction-date">

                                📅 ${formattedDate}

                            </small>

                        </div>


                        <div class="${
                            isCredit
                            ? "credit"
                            : "debit"
                        }">

                            ${sign}₹${
                                Number(
                                    transaction.amount
                                ).toFixed(2)
                            }

                        </div>

                    `;


                    container.appendChild(
                        item
                    );

                }
            );


    } catch (error) {

        console.error(
            "Transaction Error:",
            error
        );


        container.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    ⚠️
                </div>

                <h3>
                    Unable to load transactions
                </h3>

                <p>
                    Please try again later.
                </p>

            </div>

        `;
    }
}


// =====================================================
// FORMAT DATE + TIME
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


        // SQLite format compatibility
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
// LOW BALANCE ALERT
// =====================================================

function checkLowBalance(
    balance,
    limit
) {

    const alertBox =
        document.getElementById(
            "lowBalanceAlert"
        );


    if (!alertBox) {

        return;
    }


    if (
        balance <= limit
    ) {

        alertBox.style.display =
            "block";


        alertBox.innerHTML = `

            🔔
            <strong>
                Low Balance
            </strong>

            <br>

            Your wallet balance is
            ₹${balance.toFixed(2)}.

        `;

    } else {

        alertBox.style.display =
            "none";
    }
}


// =====================================================
// MY ID
// =====================================================

function viewID() {

    window.location.href =
        "my-id.html";
}


// =====================================================
// TRANSACTIONS
// =====================================================

function viewTransactions() {

    window.location.href =
        "history.html";
}


// =====================================================
// PROFILE
// =====================================================

function profile() {

    window.location.href =
        "profile.html";
}


// =====================================================
// HOME
// =====================================================

function goHome() {

    window.location.href =
        "dashboard.html";
}


// =====================================================
// LOGOUT
// =====================================================

function logout() {

    const confirmLogout =
        confirm(
            "Are you sure you want to logout?"
        );


    if (!confirmLogout) {

        return;
    }


    localStorage.removeItem(
        "studentId"
    );


    window.location.href =
        "index.html";
}


// =====================================================
// START DASHBOARD
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadDashboard();

    }
);