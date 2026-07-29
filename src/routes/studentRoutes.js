const express = require("express");

const studentRouter = express.Router();

const { createStudentAdmission, getAllStudents, getStudentById, updateStudent, deleteStudent, searchStudents, getStudentAnalytics, } = require("../controllers/studentController");

const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");

studentRouter.use(verifyToken);

studentRouter.post("/", validateRequestBody, createStudentAdmission);

studentRouter.get("/", getAllStudents);

studentRouter.get("/search", searchStudents);

studentRouter.get("/analytics", getStudentAnalytics);

studentRouter.get("/:student_id", getStudentById);

studentRouter.patch("/:student_id", validateRequestBody, updateStudent);

studentRouter.delete("/:student_id", deleteStudent);


module.exports = studentRouter;