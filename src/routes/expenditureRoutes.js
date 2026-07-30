const express = require('express');
const { createExpenditure, getAllExpenditures, getExpenditureById, updateExpenditure, deleteExpenditure } = require('../controllers/expenditureController');
const validateRequestBody = require('../middlewares/validateRequestBody');
const verifyToken = require('../middlewares/verifyToken');
const { checkRole } = require('../middlewares/checkRole');

const expenditureRouter = express.Router();

expenditureRouter.use(verifyToken);

expenditureRouter.post('/', validateRequestBody, checkRole('PRIMARY'), createExpenditure);

expenditureRouter.get('/', getAllExpenditures);

expenditureRouter.get('/:expenditure_id', getExpenditureById);

expenditureRouter.patch('/:expenditure_id', validateRequestBody, updateExpenditure);

expenditureRouter.delete('/:expenditure_id', checkRole('ADMIN'), validateRequestBody, deleteExpenditure);

module.exports = expenditureRouter;