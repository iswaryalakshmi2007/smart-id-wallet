// =====================================================
// SMART ID WALLET - STUDENT PROFILE CONTROLLER
// =====================================================

const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");

document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireAuth("student")) return;
    await loadProfileData();
});

async function loadProfileData() {
    try {
        const res = await apiRequest(`/api/student/${studentId}`);
        if (!res.ok || !res.data) {
            showToast("Failed to load profile details", "error");
            return;
        }

        const student = res.data;
        const nameEl = document.getElementById("profileName");
        const idEl = document.getElementById("profileStudentId");
        const deptEl = document.getElementById("profileDept");

        if (nameEl) nameEl.innerText = student.name || "Student";
        if (idEl) idEl.innerText = student.student_id || studentId;
        if (deptEl) deptEl.innerText = student.department || "--";

        // Pre-fill inputs
        const nameInput = document.getElementById("nameInput");
        const emailInput = document.getElementById("emailInput");
        const deptInput = document.getElementById("deptInput");
        const yearInput = document.getElementById("yearInput");
        const roleInput = document.getElementById("roleInput");

        if (nameInput) nameInput.value = student.name || "";
        if (emailInput) emailInput.value = student.email || "";
        if (deptInput) deptInput.value = student.department || "";
        if (yearInput) yearInput.value = student.academic_year || "";
        if (roleInput) roleInput.value = (student.role || Auth.getRole() || "Student").toUpperCase();

    } catch (e) {
        console.error("Error loading profile:", e);
    }
}

async function updateProfile() {
    const nameInput = document.getElementById("nameInput");
    const emailInput = document.getElementById("emailInput");
    const deptInput = document.getElementById("deptInput");
    const yearInput = document.getElementById("yearInput");
    const btn = document.getElementById("saveProfileBtn");

    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";

    if (!name) {
        showToast("Name cannot be empty", "error");
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest("/api/student/update", {
            method: "PUT",
            body: JSON.stringify({
                oldStudentId: studentId,
                studentId: studentId,
                name: name,
                email: email,
                department: deptInput ? deptInput.value : "",
                academicYear: yearInput ? yearInput.value : ""
            })
        });

        if (res.ok && res.data.success) {
            showToast("Profile updated successfully!", "success");
            localStorage.setItem("userName", name);
            const nameEl = document.getElementById("profileName");
            if (nameEl) nameEl.innerText = name;
        } else {
            showToast(res.data.message || "Failed to update profile", "error");
        }
    } catch (e) {
        console.error("Profile update error:", e);
        showToast("Error updating profile", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function updatePassword() {
    const currentPass = document.getElementById("currentPassword");
    const newPass = document.getElementById("newPassword");
    const confirmPass = document.getElementById("confirmPassword");
    const btn = document.getElementById("changePassBtn");

    const cVal = currentPass ? currentPass.value.trim() : "";
    const nVal = newPass ? newPass.value.trim() : "";
    const confVal = confirmPass ? confirmPass.value.trim() : "";

    if (!cVal || !nVal || !confVal) {
        showToast("Please fill all password fields", "error");
        return;
    }

    if (nVal.length < 6) {
        showToast("New password must be at least 6 characters", "error");
        return;
    }

    if (nVal !== confVal) {
        showToast("New passwords do not match", "error");
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const res = await apiRequest("/api/student/change-password", {
            method: "PUT",
            body: JSON.stringify({
                studentId: studentId,
                currentPassword: cVal,
                newPassword: nVal,
                confirmPassword: confVal
            })
        });

        if (res.ok && res.data.success) {
            showToast("Password changed successfully!", "success");
            if (currentPass) currentPass.value = "";
            if (newPass) newPass.value = "";
            if (confirmPass) confirmPass.value = "";
        } else {
            showToast(res.data.message || "Incorrect current password", "error");
        }
    } catch (e) {
        console.error("Password update error:", e);
        showToast("Error updating password", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}