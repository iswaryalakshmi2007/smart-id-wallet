// ==========================================
// MY ID
// ==========================================

const API_URL = "http://localhost:5000";

const studentId =
    localStorage.getItem("studentId");


// ==========================================
// LOAD STUDENT DETAILS
// ==========================================

async function loadStudentDetails() {

    if (!studentId) {

        window.location.href =
            "login.html";

        return;
    }


    try {

        const response = await fetch(
            API_URL +
            "/api/student/" +
            studentId
        );


        if (!response.ok) {
            throw new Error("Unable to load student");
        }


        const student =
            await response.json();


        document.getElementById(
            "studentName"
        ).innerText =
            student.name || "Student";


        document.getElementById(
            "studentId"
        ).innerText =
            student.studentId || studentId;


        document.getElementById(
            "department"
        ).innerText =
            student.department || "--";


        document.getElementById(
            "academicYear"
        ).innerText =
            student.academicYear || "--";


        document.getElementById(
            "barcodeId"
        ).innerText =
            student.studentId || studentId;


    } catch (error) {

        console.error(error);

        // Fallback
        document.getElementById(
            "studentId"
        ).innerText = studentId;

        document.getElementById(
            "barcodeId"
        ).innerText = studentId;
    }
}


// ==========================================
// BACK
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
    loadStudentDetails
);