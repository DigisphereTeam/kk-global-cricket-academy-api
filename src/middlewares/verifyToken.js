const jwt = require("jsonwebtoken");
const { sendErrorResponse } = require("../utils/apiResponse");
const pool = require("../config/dbConfig");


const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return sendErrorResponse(
      res,
      401,
      "Access token is required."
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    return sendErrorResponse(
      res,
      401,
      "Invalid authorization format."
    );
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return sendErrorResponse(
      res,
      401,
      "Access token is required."
    );
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Check if user still exists
    const user = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE user_id = $1
      `,
      [decoded.user_id]
    );

    if (user.rowCount === 0) {
      return sendErrorResponse(
        res,
        401,
        "User account not found. Please sign in again."
      );
    }

    req.user = decoded;

    next();
  } catch (error) {
    return sendErrorResponse(
      res,
      401,
      "Invalid or expired token."
    );
  }
};

module.exports = verifyToken;