// =====================================================
// SMART ID WALLET - MULTI-ROLE LOGIN CONTROLLER
// =====================================================

let currentRole = "student";

// Role configuration mappings
const roleConfigs = {
    student: {
        label: "Student ID",
        placeholder: "Enter Student ID (e.g. 23ECE001)",
        icon: "🎓",
        btnText: "Sign In as Student",
        demoId: "23ECE001",
        demoPass: "123456"
    },
    shopkeeper: {
        label: "Shopkeeper ID / Email",
        placeholder: "Enter Shopkeeper ID (e.g. shop01)",
        icon: "🏪",
        btnText: "Sign In as Shopkeeper",
        demoId: "shop01",
        demoPass: "123456"
    },
    admin: {
        label: "Admin Username",
        placeholder: "Enter Admin Username (e.g. admin01)",
        icon: "🛡️",
        btnText: "Sign In as Administrator",
        demoId: "admin01",
        demoPass: "admin123"
    }
};

function switchRole(role) {
    if (!roleConfigs[role]) return;
    currentRole = role;

    // Update active tab buttons
    document.querySelectorAll(".role-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    const activeTab = document.getElementById(`tab-${role}`);
    if (activeTab) activeTab.classList.add("active");

    // Update form labels & icons
    const config = roleConfigs[role];
    const idLabel = document.getElementById("idLabel");
    const idIcon = document.getElementById("idIcon");
    const loginIdInput = document.getElementById("loginId");
    const btnText = document.getElementById("btnText");

    if (idLabel) idLabel.innerText = config.label;
    if (idIcon) idIcon.innerText = config.icon;
    if (loginIdInput) {
        loginIdInput.placeholder = config.placeholder;
        loginIdInput.value = "";
    }
    if (btnText) btnText.innerText = config.btnText;

    const passwordInput = document.getElementById("password");
    if (passwordInput) passwordInput.value = "";

    hideMessage();
}

function fillDemo(role) {
    switchRole(role);
    const config = roleConfigs[role];
    const loginIdInput = document.getElementById("loginId");
    const passwordInput = document.getElementById("password");

    if (loginIdInput) loginIdInput.value = config.demoId;
    if (passwordInput) passwordInput.value = config.demoPass;

    showMessage(`Demo credentials loaded for ${role.toUpperCase()}`, "success");
}

function togglePasswordVisibility() {
    const passField = document.getElementById("password");
    const toggleBtn = document.getElementById("passwordToggleBtn");
    if (!passField) return;

    if (passField.type === "password") {
        passField.type = "text";
        if (toggleBtn) toggleBtn.innerText = "🙈";
    } else {
        passField.type = "password";
        if (toggleBtn) toggleBtn.innerText = "👁️";
    }
}

async function handleLogin() {
    const loginIdInput = document.getElementById("loginId");
    const passwordInput = document.getElementById("password");
    const loginBtn = document.getElementById("loginButton");
    const btnSpinner = document.getElementById("btnSpinner");
    const btnText = document.getElementById("btnText");

    const loginId = loginIdInput ? loginIdInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    hideMessage();

    if (!loginId) {
        showMessage(`Please enter your ${roleConfigs[currentRole].label}`, "error");
        if (loginIdInput) loginIdInput.focus();
        return;
    }

    if (!password) {
        showMessage("Please enter your password", "error");
        if (passwordInput) passwordInput.focus();
        return;
    }

    // UI Loading state
    if (loginBtn) loginBtn.disabled = true;
    if (btnSpinner) btnSpinner.style.display = "inline-block";

    try {
        const res = await apiRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                loginId: loginId,
                password: password,
                role: currentRole
            })
        });

        if (!res.ok || !res.data.success) {
            const errorMsg = res.data.message || "Invalid ID or password.";
            showMessage(errorMsg, "error");
            return;
        }

        // Authentication Success
        showMessage("Login successful! Redirecting...", "success");
        Auth.setSession(res.data.user, res.data.token);

        // Redirect based on backend response or role
        setTimeout(() => {
            const dest = res.data.redirect || (
                currentRole === "admin" ? "admin/index.html" :
                currentRole === "shopkeeper" ? "shopkeeper/index.html" : "dashboard.html"
            );
            window.location.href = dest;
        }, 500);

    } catch (err) {
        console.error("Login exception:", err);
        showMessage("Network error. Unable to reach server.", "error");
    } finally {
        if (loginBtn) loginBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = "none";
    }
}

function showMessage(msg, type = "error") {
    const msgBox = document.getElementById("loginMessage");
    if (!msgBox) return;
    msgBox.innerText = msg;
    msgBox.className = `login-message ${type}`;
    msgBox.style.display = "block";
}

function hideMessage() {
    const msgBox = document.getElementById("loginMessage");
    if (msgBox) msgBox.style.display = "none";
}

// Auto-select tab based on URL param or default
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get("role");
    if (roleParam && roleConfigs[roleParam]) {
        switchRole(roleParam);
    } else {
        switchRole("student");
    }
});