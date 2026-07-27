

// ==========================
// Add Coach

const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

// ==========================
exports.addCoach = async (req, res) => {

  const {
    full_name,
    phone_number,
    specialization,
    experience,
    salary,
    join_date,
  } = req.body;

  try {
    const existingCoach = await pool.query(
      `
      SELECT 1
      FROM tbl_coach
      WHERE phone_number = $1
      LIMIT 1
      `,
      [phone_number]
    );

    if (existingCoach.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Phone number already exists"
      );
    }

    const result = await pool.query(
      `
      INSERT INTO tbl_coach
      (
        full_name,
        phone_number,
        specialization,
        experience,
        salary,
        join_date
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6
      )
      RETURNING *
      `,
      [
        full_name,
        phone_number,
        specialization,
        experience,
        salary,
        join_date,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Coach added successfully.",
      result.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

// ==========================
// Get All Coaches
// ==========================
exports.getAllCoaches = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_coach
      ORDER BY coach_id DESC
      `
    );

    return sendSuccessResponse(
      res,
      200,
      "Coaches retrieved successfully.",
      {
        total_coaches: result.rowCount,
        coaches: result.rows,
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};
// ==========================
// Get Coach By ID
// ==========================
exports.getCoachById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID"
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_coach
      WHERE coach_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Coach not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Coach retrieved successfully.",
      result.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

// ==========================
// Update Coach
// ==========================
exports.updateCoach = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID"
    );
  }

  try {
    // Check coach exists
    const existingCoach = await pool.query(
      `
      SELECT *
      FROM tbl_coach
      WHERE coach_id = $1
      `,
      [id]
    );

    if (existingCoach.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Coach not found."
      );
    }

    // Duplicate phone number validation
    if (req.body.phone_number) {
      const phoneExists = await pool.query(
        `
        SELECT 1
        FROM tbl_coach
        WHERE phone_number = $1
        AND coach_id <> $2
        LIMIT 1
        `,
        [req.body.phone_number, id]
      );

      if (phoneExists.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Phone number already exists"
        );
      }
    }

    const allowedFields = [
      "full_name",
      "phone_number",
      "specialization",
      "experience",
      "salary",
      "join_date",
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        updates.push(`${field} = $${index}`);
        values.push(req.body[field]);
        index++;
      }
    }

    if (updates.length === 0) {
      return sendErrorResponse(
        res,
        400,
        "No fields provided for update"
      );
    }

    values.push(id);

    const result = await pool.query(
      `
      UPDATE tbl_coach
      SET ${updates.join(", ")}
      WHERE coach_id = $${index}
      RETURNING *
      `,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "Coach updated successfully.",
      result.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};
// ==========================
// Delete Coach
// ==========================
exports.deleteCoach = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID"
    );
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM tbl_coach
      WHERE coach_id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Coach not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Coach deleted successfully."
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

// ==========================
// Search Coaches
// ==========================
exports.searchCoaches = async (req, res) => {
  const { keyword } = req.query;

  if (!keyword || !keyword.trim()) {
    return sendErrorResponse(
      res,
      400,
      "Search keyword is required"
    );
  }

  try {
    const searchKeyword = `%${keyword.trim()}%`;

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_coach
      WHERE
        full_name ILIKE $1
        OR phone_number ILIKE $1
        OR specialization ILIKE $1
      ORDER BY coach_id DESC
      `,
      [searchKeyword]
    );

    return sendSuccessResponse(
      res,
      200,
      "Coaches retrieved successfully.",
      {
        totalCoaches: result.rowCount,
        coaches: result.rows,
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};