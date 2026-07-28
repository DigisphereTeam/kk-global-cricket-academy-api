const express = require("express");
const userRouter = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const { registerPrimary, getUsers, getUserById, updateUser, deleteUser, getProfile, changePassword } = require("../controllers/userController");
const validateRequestBody = require("../middlewares/validateRequestBody");

userRouter.post("/primary", validateRequestBody, verifyToken, checkRole("ADMIN"), registerPrimary);

userRouter.get("/", verifyToken, checkRole("ADMIN"), getUsers);

userRouter.get("/profile", verifyToken, getProfile);

userRouter.get("/:user_id", verifyToken, checkRole("ADMIN"), getUserById);

userRouter.patch("/:user_id", validateRequestBody, verifyToken, checkRole("ADMIN"), updateUser);

userRouter.delete("/:user_id", verifyToken, checkRole("ADMIN"), deleteUser);

userRouter.patch("/changePassword", validateRequestBody, verifyToken, changePassword);

module.exports = userRouter;