const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.addStaff = async (req, res) => {
  const {
    full_name,
    phone_number,
    department,
    designation,
    salary,
    join_date,
  } = req.body;

  try {
    // Check duplicate phone number
    const existingStaff = await pool.query(
      `
      SELECT 1
      FROM tbl_staff
      WHERE phone_number = $1
      LIMIT 1
      `,
      [phone_number]
    );

    if (existingStaff.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Phone number already exists"
      );
    }

    const result = await pool.query(
      `
      INSERT INTO tbl_staff
      (
        full_name,
        phone_number,
        department,
        designation,
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
        department,
        designation,
        salary,
        join_date,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Staff added successfully.",
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

exports.getAllStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_staff
      ORDER BY staff_id DESC
      `
    );

    return sendSuccessResponse(
      res,
      200,
      "Staff retrieved successfully.",
      {
        total_staff: result.rowCount,
        staff: result.rows,
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


exports.getStaffById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Staff ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID"
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_staff
      WHERE staff_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Staff not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Staff retrieved successfully.",
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


exports.updateStaff = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Staff ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID"
    );
  }

  try {
    // Check staff exists
    const existingStaff = await pool.query(
      `
      SELECT *
      FROM tbl_staff
      WHERE staff_id = $1
      `,
      [id]
    );

    if (existingStaff.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Staff not found."
      );
    }

    // Check duplicate phone number
    if (req.body.phone_number) {
      const phoneExists = await pool.query(
        `
        SELECT 1
        FROM tbl_staff
        WHERE phone_number = $1
          AND staff_id <> $2
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
      "department",
      "designation",
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
      UPDATE tbl_staff
      SET ${updates.join(", ")}
      WHERE staff_id = $${index}
      RETURNING *
      `,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "Staff updated successfully.",
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



exports.deleteStaff = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Staff ID is required"
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID"
    );
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM tbl_staff
      WHERE staff_id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Staff not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Staff deleted successfully."
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};



exports.searchStaff = async (req, res) => {
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
      FROM tbl_staff
      WHERE
        full_name ILIKE $1
        OR phone_number ILIKE $1
        OR department ILIKE $1
        OR designation ILIKE $1
      ORDER BY staff_id DESC
      `,
      [searchKeyword]
    );

    return sendSuccessResponse(
      res,
      200,
      "Staff retrieved successfully.",
      {
        total_staff: result.rowCount,
        staff: result.rows,
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