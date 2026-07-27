const { sendErrorResponse } = require("../utils/apiResponse");

const validateRequestBody = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return sendErrorResponse(
      res,
      400,
      "Request body cannot be empty"
    );
  }

  next();
};

module.exports = validateRequestBody;