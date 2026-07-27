const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { addCoach, getAllCoaches, searchCoaches, getCoachById, updateCoach, deleteCoach } = require("../controllers/coachController");
const verifyToken = require("../middlewares/verifyToken");

const coachRouter = express.Router();

coachRouter.use(verifyToken);

coachRouter.post("/", validateRequestBody, addCoach);

coachRouter.get("/", getAllCoaches);

coachRouter.get("/search", searchCoaches);

coachRouter.get("/:id", getCoachById);

coachRouter.patch("/:id", validateRequestBody, updateCoach);

coachRouter.delete("/:id", deleteCoach);

module.exports = coachRouter;