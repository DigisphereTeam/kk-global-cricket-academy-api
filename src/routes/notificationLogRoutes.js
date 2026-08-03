const express = require('express');
const { getNotifications, deleteNotification } = require('../controllers/notificationLogController');
const validateRequestBody = require('../middlewares/validateRequestBody');
const verifyToken = require('../middlewares/verifyToken');
const { checkRole } = require('../middlewares/checkRole');

const notificationLogRouter = express.Router();

notificationLogRouter.use(verifyToken);

notificationLogRouter.get('/', getNotifications);

notificationLogRouter.delete('/:log_id', deleteNotification);

module.exports = notificationLogRouter;