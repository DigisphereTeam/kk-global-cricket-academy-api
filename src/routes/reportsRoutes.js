const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { getPlayerWiseReport, getPlayerMonthlyReport, getTrainerWiseReport, getTrainerMonthlyReport, getStaffWiseReport, getStaffMonthlyReport, getEmployeeStatistics } = require("../controllers/reportsController");
const { checkRole } = require("../middlewares/checkRole");

const reportsRouter = express.Router();

reportsRouter.use(verifyToken);

reportsRouter.use(checkRole("ADMIN"));

reportsRouter.get("/player-wise", getPlayerWiseReport);

reportsRouter.get("/player-monthly", getPlayerMonthlyReport);

reportsRouter.get("/trainer-wise", getTrainerWiseReport);

reportsRouter.get("/trainer-monthly", getTrainerMonthlyReport);

reportsRouter.get("/staff-wise", getStaffWiseReport);

reportsRouter.get("/staff-monthly", getStaffMonthlyReport);

reportsRouter.get("/employee/statistics", getEmployeeStatistics);

module.exports = reportsRouter;