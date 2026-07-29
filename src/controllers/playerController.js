const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");


exports.createPlayerAdmission = async (req, res) => {
  const {
    admission_id,
    full_name,
    gender,
    age,
    phone_number,
    email,
    address,
    school,
    playing_role,
    batting_style,
    batch,
    admission_fee,
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
    medical_conditions,
  } = req.body;

  try {

    if (
      !admission_id ||
      !full_name ||
      !gender ||
      age == null ||
      !phone_number ||
      !email ||
      !address ||
      !school ||
      !playing_role ||
      !batting_style ||
      admission_fee == null ||
      !father_name ||
      !father_phone
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided."
      );
    }

    if (
      !/^[6-9]\d{9}$/.test(phone_number) ||
      !/^[6-9]\d{9}$/.test(father_phone)
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid phone number."
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

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid email address."
      );
    }

    if (age <= 0 || admission_fee < 0) {
      return sendErrorResponse(
        res,
        400,
        "Invalid age or admission fee."
      );
    }

    // Duplicate check
    const existingStudent = await pool.query(
      `
      SELECT 1
      FROM tbl_players
      WHERE phone_number = $1
         OR email = $2
      LIMIT 1
      `,
      [phone_number, email]
    );

    if (existingStudent.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Player already exists."
      );
    }

    // Create Student
    const result = await pool.query(
      `
      INSERT INTO tbl_players
      (
        admission_id,
        full_name,
        gender,
        age,
        phone_number,
        email,
        address,
        school,
        playing_role,
        batting_style,
        batch,
        admission_fee,
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
        medical_conditions
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        COALESCE($11,'Morning'),
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      )
      RETURNING *
      `,
      [
        admission_id,
        full_name.trim(),
        gender,
        age,
        phone_number,
        email.trim().toLowerCase(),
        address.trim(),
        school.trim(),
        playing_role,
        batting_style,
        batch,
        admission_fee,
        father_name.trim(),
        father_phone,
        father_occupation,
        mother_name,
        mother_phone,
        contact_name,
        relation,
        contact_phone,
        blood_group,
        allergies,
        medical_conditions,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Player admission created successfully.",
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

exports.getAllPlayers = async (req, res) => {

  try {

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_players
      ORDER BY player_id DESC
      `
    );


    return sendSuccessResponse(
      res,
      200,
      "Players fetched successfully.",
      {
        total_students: result.rowCount,
        students: result.rows,
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


exports.getPlayerById = async (req, res) => {

  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(
      res,
      400,
      "Player ID is required"
    );
  }
  if (!player_id || isNaN(player_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid player ID"
    );
  }


  try {

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_players
      WHERE player_id=$1
      `,
      [player_id]
    );


    if (result.rowCount === 0) {

      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );

    }


    return sendSuccessResponse(
      res,
      200,
      "Player fetched successfully.",
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


exports.updatePlayer = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(res, 400, "Player ID is required");
  }

  if (isNaN(player_id)) {
    return sendErrorResponse(res, 400, "Invalid player ID");
  }

  try {
    const allowedFields = [
      "full_name",
      "gender",
      "age",
      "phone_number",
      "email",
      "address",
      "school",
      "playing_role",
      "batting_style",
      "admission_fee",
      "father_name",
      "father_phone",
      "father_occupation",
      "mother_name",
      "mother_phone",
      "contact_name",
      "relation",
      "batch",
      "contact_phone",
      "blood_group",
      "allergies",
      "medical_conditions",
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
      return sendErrorResponse(
        res,
        400,
        "No fields provided to update"
      );
    }

    // Check duplicate phone number
    if (req.body.phone_number) {
      const existingPlayer = await pool.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE phone_number = $1
          AND player_id <> $2
        LIMIT 1
        `,
        [req.body.phone_number, player_id]
      );

      if (existingPlayer.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Phone number already exists"
        );
      }
    }

    // Check duplicate email
    if (req.body.email) {
      const existingEmail = await pool.query(
        `
        SELECT 1
        FROM tbl_players
        WHERE email = $1
          AND player_id <> $2
        LIMIT 1
        `,
        [req.body.email, player_id]
      );

      if (existingEmail.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Email already exists"
        );
      }
    }

    // Add player_id for WHERE clause
    values.push(player_id);

    const result = await pool.query(
      `
      UPDATE tbl_players
      SET ${updates.join(", ")}
      WHERE player_id = $${index}
      RETURNING *;
      `,
      values
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Player not found"
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Player updated successfully",
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


exports.deletePlayer = async (req, res) => {

  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(
      res,
      400,
      "Player ID is required"
    );
  }
  if (!player_id || isNaN(player_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid player ID"
    );
  }


  try {

    const result = await pool.query(
      `
      DELETE FROM tbl_players
      WHERE player_id=$1
      RETURNING *
      `,
      [player_id]
    );


    if (result.rowCount === 0) {

      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );

    }


    return sendSuccessResponse(
      res,
      200,
      "Player deleted successfully."
    );


  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }

};


exports.searchPlayers = async (req, res) => {
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
      FROM tbl_players
      WHERE
        full_name ILIKE $1
        OR admission_id ILIKE $1
        OR phone_number ILIKE $1
        OR school ILIKE $1
      ORDER BY player_id DESC;
      `,
      [searchKeyword]
    );

    return sendSuccessResponse(
      res,
      200,
      "Players retrieved successfully.",
      {
        total_players: result.rowCount,
        players: result.rows,
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
