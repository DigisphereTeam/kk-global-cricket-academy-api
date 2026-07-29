const express = require("express");

const { getDashboardStatistics } = require("../controllers/dashboardController");
const verifyToken = require("../middlewares/verifyToken");

const dashboardRouter = express.Router();

dashboardRouter.use(verifyToken);

dashboardRouter.get("/", getDashboardStatistics);

module.exports = dashboardRouter;