const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { getAllApplications, getApplicationById, updateApplication, deleteApplication, applyOneOnOne, renewOneOnOne, getStudentApplications } = require("../controllers/oneOnOneController");

const oneOnOneRouter = express.Router();

// Protect all one-on-one routes
oneOnOneRouter.use(verifyToken);


// Apply one-on-one training
oneOnOneRouter.post(
  "/",
  validateRequestBody,
  applyOneOnOne
);

// Renew existing one-on-one training
oneOnOneRouter.post(
  "/renew",
  validateRequestBody,
  renewOneOnOne
);

oneOnOneRouter.get(
  "/students/:student_id/applications",
  getStudentApplications
);

// Get all applications
oneOnOneRouter.get(
  "/",
  getAllApplications
);


// Get application by ID
oneOnOneRouter.get(
  "/:application_id",
  getApplicationById
);


// Update application
oneOnOneRouter.patch(
  "/:application_id",
  validateRequestBody,
  updateApplication
);


// Delete application
oneOnOneRouter.delete(
  "/:application_id",
  deleteApplication
);


module.exports = oneOnOneRouter;