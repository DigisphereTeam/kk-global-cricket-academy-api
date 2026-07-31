const express = require("express");

const playerFeeRouter = express.Router();

const verifyToken = require("../middlewares/verifyToken");

const { createPlayerFee, getAllPlayerFees, getPlayerFeeById, getPlayerFeesByPlayerId, updatePlayerFee, deletePlayerFee, getPlayerFeeStatistics } = require("../controllers/playerFeeController");
const { checkRole } = require("../middlewares/checkRole");

playerFeeRouter.use(verifyToken);


playerFeeRouter.post("/", checkRole("PRIMARY"), createPlayerFee);

playerFeeRouter.get("/", getAllPlayerFees);

playerFeeRouter.get("/statistics", getPlayerFeeStatistics);

playerFeeRouter.get("/:fee_id", getPlayerFeeById);

playerFeeRouter.get("/player/:player_id", getPlayerFeesByPlayerId);

playerFeeRouter.patch("/:fee_id", updatePlayerFee);

playerFeeRouter.delete("/:fee_id", checkRole("ADMIN"), deletePlayerFee);

module.exports = playerFeeRouter;