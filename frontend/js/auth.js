// =====================================================
// SMART ID WALLET - CLIENT AUTHENTICATION HANDLER
// =====================================================

(function (window) {

    function setSession(userData, token) {
        if (token) localStorage.setItem("authToken", token);
        if (userData) {
            // Strip any sensitive fields before storing
            const safeUserData = {
                user_id: userData.user_id || userData.student_id || userData.admin_id || userData.shopkeeper_id || "",
                name: userData.name || "",
                role: (userData.role || "student").toLowerCase(),
                email: userData.email || "",
                department: userData.department || "",
                academic_year: userData.academic_year || "",
                shop_name: userData.shop_name || "",
                category: userData.category || "",
                status: userData.status || "ACTIVE"
            };

            localStorage.setItem("userRole", safeUserData.role);
            localStorage.setItem("userId", safeUserData.user_id);
            localStorage.setItem("userName", safeUserData.name);

            if (safeUserData.role === "student") {
                localStorage.setItem("studentId", safeUserData.user_id);
            }
            if (safeUserData.role === "shopkeeper") {
                localStorage.setItem("shopkeeperId", safeUserData.user_id);
                localStorage.setItem("shopName", safeUserData.shop_name);
            }
            localStorage.setItem("userData", JSON.stringify(safeUserData));
        }
        localStorage.setItem("isLoggedIn", "true");
    }

    function clearSession() {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        localStorage.removeItem("userId");
        localStorage.removeItem("userName");
        localStorage.removeItem("studentId");
        localStorage.removeItem("shopkeeperId");
        localStorage.removeItem("shopName");
        localStorage.removeItem("userData");
        localStorage.removeItem("isLoggedIn");
        sessionStorage.clear();
    }

    function getCurrentUser() {
        const userStr = localStorage.getItem("userData");
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function getRole() {
        return (localStorage.getItem("userRole") || "").toLowerCase();
    }

    function getToken() {
        return localStorage.getItem("authToken") || "";
    }

    function getStudentId() {
        return localStorage.getItem("studentId") || localStorage.getItem("userId") || "";
    }

    function getShopkeeperId() {
        return localStorage.getItem("shopkeeperId") || localStorage.getItem("userId") || "";
    }

    function hasRole(requiredRole) {
        if (!requiredRole) return true;
        const currentRole = getRole();
        if (Array.isArray(requiredRole)) {
            return requiredRole.map(r => r.toLowerCase()).includes(currentRole);
        }
        return currentRole === requiredRole.toLowerCase();
    }

    function getLoginRedirectPath() {
        const pathname = window.location.pathname;
        if (pathname.includes("/admin/") || pathname.includes("/shopkeeper/")) {
            return "../index.html";
        }
        return "index.html";
    }

    function getRoleLandingPath(role) {
        const pathname = window.location.pathname;
        const inSubdir = pathname.includes("/admin/") || pathname.includes("/shopkeeper/");

        switch (role) {
            case "admin":
                return inSubdir ? "../admin/index.html" : "admin/index.html";
            case "shopkeeper":
                return inSubdir ? "../shopkeeper/index.html" : "shopkeeper/index.html";
            case "student":
            default:
                return inSubdir ? "../dashboard.html" : "dashboard.html";
        }
    }

    function requireAuth(allowedRole = null) {
        const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
        const currentRole = getRole();
        const token = getToken();

        if (!isLoggedIn || !token) {
            clearSession();
            window.location.href = getLoginRedirectPath();
            return false;
        }

        if (allowedRole && !hasRole(allowedRole)) {
            // Role mismatch redirect to authorized landing
            window.location.href = getRoleLandingPath(currentRole);
            return false;
        }

        return true;
    }

    function logout() {
        if (confirm("Are you sure you want to sign out?")) {
            clearSession();
            window.location.href = getLoginRedirectPath();
        }
    }

    window.Auth = {
        setSession: setSession,
        clearSession: clearSession,
        getCurrentUser: getCurrentUser,
        getRole: getRole,
        getToken: getToken,
        getStudentId: getStudentId,
        getShopkeeperId: getShopkeeperId,
        hasRole: hasRole,
        requireAuth: requireAuth,
        logout: logout
    };

})(window);
