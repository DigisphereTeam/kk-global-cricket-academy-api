const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { addCoach, getAllCoaches, searchCoaches, getCoachById, updateCoach, deleteCoach, updateCoachStatus } = require("../controllers/coachController");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const fileUpload = require("../middlewares/uploadMiddleware");
const multer = require("multer");
const { sendErrorResponse } = require("../utils/apiResponse");

const coachRouter = express.Router();

coachRouter.use(verifyToken);

coachRouter.post(
  "/",
  (req, res, next) => {
    fileUpload.array("document_urls", 10)(req, res, (err) => {
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
            "Only 10 files are allowed."
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
  addCoach
);

coachRouter.get("/", getAllCoaches);

coachRouter.get("/search", searchCoaches);

coachRouter.get("/:id", getCoachById);

coachRouter.patch("/:id", fileUpload.array("document_urls", 10), validateRequestBody, updateCoach);

coachRouter.patch("/:id/status", validateRequestBody, updateCoachStatus);

// coachRouter.delete("/:id", checkRole("ADMIN"), deleteCoach);

module.exports = coachRouter;