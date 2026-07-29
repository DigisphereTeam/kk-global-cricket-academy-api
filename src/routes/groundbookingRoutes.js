const express = require("express");

const validateRequestBody = require("../middlewares/validateRequestBody");
const { createGroundBooking, getAllGroundBookings, getGroundBookingById, updateGroundBooking } = require("../controllers/groundbookingController");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");

const groundBookingRouter = express.Router();


// Create ground
// groundBookingRouter.post(
//   "/add-ground",
//   validateRequestBody,
//   createGround
// );


groundBookingRouter.use(verifyToken);

groundBookingRouter.post("/", validateRequestBody, checkRole("PRIMARY"), createGroundBooking);

groundBookingRouter.get("/", getAllGroundBookings);

groundBookingRouter.get("/:booking_id", getGroundBookingById);

groundBookingRouter.patch("/:booking_id", validateRequestBody, updateGroundBooking);


module.exports = groundBookingRouter;