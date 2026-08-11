const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const { deletefroms3, uploadToS3, getSignedVideoUrl } = require("../utils/s3upload");

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
  const uploadedS3Files = [];

  try {
    // Required field validation
    if (
      !full_name?.trim() ||
      !phone_number?.trim() ||
      !specialization?.trim() ||
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

    // Phone validation
    if (
      !/^[6-9]\d{9}$/.test(
        phone_number.trim()
      )
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
      );
    }

    // Experience validation
    if (
      isNaN(Number(experience)) ||
      Number(experience) < 0
    ) {
      return sendErrorResponse(
        res,
        400,
        "Experience cannot be negative."
      );
    }

    // Salary validation
    if (
      isNaN(Number(salary)) ||
      Number(salary) <= 0
    ) {
      return sendErrorResponse(
        res,
        400,
        "Salary must be greater than zero."
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    const currentYear =
      new Date().getFullYear();

    const yearCode =
      String(currentYear).slice(-2);

    const prefix =
      `C${yearCode}`;

    // Prevent duplicate coach code generation
    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );

    const coachCodeResult =
      await client.query(
        `
        SELECT
          COALESCE(
            MAX(
              CAST(
                SUBSTRING(
                  coach_code FROM 4
                ) AS INTEGER
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
      Number(
        coachCodeResult.rows[0].last_number
      ) + 1;

    const coach_code =
      `${prefix}${String(nextNumber).padStart(
        4,
        "0"
      )}`;

    const existingCoach =
      await client.query(
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

    // ==========================================
    // Create Coach
    // ==========================================

    const result =
      await client.query(
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

    const coachId =
      result.rows[0].coach_id;

    // ==========================================
    // Upload Multiple Documents to S3
    // ==========================================

    if (
      req.files &&
      req.files.length > 0
    ) {
      for (const file of req.files) {
        try {
          // Upload file to S3
          const s3Key = await uploadToS3(
            file,
            "coaches"
          );

          // Keep track of uploaded files
          // for cleanup if transaction fails
          uploadedS3Files.push(s3Key);

          // Store S3 key in common documents table
          await client.query(
            `
        INSERT INTO tbl_documents
        (
          coach_id,
          document_url
        )
        VALUES
        (
          $1,
          $2
        )
        `,
            [
              coachId,
              s3Key,
            ]
          );

        } catch (uploadError) {
          console.error(
            "S3 upload failed:",
            uploadError
          );

          throw new Error(
            `Failed to upload document: ${file.originalname}`
          );
        }
      }
    }

    const userResult =
      await client.query(
        `
        SELECT full_name
        FROM tbl_users
        WHERE user_id = $1
        `,
        [req.user.user_id]
      );

    const performedBy =
      userResult.rows[0]?.full_name ||
      "System";

    // ==========================================
    // Notification
    // ==========================================

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

    console.error(
      "Add coach error:",
      error
    );

    if (client) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }


    if (
      uploadedS3Files.length > 0
    ) {
      for (
        const s3Key
        of uploadedS3Files
      ) {
        try {
          await deletefroms3(
            s3Key
          );
        } catch (deleteError) {
          console.error(
            `Failed to delete S3 file ${s3Key}:`,
            deleteError
          );
        }
      }
    }

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Internal Server Error"
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
              JSON_BUILD_OBJECT(
                'document_id', d.document_id,
                'document_url', d.document_url,
                'created_at', d.created_at
              )
              ORDER BY d.document_id
            ) FILTER (
              WHERE d.document_id IS NOT NULL
            ),
            '[]'
          ) AS documents

        FROM tbl_coach c

        LEFT JOIN tbl_documents d
          ON d.coach_id = c.coach_id

        GROUP BY
          c.coach_id

        ORDER BY
          c.coach_id DESC
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
          coach.documents.map(async (document) => {
            if (!document.document_url) {
              return null;
            }

            const signedUrl =
              await getSignedVideoUrl(
                document.document_url
              );

            return {
              document_id: document.document_id,
              document_url: document.document_url,
              created_at: document.created_at,
              file_url: signedUrl,
            };
          })
        );

        // Remove original documents key
        delete coach.documents;

        return {
          ...coach,
          document_urls: document_urls.filter(Boolean),
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

  if (!id) {
    return sendErrorResponse(
      res,
      400,
      "Coach ID is required."
    );
  }

  if (!Number.isInteger(Number(id))) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Coach ID."
    );
  }

  let client;

  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const existingCoach =
      await client.query(
        `
        SELECT *
        FROM tbl_coach
        WHERE coach_id = $1
        AND is_active = TRUE
        `,
        [id]
      );

    if (existingCoach.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Coach not found."
      );
    }


    if (req.body.phone_number) {
      req.body.phone_number =
        req.body.phone_number.trim();
    }

    if (
      req.body.phone_number &&
      !/^[6-9]\d{9}$/.test(
        req.body.phone_number
      )
    ) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
      );
    }

    if (req.body.phone_number) {
      const phoneExists =
        await client.query(
          `
          SELECT 1
          FROM tbl_coach
          WHERE phone_number = $1
          AND coach_id <> $2
          LIMIT 1
          `,
          [
            req.body.phone_number,
            id,
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


    if (
      req.body.experience !== undefined &&
      req.body.experience !== null &&
      req.body.experience !== "" &&
      (
        isNaN(
          Number(req.body.experience)
        ) ||
        Number(req.body.experience) < 0
      )
    ) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        400,
        "Experience cannot be negative."
      );
    }

    if (
      req.body.salary !== undefined &&
      req.body.salary !== null &&
      req.body.salary !== "" &&
      (
        isNaN(
          Number(req.body.salary)
        ) ||
        Number(req.body.salary) <= 0
      )
    ) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        400,
        "Salary must be greater than zero."
      );
    }


    const allowedFields = [
      "full_name",
      "phone_number",
      "specialization",
      "experience",
      "salary",
      "join_date",
      "rating",
    ];

    const numericFields = [
      "experience",
      "salary",
      "rating",
    ];

    const updates = [];
    const values = [];

    let index = 1;


    for (const field of allowedFields) {
      if (
        Object.hasOwn(
          req.body,
          field
        )
      ) {
        let value =
          req.body[field];

        if (
          typeof value === "string"
        ) {
          value = value.trim();
        }

        if (
          numericFields.includes(
            field
          ) &&
          value !== null &&
          value !== ""
        ) {
          value = Number(value);
        }

        updates.push(
          `${field} = $${index}`
        );

        values.push(
          value === ""
            ? null
            : value
        );

        index++;
      }
    }

    let result;



    if (updates.length > 0) {
      values.push(id);

      result = await client.query(
        `
        UPDATE tbl_coach
        SET ${updates.join(", ")}
        WHERE coach_id = $${index}
        AND is_active = TRUE
        RETURNING *;
        `,
        values
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");

        return sendErrorResponse(
          res,
          404,
          "Coach not found."
        );
      }
    } else {

      result = {
        rows: [
          existingCoach.rows[0],
        ],
        rowCount: 1,
      };
    }

    const coachId =
      result.rows[0].coach_id;


    if (
      req.files &&
      req.files.length > 0
    ) {
      for (const file of req.files) {
        try {
          // Upload file to S3
          const s3Key =
            await uploadToS3(
              file,
              "coaches"
            );

          // Track uploaded file
          // for cleanup if transaction fails
          uploadedS3Files.push(
            s3Key
          );

          // Store S3 key in common documents table
          await client.query(
            `
            INSERT INTO tbl_documents
            (
              coach_id,
              document_url
            )
            VALUES
            ($1, $2)
            `,
            [
              coachId,
              s3Key,
            ]
          );

        } catch (uploadError) {
          console.error(
            "S3 upload failed:",
            uploadError
          );

          throw new Error(
            `Failed to upload document: ${file.originalname}`
          );
        }
      }
    }


    const documents =
      await client.query(
        `
        SELECT
          document_id,
          document_url,
          created_at
        FROM tbl_documents
        WHERE coach_id = $1
        ORDER BY document_id;
        `,
        [coachId]
      );


    const reqUserDetails =
      await client.query(
        `
        SELECT full_name
        FROM tbl_users
        WHERE user_id = $1
        `,
        [req.user.user_id]
      );

    const reqUser =
      reqUserDetails.rows[0];

    if (!reqUser) {
      throw new Error(
        "Logged-in user not found."
      );
    }

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
        "Updated",
        `Coach ${result.rows[0].full_name} was updated.`,
        reqUser.full_name,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      200,
      "Coach updated successfully.",
      {
        ...result.rows[0],
        documents:
          documents.rows,
      }
    );

  } catch (error) {

    console.error(
      "Update coach error:",
      error
    );

    // ==========================================
    // Rollback Database
    // ==========================================

    if (client) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }

    // ==========================================
    // Delete Newly Uploaded S3 Files
    // ==========================================

    if (
      uploadedS3Files.length > 0
    ) {
      for (
        const s3Key
        of uploadedS3Files
      ) {
        try {
          await deletefroms3(
            s3Key
          );
        } catch (deleteError) {
          console.error(
            `Failed to delete S3 file ${s3Key}:`,
            deleteError
          );
        }
      }
    }

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Internal Server Error"
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