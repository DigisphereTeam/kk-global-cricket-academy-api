const express = require("express");

const staffRouter = express.Router();

const { addStaff, getAllStaff, searchStaff, getStaffById, updateStaff, deleteStaff } = require("../controllers/staffController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");

staffRouter.use(verifyToken);

staffRouter.post("/", validateRequestBody, checkRole("PRIMARY"), addStaff);

staffRouter.get("/", getAllStaff);

staffRouter.get("/search", searchStaff);

staffRouter.get("/:id", getStaffById);

staffRouter.patch("/:id", validateRequestBody, updateStaff);

staffRouter.delete("/:id", deleteStaff);

module.exports = staffRouter;