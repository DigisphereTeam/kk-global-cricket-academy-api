const express = require("express");
const paymentRouter = express.Router();

const { confirmPayment } = require("../controllers/paymentController");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");

paymentRouter.use(verifyToken, checkRole("ADMIN"))

paymentRouter.patch("/:payment_type/:payment_id/confirm", confirmPayment);

module.exports = paymentRouter;