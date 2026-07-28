const express = require("express");
const userRouter = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const { registerPrimary, getUsers, getUserById, updateUser, deleteUser, getProfile, changePassword } = require("../controllers/userController");

userRouter.post("/primary", verifyToken, checkRole("ADMIN"), registerPrimary);

userRouter.get("/", verifyToken, checkRole("ADMIN"), getUsers);

userRouter.get("/:user_id", verifyToken, checkRole("ADMIN"), getUserById);

userRouter.patch("/:user_id", verifyToken, checkRole("ADMIN"), updateUser);

userRouter.delete("/:user_id", verifyToken, checkRole("ADMIN"), deleteUser);

userRouter.get("/profile", verifyToken, getProfile);

userRouter.put("/changePassword", verifyToken, changePassword);

module.exports = userRouter;