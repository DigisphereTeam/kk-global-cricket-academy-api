const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const { deletefroms3, uploadToS3, getSignedVideoUrl } = require("../utils/s3upload");

exports.addStaff = async (req, res) => {
  const {
    full_name,
    phone_number,
    secondary_phone_number,
    department,
    designation,
    salary,
    join_date,
    contact_name,
    contact_relation,
    contact_phone,
    remarks,
    advance_amount,
    advance_date,
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

  if (!department?.trim()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Department is required.",
    });
  }

  if (department.trim().length > 250) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Department cannot exceed 250 characters.",
    });
  }

  if (!designation?.trim()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Designation is required.",
    });
  }

  if (designation.trim().length > 250) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Designation cannot exceed 250 characters.",
    });
  }

  if (
    salary == null ||
    salary === "" ||
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

  if (contact_relation && contact_relation.trim().length > 100) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Contact relation cannot exceed 100 characters.",
    });
  }

  if (contact_phone && !phoneRegex.test(contact_phone.trim())) {
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
  }

  if (
    advance_date !== undefined &&
    advance_date !== null &&
    advance_date !== ""
  ) {
    if (isNaN(Date.parse(advance_date))) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Invalid advance date.",
      });
    }
  }

  let client;
  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

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
        "A staff member with this phone number already exists."
      );
    }

    const currentYear = new Date().getFullYear();
    const yearCode = String(currentYear).slice(-2);
    const prefix = `S${yearCode}`;

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

    const result = await client.query(
      `
      INSERT INTO tbl_staff
      (
        staff_code,
        id_increment,
        full_name,
        phone_number,
        secondary_phone_number,
        department,
        designation,
        salary,
        join_date,
        contact_name,
        contact_relation,
        contact_phone,
        remarks
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      RETURNING *
      `,
      [
        staff_code,
        nextNumber,
        full_name.trim(),
        phone_number.trim(),
        secondary_phone_number?.trim() || null,
        department.trim(),
        designation.trim(),
        Number(salary),
        join_date,
        contact_name?.trim() || null,
        contact_relation?.trim() || null,
        contact_phone?.trim() || null,
        remarks?.trim() || null,
      ]
    );

    const staff = result.rows[0];
    const staffId = staff.staff_id;

    if (
      advance_amount !== undefined &&
      advance_amount !== null &&
      advance_amount !== ""
    ) {
      await client.query(
        `
        INSERT INTO tbl_employee_advances
        (
          staff_id,
          amount,
          advance_date,
          remarks
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          staffId,
          Number(advance_amount),
          advance_date || new Date(),
          remarks?.trim() || null,
        ]
      );
    }

    if (req.files?.length > 0) {
      for (const file of req.files) {
        const s3Key = await uploadToS3(file, "staff");

        uploadedS3Files.push(s3Key);

        await client.query(
          `
          INSERT INTO tbl_documents
          (
            staff_id,
            document_url
          )
          VALUES ($1, $2)
          `,
          [staffId, s3Key]
        );
      }
    }

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Staff added successfully.",
      staff
    );
  } catch (error) {
    console.error("Add staff error:", error);

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
        "A staff member with this information already exists."
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
      "Failed to add staff."
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

          latest_advance.amount AS advance_amount,
          latest_advance.advance_date,
          latest_advance.remarks AS advance_remarks,

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

        LEFT JOIN LATERAL (
          SELECT
            ea.advance_id,
            ea.amount,
            ea.advance_date,
            ea.remarks
          FROM tbl_employee_advances ea
          WHERE ea.staff_id = s.staff_id
          ORDER BY ea.advance_id DESC
          LIMIT 1
        ) latest_advance
          ON TRUE

        GROUP BY
          s.staff_id,
          latest_advance.advance_id,
          latest_advance.amount,
          latest_advance.advance_date,
          latest_advance.remarks

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
                error.message
              );

              return null;
            }
          })
        );

        delete employee.documents;

        return {
          ...employee,

          advance_amount:
            employee.advance_amount !== null
              ? Number(employee.advance_amount)
              : 0,

          advance_date:
            employee.advance_date || null,

          advance_remarks:
            employee.advance_remarks || null,

          document_urls:
            document_urls.filter(Boolean),
        };
      })
    );

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
      "Failed to retrieve staff."
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
  const errors = {};

  const phoneRegex = /^[6-9]\d{9}$/;
  const nameRegex = /^[A-Za-z\s.'-]+$/;

  if (!id) {
    errors.id = "Staff ID is required.";
  } else if (!Number.isInteger(Number(id))) {
    errors.id = "Invalid Staff ID.";
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
    req.body.contact_phone = req.body.contact_phone.trim();

    if (!phoneRegex.test(req.body.contact_phone)) {
      errors.contact_phone =
        "Invalid contact phone number.";
    }
  }

  if (req.body.full_name) {
    req.body.full_name = req.body.full_name.trim();

    if (req.body.full_name.length > 250) {
      errors.full_name =
        "Full name cannot exceed 250 characters.";
    } else if (!nameRegex.test(req.body.full_name)) {
      errors.full_name =
        "Full name contains invalid characters.";
    }
  }

  if (req.body.department) {
    req.body.department = req.body.department.trim();

    if (req.body.department.length > 250) {
      errors.department =
        "Department cannot exceed 250 characters.";
    }
  }

  if (req.body.designation) {
    req.body.designation = req.body.designation.trim();

    if (req.body.designation.length > 250) {
      errors.designation =
        "Designation cannot exceed 250 characters.";
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

  if (req.body.join_date) {
    if (isNaN(Date.parse(req.body.join_date))) {
      errors.join_date = "Invalid join date.";
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

  if (req.body.advance_remarks) {
    req.body.advance_remarks =
      req.body.advance_remarks.trim();

    if (req.body.advance_remarks.length > 1000) {
      errors.advance_remarks =
        "Advance remarks cannot exceed 1000 characters.";
    }
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

    const existingStaff = await client.query(
      `
      SELECT *
      FROM tbl_staff
      WHERE staff_id = $1
        AND is_active = TRUE
      `,
      [Number(id)]
    );

    if (existingStaff.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Active staff not found."
      );
    }

    if (req.body.phone_number) {
      const phoneExists = await client.query(
        `
        SELECT 1
        FROM tbl_staff
        WHERE phone_number = $1
          AND staff_id <> $2
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
          "Phone number already exists for another staff member."
        );
      }
    }

    const allowedFields = [
      "full_name",
      "phone_number",
      "secondary_phone_number",
      "department",
      "designation",
      "salary",
      "join_date",
      "contact_name",
      "contact_relation",
      "contact_phone",
      "remarks",
    ];

    const numericFields = ["salary"];

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
        UPDATE tbl_staff
        SET ${updates.join(", ")}
        WHERE staff_id = $${values.length}
          AND is_active = TRUE
        RETURNING *
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
      result = {
        rows: [existingStaff.rows[0]],
        rowCount: 1,
      };
    }

    const staff = result.rows[0];
    const staffId = staff.staff_id;

    if (
      req.body.advance_amount !== undefined &&
      req.body.advance_amount !== null &&
      req.body.advance_amount !== ""
    ) {
      await client.query(
        `
    INSERT INTO tbl_employee_advances
    (
      staff_id,
      amount,
      advance_date,
      remarks
    )
    VALUES ($1, $2, $3, $4)
    `,
        [
          staffId,
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
          "staff"
        );

        uploadedS3Files.push(s3Key);

        await client.query(
          `
          INSERT INTO tbl_documents
          (
            staff_id,
            document_url
          )
          VALUES ($1, $2)
          `,
          [staffId, s3Key]
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
      WHERE staff_id = $1
      ORDER BY document_id
      `,
      [staffId]
    );

    const latestAdvance = await client.query(
      `
      SELECT
        advance_id,
        amount,
        advance_date,
        remarks
      FROM tbl_employee_advances
      WHERE staff_id = $1
      ORDER BY advance_id DESC
      LIMIT 1
      `,
      [staffId]
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
        "Staff",
        "Updated",
        `Staff ${staff.full_name} was updated.`,
        performedBy,
      ]
    );

    await client.query("COMMIT");

    const advance =
      latestAdvance.rows[0] || null;

    return sendSuccessResponse(
      res,
      200,
      "Staff updated successfully.",
      {
        ...staff,

        advance_amount: advance
          ? Number(advance.amount)
          : 0,

        advance_date: advance
          ? advance.advance_date
          : null,

        advance_remarks: advance
          ? advance.remarks
          : null,

        documents: documents.rows,
      }
    );

  } catch (error) {
    console.error(
      "Update staff error:",
      error
    );

    if (client) {
      await client.query("ROLLBACK").catch(() => { });
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
        "A staff member with the provided information already exists."
      );
    }

    return sendErrorResponse(
      res,
      500,
      "Failed to update staff."
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