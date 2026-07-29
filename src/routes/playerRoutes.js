const express = require("express");

const playerRouter = express.Router();

const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const { createPlayerAdmission, getAllPlayers, searchPlayers, getPlayerAnalytics, getPlayerById, updatePlayer, deletePlayer } = require("../controllers/playerController");

playerRouter.use(verifyToken);

playerRouter.post("/", validateRequestBody, checkRole("PRIMARY"), createPlayerAdmission);

playerRouter.get("/", getAllPlayers);

playerRouter.get("/search", searchPlayers);

playerRouter.get("/analytics", getPlayerAnalytics);

playerRouter.get("/:player_id", getPlayerById);

playerRouter.patch("/:player_id", validateRequestBody, updatePlayer);

playerRouter.delete("/:player_id", checkRole("ADMIN"), deletePlayer);

module.exports = playerRouter;