const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse, } = require("../utils/apiResponse");

exports.applyOneOnOne = async (req, res) => {
  const {
    player_id,
    coach_id,
    application_date,
    focus_area,
    payment_type,
    fee_amount,
    preferred_slot,
    monthly_performance_review,
    remarks,
  } = req.body;

  try {
    if (
      !player_id ||
      !coach_id ||
      !focus_area ||
      !payment_type ||
      fee_amount == null ||
      !preferred_slot
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided.",
      );
    }

    if (fee_amount <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Fee amount must be greater than zero.",
      );
    }

    const [student, coach] = await Promise.all([
      pool.query(`SELECT 1 FROM tbl_players WHERE player_id = $1`, [
        player_id,
      ]),
      pool.query(`SELECT 1 FROM tbl_coach WHERE coach_id = $1`, [coach_id]),
    ]);

    if (student.rowCount === 0) {
      return sendErrorResponse(res, 404, "Student not found.");
    }

    if (coach.rowCount === 0) {
      return sendErrorResponse(res, 404, "Coach not found.");
    }

    const existingApplication = await pool.query(
      `SELECT 1
       FROM tbl_one_on_one_applications
       WHERE player_id = $1
       AND coach_id = $2
       AND preferred_slot = $3`,
      [player_id, coach_id, preferred_slot],
    );

    if (existingApplication.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "An application already exists for the selected coach and preferred slot.",
      );
    }

    const application = await pool.query(
      `
      INSERT INTO tbl_one_on_one_applications
      (
        player_id,
        coach_id,
        application_date,
        focus_area,
        payment_type,
        fee_amount,
        preferred_slot,
        remarks,
        monthly_performance_review
      )
      VALUES
      ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,$7,$8,$9)
      RETURNING *;
      `,
      [
        player_id,
        coach_id,
        application_date || null,
        focus_area.trim(),
        payment_type,
        fee_amount,
        preferred_slot,
        remarks,
        monthly_performance_review || null,
      ],
    );

    // Get logged-in user
    const userResult = await pool.query(
      `
    SELECT full_name
    FROM tbl_users
    WHERE user_id = $1
    `,
      [req.user.user_id]
    );

    const performedBy = userResult.rows[0].full_name;

    const details = await pool.query(
      `
  SELECT
    p.full_name AS player_name,
    c.full_name AS coach_name
  FROM tbl_players p
  JOIN tbl_coach c
    ON c.coach_id = $2
  WHERE p.player_id = $1
  `,
      [player_id, coach_id]
    );

    await pool.query(
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
        "One-on-One Training",
        "Created",
        `${details.rows[0].player_name} registered for one-on-one training with Coach ${details.rows[0].coach_name}.`,
        performedBy,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "One-on-one training application submitted successfully.",
      application.rows[0],
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

exports.renewOneOnOne = async (req, res) => {
  const {
    player_id,
    coach_id,
    application_date,
    focus_area,
    payment_type,
    fee_amount,
    preferred_slot,
    monthly_performance_review,
    remarks,
  } = req.body;

  try {
    if (
      !player_id ||
      !coach_id ||
      !focus_area ||
      !payment_type ||
      fee_amount == null ||
      !preferred_slot
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided."
      );
    }

    if (fee_amount <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Fee amount must be greater than zero."
      );
    }

    const [student, coach] = await Promise.all([
      pool.query(
        `SELECT 1 FROM tbl_players WHERE player_id = $1`,
        [player_id]
      ),
      pool.query(
        `SELECT 1 FROM tbl_coach WHERE coach_id = $1`,
        [coach_id]
      ),
    ]);

    if (student.rowCount === 0) {
      return sendErrorResponse(res, 404, "Student not found.");
    }

    if (coach.rowCount === 0) {
      return sendErrorResponse(res, 404, "Coach not found.");
    }

    // Check previous application exists
    const previousApplication = await pool.query(
      `
      SELECT application_id
      FROM tbl_one_on_one_applications
      WHERE player_id = $1
      ORDER BY application_date DESC, application_id DESC
      LIMIT 1
      `,
      [player_id]
    );

    if (previousApplication.rowCount === 0) {
      return sendErrorResponse(
        res,
        400,
        "Student does not have an active one-on-one application to renew."
      );
    }

    const renewal = await pool.query(
      `
      INSERT INTO tbl_one_on_one_applications
      (
        player_id,
        coach_id,
        application_date,
        focus_area,
        payment_type,
        fee_amount,
        preferred_slot,
        application_type,
        monthly_performance_review,
        remarks
      )
      VALUES
      (
        $1,
        $2,
        COALESCE($3::date, CURRENT_DATE),
        $4,
        $5,
        $6,
        $7,
        'Renewal',
        $8,
        $9
      )
      RETURNING *;
      `,
      [
        player_id,
        coach_id,
        application_date || null,
        focus_area.trim(),
        payment_type,
        fee_amount,
        preferred_slot,
        monthly_performance_review || null,
        remarks || null,
      ]
    );

    // Get logged-in user
    const userResult = await pool.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const performedBy = userResult.rows[0].full_name;

    const details = await pool.query(
      `
      SELECT
        p.full_name AS player_name,
        c.full_name AS coach_name
      FROM tbl_players p
      JOIN tbl_coach c
        ON c.coach_id = $2
      WHERE p.player_id = $1
      `,
      [player_id, coach_id]
    );

    await pool.query(
      `
      INSERT INTO tbl_notification_logs
      (
        module_name,
        action,
        description,
        performed_by
      )
      VALUES
      ($1, $2, $3, $4)
      `,
      [
        "One-on-One Training",
        "Renewed",
        `${details.rows[0].player_name} renewed one-on-one training with Coach ${details.rows[0].coach_name}.`,
        performedBy,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "One-on-one training renewed successfully.",
      renewal.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

exports.getAllApplications = async (req, res) => {
  const now = new Date();

  const month = req.query.month
    ? Number(req.query.month)
    : now.getMonth() + 1;

  const year = req.query.year
    ? Number(req.query.year)
    : now.getFullYear();

  try {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return sendErrorResponse(res, 400, "Invalid month.");
    }

    if (!Number.isInteger(year) || year < 2000) {
      return sendErrorResponse(res, 400, "Invalid year.");
    }

    const applications = await pool.query(
      `
      SELECT
        latest.application_id,
        latest.player_id,
        p.admission_id,
        p.full_name AS student_name,

        latest.coach_id,
        c.full_name AS coach_name,

        latest.focus_area,
        latest.payment_type,
        latest.payment_status,
        latest.fee_amount,
        latest.preferred_slot,
        latest.application_type,
        latest.application_date,
        latest.monthly_performance_review,
        latest.remarks,
        latest.created_at,
        latest.updated_at,

        latest.application_month,
        latest.application_year

      FROM tbl_players p

      JOIN LATERAL (
        SELECT
          oa.*,
          EXTRACT(MONTH FROM oa.application_date)::INT AS application_month,
          EXTRACT(YEAR FROM oa.application_date)::INT AS application_year
        FROM tbl_one_on_one_applications oa
        WHERE oa.player_id = p.player_id
          AND (
            EXTRACT(YEAR FROM oa.application_date) < $2
            OR (
              EXTRACT(YEAR FROM oa.application_date) = $2
              AND EXTRACT(MONTH FROM oa.application_date) <= $1
            )
          )
        ORDER BY
          oa.application_date DESC,
          oa.application_id DESC
        LIMIT 1
      ) latest ON TRUE

      INNER JOIN tbl_coach c
        ON latest.coach_id = c.coach_id

      ORDER BY latest.application_date DESC;
      `,
      [month, year]
    );

    const data = applications.rows.map((row) => {
      const actualMonth = Number(row.application_month);
      const actualYear = Number(row.application_year);

      if (
        actualMonth === month &&
        actualYear === year
      ) {
        return {
          ...row,
          payment_status: row.payment_status,
        };
      }

      let nextMonth = actualMonth + 1;
      let nextYear = actualYear;

      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }

      let paymentStatus = "Pending";

      if (
        month === nextMonth &&
        year === nextYear
      ) {
        paymentStatus = "Pending";
      }

      return {
        ...row,
        application_date: `${year}-${String(month).padStart(2, "0")}-01`,
        payment_status: paymentStatus,
      };
    });

    const statistics = {
      total_applications: data.length,
      active_sessions: data.filter(
        (x) => x.payment_status === "Paid"
      ).length,
      pending_renewal: data.filter(
        (x) => x.payment_status === "Pending"
      ).length,
      this_month: data.filter(
        (x) => month === now.getMonth() + 1 && year === now.getFullYear()
      ).length,
    };

    return sendSuccessResponse(
      res,
      200,
      "Applications fetched successfully.",
      {
        month,
        year,
        statistics,
        applications: data,
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

exports.getPlayerApplications = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(res, 400, "Player ID is required.");
  }

  if (isNaN(player_id) || Number(player_id) <= 0) {
    return sendErrorResponse(res, 400, "Invalid player ID.");
  }

  try {
    // Get Player Details
    const playerResult = await pool.query(
      `
      SELECT
        p.player_id,
        p.admission_id,
        p.full_name,
        (
          SELECT oa.focus_area
          FROM tbl_one_on_one_applications oa
          WHERE oa.player_id = p.player_id
          ORDER BY oa.application_date DESC, oa.application_id DESC
          LIMIT 1
        ) AS focus_area,
        p.phone_number,
        p.email
      FROM tbl_players p
      WHERE p.player_id = $1
      `,
      [player_id]
    );

    if (playerResult.rowCount === 0) {
      return sendErrorResponse(res, 404, "Player not found.");
    }

    const player = playerResult.rows[0];

    // Get Player Applications
    const applications = await pool.query(
      `
      SELECT
        oa.application_id,
        oa.coach_id,
        c.full_name AS coach_name,
        oa.focus_area,
        oa.payment_type,
        oa.payment_status,
        oa.fee_amount,
        oa.preferred_slot,
        oa.application_type,
        oa.application_date,
        oa.monthly_performance_review,
        oa.remarks,
        oa.created_at,
        oa.updated_at
      FROM tbl_one_on_one_applications oa
      INNER JOIN tbl_coach c
        ON oa.coach_id = c.coach_id
      WHERE oa.player_id = $1
      ORDER BY oa.application_id DESC
      `,
      [player_id]
    );

    return sendSuccessResponse(
      res,
      200,
      "Player one-on-one applications fetched successfully.",
      {
        player,
        applications: applications.rows,
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

exports.getApplicationById = async (req, res) => {
  const { application_id } = req.params;

  if (!application_id || isNaN(application_id)) {
    return sendErrorResponse(res, 400, "Invalid application ID.");
  }

  const applicationId = Number(application_id);

  if (applicationId <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Application ID must be a positive number.",
    );
  }

  try {
    const application = await pool.query(
      `
      SELECT
        oa.application_id,

        oa.player_id,
        p.full_name AS player_name,

        oa.coach_id,
        c.full_name AS coach_name,

        oa.focus_area,
        oa.payment_type,
        oa.fee_amount,
        oa.preferred_slot,
        oa.application_date,
        oa.monthly_performance_review,
        oa.remarks,

        oa.created_at,
        oa.updated_at

      FROM tbl_one_on_one_applications oa

      INNER JOIN tbl_players p
      ON oa.player_id = p.player_id

      INNER JOIN tbl_coach c
      ON oa.coach_id = c.coach_id

      WHERE oa.application_id = $1
      `,
      [application_id],
    );

    if (application.rowCount === 0) {
      return sendErrorResponse(res, 404, "Application not found.");
    }

    return sendSuccessResponse(
      res,
      200,
      "Application fetched successfully.",
      application.rows[0],
    );
  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};

exports.updateApplication = async (req, res) => {
  const { application_id } = req.params;

  if (!application_id) {
    return sendErrorResponse(res, 400, "Application ID is required");
  }

  if (isNaN(application_id)) {
    return sendErrorResponse(res, 400, "Invalid application ID");
  }

  try {
    const allowedFields = [
      "coach_id",
      "focus_area",
      "payment_type",
      "fee_amount",
      "preferred_slot",
      "monthly_performance_review",
      "remarks",
    ];

    const updates = [];
    const values = [];

    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${index}`);
        values.push(req.body[field]);
        index++;
      }
    }

    if (updates.length === 0) {
      return sendErrorResponse(res, 400, "No fields provided to update");
    }

    // Check application exists
    const existingApplication = await pool.query(
      `
      SELECT application_id
      FROM tbl_one_on_one_applications
      WHERE application_id = $1
      `,
      [application_id],
    );

    if (existingApplication.rowCount === 0) {
      return sendErrorResponse(res, 404, "Application not found");
    }

    // Check coach if updating coach_id
    if (req.body.coach_id !== undefined) {
      const coach = await pool.query(
        `
        SELECT coach_id
        FROM tbl_coach
        WHERE coach_id = $1
        `,
        [req.body.coach_id],
      );

      if (coach.rowCount === 0) {
        return sendErrorResponse(res, 404, "Coach not found");
      }
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    // Add application_id for WHERE condition
    values.push(application_id);

    const result = await pool.query(
      `
      UPDATE tbl_one_on_one_applications
      SET ${updates.join(", ")}
      WHERE application_id = $${index}
      RETURNING *
      `,
      values,
    );

    return sendSuccessResponse(
      res,
      200,
      "One-on-one application updated successfully",
      result.rows[0],
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
    );
  }
};

exports.deleteApplication = async (req, res) => {
  const { application_id } = req.params;

  if (!application_id || isNaN(application_id)) {
    return sendErrorResponse(res, 400, "Invalid application ID.");
  }

  const applicationId = Number(application_id);

  if (applicationId <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Application ID must be a positive number.",
    );
  }

  try {
    const deleted = await pool.query(
      `
      DELETE FROM tbl_one_on_one_applications
      WHERE application_id = $1
      RETURNING application_id
      `,
      [application_id],
    );

    if (deleted.rowCount === 0) {
      return sendErrorResponse(res, 404, "Application not found.");
    }

    return sendSuccessResponse(res, 200, "Application deleted successfully.", {
      application_id: deleted.rows[0].application_id,
    });
  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};
