const express = require("express");

const staffRouter = express.Router();

const { addStaff, getAllStaff, searchStaff, getStaffById, updateStaff, deleteStaff, updateStaffStatus } = require("../controllers/staffController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const fileUpload = require("../middlewares/uploadMiddleware");

staffRouter.use(verifyToken);

staffRouter.post("/", fileUpload.array("document_urls", 5), validateRequestBody, checkRole("PRIMARY"), addStaff);

staffRouter.get("/", getAllStaff);

staffRouter.get("/search", searchStaff);

staffRouter.get("/:id", getStaffById);

staffRouter.patch("/:id", fileUpload.array("document_urls", 5), validateRequestBody, updateStaff);

staffRouter.patch("/:staff_id/status", validateRequestBody, updateStaffStatus);

// staffRouter.delete("/:id", checkRole("ADMIN"), deleteStaff);

module.exports = staffRouter;