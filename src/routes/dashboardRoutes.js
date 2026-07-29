const express = require("express");

const { getDashboardStatistics } = require("../controllers/dashboardController");
const verifyToken = require("../middlewares/verifyToken");

const dashboardRouter = express.Router();

dashboardRouter.use(verifyToken);

dashboardRouter.get("/overview", getDashboardStatistics);

module.exports = dashboardRouter;