const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { createEvent, getAllEvents, getEventById, updateEvent, deleteEvent } = require("../controllers/eventController");

const eventRouter = express.Router();

eventRouter.use(verifyToken);

eventRouter.post(
  "/",
  validateRequestBody,
  createEvent
);

eventRouter.get(
  "/",
  getAllEvents
);

eventRouter.get(
  "/:event_id",
  getEventById
);

eventRouter.patch(
  "/:event_id",
  validateRequestBody,
  updateEvent
);

eventRouter.delete(
  "/:event_id",
  deleteEvent
);

module.exports = eventRouter;