// =====================================================
// SMART ID WALLET - CLIENT CONFIGURATION & UTILITIES
// =====================================================

(function (window) {
    // Dynamic API URL: Automatically adapts to current host and port
    // Configurable via window.APP_API_BASE_URL or window.API_BASE_URL
    let apiBase = window.APP_API_BASE_URL || window.API_BASE_URL || window.location.origin;
    if (window.location.protocol === "file:" || (window.location.port && window.location.port !== "5000")) {
        apiBase = window.APP_API_BASE_URL || window.API_BASE_URL || "http://localhost:5000";
    }

    const CONFIG = {
        API_URL: apiBase,
        COLLEGE_NAME: "Smart College of Engineering",
        CURRENCY: "₹",
        DEFAULT_LOW_BALANCE_LIMIT: 100
    };

    window.API_BASE_URL = CONFIG.API_URL;

    // Helper: Formats numbers as currency
    function formatCurrency(amount) {
        const val = Number(amount) || 0;
        return CONFIG.CURRENCY + val.toFixed(2);
    }

    // Helper: Formats ISO timestamp to readable date & time
    function formatDateTime(isoString) {
        if (!isoString) return "--";
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            return date.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }) + " " + date.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
        } catch (e) {
            return isoString;
        }
    }

    // Helper: Request with auth headers
    async function apiRequest(endpoint, options = {}) {
        const url = endpoint.startsWith("http") ? endpoint : CONFIG.API_URL + endpoint;
        const headers = options.headers || {};

        if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
        }

        const token = localStorage.getItem("authToken");
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }

        const role = localStorage.getItem("userRole");
        if (role) {
            headers["X-User-Role"] = role;
        }

        options.headers = headers;

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));
            return {
                ok: response.ok,
                status: response.status,
                data: data
            };
        } catch (error) {
            console.error("API Request Error:", error);
            return {
                ok: false,
                status: 0,
                data: {
                    success: false,
                    message: "Unable to connect to server. Please ensure the backend is running."
                }
            };
        }
    }

    // Toast notifications
    function showToast(message, type = "info") {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        const bgColors = {
            success: "linear-gradient(135deg, #059669, #10b981)",
            error: "linear-gradient(135deg, #dc2626, #ef4444)",
            warning: "linear-gradient(135deg, #d97706, #f59e0b)",
            info: "linear-gradient(135deg, #2563eb, #3b82f6)"
        };

        toast.style.cssText = `
            background: ${bgColors[type] || bgColors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            pointer-events: auto;
            transition: all 0.3s ease;
            transform: translateX(100px);
            opacity: 0;
            max-width: 350px;
            word-break: break-word;
        `;
        toast.innerText = message;
        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = "translateX(0)";
            toast.style.opacity = "1";
        });

        setTimeout(() => {
            toast.style.transform = "translateX(100px)";
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    window.CONFIG = CONFIG;
    window.formatCurrency = formatCurrency;
    window.formatDateTime = formatDateTime;
    window.apiRequest = apiRequest;
    window.showToast = showToast;

})(window);
