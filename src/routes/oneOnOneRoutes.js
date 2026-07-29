const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { getAllApplications, getApplicationById, updateApplication, deleteApplication, applyOneOnOne, renewOneOnOne, getPlayerApplications } = require("../controllers/oneOnOneController");
const { checkRole } = require("../middlewares/checkRole");

const oneOnOneRouter = express.Router();

oneOnOneRouter.use(verifyToken);

oneOnOneRouter.post("/", validateRequestBody, checkRole("PRIMARY"), applyOneOnOne);

oneOnOneRouter.post("/renew", validateRequestBody, renewOneOnOne);

oneOnOneRouter.get("/players/:player_id/applications", getPlayerApplications);

oneOnOneRouter.get("/", getAllApplications);

oneOnOneRouter.get("/:application_id", getApplicationById);

oneOnOneRouter.patch("/:application_id", validateRequestBody, updateApplication);

oneOnOneRouter.delete("/:application_id", checkRole("ADMIN"), deleteApplication);


module.exports = oneOnOneRouter;