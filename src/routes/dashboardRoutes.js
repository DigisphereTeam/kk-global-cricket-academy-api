const express = require("express");

const { getDashboardStatistics, getDashboardCharts, getDashboardRevenueAndActivities } = require("../controllers/dashboardController");
const verifyToken = require("../middlewares/verifyToken");

const dashboardRouter = express.Router();

dashboardRouter.use(verifyToken);

dashboardRouter.get("/overview", getDashboardStatistics);

dashboardRouter.get("/charts", getDashboardCharts);

dashboardRouter.get("/revenue-activities", getDashboardRevenueAndActivities);

module.exports = dashboardRouter;