const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");


exports.addCoach = async (req, res) => {
  const {
    full_name,
    phone_number,
    specialization,
    experience,
    salary,
    join_date,
  } = req.body;

  let client;

  try {
    if (
      !full_name ||
      !phone_number ||
      !specialization ||
      experience == null ||
      salary == null ||
      !join_date
    ) {
      return sendErrorResponse(
        res,
        400,
        "All fields are required."
      );
    }

    if (!/^[6-9]\d{9}$/.test(phone_number)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
      );
    }

    if (Number(experience) < 0) {
      return sendErrorResponse(
        res,
        400,
        "Experience cannot be negative."
      );
    }

    if (Number(salary) <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Salary must be greater than zero."
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    const currentYear = new Date().getFullYear();
    const yearCode = String(currentYear).slice(-2);
    const prefix = `C${yearCode}`;

    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );

    const coachCodeResult = await client.query(
      `
      SELECT
        COALESCE(
          MAX(
            CAST(SUBSTRING(coach_code FROM 4) AS INTEGER)
          ),
          0
        ) AS last_number
      FROM tbl_coach
      WHERE coach_code LIKE $1
      `,
      [`${prefix}%`]
    );

    const nextNumber =
      Number(coachCodeResult.rows[0].last_number) + 1;

    const coach_code = `${prefix}${String(nextNumber).padStart(
      4,
      "0"
    )}`;

    const existingCoach = await client.query(
      `
      SELECT 1
      FROM tbl_coach
      WHERE phone_number = $1
      LIMIT 1
      `,
      [phone_number.trim()]
    );

    if (existingCoach.rowCount > 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        409,
        "Phone number already exists."
      );
    }

    const result = await client.query(
      `
      INSERT INTO tbl_coach
      (
        coach_code,
        full_name,
        phone_number,
        specialization,
        experience,
        salary,
        join_date,
        id_increment
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8
      )
      RETURNING *;
      `,
      [
        coach_code,
        full_name.trim(),
        phone_number.trim(),
        specialization.trim(),
        Number(experience),
        Number(salary),
        join_date,
        nextNumber,
      ]
    );

    const userResult = await client.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const performedBy =
      userResult.rows[0]?.full_name || "System";

    await client.query(
      `
      INSERT INTO tbl_notification_logs
      (
        module_name,
        action,
        description,
        performed_by
      )
      VALUES
      ($1,$2,$3,$4)
      `,
      [
        "Coach",
        "Created",
        `Coach ${result.rows[0].full_name} was added.`,
        performedBy,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Coach added successfully.",
      result.rows[0]
    );

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error(error);

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


exports.getAllCoaches = async (req, res) => {
  try {
    const [result, statistics] = await Promise.all([
      pool.query(
        `
        SELECT *
        FROM tbl_coach
        WHERE is_active = TRUE
        ORDER BY coach_id DESC
        `
      ),

      pool.query(
        `
        SELECT
          COUNT(*) AS total_trainers,
          COUNT(*) AS active_trainers,
          COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating,
          COALESCE(ROUND(AVG(experience::NUMERIC), 1), 0) AS average_experience
        FROM tbl_coach
        WHERE is_active = TRUE
        `
      ),
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Coaches retrieved successfully.",
      {
        statistics: {
          total_trainers: Number(statistics.rows[0].total_trainers),
          active_trainers: Number(statistics.rows[0].active_trainers),
          average_rating: Number(statistics.rows[0].average_rating),
          average_experience: Number(statistics.rows[0].average_experience),
        },
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


exports.getCoachById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required."
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID."
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_coach
      WHERE coach_id = $1
        AND is_active = TRUE
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Active coach not found."
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
        AND is_active = TRUE
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
      "rating"
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


exports.deleteCoach = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required."
    );
  }

  if (isNaN(id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID."
    );
  }

  try {
    // Check whether the coach is assigned to any one-on-one application
    const assignedCoach = await pool.query(
      `
      SELECT 1
      FROM tbl_one_on_one_applications
      WHERE coach_id = $1
      LIMIT 1
      `,
      [id]
    );

    if (assignedCoach.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Coach is assigned to one or more Coach cannot be deleted."
      );
    }

    // Delete the coach
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


exports.updateCoachStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  // Validate Coach ID
  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required."
    );
  }

  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID."
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
    // Check coach exists
    const coach = await pool.query(
      `
      SELECT coach_id, is_active
      FROM tbl_coach
      WHERE coach_id = $1;
      `,
      [id]
    );

    if (coach.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Coach not found."
      );
    }

    // Check if status is already the same
    if (coach.rows[0].is_active === is_active) {
      return sendErrorResponse(
        res,
        409,
        `Coach is already ${is_active ? "active" : "inactive"}.`
      );
    }

    const result = await pool.query(
      `
      UPDATE tbl_coach
      SET
        is_active = $1
      WHERE coach_id = $2
      RETURNING *;
      `,
      [is_active, id]
    );

    return sendSuccessResponse(
      res,
      200,
      `Coach ${is_active ? "activated" : "deactivated"} successfully.`,
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