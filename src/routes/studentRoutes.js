const express = require("express");

const studentRouter = express.Router();

const {
  createStudentAdmission,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  searchStudents,
} = require("../controllers/studentController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");

// Protect all student routes
studentRouter.use(verifyToken);

// Create student admission
studentRouter.post("/", validateRequestBody, createStudentAdmission);


// Get all students
studentRouter.get("/", getAllStudents);


// Search students
studentRouter.get("/search", searchStudents);


// Get student by ID
studentRouter.get("/:student_id", getStudentById);


// Update student
studentRouter.patch("/:student_id", validateRequestBody, updateStudent);


// Delete student
studentRouter.delete("/:student_id", deleteStudent);


module.exports = studentRouter;