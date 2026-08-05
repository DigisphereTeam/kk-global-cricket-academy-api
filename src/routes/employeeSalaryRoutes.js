const express = require("express");
const { createEmployeeSalary, getEmployeeSalaries, getEmployeeSalaryById, updateEmployeeSalary, deleteEmployeeSalary, getEmployeeSalaryHistory, getEligibleEmployees, creditEmployeeSalary } = require("../controllers/employeeSalaryController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");

const employeeSalaryRouter = express.Router();


employeeSalaryRouter.use(verifyToken);

employeeSalaryRouter.post("/", validateRequestBody, checkRole("ADMIN"), createEmployeeSalary);

employeeSalaryRouter.post("/credit/:salary_id", validateRequestBody, checkRole("ADMIN"), creditEmployeeSalary);

employeeSalaryRouter.get("/", getEmployeeSalaries);

employeeSalaryRouter.get("/history", getEmployeeSalaryHistory);

employeeSalaryRouter.get("/eligible-employees", getEligibleEmployees);

employeeSalaryRouter.get("/:salary_id", getEmployeeSalaryById);

employeeSalaryRouter.patch("/:salary_id", validateRequestBody, updateEmployeeSalary);

employeeSalaryRouter.delete("/:salary_id", checkRole("ADMIN"), deleteEmployeeSalary);

module.exports = employeeSalaryRouter;