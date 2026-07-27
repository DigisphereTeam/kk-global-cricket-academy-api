const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { createGround,createGroundBooking,getAllGroundBookings,getGroundBookingById,updateGroundBooking } = require("../controllers/groundbookingController");

const groundbookingRouter = express.Router();

groundbookingRouter.post("/addground", validateRequestBody, createGround);
groundbookingRouter.post("/", validateRequestBody,createGroundBooking);
 groundbookingRouter.get("/", getAllGroundBookings);
 groundbookingRouter.get("/:booking_id", getGroundBookingById);
groundbookingRouter.put("/:booking_id", validateRequestBody, updateGroundBooking);


module.exports = groundbookingRouter;