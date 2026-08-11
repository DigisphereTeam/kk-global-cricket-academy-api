const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const { deletefroms3, uploadToS3, getSignedVideoUrl } = require("../utils/s3upload");

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
  const uploadedS3Files = [];

  try {
    // Required field validation
    if (
      !full_name?.trim() ||
      !phone_number?.trim() ||
      !department?.trim() ||
      !designation?.trim() ||
      salary == null ||
      salary === "" ||
      !join_date
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided."
      );
    }

    // Phone validation
    if (!/^[6-9]\d{9}$/.test(phone_number.trim())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
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

    // Check duplicate phone number
    const existingStaff = await client.query(
      `
      SELECT 1
      FROM tbl_staff
      WHERE phone_number = $1
      LIMIT 1
      `,
      [phone_number.trim()]
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

    // Prevent duplicate staff code generation
    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );

    const staffNumberResult = await client.query(
      `
      SELECT COALESCE(
        MAX(
          CAST(
            SUBSTRING(staff_code FROM 4) AS INTEGER
          )
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

    // Create staff
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
        phone_number.trim(),
        department.trim(),
        designation.trim(),
        Number(salary),
        join_date,
      ]
    );

    const staffId = result.rows[0].staff_id;

    // Upload multiple documents to S3
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Upload file to S3
          const s3Key = await uploadToS3(
            file,
            "staff"
          );

          // Keep track of uploaded files
          // so we can delete them if DB transaction fails
          uploadedS3Files.push(s3Key);

          // Store S3 key in common documents table
          await client.query(
            `
        INSERT INTO tbl_documents
        (
          staff_id,
          document_url
        )
        VALUES
        ($1, $2)
        `,
            [
              staffId,
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

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Staff added successfully.",
      result.rows[0]
    );

  } catch (error) {
    console.error(
      "Add staff error:",
      error
    );

    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }

    // Delete uploaded S3 files if DB transaction fails
    if (uploadedS3Files.length > 0) {
      for (const s3Key of uploadedS3Files) {
        try {
          await deletefroms3(s3Key);
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
    const [result, statistics] = await Promise.all([
      pool.query(`
        SELECT
          s.*,

          COALESCE(
            JSON_AGG(
              d.document_url
              ORDER BY d.document_id
            ) FILTER (
              WHERE d.document_id IS NOT NULL
            ),
            '[]'
          ) AS documents

        FROM tbl_staff s

        LEFT JOIN tbl_documents d
          ON d.staff_id = s.staff_id

        GROUP BY
          s.staff_id

        ORDER BY
          s.staff_id DESC
      `),

      pool.query(`
        SELECT
          COUNT(*) AS total_staff,

          COUNT(*) FILTER (
            WHERE is_active = TRUE
          ) AS active_staff,

          COUNT(*) FILTER (
            WHERE is_active = FALSE
          ) AS inactive_staff,

          COUNT(DISTINCT department) AS total_departments,

          0 AS leave_staff

        FROM tbl_staff
      `),
    ]);

    // ==========================================
    // Generate signed S3 URLs
    // ==========================================
    const staff = await Promise.all(
      result.rows.map(async (employee) => {
        const document_urls = await Promise.all(
          employee.documents.map(async (documentKey) => {
            if (!documentKey) {
              return null;
            }

            try {
              return await getSignedVideoUrl(documentKey);
            } catch (error) {
              console.error(
                `Failed to generate signed URL for ${documentKey}:`,
                error
              );

              return null;
            }
          })
        );

        // Remove DB document key from response
        delete employee.documents;

        return {
          ...employee,
          document_urls: document_urls.filter(Boolean),
        };
      })
    );

    // ==========================================
    // SUCCESS RESPONSE
    // ==========================================
    return sendSuccessResponse(
      res,
      200,
      "Staff retrieved successfully.",
      {
        statistics: {
          total_staff: Number(
            statistics.rows[0].total_staff
          ),

          active_staff: Number(
            statistics.rows[0].active_staff
          ),

          inactive_staff: Number(
            statistics.rows[0].inactive_staff
          ),

          total_departments: Number(
            statistics.rows[0].total_departments
          ),

          leave_staff: Number(
            statistics.rows[0].leave_staff
          ),
        },

        staff,
      }
    );
  } catch (error) {
    console.error(
      "Get all staff error:",
      error
    );

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
    const result = await pool.query(
      `
      SELECT
        s.*
      FROM tbl_staff s
      WHERE s.staff_id = $1
      `,
      [id]
    );

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

  if (!Number.isInteger(Number(id))) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Staff ID."
    );
  }

  let client;

  // Keep track of newly uploaded S3 files
  // so they can be deleted if transaction fails
  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // ==========================================
    // Check active staff exists
    // ==========================================

    const existingStaff =
      await client.query(
        `
        SELECT *
        FROM tbl_staff
        WHERE staff_id = $1
        AND is_active = TRUE
        `,
        [id]
      );

    if (existingStaff.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Active staff not found."
      );
    }

    // ==========================================
    // Normalize phone number
    // ==========================================

    if (req.body.phone_number) {
      req.body.phone_number =
        req.body.phone_number.trim();
    }

    // ==========================================
    // Phone validation
    // ==========================================

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

    // ==========================================
    // Duplicate phone number validation
    // ==========================================

    if (req.body.phone_number) {
      const phoneExists =
        await client.query(
          `
          SELECT 1
          FROM tbl_staff
          WHERE phone_number = $1
          AND staff_id <> $2
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

    // ==========================================
    // Salary validation
    // ==========================================

    if (
      req.body.salary !== undefined &&
      req.body.salary !== null &&
      req.body.salary !== "" &&
      (
        isNaN(Number(req.body.salary)) ||
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

    // ==========================================
    // Allowed fields
    // ==========================================

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

    // ==========================================
    // Build UPDATE query
    // ==========================================

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
          field === "salary" &&
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

    // ==========================================
    // Update Staff
    // ==========================================

    if (updates.length > 0) {
      values.push(id);

      result = await client.query(
        `
        UPDATE tbl_staff
        SET ${updates.join(", ")}
        WHERE staff_id = $${index}
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
          "Active staff not found."
        );
      }
    } else {
      // No staff fields were changed.
      // Documents may still be uploaded.
      result = {
        rows: [
          existingStaff.rows[0],
        ],
        rowCount: 1,
      };
    }

    const staffId =
      result.rows[0].staff_id;

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
          const s3Key =
            await uploadToS3(
              file,
              "staff"
            );

          // Track uploaded S3 file
          // for cleanup if transaction fails
          uploadedS3Files.push(
            s3Key
          );

          // Store S3 key in common documents table
          await client.query(
            `
            INSERT INTO tbl_documents
            (
              staff_id,
              document_url
            )
            VALUES
            ($1, $2)
            `,
            [
              staffId,
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
        WHERE staff_id = $1
        ORDER BY document_id;
        `,
        [staffId]
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
        "Staff",
        "Updated",
        `Staff ${result.rows[0].full_name} was updated.`,
        reqUser.full_name,
      ]
    );


    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      200,
      "Staff updated successfully.",
      {
        ...result.rows[0],
        documents:
          documents.rows,
      }
    );

  } catch (error) {

    console.error(
      "Update staff error:",
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

  if (
    !Number.isInteger(Number(staff_id)) ||
    Number(staff_id) <= 0
  ) {
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
      SELECT
        staff_id,
        is_active,
        status
      FROM tbl_staff
      WHERE staff_id = $1;
      `,
      [staff_id]
    );

    // Staff not found
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
        `Staff is already ${is_active ? "active" : "inactive"
        }.`
      );
    }

    // Update is_active and status
    const result = await pool.query(
      `
      UPDATE tbl_staff
      SET
        is_active = $1,
        status = CASE
          WHEN $1 = TRUE THEN 'Active'
          ELSE 'Inactive'
        END
      WHERE staff_id = $2
      RETURNING *;
      `,
      [is_active, staff_id]
    );

    return sendSuccessResponse(
      res,
      200,
      `Staff ${is_active ? "activated" : "deactivated"
      } successfully.`,
      result.rows[0]
    );

  } catch (error) {
    console.error("Update Staff Status Error:", error);

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