const express = require("express");

const staffRouter = express.Router();

const { addStaff, getAllStaff, searchStaff, getStaffById, updateStaff, deleteStaff, updateStaffStatus } = require("../controllers/staffController");
const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const fileUpload = require("../middlewares/uploadMiddleware");
const multer = require("multer");
const { sendErrorResponse } = require("../utils/apiResponse");

staffRouter.use(verifyToken);

staffRouter.post(
  "/",
  (req, res, next) => {
    fileUpload.array("document_urls", 5)(req, res, (err) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          (
            err.code === "LIMIT_UNEXPECTED_FILE" ||
            err.code === "LIMIT_FILE_COUNT"
          )
        ) {
          return sendErrorResponse(
            res,
            400,
            "Only 5 files are allowed."
          );
        }

        return sendErrorResponse(
          res,
          400,
          err.message || "File upload failed."
        );
      }

      next();
    });
  },
  validateRequestBody,
  checkRole("PRIMARY"),
  addStaff
);
staffRouter.get("/", getAllStaff);

staffRouter.get("/search", searchStaff);

staffRouter.get("/:id", getStaffById);

staffRouter.patch("/:id", fileUpload.array("document_urls", 5), validateRequestBody, updateStaff);

staffRouter.patch("/:staff_id/status", validateRequestBody, updateStaffStatus);

// staffRouter.delete("/:id", checkRole("ADMIN"), deleteStaff);

module.exports = staffRouter;