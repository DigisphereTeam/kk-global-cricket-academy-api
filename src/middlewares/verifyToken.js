const jwt = require("jsonwebtoken");
const { sendErrorResponse } = require("../utils/apiResponse");


const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return sendErrorResponse(
      res,
      401,
      "Access token is required"
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    return sendErrorResponse(
      res,
      401,
      "Invalid authorization format"
    );
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return sendErrorResponse(
      res,
      401,
      "Access token is required"
    );
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (error) {
    return sendErrorResponse(
      res,
      401,
      "Invalid or expired token"
    );
  }
};

module.exports = verifyToken;