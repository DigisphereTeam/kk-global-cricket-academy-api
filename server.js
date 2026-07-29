const express = require("express");
const cors = require("cors");
const path = require("path");
const { sendSuccessResponse } = require("./src/utils/apiResponse");
const notFoundHandler = require("./src/middlewares/notFoundHandler");
const globalErrorHandler = require("./src/middlewares/errorHandler");
const pool = require("./src/config/dbConfig");
const studentRouter = require("./src/routes/studentRoutes");
const coachRouter = require("./src/routes/coachRoutes");
const staffRouter = require("./src/routes/staffRoutes");
const authRouter = require("./src/routes/authRoutes");
const oneOnOneRouter = require("./src/routes/oneOnOneRoutes");
const groundBookingRouter = require("./src/routes/groundTookingRoutes");
const eventRouter = require("./src/routes/eventRoutes");
const equipmentRouter = require("./src/routes/equipmentRoutes");
const employeeSalaryRoutes = require("./src/routes/employeeSalaryRoutes");
const userRouter = require("./src/routes/userRoutes");
const dashboardRouter = require("./src/routes/dashboardRoutes");
const apiLogger = require("./src/middlewares/apiLogger");


const app = express();

app.use(express.json());
app.use(cors());

app.use(apiLogger);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_req, res) => {
  sendSuccessResponse(res, 200, "Server is up and running!");
});

app.use("/auth", authRouter)
app.use("/dashboard", dashboardRouter);
app.use("/students", studentRouter);
app.use("/coaches", coachRouter);
app.use("/staff", staffRouter);
app.use("/one-on-one-applications", oneOnOneRouter);
app.use("/ground-bookings", groundBookingRouter);
app.use("/events", eventRouter)
app.use("/equipments", equipmentRouter);
app.use("/employee-salaries", employeeSalaryRoutes);
app.use("/users", userRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler)

app.listen(5000, async () => {
  try {
    await pool.query("SELECT 1");
    console.log("DB connected successfully");
    console.log(`Server is running on http://localhost:${5000}`);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
});