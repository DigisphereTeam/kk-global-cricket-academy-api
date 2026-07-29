const express = require("express");

const playerRouter = express.Router();

const { createPlayerAdmission,getAllPlayers,getPlayerById,updatePlayer,deletePlayer,searchPlayers,getPlayerAnalytics } = require("../controllers/playerController");

const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");


playerRouter.use(verifyToken);

playerRouter.post("/", validateRequestBody, checkRole("PRIMARY"), createPlayerAdmission);

playerRouter.get("/", getAllPlayers);

playerRouter.get("/search", searchPlayers);

playerRouter.get("/analytics", getPlayerAnalytics);

playerRouter.get("/:player_id", getPlayerById);

playerRouter.patch("/:player_id", validateRequestBody, updatePlayer);

playerRouter.delete("/:player_id", deletePlayer);


module.exports = playerRouter;