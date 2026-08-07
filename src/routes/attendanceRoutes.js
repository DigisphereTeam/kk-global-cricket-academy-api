const express = require("express");
const { syncAttendance, getAttendance, getMonthlyAttendanceSummary, getAttendanceTimeline } = require("../controllers/attendanceController");
const verifyToken = require("../middlewares/verifyToken");
const attendanceRouter = express.Router();

attendanceRouter.post("/sync", syncAttendance);

attendanceRouter.get("/", verifyToken, getAttendance);

attendanceRouter.get(
  "/monthly-summary",
  verifyToken,
  getMonthlyAttendanceSummary
);

attendanceRouter.get(
  "/timeline",
  verifyToken,
  getAttendanceTimeline
);

module.exports = attendanceRouter;