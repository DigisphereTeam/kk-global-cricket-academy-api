const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { addCoach, getAllCoaches, searchCoaches, getCoachById, updateCoach, deleteCoach, updateCoachStatus } = require("../controllers/coachController");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const fileUpload = require("../middlewares/uploadMiddleware");

const coachRouter = express.Router();

coachRouter.use(verifyToken);

coachRouter.post("/", fileUpload.array("document_urls", 10), validateRequestBody, checkRole("PRIMARY"), addCoach);

coachRouter.get("/", getAllCoaches);

coachRouter.get("/search", searchCoaches);

coachRouter.get("/:id", getCoachById);

coachRouter.patch("/:id", fileUpload.array("document_urls", 10), validateRequestBody, updateCoach);

coachRouter.patch("/:id/status", validateRequestBody, updateCoachStatus);

// coachRouter.delete("/:id", checkRole("ADMIN"), deleteCoach);

module.exports = coachRouter;