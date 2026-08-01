const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { getPlayerWiseReport,getYearWisePlayerReport,getMonthlyPlayerReport,getTrainerWiseSalaryReport } = require("../controllers/reportsController");
const { checkRole } = require("../middlewares/checkRole");

const reportsRouter = express.Router();

reportsRouter.use(verifyToken);

reportsRouter.get("/", checkRole("ADMIN"), getPlayerWiseReport);

reportsRouter.get("/year-wise", checkRole("ADMIN"), getYearWisePlayerReport);

reportsRouter.get("/monthly", checkRole("ADMIN"), getMonthlyPlayerReport);

reportsRouter.get("/trainer-wise", checkRole("ADMIN"), getTrainerWiseSalaryReport);





module.exports = reportsRouter;