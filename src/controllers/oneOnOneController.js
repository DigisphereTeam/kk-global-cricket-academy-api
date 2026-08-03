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
  const { application_id } = req.params;

  if (!application_id) {
    return sendErrorResponse(
      res,
      400,
      "Application ID is required."
    );
  }

  if (isNaN(application_id) || Number(application_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid application ID."
    );
  }

  const {
    focus_area,
    payment_type,
    fee_amount,
    preferred_slot,
    monthly_performance_review,
    remarks,
  } = req.body;

  try {
    if (
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

    if (Number(fee_amount) <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Fee amount must be greater than zero."
      );
    }

    // Get selected application
    const applicationResult = await pool.query(
      `
      SELECT
        oa.application_id,
        oa.player_id,
        oa.coach_id,
        oa.application_date,
        oa.application_type,
        p.full_name AS player_name,
        c.full_name AS coach_name
      FROM tbl_one_on_one_applications oa
      INNER JOIN tbl_players p
        ON oa.player_id = p.player_id
      INNER JOIN tbl_coach c
        ON oa.coach_id = c.coach_id
      WHERE oa.application_id = $1
      `,
      [application_id]
    );

    if (applicationResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Application not found."
      );
    }

    const application = applicationResult.rows[0];

    // Allow renewal only for latest application
    const latestApplication = await pool.query(
      `
      SELECT
        application_id
      FROM tbl_one_on_one_applications
      WHERE player_id = $1
      ORDER BY application_date DESC, application_id DESC
      LIMIT 1
      `,
      [application.player_id]
    );

    if (
      latestApplication.rows[0].application_id !==
      Number(application_id)
    ) {
      return sendErrorResponse(
        res,
        409,
        "Only the latest application can be renewed."
      );
    }

    // Renewal is always for next month
    const renewalDate = new Date();

    // Prevent duplicate renewal/application for the renewal month
    const existingApplication = await pool.query(
      `
      SELECT
        application_id,
        application_type,
        application_date
      FROM tbl_one_on_one_applications
      WHERE player_id = $1
        AND EXTRACT(MONTH FROM application_date) =
            EXTRACT(MONTH FROM $2::date)
        AND EXTRACT(YEAR FROM application_date) =
            EXTRACT(YEAR FROM $2::date)
      LIMIT 1
      `,
      [
        application.player_id,
        renewalDate,
      ]
    );

    if (existingApplication.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        `Player already has a ${existingApplication.rows[0].application_type.toLowerCase()} application for this month.`
      );
    }

    // Create renewal
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
        $3,
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
        application.player_id,
        application.coach_id,
        renewalDate,
        focus_area.trim(),
        payment_type,
        fee_amount,
        preferred_slot,
        monthly_performance_review || null,
        remarks || null,
      ]
    );

    // Logged-in user
    const userResult = await pool.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const performedBy = userResult.rows[0].full_name;

    // Notification
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
        "Renewed",
        `${application.player_name} renewed one-on-one training with Coach ${application.coach_name}.`,
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
      WITH latest_applications AS (
          SELECT
              oa.*,
              ROW_NUMBER() OVER (
                  PARTITION BY oa.player_id
                  ORDER BY
                      CASE
                          WHEN date_trunc('month', oa.application_date) =
                               make_date($2, $1, 1)
                          THEN 0
                          ELSE 1
                      END,
                      oa.application_date DESC,
                      oa.application_id DESC
              ) AS rn
          FROM tbl_one_on_one_applications oa
          WHERE
              oa.renewal_status = 'Active'
              AND date_trunc('month', oa.application_date) IN (
                  make_date($2, $1, 1),
                  make_date($2, $1, 1) - interval '1 month'
              )
      )

      SELECT
          la.application_id,

          p.player_id,
          p.admission_id,
          p.full_name AS student_name,

          la.coach_id,
          c.full_name AS coach_name,

          la.focus_area,
          la.payment_type,
          la.payment_status,
          la.fee_amount,
          la.preferred_slot,
          la.application_type,
          la.application_date,
          la.monthly_performance_review,
          la.remarks,
          la.created_at,
          la.updated_at,

          EXTRACT(MONTH FROM la.application_date)::INT AS application_month,
          EXTRACT(YEAR FROM la.application_date)::INT AS application_year

      FROM latest_applications la

      JOIN tbl_players p
        ON p.player_id = la.player_id

      LEFT JOIN tbl_coach c
        ON c.coach_id = la.coach_id

      WHERE la.rn = 1

      ORDER BY la.application_date DESC;
      `,
      [month, year]
    );

    const totalApplications = await pool.query(`
      SELECT COUNT(DISTINCT player_id)::INT AS total_applications
      FROM tbl_one_on_one_applications
      WHERE renewal_status='Active'
    `);

    const data = applications.rows.map((row) => {
      const isCurrentMonth =
        Number(row.application_month) === month &&
        Number(row.application_year) === year;

      return {
        ...row,
        status: "Active",
        sessions: 1,
        payment_status: isCurrentMonth
          ? row.payment_status
          : "Pending",
      };
    });

    const statistics = {
      total_applications:
        totalApplications.rows[0].total_applications,

      active_sessions: data.filter(
        (item) => item.payment_status === "Paid"
      ).length,

      pending_renewal: data.filter(
        (item) => item.payment_status === "Pending"
      ).length,

      this_month: data.filter(
        (item) =>
          Number(item.application_month) === month &&
          Number(item.application_year) === year
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
        'Active' AS status,
        2 AS sessions,
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

exports.cancelRenewal = async (req, res) => {
  const { application_id } = req.params;
  const { cancellation_reason } = req.body || {};

  try {
    if (!application_id) {
      return sendErrorResponse(
        res,
        400,
        "Application ID is required."
      );
    }

    const application = await pool.query(
      `
      SELECT
        application_id,
        payment_status,
        renewal_status
      FROM tbl_one_on_one_applications
      WHERE application_id = $1
      `,
      [application_id]
    );


    if (application.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "Application not found."
      );
    }


    if (
      application.rows[0].renewal_status === "Cancelled"
    ) {
      return sendErrorResponse(
        res,
        400,
        "Renewal already cancelled."
      );
    }


    await pool.query(
      `
      UPDATE tbl_one_on_one_applications
      SET
        renewal_status = 'Cancelled',
        cancellation_reason = $2,
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE application_id = $1
      `,
      [
        application_id,
        cancellation_reason?.trim() || null
      ]
    );


    return sendSuccessResponse(
      res,
      200,
      "Renewal cancelled successfully."
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
