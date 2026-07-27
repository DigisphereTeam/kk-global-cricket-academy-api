const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { addCoach, getAllCoaches, searchCoaches, getCoachById, updateCoach, deleteCoach } = require("../controllers/coachController");

const coachRouter = express.Router();



// Add coach
coachRouter.post("/", validateRequestBody, addCoach);

// Get all coaches
coachRouter.get("/", getAllCoaches);

// Search coaches
coachRouter.get("/search", searchCoaches);

// Get coach by ID
coachRouter.get("/:id", getCoachById);

// Update coach
coachRouter.patch("/:id", validateRequestBody, updateCoach);

// Delete coach
coachRouter.delete("/:id", deleteCoach);

module.exports = coachRouter;