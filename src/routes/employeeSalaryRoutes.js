const express = require("express");
const { createEmployeeSalary, getEmployeeSalaries, getEmployeeSalaryById, updateEmployeeSalary, deleteEmployeeSalary } = require("../controllers/employeeSalaryController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");

const employeeSalaryRoutes = express.Router();


employeeSalaryRoutes.use(verifyToken);

employeeSalaryRoutes.post("/", validateRequestBody, checkRole("PRIMARY"), createEmployeeSalary);

employeeSalaryRoutes.get("/", getEmployeeSalaries);

employeeSalaryRoutes.get("/:salary_id", getEmployeeSalaryById);

employeeSalaryRoutes.patch("/:salary_id", validateRequestBody, updateEmployeeSalary);

employeeSalaryRoutes.delete("/:salary_id", deleteEmployeeSalary);

module.exports = employeeSalaryRoutes;