const pool = require("../config/dbConfig");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/apiResponse");

exports.createPlayerAdmission = async (req, res) => {
  const {
    full_name,
    gender,
    age,
    date_of_birth,
    admission_date,
    phone_number,
    email,
    address,
    school,
    admission_fee,
    payment_type,
    remarks,
    father_name,
    father_phone,
    father_occupation,
    mother_name,
    mother_phone,
    contact_name,
    relation,
    contact_phone,
    blood_group,
    allergies,
    height,
    weight,
  } = req.body;


  if (
    !full_name ||
    !gender ||
    age == null ||
    !phone_number ||
    !address ||
    admission_fee == null ||
    !payment_type
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
      "Invalid player phone number."
    );
  }

  if (father_phone && !/^[6-9]\d{9}$/.test(father_phone)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid father phone number."
    );
  }

  if (mother_phone && !/^[6-9]\d{9}$/.test(mother_phone)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid mother phone number."
    );
  }

  if (contact_phone && !/^[6-9]\d{9}$/.test(contact_phone)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid emergency contact phone number."
    );
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid email address."
    );
  }

  if (Number(age) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Age must be greater than 0."
    );
  }

  if (Number(admission_fee) < 0) {
    return sendErrorResponse(
      res,
      400,
      "Admission fee cannot be negative."
    );
  }

  if (height != null && Number(height) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Height must be greater than 0."
    );
  }

  if (weight != null && Number(weight) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Weight must be greater than 0."
    );
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const currentYear = new Date().getFullYear();
    const yearCode = String(currentYear).slice(-2);
    const prefix = `A${yearCode}`;

    await client.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [currentYear]
    );

    const admissionResult = await client.query(
      `
      SELECT COALESCE(
        MAX(
          CAST(SUBSTRING(admission_id FROM 4) AS INTEGER)
        ),
        0
      ) AS last_number
      FROM tbl_players
      WHERE admission_id LIKE $1
      `,
      [`${prefix}%`]
    );

    const nextNumber =
      Number(admissionResult.rows[0].last_number) + 1;

    const admission_id = `${prefix}${String(nextNumber).padStart(
      4,
      "0"
    )}`;

    let existingPlayer;

    if (email) {
      existingPlayer = await client.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE phone_number = $1
           OR LOWER(email) = LOWER($2)
        LIMIT 1
        `,
        [phone_number.trim(), email.trim()]
      );
    } else {
      existingPlayer = await client.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE phone_number = $1
        LIMIT 1
        `,
        [phone_number.trim()]
      );
    }

    if (existingPlayer.rowCount > 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        409,
        "Player already exists."
      );
    }

    const document_url = req.file
      ? req.file.path
      : null;

    const result = await client.query(
      `
  INSERT INTO tbl_players (
    admission_id,
    full_name,
    gender,
    age,
    date_of_birth,
    admission_date,
    phone_number,
    email,
    address,
    school,
    admission_fee,
    payment_type,
    remarks,
    father_name,
    father_phone,
    father_occupation,
    mother_name,
    mother_phone,
    contact_name,
    relation,
    contact_phone,
    blood_group,
    allergies,
    height,
    weight,
    document_url,
    id_increment
  )
  VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,
    $19,$20,$21,$22,$23,$24,$25,$26,
    $27
  )
  RETURNING *;
  `,
      [
        admission_id,
        full_name.trim(),
        gender,
        Number(age),
        date_of_birth || null,
        admission_date || null,
        phone_number.trim(),
        email ? email.trim().toLowerCase() : null,
        address.trim(),
        school?.trim() || null,
        Number(admission_fee),
        payment_type.trim(),
        remarks?.trim() || null,
        father_name?.trim() || null,
        father_phone || null,
        father_occupation?.trim() || null,
        mother_name?.trim() || null,
        mother_phone || null,
        contact_name?.trim() || null,
        relation?.trim() || null,
        contact_phone || null,
        blood_group || null,
        allergies?.trim() || null,
        height != null ? Number(height) : null,
        weight != null ? Number(weight) : null,
        document_url,
        nextNumber,
      ]
    );
    const reqUserDetails = await client.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const reqUser = reqUserDetails.rows[0];
    await client.query(
      `INSERT INTO tbl_notification_logs
        (
          module_name,
          action,
          description,
          performed_by
        )
        VALUES
        ($1,$2,$3,$4)`,
      [
        "Player",
        "Created",
        `Player ${result.rows[0].full_name} was added .`,
        reqUser.full_name,
      ])
    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Player admission created successfully.",
      result.rows[0],
    );
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.getAllPlayers = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_players
      ORDER BY player_id DESC
      `,
    );

    return sendSuccessResponse(res, 200, "Players fetched successfully.", {
      total_students: result.rowCount,
      students: result.rows,
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
    );
  }
};

exports.getPlayerById = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(res, 400, "Player ID is required");
  }
  if (!player_id || isNaN(player_id)) {
    return sendErrorResponse(res, 400, "Invalid player ID");
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tbl_players
      WHERE player_id=$1
      `,
      [player_id],
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(res, 404, "Player not found.");
    }

    return sendSuccessResponse(
      res,
      200,
      "Player fetched successfully.",
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

exports.updatePlayer = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(res, 400, "Player ID is required.");
  }

  if (isNaN(player_id)) {
    return sendErrorResponse(res, 400, "Invalid player ID.");
  }

  try {
    const allowedFields = [
      "full_name",
      "gender",
      "age",
      "date_of_birth",
      "admission_date",
      "phone_number",
      "email",
      "address",
      "school",
      "admission_fee",
      "payment_type",
      "remarks",
      "father_name",
      "father_phone",
      "father_occupation",
      "mother_name",
      "mother_phone",
      "contact_name",
      "relation",
      "contact_phone",
      "blood_group",
      "allergies",
      "height",
      "weight",
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (typeof value === "string") {
          value = value.trim();
        }
        if (field === "email" && value) {
          value = value.toLowerCase();
        }

        updates.push(`${field} = $${index}`);
        values.push(value === "" ? null : value);
        index++;
      }
    }

    if (updates.length === 0) {
      return sendErrorResponse(res, 400, "No fields provided to update");
    }

    if (req.body.phone_number) {
      const existingPlayer = await pool.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE phone_number = $1
          AND player_id <> $2
        LIMIT 1
        `,
        [req.body.phone_number, player_id],
      );

      if (existingPlayer.rowCount > 0) {
        return sendErrorResponse(res, 409, "Phone number already exists");
      }
    }

    if (req.body.email) {
      const existingEmail = await pool.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE LOWER(email) = LOWER($1)
          AND player_id <> $2
        LIMIT 1
        `,
        [req.body.email, player_id],
      );

      if (existingEmail.rowCount > 0) {
        return sendErrorResponse(res, 409, "Email already exists");
      }
    }

    values.push(player_id);

    const result = await pool.query(
      `
      UPDATE tbl_players
      SET ${updates.join(", ")}
      WHERE player_id = $${index}
      RETURNING *;
      `,
      values,
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(res, 404, "Player not found");
    }

    return sendSuccessResponse(
      res,
      200,
      "Player updated successfully",
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

exports.deletePlayer = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(res, 400, "Player ID is required");
  }
  if (!player_id || isNaN(player_id)) {
    return sendErrorResponse(res, 400, "Invalid player ID");
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM tbl_players
      WHERE player_id=$1
      RETURNING *
      `,
      [player_id],
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(res, 404, "Player not found.");
    }

    return sendSuccessResponse(res, 200, "Player deleted successfully.");
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
    );
  }
};

exports.searchPlayers = async (req, res) => {
  const { keyword } = req.query;

  if (!keyword || !keyword.trim()) {
    return sendErrorResponse(res, 400, "Search keyword is required");
  }

  try {
    const searchKeyword = `%${keyword.trim()}%`;

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_players
      WHERE
        full_name ILIKE $1
        OR admission_id ILIKE $1
        OR phone_number ILIKE $1
        OR school ILIKE $1
      ORDER BY player_id DESC;
      `,
      [searchKeyword],
    );

    return sendSuccessResponse(res, 200, "Players retrieved successfully.", {
      total_players: result.rowCount,
      players: result.rows,
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
    );
  }
};
