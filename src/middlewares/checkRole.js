const { sendErrorResponse } = require("../utils/apiResponse");

exports.checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendErrorResponse(
        res,
        401,
        "Unauthorized."
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendErrorResponse(
        res,
        403,
        "Access denied."
      );
    }

    next();
  };
};