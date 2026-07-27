const express = require("express");

const staffRouter = express.Router();

const { addStaff, getAllStaff, searchStaff, getStaffById, updateStaff, deleteStaff } = require("../controllers/staffController");
const validateRequestBody = require("../middlewares/validateRequestBody");

// Add staff
staffRouter.post("/", validateRequestBody, addStaff);

// Get all staff
staffRouter.get("/", getAllStaff);

// Search staff
staffRouter.get("/search", searchStaff);

// Get staff by ID
staffRouter.get("/:id", getStaffById);

// Update staff
staffRouter.patch("/:id", validateRequestBody, updateStaff);

// Delete staff
staffRouter.delete("/:id", deleteStaff);

module.exports = staffRouter;