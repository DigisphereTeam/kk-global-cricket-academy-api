const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { signIn, signUp } = require("../controllers/authController");
const { checkRole } = require("../middlewares/checkRole");
const verifyToken = require("../middlewares/verifyToken");

const authRouter = express.Router();

authRouter.post("/signup", verifyToken, checkRole("ADMIN"), validateRequestBody, signUp);

authRouter.post("/signin", validateRequestBody, signIn);

module.exports = authRouter;