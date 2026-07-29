const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse, } = require("../utils/apiResponse");

exports.applyOneOnOne = async (req, res) => {
  const {
    student_id,
    coach_id,
    focus_area,
    payment_type,
    fee_amount,
    preferred_slot,
    remarks,
  } = req.body;

  try {
    if (
      !student_id ||
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
      pool.query(`SELECT 1 FROM tbl_students WHERE student_id = $1`, [
        student_id,
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
       WHERE student_id = $1
       AND coach_id = $2
       AND preferred_slot = $3`,
      [student_id, coach_id, preferred_slot],
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
        student_id,
        coach_id,
        focus_area,
        payment_type,
        fee_amount,
        preferred_slot,
        remarks
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        student_id,
        coach_id,
        focus_area.trim(),
        payment_type,
        fee_amount,
        preferred_slot,
        remarks,
      ],
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
    student_id,
    coach_id,
    focus_area,
    payment_type,
    fee_amount,
    preferred_slot,
    remarks,
  } = req.body;

  try {
    const [student, coach] = await Promise.all([
      pool.query(
        `
        SELECT student_id
        FROM tbl_students
        WHERE student_id = $1
        `,
        [student_id],
      ),

      pool.query(
        `
        SELECT coach_id
        FROM tbl_coach
        WHERE coach_id = $1
        `,
        [coach_id],
      ),
    ]);

    if (student.rowCount === 0) {
      return sendErrorResponse(res, 404, "Student not found.");
    }

    if (coach.rowCount === 0) {
      return sendErrorResponse(res, 404, "Coach not found.");
    }

    // Check Previous New Application
    const previousApplication = await pool.query(
      `
      SELECT application_id
      FROM tbl_one_on_one_applications
      WHERE student_id = $1
      LIMIT 1
      `,
      [student_id],
    );

    if (previousApplication.rowCount === 0) {
      return sendErrorResponse(
        res,
        400,
        "Student does not have an active one-on-one application to renew.",
      );
    }

    // Create Renewal Application
    const renewal = await pool.query(
      `
      INSERT INTO tbl_one_on_one_applications
      (
        student_id,
        coach_id,
        focus_area,
        payment_type,
        fee_amount,
        preferred_slot,
        application_type,
        remarks
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,'Renewal',$7)
      RETURNING *
      `,
      [
        student_id,
        coach_id,
        focus_area,
        payment_type,
        fee_amount,
        preferred_slot,
        remarks,
      ],
    );

    return sendSuccessResponse(
      res,
      201,
      "One-on-one training renewed successfully.",
      renewal.rows[0],
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
  try {
    const applications = await pool.query(
      `
      SELECT
        oa.application_id,

        oa.student_id,
        s.full_name AS student_name,

        oa.coach_id,
        c.full_name AS coach_name,

        oa.focus_area,
        oa.payment_type,
        oa.fee_amount,
        oa.preferred_slot,
        oa.application_date,
        oa.remarks,

        oa.created_at,
        oa.updated_at

      FROM tbl_one_on_one_applications oa

      INNER JOIN tbl_students s
      ON oa.student_id = s.student_id

      INNER JOIN tbl_coach c
      ON oa.coach_id = c.coach_id

      ORDER BY oa.application_id DESC
      `,
    );

    return sendSuccessResponse(res, 200, "Applications fetched successfully.", {
      total_applications: applications.rowCount,
      applications: applications.rows,
    });
  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};

exports.getStudentApplications = async (req, res) => {
  const { student_id } = req.params;

  if (!student_id) {
    return sendErrorResponse(res, 400, "Student ID is required.");
  }

  if (isNaN(student_id) || Number(student_id) <= 0) {
    return sendErrorResponse(res, 400, "Invalid student ID.");
  }

  try {
    // Check Student
    const student = await pool.query(
      `
      SELECT student_id
      FROM tbl_students
      WHERE student_id = $1
      `,
      [student_id],
    );

    if (student.rowCount === 0) {
      return sendErrorResponse(res, 404, "Student not found.");
    }

    // Get Student Applications
    const applications = await pool.query(
      `
      SELECT
        oa.application_id,

        oa.student_id,
        s.full_name AS student_name,

        oa.coach_id,
        c.full_name AS coach_name,

        oa.focus_area,
        oa.payment_type,
        oa.fee_amount,
        oa.preferred_slot,

        oa.application_type,
        oa.application_date,

        oa.remarks,

        oa.created_at,
        oa.updated_at

      FROM tbl_one_on_one_applications oa

      INNER JOIN tbl_students s
      ON oa.student_id = s.student_id

      INNER JOIN tbl_coach c
      ON oa.coach_id = c.coach_id

      WHERE oa.student_id = $1

      ORDER BY oa.application_id DESC
      `,
      [student_id],
    );

    return sendSuccessResponse(
      res,
      200,
      "Student one-on-one applications fetched successfully.",
      {
        total_applications: applications.rowCount,
        applications: applications.rows,
      },
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

        oa.student_id,
        s.full_name AS student_name,

        oa.coach_id,
        c.full_name AS coach_name,

        oa.focus_area,
        oa.payment_type,
        oa.fee_amount,
        oa.preferred_slot,
        oa.application_date,
        oa.remarks,

        oa.created_at,
        oa.updated_at

      FROM tbl_one_on_one_applications oa

      INNER JOIN tbl_students s
      ON oa.student_id = s.student_id

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
