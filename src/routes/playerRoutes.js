const express = require("express");

const playerRouter = express.Router();

const validateRequestBody = require("../middlewares/validateRequestBody");
const verifyToken = require("../middlewares/verifyToken");
const { checkRole } = require("../middlewares/checkRole");
const { createPlayerAdmission, getAllPlayers, searchPlayers, getPlayerById, updatePlayer, deletePlayer, getPlayersAndCoaches, generateDues, updatePlayerStatus } = require("../controllers/playerController");
const fileUpload = require("../middlewares/uploadMiddleware");
const { generateMonthlyDues } = require("../jobs/generateMonthlyDues");

playerRouter.use(verifyToken);

playerRouter.post(
  "/",
  fileUpload.array("document_urls", 5), // Max 5 files
  validateRequestBody,
  checkRole("PRIMARY"),
  createPlayerAdmission
);
playerRouter.get("/", getAllPlayers);

playerRouter.get("/players-coaches", getPlayersAndCoaches);

playerRouter.get("/search", searchPlayers);

playerRouter.get("/:player_id", getPlayerById);

playerRouter.patch("/:player_id", fileUpload.array("document_urls", 5), validateRequestBody, updatePlayer);

playerRouter.patch("/:player_id/status", validateRequestBody, updatePlayerStatus);

// playerRouter.delete("/:player_id", checkRole("ADMIN"), deletePlayer);

playerRouter.post(
  "/generate-monthly-dues",
  generateDues
);

module.exports = playerRouter;