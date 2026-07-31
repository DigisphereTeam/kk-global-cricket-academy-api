const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");


exports.getPlayerWiseReport = async (req, res) => {
  const { year } = req.query;

  try {

    if (!year) {
      return sendErrorResponse(
        res,
        400,
        "Admission year is required."
      );
    }

    const result = await pool.query(
      `
      SELECT
        admission_id,
        full_name,
        gender,
        age,
        EXTRACT(YEAR FROM created_at) AS admission_year,
        admission_fee AS total_paid
      FROM tbl_players
      WHERE EXTRACT(YEAR FROM created_at) = $1
      ORDER BY full_name ASC
      `,
      [year]
    );

    return sendSuccessResponse(
      res,
      200,
      "Player report fetched successfully.",
      result.rows
    );

  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};