const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { getPlayerWiseReport,getPlayerMonthlyReport,getTrainerWiseReport,getTrainerMonthlyReport,getStaffWiseReport,getStaffMonthlyReport } = require("../controllers/reportsController");
const { checkRole } = require("../middlewares/checkRole");

const reportsRouter = express.Router();

reportsRouter.use(verifyToken);

reportsRouter.get("/player-wise", checkRole("ADMIN"), getPlayerWiseReport);

reportsRouter.get("/player-monthly", checkRole("ADMIN"), getPlayerMonthlyReport);

reportsRouter.get("/trainer-wise", checkRole("ADMIN"), getTrainerWiseReport);

reportsRouter.get("/trainer-monthly", checkRole("ADMIN"), getTrainerMonthlyReport);

reportsRouter.get("/staff-wise", checkRole("ADMIN"), getStaffWiseReport);

reportsRouter.get("/staff-monthly", checkRole("ADMIN"), getStaffMonthlyReport);



module.exports = reportsRouter;