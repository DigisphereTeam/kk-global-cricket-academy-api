const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const { deletefroms3, uploadToS3, getSignedVideoUrl } = require("../utils/s3upload");

exports.addCoach = async (req, res) => {
  const {
    full_name,
    phone_number,
    secondary_phone_number,
    specialization,
    experience,
    salary,
    join_date,
    contact_name,
    contact_relation,
    contact_phone,
    remarks,
    advance_amount,
    advance_date,
    advance_remarks,
  } = req.body;

  const phoneRegex = /^[6-9]\d{9}$/;
  const nameRegex = /^[A-Za-z\s.'-]+$/;

  if (!full_name?.trim()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Full name is required.",
    });
  }

  if (full_name.trim().length > 250) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Full name cannot exceed 250 characters.",
    });
  }

  if (!nameRegex.test(full_name.trim())) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Full name contains invalid characters.",
    });
  }

  if (!phone_number?.trim()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Phone number is required.",
    });
  }

  if (!phoneRegex.test(phone_number.trim())) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid phone number.",
    });
  }

  if (
    secondary_phone_number &&
    !phoneRegex.test(secondary_phone_number.trim())
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid secondary phone number.",
    });
  }

  if (!specialization?.trim()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Specialization is required.",
    });
  }

  if (specialization.trim().length > 250) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Specialization cannot exceed 250 characters.",
    });
  }

  if (
    experience === undefined ||
    experience === null ||
    experience === ""
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Experience is required.",
    });
  }

  if (
    isNaN(Number(experience)) ||
    Number(experience) < 0
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Experience cannot be negative.",
    });
  }

  if (
    salary === undefined ||
    salary === null ||
    salary === ""
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Salary is required.",
    });
  }

  if (
    isNaN(Number(salary)) ||
    Number(salary) <= 0
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Salary must be greater than zero.",
    });
  }

  if (!join_date) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Join date is required.",
    });
  }

  if (isNaN(Date.parse(join_date))) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid join date.",
    });
  }

  if (contact_name) {
    if (contact_name.trim().length > 250) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Contact name cannot exceed 250 characters.",
      });
    }

    if (!nameRegex.test(contact_name.trim())) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Invalid contact name.",
      });
    }
  }

  if (
    contact_relation &&
    contact_relation.trim().length > 100
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Contact relation cannot exceed 100 characters.",
    });
  }

  if (
    contact_phone &&
    !phoneRegex.test(contact_phone.trim())
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid contact phone number.",
    });
  }

  if (remarks && remarks.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Remarks cannot exceed 1000 characters.",
    });
  }

  if (
    advance_amount !== undefined &&
    advance_amount !== null &&
    advance_amount !== ""
  ) {
    if (
      isNaN(Number(advance_amount)) ||
      Number(advance_amount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Advance amount must be greater than zero.",
      });
    }

    if (!advance_date) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message:
          "Advance date is required when advance amount is provided.",
      });
    }
  }

  if (advance_date && isNaN(Date.parse(advance_date))) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid advance date.",
    });
  }

  if (
    advance_remarks &&
    advance_remarks.trim().length > 1000
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Advance remarks cannot exceed 1000 characters.",
    });
  }

  let client;
  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

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
        "A coach with this phone number already exists."
      );
    }

    const currentYear = new Date().getFullYear();
    const yearCode = String(currentYear).slice(-2);
    const prefix = `C${yearCode}`;

    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );

    const coachCodeResult = await client.query(
      `
      SELECT COALESCE(
        MAX(
          CAST(
            SUBSTRING(coach_code FROM 4) AS INTEGER
          )
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

    const coach_code =
      `${prefix}${String(nextNumber).padStart(4, "0")}`;

    const result = await client.query(
      `
      INSERT INTO tbl_coach
      (
        coach_code,
        full_name,
        phone_number,
        secondary_phone_number,
        specialization,
        experience,
        salary,
        join_date,
        contact_name,
        contact_relation,
        contact_phone,
        remarks,
        id_increment
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      RETURNING *
      `,
      [
        coach_code,
        full_name.trim(),
        phone_number.trim(),
        secondary_phone_number?.trim() || null,
        specialization.trim(),
        Number(experience),
        Number(salary),
        join_date,
        contact_name?.trim() || null,
        contact_relation?.trim() || null,
        contact_phone?.trim() || null,
        remarks?.trim() || null,
        nextNumber,
      ]
    );

    const coach = result.rows[0];
    const coachId = coach.coach_id;

    if (
      advance_amount !== undefined &&
      advance_amount !== null &&
      advance_amount !== ""
    ) {
      await client.query(
        `
        INSERT INTO tbl_employee_advances
        (
          coach_id,
          amount,
          advance_date,
          remarks
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          coachId,
          Number(advance_amount),
          advance_date,
          advance_remarks?.trim() || null,
        ]
      );
    }

    if (req.files?.length > 0) {
      for (const file of req.files) {
        const s3Key = await uploadToS3(file, "coaches");

        uploadedS3Files.push(s3Key);

        await client.query(
          `
          INSERT INTO tbl_documents
          (
            coach_id,
            document_url
          )
          VALUES ($1, $2)
          `,
          [coachId, s3Key]
        );
      }
    }

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
      VALUES ($1, $2, $3, $4)
      `,
      [
        "Coach",
        "Created",
        `Coach ${coach.full_name} was added.`,
        performedBy,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Coach added successfully.",
      coach
    );

  } catch (error) {
    console.error("Add coach error:", error);

    if (client) {
      await client.query("ROLLBACK").catch((err) => {
        console.error("Rollback error:", err);
      });
    }

    if (uploadedS3Files.length > 0) {
      await Promise.allSettled(
        uploadedS3Files.map((key) => deletefroms3(key))
      );
    }

    if (error.code === "23505") {
      return sendErrorResponse(
        res,
        409,
        "A coach with this information already exists."
      );
    }

    if (error.code === "23503") {
      return sendErrorResponse(
        res,
        400,
        "Invalid related record."
      );
    }

    if (error.code === "22P02" || error.code === "22007") {
      return sendErrorResponse(
        res,
        400,
        "Invalid data format."
      );
    }

    return sendErrorResponse(
      res,
      500,
      "Failed to add coach."
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
      pool.query(`
          SELECT
            c.*,

            COALESCE(
              JSON_AGG(
                d.document_url
                ORDER BY d.document_id
              ) FILTER (
                WHERE d.document_id IS NOT NULL
              ),
              '[]'
            ) AS documents,

            latest_advance.amount AS advance_amount,
            latest_advance.advance_date

          FROM tbl_coach c

          LEFT JOIN tbl_documents d
            ON d.coach_id = c.coach_id

          LEFT JOIN LATERAL (
            SELECT
              ea.advance_id,
              ea.amount,
              ea.advance_date
            FROM tbl_employee_advances ea
            WHERE ea.coach_id = c.coach_id
            ORDER BY ea.advance_id DESC
            LIMIT 1
          ) latest_advance
            ON TRUE

          GROUP BY
            c.coach_id,
            latest_advance.advance_id,
            latest_advance.amount,
            latest_advance.advance_date

          ORDER BY c.coach_id DESC
      `),

      pool.query(`
        SELECT
          COUNT(*) AS total_trainers,

          COUNT(*) FILTER (
            WHERE is_active = TRUE
          ) AS active_trainers,

          COUNT(*) FILTER (
            WHERE is_active = FALSE
          ) AS inactive_trainers,

          COALESCE(
            ROUND(
              AVG(experience::NUMERIC),
              1
            ),
            0
          ) AS average_experience

        FROM tbl_coach
      `),
    ]);

    const coaches = await Promise.all(
      result.rows.map(async (coach) => {
        const document_urls = await Promise.all(
          coach.documents.map(async (documentUrl) => {
            if (!documentUrl) {
              return null;
            }

            try {
              return await getSignedVideoUrl(documentUrl);
            } catch (error) {
              console.error(
                "Failed to generate signed URL:",
                error.message
              );

              return null;
            }
          })
        );

        delete coach.documents;

        return {
          ...coach,
          advance_amount:
            coach.advance_amount !== null
              ? Number(coach.advance_amount)
              : 0,

          advance_date:
            coach.advance_date || null,

          document_urls:
            document_urls.filter(Boolean),
        };
      })
    );

    return sendSuccessResponse(
      res,
      200,
      "Coaches retrieved successfully.",
      {
        statistics: {
          total_trainers: Number(
            statistics.rows[0].total_trainers
          ),

          active_trainers: Number(
            statistics.rows[0].active_trainers
          ),

          inactive_trainers: Number(
            statistics.rows[0].inactive_trainers
          ),

          average_experience: Number(
            statistics.rows[0].average_experience
          ),
        },

        coaches,
      }
    );
  } catch (error) {
    console.error(
      "Get all coaches error:",
      error
    );

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Internal Server Error"
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
    SELECT
    c.*
    FROM tbl_coach c
    WHERE c.coach_id = $1
    `,
      [id]
    );

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
  const errors = {};

  const phoneRegex = /^[6-9]\d{9}$/;
  const nameRegex = /^[A-Za-z\s.'-]+$/;

  if (!id) {
    errors.id = "Coach ID is required.";
  } else if (!Number.isInteger(Number(id))) {
    errors.id = "Invalid Coach ID.";
  }

  if (req.body.phone_number) {
    req.body.phone_number = req.body.phone_number.trim();

    if (!phoneRegex.test(req.body.phone_number)) {
      errors.phone_number = "Invalid phone number.";
    }
  }

  if (req.body.secondary_phone_number) {
    req.body.secondary_phone_number =
      req.body.secondary_phone_number.trim();

    if (!phoneRegex.test(req.body.secondary_phone_number)) {
      errors.secondary_phone_number =
        "Invalid secondary phone number.";
    }
  }

  if (req.body.contact_phone) {
    req.body.contact_phone =
      req.body.contact_phone.trim();

    if (!phoneRegex.test(req.body.contact_phone)) {
      errors.contact_phone =
        "Invalid contact phone number.";
    }
  }

  if (req.body.full_name) {
    req.body.full_name =
      req.body.full_name.trim();

    if (req.body.full_name.length > 250) {
      errors.full_name =
        "Full name cannot exceed 250 characters.";
    } else if (!nameRegex.test(req.body.full_name)) {
      errors.full_name =
        "Full name contains invalid characters.";
    }
  }

  if (req.body.specialization) {
    req.body.specialization =
      req.body.specialization.trim();

    if (req.body.specialization.length > 250) {
      errors.specialization =
        "Specialization cannot exceed 250 characters.";
    }
  }

  if (
    req.body.experience !== undefined &&
    req.body.experience !== null &&
    req.body.experience !== ""
  ) {
    if (
      isNaN(Number(req.body.experience)) ||
      Number(req.body.experience) < 0
    ) {
      errors.experience =
        "Experience cannot be negative.";
    }
  }

  if (
    req.body.salary !== undefined &&
    req.body.salary !== null &&
    req.body.salary !== ""
  ) {
    if (
      isNaN(Number(req.body.salary)) ||
      Number(req.body.salary) <= 0
    ) {
      errors.salary =
        "Salary must be greater than zero.";
    }
  }

  if (
    req.body.rating !== undefined &&
    req.body.rating !== null &&
    req.body.rating !== ""
  ) {
    if (
      isNaN(Number(req.body.rating)) ||
      Number(req.body.rating) < 0 ||
      Number(req.body.rating) > 5
    ) {
      errors.rating =
        "Rating must be between 0 and 5.";
    }
  }

  if (req.body.join_date) {
    if (isNaN(Date.parse(req.body.join_date))) {
      errors.join_date =
        "Invalid join date.";
    }
  }

  if (req.body.contact_name) {
    req.body.contact_name =
      req.body.contact_name.trim();

    if (req.body.contact_name.length > 250) {
      errors.contact_name =
        "Contact name cannot exceed 250 characters.";
    } else if (!nameRegex.test(req.body.contact_name)) {
      errors.contact_name =
        "Invalid contact name.";
    }
  }

  if (req.body.contact_relation) {
    req.body.contact_relation =
      req.body.contact_relation.trim();

    if (req.body.contact_relation.length > 100) {
      errors.contact_relation =
        "Contact relation cannot exceed 100 characters.";
    }
  }

  if (req.body.remarks) {
    req.body.remarks =
      req.body.remarks.trim();

    if (req.body.remarks.length > 1000) {
      errors.remarks =
        "Remarks cannot exceed 1000 characters.";
    }
  }

  if (
    req.body.advance_amount !== undefined &&
    req.body.advance_amount !== null &&
    req.body.advance_amount !== ""
  ) {
    if (
      isNaN(Number(req.body.advance_amount)) ||
      Number(req.body.advance_amount) < 0
    ) {
      errors.advance_amount =
        "Advance amount cannot be negative.";
    }

    if (
      Number(req.body.advance_amount) > 0 &&
      !req.body.advance_date
    ) {
      errors.advance_date =
        "Advance date is required when advance amount is provided.";
    }
  }

  if (
    req.body.advance_date &&
    isNaN(Date.parse(req.body.advance_date))
  ) {
    errors.advance_date =
      "Invalid advance date.";
  }

  if (
    req.body.advance_remarks &&
    req.body.advance_remarks.trim().length > 1000
  ) {
    errors.advance_remarks =
      "Advance remarks cannot exceed 1000 characters.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors,
    });
  }

  let client;
  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const existingCoach = await client.query(
      `
      SELECT *
      FROM tbl_coach
      WHERE coach_id = $1
        AND is_active = TRUE
      `,
      [Number(id)]
    );

    if (existingCoach.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Active coach not found."
      );
    }

    if (req.body.phone_number) {
      const phoneExists = await client.query(
        `
        SELECT 1
        FROM tbl_coach
        WHERE phone_number = $1
          AND coach_id <> $2
        LIMIT 1
        `,
        [
          req.body.phone_number,
          Number(id),
        ]
      );

      if (phoneExists.rowCount > 0) {
        await client.query("ROLLBACK");

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
      "secondary_phone_number",
      "specialization",
      "experience",
      "salary",
      "join_date",
      "contact_name",
      "contact_relation",
      "contact_phone",
      "rating",
      "remarks",
    ];

    const numericFields = [
      "experience",
      "salary",
      "rating",
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        let value = req.body[field];

        if (typeof value === "string") {
          value = value.trim();
        }

        if (
          numericFields.includes(field) &&
          value !== null &&
          value !== ""
        ) {
          value = Number(value);
        }

        updates.push(
          `${field} = $${values.length + 1}`
        );

        values.push(
          value === "" ? null : value
        );
      }
    }

    let result;

    if (updates.length > 0) {
      values.push(Number(id));

      result = await client.query(
        `
        UPDATE tbl_coach
        SET ${updates.join(", ")}
        WHERE coach_id = $${values.length}
          AND is_active = TRUE
        RETURNING *
        `,
        values
      );
    } else {
      result = {
        rows: [existingCoach.rows[0]],
        rowCount: 1,
      };
    }

    const coach = result.rows[0];
    const coachId = coach.coach_id;

    if (
      req.body.advance_amount !== undefined &&
      req.body.advance_amount !== null &&
      req.body.advance_amount !== ""
    ) {
      await client.query(
        `
        INSERT INTO tbl_employee_advances
        (
          coach_id,
          amount,
          advance_date,
          remarks
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          coachId,
          Number(req.body.advance_amount),
          req.body.advance_date || null,
          req.body.advance_remarks?.trim() || null,
        ]
      );
    }

    if (req.files?.length > 0) {
      for (const file of req.files) {
        const s3Key = await uploadToS3(
          file,
          "coaches"
        );

        uploadedS3Files.push(s3Key);

        await client.query(
          `
          INSERT INTO tbl_documents
          (
            coach_id,
            document_url
          )
          VALUES ($1, $2)
          `,
          [coachId, s3Key]
        );
      }
    }

    const documents = await client.query(
      `
      SELECT
        document_id,
        document_url,
        created_at
      FROM tbl_documents
      WHERE coach_id = $1
      ORDER BY document_id
      `,
      [coachId]
    );

    const latestAdvance = await client.query(
      `
      SELECT
        advance_id,
        amount,
        advance_date,
        remarks
      FROM tbl_employee_advances
      WHERE coach_id = $1
      ORDER BY advance_id DESC
      LIMIT 1
      `,
      [coachId]
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
      VALUES ($1, $2, $3, $4)
      `,
      [
        "Coach",
        "Updated",
        `Coach ${coach.full_name} was updated.`,
        performedBy,
      ]
    );

    await client.query("COMMIT");

    const advance =
      latestAdvance.rows[0] || null;

    return sendSuccessResponse(
      res,
      200,
      "Coach updated successfully.",
      {
        ...coach,
        advance_amount:
          advance?.amount !== null &&
            advance?.amount !== undefined
            ? Number(advance.amount)
            : 0,
        advance_date:
          advance?.advance_date || null,
        advance_remarks:
          advance?.remarks || null,
        documents: documents.rows,
      }
    );

  } catch (error) {
    console.error(
      "Update coach error:",
      error
    );

    if (client) {
      await client.query("ROLLBACK").catch((err) => {
        console.error(
          "Rollback error:",
          err
        );
      });
    }

    if (uploadedS3Files.length > 0) {
      await Promise.allSettled(
        uploadedS3Files.map((key) =>
          deletefroms3(key)
        )
      );
    }

    if (error.code === "23505") {
      return sendErrorResponse(
        res,
        409,
        "A coach with the provided information already exists."
      );
    }

    return sendErrorResponse(
      res,
      500,
      "Failed to update coach."
    );

  } finally {
    if (client) {
      client.release();
    }
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
    const searchKeyword = `% ${keyword.trim()}% `;

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