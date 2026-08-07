const express = require("express");
const { syncAttendance, getAttendance, getMonthlyAttendanceSummary } = require("../controllers/attendanceController");
const verifyToken = require("../middlewares/verifyToken");
const attendanceRouter = express.Router();

attendanceRouter.post("/sync", syncAttendance);

attendanceRouter.get("/", verifyToken, getAttendance);

attendanceRouter.get(
  "/monthly-summary",
  verifyToken,
  getMonthlyAttendanceSummary
);

module.exports = attendanceRouter;