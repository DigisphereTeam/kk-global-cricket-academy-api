const express = require("express");

const validateRequestBody = require("../middlewares/validateRequestBody");
const { createGroundBooking, getAllGroundBookings, getGroundBookingById, updateGroundBooking } = require("../controllers/groundbookingController");
const verifyToken = require("../middlewares/verifyToken");

const groundBookingRouter = express.Router();


// Create ground
// groundBookingRouter.post(
//   "/add-ground",
//   validateRequestBody,
//   createGround
// );


// Protect all student routes
groundBookingRouter.use(verifyToken);

// Create ground booking
groundBookingRouter.post(
  "/",
  validateRequestBody,
  createGroundBooking
);


// Get all ground bookings
groundBookingRouter.get(
  "/",
  getAllGroundBookings
);


// Get booking by ID
groundBookingRouter.get(
  "/:booking_id",
  getGroundBookingById
);


// Update booking
groundBookingRouter.put(
  "/:booking_id",
  validateRequestBody,
  updateGroundBooking
);


module.exports = groundBookingRouter;