// =====================================================
// SMART ID WALLET - DIGITAL ID CARD CONTROLLER
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireAuth("student")) return;

    const studentId = localStorage.getItem("studentId") || localStorage.getItem("userId");
    if (!studentId) {
        window.location.href = "index.html";
        return;
    }

    await loadStudentCard(studentId);
});

async function loadStudentCard(studentId) {
    try {
        const res = await apiRequest(`/api/student/${studentId}`);
        if (!res.ok || !res.data) {
            showToast("Failed to load student identity details", "error");
            return;
        }

        const student = res.data;
        const idVal = student.student_id || studentId;
        const barcodeVal = student.barcode || student.barcode_or_qr_value || idVal;

        // Populate DOM elements
        const nameEl = document.getElementById("idStudentName");
        const idEl = document.getElementById("idStudentId");
        const deptEl = document.getElementById("idDepartment");
        const yearEl = document.getElementById("idAcademicYear");
        const barcodeTextEl = document.getElementById("barcodeString");

        if (nameEl) nameEl.innerText = student.name || "Student";
        if (idEl) idEl.innerText = idVal;
        if (deptEl) deptEl.innerText = student.department || "Engineering";
        if (yearEl) yearEl.innerText = student.academic_year || "2025-2029";
        if (barcodeTextEl) barcodeTextEl.innerText = `* ${barcodeVal} *`;

        // Render Real Dynamic QR Code using lightweight QRCode.js
        const qrContainer = document.getElementById("qrcodeContainer");
        if (qrContainer && typeof QRCode !== "undefined") {
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, {
                text: barcodeVal,
                width: 140,
                height: 140,
                colorDark: "#0f172a",
                colorLight: "#ffffff"
            });
        }

    } catch (e) {
        console.error("Error loading ID card:", e);
        showToast("Error rendering digital ID card", "error");
    }
}

function copyStudentId() {
    const studentId = localStorage.getItem("studentId") || "";
    if (!studentId) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(studentId).then(() => {
            showToast(`Copied Student ID '${studentId}' to clipboard!`, "success");
        }).catch(() => {
            prompt("Copy Student ID:", studentId);
        });
    } else {
        prompt("Copy Student ID:", studentId);
    }
}