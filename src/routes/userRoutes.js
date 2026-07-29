const express = require("express");
const userRouter = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const { registerPrimary, getUsers, getUserById, updateUser, deleteUser, getProfile, changePassword } = require("../controllers/userController");
const validateRequestBody = require("../middlewares/validateRequestBody");

userRouter.use(verifyToken);

userRouter.post("/primary", validateRequestBody, checkRole("ADMIN"), registerPrimary);

userRouter.get("/", checkRole("ADMIN"), getUsers);

userRouter.get("/profile", getProfile);

userRouter.get("/:user_id", checkRole("ADMIN"), getUserById);

userRouter.patch("/:user_id", validateRequestBody, checkRole("ADMIN"), updateUser);

userRouter.delete("/:user_id", checkRole("ADMIN"), deleteUser);

userRouter.patch("/changePassword", validateRequestBody, changePassword);

module.exports = userRouter;