const API_URL = "http://localhost:5000";


// ==========================================
// GET LOGGED-IN STUDENT
// ==========================================

let studentId =
    localStorage.getItem("studentId");


// ==========================================
// CHECK LOGIN
// ==========================================

if (!studentId) {

    window.location.href =
        "index.html";

}


// ==========================================
// LOAD PROFILE
// ==========================================

async function loadProfile() {

    try {

        const response =
            await fetch(
                API_URL +
                "/api/student/" +
                studentId
            );


        const student =
            await response.json();


        if (!response.ok) {

            alert(
                student.message ||
                "Unable to load profile."
            );

            return;
        }


        // ==================================
        // PROFILE HEADER
        // ==================================

        document.getElementById(
            "studentName"
        ).innerText =
            student.name || "Student";


        document.getElementById(
            "studentId"
        ).innerText =
            student.student_id || studentId;


        // ==================================
        // EDIT INPUTS
        // ==================================

        const nameInput =
            document.getElementById("name");

        if (nameInput) {

            nameInput.value =
                student.name || "";

        }


        const studentIdInput =
            document.getElementById(
                "studentIdInput"
            );

        if (studentIdInput) {

            studentIdInput.value =
                student.student_id || studentId;

        }


        const departmentInput =
            document.getElementById(
                "departmentInput"
            );

        if (departmentInput) {

            departmentInput.value =
                student.department || "";

        }


        const academicYearInput =
            document.getElementById(
                "academicYearInput"
            );

        if (academicYearInput) {

            academicYearInput.value =
                student.academic_year || "";

        }


        const emailInput =
            document.getElementById(
                "emailInput"
            );

        if (emailInput) {

            emailInput.value =
                student.email || "";

        }


        // ==================================
        // DETAILS
        // ==================================

        const detailName =
            document.getElementById(
                "detailName"
            );

        if (detailName) {

            detailName.innerText =
                student.name ||
                "Not available";

        }


        const detailStudentId =
            document.getElementById(
                "detailStudentId"
            );

        if (detailStudentId) {

            detailStudentId.innerText =
                student.student_id ||
                studentId;

        }


        const department =
            document.getElementById(
                "department"
            );

        if (department) {

            department.innerText =
                student.department ||
                "Not available";

        }


        const academicYear =
            document.getElementById(
                "academicYear"
            );

        if (academicYear) {

            academicYear.innerText =
                student.academic_year ||
                "Not available";

        }


        const email =
            document.getElementById(
                "email"
            );

        if (email) {

            email.innerText =
                student.email ||
                "Not provided";

        }


        // ==================================
        // LOAD WALLET
        // ==================================

        await loadWallet();


    } catch (error) {

        console.error(
            "Profile loading error:",
            error
        );


        alert(
            "Unable to connect to server."
        );

    }

}


// ==========================================
// LOAD WALLET
// ==========================================

async function loadWallet() {

    try {

        const response =
            await fetch(
                API_URL +
                "/api/wallet/" +
                studentId
            );


        const wallet =
            await response.json();


        if (response.ok) {

            const balance =
                document.getElementById(
                    "balance"
                );


            if (balance) {

                balance.innerText =
                    "₹" +
                    Number(wallet.balance)
                        .toFixed(2);

            }

        }

    } catch (error) {

        console.error(
            "Wallet error:",
            error
        );

    }

}


// ==========================================
// SAVE PROFILE
// ==========================================

async function saveProfile() {

    const name =
        document.getElementById(
            "name"
        ).value.trim();


    const newStudentId =
        document.getElementById(
            "studentIdInput"
        ).value.trim().toUpperCase();


    const department =
        document.getElementById(
            "departmentInput"
        ).value.trim();


    const academicYear =
        document.getElementById(
            "academicYearInput"
        ).value.trim();


    const email =
        document.getElementById(
            "emailInput"
        ).value.trim();


    // ==================================
    // VALIDATION
    // ==================================

    if (!name) {

        alert(
            "Please enter student name."
        );

        return;
    }


    if (!newStudentId) {

        alert(
            "Please enter student ID."
        );

        return;
    }


    if (!department) {

        alert(
            "Please enter department."
        );

        return;
    }


    if (!academicYear) {

        alert(
            "Please enter academic year."
        );

        return;
    }


    // ==================================
    // SAVE
    // ==================================

    try {

        const response =
            await fetch(
                API_URL +
                "/api/student/update",
                {

                    method: "PUT",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        oldStudentId:
                            studentId,

                        studentId:
                            newStudentId,

                        name:
                            name,

                        department:
                            department,

                        academicYear:
                            academicYear,

                        email:
                            email

                    })

                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            alert(
                result.message ||
                "Unable to save profile."
            );

            return;
        }


        // ==================================
        // UPDATE LOGIN SESSION
        // ==================================

        studentId =
            result.studentId;


        localStorage.setItem(
            "studentId",
            result.studentId
        );


        alert(
            "Profile updated successfully!"
        );


        // Reload profile

        loadProfile();


    } catch (error) {

        console.error(
            "Save profile error:",
            error
        );


        alert(
            "Unable to connect to server."
        );

    }

}


// ==========================================
// CHANGE PASSWORD
// ==========================================

async function changePassword() {

    // ==================================
    // CURRENT PASSWORD
    // ==================================

    const currentPassword =
        prompt(
            "Enter your current password:"
        );


    if (currentPassword === null) {

        return;

    }


    if (
        currentPassword.trim() === ""
    ) {

        alert(
            "Please enter your current password."
        );

        return;

    }


    // ==================================
    // NEW PASSWORD
    // ==================================

    const newPassword =
        prompt(
            "Enter your new password:\n\n" +
            "Minimum 6 characters."
        );


    if (newPassword === null) {

        return;

    }


    if (
        newPassword.trim() === ""
    ) {

        alert(
            "Please enter a new password."
        );

        return;

    }


    if (
        newPassword.length < 6
    ) {

        alert(
            "New password must be at least 6 characters."
        );

        return;

    }


    // ==================================
    // CONFIRM PASSWORD
    // ==================================

    const confirmPassword =
        prompt(
            "Confirm your new password:"
        );


    if (confirmPassword === null) {

        return;

    }


    if (
        confirmPassword.trim() === ""
    ) {

        alert(
            "Please confirm your new password."
        );

        return;

    }


    // ==================================
    // PASSWORD MATCH
    // ==================================

    if (
        newPassword !==
        confirmPassword
    ) {

        alert(
            "New passwords do not match."
        );

        return;

    }


    // ==================================
    // SAME PASSWORD
    // ==================================

    if (
        currentPassword ===
        newPassword
    ) {

        alert(
            "New password must be different from current password."
        );

        return;

    }


    // ==================================
    // FINAL CONFIRMATION
    // ==================================

    const confirmed =
        confirm(
            "Are you sure you want to change your password?"
        );


    if (!confirmed) {

        return;

    }


    // ==================================
    // SEND TO BACKEND
    // ==================================

    try {

        const response =
            await fetch(
                API_URL +
                "/api/student/change-password",
                {

                    method: "PUT",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        studentId:
                            studentId,

                        currentPassword:
                            currentPassword,

                        newPassword:
                            newPassword,

                        confirmPassword:
                            confirmPassword

                    })

                }
            );


        const result =
            await response.json();


        // ==================================
        // ERROR
        // ==================================

        if (!response.ok) {

            alert(
                result.message ||
                "Unable to change password."
            );

            return;

        }


        // ==================================
        // SUCCESS
        // ==================================

        alert(
            "✅ Password changed successfully!\n\n" +
            "Your new password will be used for your next login."
        );


    } catch (error) {

        console.error(
            "Change password error:",
            error
        );


        alert(
            "Unable to connect to server."
        );

    }

}


// ==========================================
// LOGOUT
// ==========================================

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


// ==========================================
// BACK
// ==========================================

function goBack() {

    window.location.href =
        "dashboard.html";

}


// ==========================================
// PAGE LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    loadProfile
);