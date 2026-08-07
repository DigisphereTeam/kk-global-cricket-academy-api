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

  let client;

  try {

    if (
      !full_name ||
      !phone_number ||
      !department ||
      !designation ||
      salary == null ||
      !join_date
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided."
      );
    }

    if (!/^[6-9]\d{9}$/.test(phone_number)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
      );
    }

    if (salary <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Salary must be greater than zero."
      );
    }


    client = await pool.connect();

    await client.query("BEGIN");


    // Check duplicate phone number
    const existingStaff = await client.query(
      `
      SELECT 1
      FROM tbl_staff
      WHERE phone_number = $1
      LIMIT 1
      `,
      [phone_number]
    );


    if (existingStaff.rowCount > 0) {

      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        409,
        "Phone number already exists."
      );
    }


    const currentYear = new Date().getFullYear();

    const yearCode = String(currentYear).slice(-2);

    const prefix = `S${yearCode}`;


    // Prevent duplicate code generation
    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );


    const staffNumberResult = await client.query(
      `
      SELECT COALESCE(
        MAX(
          CAST(SUBSTRING(staff_code FROM 5) AS INTEGER)
        ),
        0
      ) AS last_number
      FROM tbl_staff
      WHERE staff_code LIKE $1
      `,
      [`${prefix}%`]
    );


    const nextNumber =
      Number(staffNumberResult.rows[0].last_number) + 1;


    const staff_code =
      `${prefix}${String(nextNumber).padStart(4, "0")}`;


    const result = await client.query(
      `
      INSERT INTO tbl_staff
      (
        staff_code,
        id_increment,
        full_name,
        phone_number,
        department,
        designation,
        salary,
        join_date
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        staff_code,
        nextNumber,
        full_name.trim(),
        phone_number,
        department.trim(),
        designation.trim(),
        salary,
        join_date,
      ]
    );


    await client.query("COMMIT");


    return sendSuccessResponse(
      res,
      201,
      "Staff added successfully.",
      result.rows[0]
    );


  } catch (error) {

    if (client) {
      await client.query("ROLLBACK");
    }

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  } finally {

    if (client) {
      client.release();
    }

  }
};

exports.getAllStaff = async (req, res) => {
  try {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const [result, statistics] = await Promise.all([
      pool.query(
        `
        SELECT
          s.*,
          a.attendance_id,
          a.payroll_date,
          CASE
            WHEN a.attendance_id IS NOT NULL THEN 'Present'
            ELSE 'Absent'
          END AS attendance_status
        FROM tbl_staff s

        LEFT JOIN tbl_attendance a
          ON a.employee_code = s.staff_code
          AND a.payroll_date = $1

        ORDER BY s.staff_id DESC
        `,
        [today]
      ),

      pool.query(`
        SELECT
          COUNT(*) AS total_staff,
          COUNT(*) FILTER (WHERE is_active = TRUE) AS active_staff,
          COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_staff,
          COUNT(DISTINCT department) AS total_departments,
          0 AS leave_staff
        FROM tbl_staff
      `),
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Staff retrieved successfully.",
      {
        statistics: {
          total_staff: Number(statistics.rows[0].total_staff),
          active_staff: Number(statistics.rows[0].active_staff),
          inactive_staff: Number(statistics.rows[0].inactive_staff),
          total_departments: Number(statistics.rows[0].total_departments),
          leave_staff: Number(statistics.rows[0].leave_staff),
        },
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
      "Staff ID is required."
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID."
    );
  }

  try {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const result = await pool.query(
      `
      SELECT
        s.*,
        a.attendance_id,
        a.payroll_date,
        CASE
          WHEN a.attendance_id IS NOT NULL THEN 'Present'
          ELSE 'Absent'
        END AS attendance_status
      FROM tbl_staff s

      LEFT JOIN tbl_attendance a
        ON a.employee_code = s.staff_code
        AND a.payroll_date = $2

      WHERE s.staff_id = $1
        AND s.is_active = TRUE
      `,
      [id, today]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Active staff not found."
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
      "Staff ID is required."
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID."
    );
  }

  try {
    // Check active staff exists
    const existingStaff = await pool.query(
      `
      SELECT *
      FROM tbl_staff
      WHERE staff_id = $1
        AND is_active = TRUE
      `,
      [id]
    );

    if (existingStaff.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Active staff not found."
      );
    }

    // Duplicate phone number validation
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
          "Phone number already exists."
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
        "No fields provided for update."
      );
    }

    values.push(id);

    const result = await pool.query(
      `
      UPDATE tbl_staff
      SET ${updates.join(", ")}
      WHERE staff_id = $${index}
      RETURNING *;
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


exports.updateStaffStatus = async (req, res) => {
  const { staff_id } = req.params;
  const { is_active } = req.body;

  // Validate Staff ID
  if (!staff_id) {
    return sendErrorResponse(
      res,
      400,
      "Staff ID is required."
    );
  }

  if (!Number.isInteger(Number(staff_id)) || Number(staff_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID."
    );
  }

  // Validate is_active
  if (is_active === undefined) {
    return sendErrorResponse(
      res,
      400,
      "is_active is required."
    );
  }

  if (typeof is_active !== "boolean") {
    return sendErrorResponse(
      res,
      400,
      "is_active must be a boolean value."
    );
  }

  try {
    // Check staff exists
    const staff = await pool.query(
      `
      SELECT staff_id, is_active
      FROM tbl_staff
      WHERE staff_id = $1;
      `,
      [staff_id]
    );

    if (staff.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Staff not found."
      );
    }

    // Check if status is already the same
    if (staff.rows[0].is_active === is_active) {
      return sendErrorResponse(
        res,
        409,
        `Staff is already ${is_active ? "active" : "inactive"}.`
      );
    }

    const result = await pool.query(
      `
      UPDATE tbl_staff
      SET is_active = $1
      WHERE staff_id = $2
      RETURNING *;
      `,
      [is_active, staff_id]
    );

    return sendSuccessResponse(
      res,
      200,
      `Staff ${is_active ? "activated" : "deactivated"} successfully.`,
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