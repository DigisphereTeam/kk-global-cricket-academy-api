const express = require("express");
const validateRequestBody = require("../middlewares/validateRequestBody");
const { signIn, signUp } = require("../controllers/authController");

const authRouter = express.Router();

authRouter.post("/signup", validateRequestBody, signUp);

authRouter.post("/signin", validateRequestBody, signIn);

module.exports = authRouter;