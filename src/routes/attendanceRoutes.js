const express = require("express");
const { syncAttendance, getAttendance } = require("../controllers/attendanceController");
const verifyToken = require("../middlewares/verifyToken");
const attendanceRouter = express.Router();

attendanceRouter.post("/sync", syncAttendance);

attendanceRouter.get("/", verifyToken, getAttendance);

module.exports = attendanceRouter;