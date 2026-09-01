// ==========================================
// SMART ID WALLET - LOGIN
// ==========================================

const API_URL = "http://localhost:5000";


// ==========================================
// LOGIN
// ==========================================

async function login() {

    const studentIdInput =
        document.getElementById("studentId");

    const passwordInput =
        document.getElementById("password");

    const message =
        document.getElementById("message");

    const loginButton =
        document.querySelector(".login-btn");


    // Get values
    const studentId =
        studentIdInput.value
            .trim()
            .toUpperCase();

    const password =
        passwordInput.value.trim();


    // Clear previous message
    message.innerText = "";


    // ======================================
    // VALIDATION
    // ======================================

    if (studentId === "") {

        message.innerText =
            "Please enter your Student ID.";

        studentIdInput.focus();

        return;
    }


    if (password === "") {

        message.innerText =
            "Please enter your password.";

        passwordInput.focus();

        return;
    }


    // ======================================
    // STUDENT ID FORMAT CHECK
    // Example: 25EC060
    // Example: 25AD101
    // Example: 25ME120
    // ======================================

    const studentIdPattern =
        /^[0-9]{2}[A-Z]{2,4}[0-9]{3}$/;


    if (!studentIdPattern.test(studentId)) {

        message.innerText =
            "Enter a valid Student ID.\nExample: 25EC060";

        studentIdInput.focus();

        return;
    }


    // ======================================
    // LOADING
    // ======================================

    if (loginButton) {

        loginButton.disabled = true;

        loginButton.innerText =
            "Logging in...";
    }


    try {

        // ==================================
        // SEND LOGIN REQUEST
        // ==================================

        const response = await fetch(
            API_URL + "/api/login",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    studentId: studentId,

                    password: password

                })
            }
        );


        // ==================================
        // READ RESPONSE
        // ==================================

        const result =
            await response.json();


        // ==================================
        // LOGIN FAILED
        // ==================================

        if (!response.ok) {

            message.innerText =
                result.message ||
                "Invalid Student ID or Password.";

            if (loginButton) {

                loginButton.disabled = false;

                loginButton.innerText =
                    "Login";
            }

            return;
        }


        // ==================================
        // LOGIN SUCCESS
        // ==================================

        const loggedInStudentId =
            result.studentId || studentId;


        // Save student ID
        localStorage.setItem(
            "studentId",
            loggedInStudentId
        );


        // Save login status
        localStorage.setItem(
            "isLoggedIn",
            "true"
        );


        // ==================================
        // OPEN DASHBOARD
        // ==================================

        window.location.href =
            "dashboard.html";


    } catch (error) {

        console.error(
            "Login Error:",
            error
        );


        message.innerText =
            "Cannot connect to server.\n" +
            "Please make sure the Python backend is running.";


        if (loginButton) {

            loginButton.disabled = false;

            loginButton.innerText =
                "Login";
        }
    }
}


// ==========================================
// SHOW / HIDE PASSWORD
// ==========================================

function togglePassword() {

    const password =
        document.getElementById("password");

    const toggle =
        document.getElementById("passwordToggle");


    if (!password || !toggle) {
        return;
    }


    if (password.type === "password") {

        password.type = "text";

        toggle.innerText = "🙈";

        toggle.title = "Hide Password";

    } else {

        password.type = "password";

        toggle.innerText = "👁️";

        toggle.title = "Show Password";
    }
}


// ==========================================
// FORGOT PASSWORD
// ==========================================

function forgotPassword(event) {

    if (event) {
        event.preventDefault();
    }


    alert(
        "Forgot your password?\n\n" +
        "Please contact your college administrator " +
        "to reset your Smart ID Wallet password."
    );
}


// ==========================================
// ENTER KEY LOGIN
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const studentId =
            document.getElementById("studentId");

        const password =
            document.getElementById("password");


        // Student ID → uppercase automatically

        if (studentId) {

            studentId.addEventListener(
                "input",
                function () {

                    this.value =
                        this.value.toUpperCase();
                }
            );
        }


        // Press ENTER → Login

        if (password) {

            password.addEventListener(
                "keydown",
                function (event) {

                    if (event.key === "Enter") {

                        event.preventDefault();

                        login();
                    }
                }
            );
        }

    }
);