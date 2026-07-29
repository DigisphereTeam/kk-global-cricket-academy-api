const express = require('express');
const validateRequestBody = require('../middlewares/validateRequestBody');
const { createEquipment, getAllEquipment, getEquipmentById, updateEquipment, deleteEquipment } = require('../controllers/equipmentController');
const verifyToken = require('../middlewares/verifyToken');
const { checkRole } = require('../middlewares/checkRole');

const equipmentRouter = express.Router();

equipmentRouter.use(verifyToken);

equipmentRouter.post('/', validateRequestBody, checkRole("PRIMARY"), createEquipment);

equipmentRouter.get('/', getAllEquipment);

equipmentRouter.get('/:equipment_id', getEquipmentById);

equipmentRouter.put('/:equipment_id', validateRequestBody, updateEquipment);

equipmentRouter.delete('/:equipment_id', deleteEquipment);

module.exports = equipmentRouter;