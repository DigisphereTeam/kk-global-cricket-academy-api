const pool = require("../config/dbConfig");
const { generateMonthlyDues } = require("../jobs/generateMonthlyDues");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/apiResponse");
const { deletefroms3, uploadToS3, getSignedVideoUrl } = require("../utils/s3upload");


// exports.createPlayerAdmission = async (req, res) => {
//   const {
//     full_name,
//     gender,
//     age,
//     date_of_birth,
//     admission_date,
//     phone_number,
//     email,
//     address,
//     school,
//     admission_fee,
//     payment_type,
//     fee_type,
//     regular_fee,
//     remarks,
//     father_name,
//     father_phone,
//     father_occupation,
//     mother_name,
//     mother_phone,
//     contact_name,
//     relation,
//     contact_phone,
//     blood_group,
//     allergies,
//     height,
//     weight,
//   } = req.body;

//   // Required field validation
//   if (
//     !full_name?.trim() ||
//     !gender ||
//     age == null ||
//     !phone_number?.trim() ||
//     !address?.trim() ||
//     admission_fee === undefined ||
//     admission_fee === null ||
//     admission_fee === "" ||
//     !payment_type?.trim() ||
//     !fee_type?.trim() ||
//     regular_fee === undefined ||
//     regular_fee === null ||
//     regular_fee === ""
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "All required fields must be provided."
//     );
//   }

//   // Player phone validation
//   if (!/^[6-9]\d{9}$/.test(phone_number.trim())) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Invalid player phone number."
//     );
//   }

//   // Father phone validation
//   if (
//     father_phone &&
//     !/^[6-9]\d{9}$/.test(father_phone.trim())
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Invalid father phone number."
//     );
//   }

//   // Mother phone validation
//   if (
//     mother_phone &&
//     !/^[6-9]\d{9}$/.test(mother_phone.trim())
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Invalid mother phone number."
//     );
//   }

//   // Emergency contact validation
//   if (
//     contact_phone &&
//     !/^[6-9]\d{9}$/.test(contact_phone.trim())
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Invalid emergency contact phone number."
//     );
//   }

//   // Email validation
//   if (
//     email &&
//     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Invalid email address."
//     );
//   }

//   // Age validation
//   if (
//     isNaN(Number(age)) ||
//     Number(age) <= 0
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Age must be greater than 0."
//     );
//   }

//   // Admission fee validation
//   if (
//     isNaN(Number(admission_fee)) ||
//     Number(admission_fee) <= 0
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Admission fee required or must be greater than 0."
//     );
//   }

//   // Regular fee validation
//   if (
//     isNaN(Number(regular_fee)) ||
//     Number(regular_fee) <= 0
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Regular fee must be greater than 0."
//     );
//   }

//   // Weight validation
//   if (
//     weight !== undefined &&
//     weight !== null &&
//     weight.toString().trim() !== "" &&
//     (isNaN(Number(weight)) || Number(weight) <= 0)
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Weight must be greater than 0."
//     );
//   }

//   // Height validation
//   if (
//     height !== undefined &&
//     height !== null &&
//     height.toString().trim() !== "" &&
//     (isNaN(Number(height)) || Number(height) <= 0)
//   ) {
//     return sendErrorResponse(
//       res,
//       400,
//       "Height must be greater than 0."
//     );
//   }

//   let client;

//   try {
//     client = await pool.connect();

//     await client.query("BEGIN");

//     const currentYear = new Date().getFullYear();
//     const yearCode = String(currentYear).slice(-2);
//     const prefix = `A${yearCode}`;

//     // Prevent duplicate admission ID generation
//     await client.query(
//       `SELECT pg_advisory_xact_lock($1)`,
//       [currentYear]
//     );

//     const admissionResult = await client.query(
//       `
//       SELECT COALESCE(
//         MAX(
//           CAST(SUBSTRING(admission_id FROM 4) AS INTEGER)
//         ),
//         0
//       ) AS last_number
//       FROM tbl_players
//       WHERE admission_id LIKE $1
//       `,
//       [`${prefix}%`]
//     );

//     const nextNumber =
//       Number(admissionResult.rows[0].last_number) + 1;

//     const admission_id =
//       `${prefix}${String(nextNumber).padStart(4, "0")}`;

//     // Check duplicate player
//     let existingPlayer;

//     if (email) {
//       existingPlayer = await client.query(
//         `
//         SELECT 1
//         FROM tbl_players
//         WHERE phone_number = $1
//            OR LOWER(email) = LOWER($2)
//         LIMIT 1
//         `,
//         [
//           phone_number.trim(),
//           email.trim(),
//         ]
//       );
//     } else {
//       existingPlayer = await client.query(
//         `
//         SELECT 1
//         FROM tbl_players
//         WHERE phone_number = $1
//         LIMIT 1
//         `,
//         [phone_number.trim()]
//       );
//     }

//     if (existingPlayer.rowCount > 0) {
//       await client.query("ROLLBACK");

//       return sendErrorResponse(
//         res,
//         409,
//         "Player already exists."
//       );
//     }

//     // Create player
//     const result = await client.query(
//       `
//       INSERT INTO tbl_players (
//         admission_id,
//         full_name,
//         gender,
//         age,
//         date_of_birth,
//         admission_date,
//         phone_number,
//         email,
//         address,
//         school,
//         admission_fee,
//         payment_type,
//         fee_type,
//         regular_fee,
//         remarks,
//         father_name,
//         father_phone,
//         father_occupation,
//         mother_name,
//         mother_phone,
//         contact_name,
//         relation,
//         contact_phone,
//         blood_group,
//         allergies,
//         height,
//         weight,
//         id_increment
//       )
//       VALUES (
//         $1,$2,$3,$4,$5,
//         COALESCE($6::date, CURRENT_DATE),
//         $7,$8,$9,$10,
//         $11,$12,$13,$14,$15,$16,$17,$18,
//         $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
//       )
//       RETURNING *;
//       `,
//       [
//         admission_id,
//         full_name.trim(),
//         gender,
//         Number(age),
//         date_of_birth || null,
//         admission_date || null,
//         phone_number.trim(),
//         email
//           ? email.trim().toLowerCase()
//           : null,
//         address.trim(),
//         school?.trim() || null,
//         Number(admission_fee),
//         payment_type.trim(),
//         fee_type.trim(),
//         Number(regular_fee),
//         remarks?.trim() || null,
//         father_name?.trim() || null,
//         father_phone?.trim() || null,
//         father_occupation?.trim() || null,
//         mother_name?.trim() || null,
//         mother_phone?.trim() || null,
//         contact_name?.trim() || null,
//         relation?.trim() || null,
//         contact_phone?.trim() || null,
//         blood_group || null,
//         allergies?.trim() || null,
//         height != null
//           ? Number(height)
//           : null,
//         weight != null
//           ? Number(weight)
//           : null,
//         nextNumber,
//       ]
//     );

//     const playerId = result.rows[0].player_id;

//     // Insert multiple player documents
//     if (req.files && req.files.length > 0) {
//       for (const file of req.files) {
//         await client.query(
//           `
//           INSERT INTO tbl_player_documents
//           (
//             player_id,
//             document_url
//           )
//           VALUES
//           ($1, $2)
//           `,
//           [
//             playerId,
//             `/uploads/${file.filename}`,
//           ]
//         );
//       }
//     }

//     // Get logged-in user
//     const reqUserDetails = await client.query(
//       `
//       SELECT full_name
//       FROM tbl_users
//       WHERE user_id = $1
//       `,
//       [req.user.user_id]
//     );

//     const reqUser = reqUserDetails.rows[0];

//     if (!reqUser) {
//       await client.query("ROLLBACK");

//       return sendErrorResponse(
//         res,
//         404,
//         "Logged-in user not found."
//       );
//     }

//     // Notification
//     await client.query(
//       `
//       INSERT INTO tbl_notification_logs
//       (
//         module_name,
//         action,
//         description,
//         performed_by
//       )
//       VALUES
//       ($1,$2,$3,$4)
//       `,
//       [
//         "Player",
//         "Created",
//         `Player ${result.rows[0].full_name} was added.`,
//         reqUser.full_name,
//       ]
//     );

//     await client.query("COMMIT");

//     return sendSuccessResponse(
//       res,
//       201,
//       "Player admission created successfully.",
//       result.rows[0]
//     );

//   } catch (error) {
//     if (client) {
//       await client.query("ROLLBACK");
//     }

//     console.error(error);

//     return sendErrorResponse(
//       res,
//       500,
//       error.message || "Internal Server Error"
//     );

//   } finally {
//     if (client) {
//       client.release();
//     }
//   }
// };



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
    fee_type,
    regular_fee,
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

  // Required field validation
  if (
    !full_name?.trim() ||
    !gender ||
    age == null ||
    !phone_number?.trim() ||
    !address?.trim() ||
    admission_fee === undefined ||
    admission_fee === null ||
    admission_fee === "" ||
    !payment_type?.trim() ||
    !fee_type?.trim()
  ) {
    return sendErrorResponse(
      res,
      400,
      "All required fields must be provided."
    );
  }

  // Player phone validation
  if (!/^[6-9]\d{9}$/.test(phone_number.trim())) {
    return sendErrorResponse(
      res,
      400,
      "Invalid player phone number."
    );
  }

  // Father phone validation
  if (
    father_phone &&
    !/^[6-9]\d{9}$/.test(father_phone.trim())
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid father phone number."
    );
  }

  // Mother phone validation
  if (
    mother_phone &&
    !/^[6-9]\d{9}$/.test(mother_phone.trim())
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid mother phone number."
    );
  }

  // Emergency contact validation
  if (
    contact_phone &&
    !/^[6-9]\d{9}$/.test(contact_phone.trim())
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid emergency contact phone number."
    );
  }

  // Email validation
  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid email address."
    );
  }

  // Age validation
  if (isNaN(Number(age)) || Number(age) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Age must be greater than 0."
    );
  }

  // Admission fee validation
  if (
    isNaN(Number(admission_fee)) ||
    Number(admission_fee) <= 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Admission fee required or must be greater than 0."
    );
  }

  // Regular fee validation
  if (
    isNaN(Number(regular_fee)) ||
    Number(regular_fee) <= 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Regular fee must be greater than 0."
    );
  }

  // Weight validation
  if (
    weight !== undefined &&
    weight !== null &&
    weight.toString().trim() !== "" &&
    (isNaN(Number(weight)) || Number(weight) <= 0)
  ) {
    return sendErrorResponse(
      res,
      400,
      "Weight must be greater than 0."
    );
  }

  // Height validation
  if (
    height !== undefined &&
    height !== null &&
    height.toString().trim() !== "" &&
    (isNaN(Number(height)) || Number(height) <= 0)
  ) {
    return sendErrorResponse(
      res,
      400,
      "Height must be greater than 0."
    );
  }

  let client;
  const uploadedS3Files = [];

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const currentYear = new Date().getFullYear();
    const yearCode = String(currentYear).slice(-2);
    const prefix = `A${yearCode}`;

    // Prevent duplicate admission ID generation
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

    const admission_id =
      `${prefix}${String(nextNumber).padStart(4, "0")}`;

    // Check duplicate player
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
        [
          phone_number.trim(),
          email.trim(),
        ]
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

    // Create player
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
        fee_type,
        regular_fee,
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
        id_increment
      )
      VALUES (
        $1,$2,$3,$4,$5,
        COALESCE($6::date, CURRENT_DATE),
        $7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
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
        email
          ? email.trim().toLowerCase()
          : null,
        address.trim(),
        school?.trim() || null,
        Number(admission_fee),
        payment_type.trim(),
        fee_type.trim(),
        Number(regular_fee),
        remarks?.trim() || null,
        father_name?.trim() || null,
        father_phone?.trim() || null,
        father_occupation?.trim() || null,
        mother_name?.trim() || null,
        mother_phone?.trim() || null,
        contact_name?.trim() || null,
        relation?.trim() || null,
        contact_phone?.trim() || null,
        blood_group || null,
        allergies?.trim() || null,
        height != null ? Number(height) : null,
        weight != null ? Number(weight) : null,
        nextNumber,
      ]
    );

    const playerId = result.rows[0].player_id;

    // ==========================================
    // Upload player documents to S3
    // ==========================================

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Upload file to S3
          const s3Key = await uploadToS3(
            file,
            "players"
          );

          // Keep track of uploaded files
          // so we can delete them if DB transaction fails
          uploadedS3Files.push(s3Key);

          // Store S3 key in common documents table
          await client.query(
            `
        INSERT INTO tbl_documents
        (
          player_id,
          document_url
        )
        VALUES
        ($1, $2)
        `,
            [
              playerId,
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

    // Get logged-in user
    const reqUserDetails = await client.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const reqUser = reqUserDetails.rows[0];

    if (!reqUser) {
      throw new Error(
        "Logged-in user not found."
      );
    }

    // Notification
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
        "Player",
        "Created",
        `Player ${result.rows[0].full_name} was added.`,
        reqUser.full_name,
      ]
    );

    // Commit transaction
    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Player admission created successfully.",
      result.rows[0]
    );

  } catch (error) {
    console.error("Create player error:", error);

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

    // Delete files already uploaded to S3
    // if database transaction failed
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



exports.getAllPlayers = async (req, res) => {
  try {
    const [players, statistics] = await Promise.all([
      // =========================
      // PLAYER LIST
      // =========================
      pool.query(`
        SELECT
          p.*
        FROM tbl_players p
        ORDER BY
          p.player_id DESC;
      `),

      // =========================
      // PLAYER STATISTICS
      // =========================
      pool.query(`
        SELECT

          /* =========================
             TOTAL PLAYERS
          ========================= */
          (
            SELECT COUNT(*)
            FROM tbl_players
          ) AS total_players,


          /* =========================
             ACTIVE PLAYERS
          ========================= */
          (
            SELECT COUNT(*)
            FROM tbl_players
            WHERE is_active = TRUE
          ) AS active_players,


          /* =========================
             INACTIVE PLAYERS
          ========================= */
          (
            SELECT COUNT(*)
            FROM tbl_players
            WHERE is_active = FALSE
          ) AS inactive_players,


          /* =========================
             PENDING FEES
          ========================= */
          (
            SELECT COUNT(
              DISTINCT pending_players.player_id
            )

            FROM (

              /* =================================
                 REGULAR PLAYERS
                 ================================= */

              SELECT
                p.player_id

              FROM tbl_players p

              WHERE p.is_active = TRUE

                /* Player must have joined */
                AND p.admission_date <= CURRENT_DATE

                /* Only after the 4th */
                AND CURRENT_DATE >
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) + INTERVAL '3 day'

                /* Player has NOT paid this month */
                AND NOT EXISTS (

                  SELECT 1

                  FROM tbl_player_fees pf

                  WHERE pf.player_id = p.player_id

                    AND pf.status = 'Paid'

                    AND pf.is_active = TRUE

                    AND pf.payment_date >=
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        )

                    AND pf.payment_date <
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        ) + INTERVAL '1 month'
                )


              UNION


              /* =================================
                 ONE-ON-ONE PLAYERS
                 ================================= */

              SELECT
                o.player_id

              FROM tbl_one_on_one_applications o

              INNER JOIN tbl_players p
                ON p.player_id = o.player_id
                AND p.is_active = TRUE

              WHERE o.is_active = TRUE

                AND o.renewal_status = 'Active'

                /* Player must have joined */
                AND p.admission_date <= CURRENT_DATE

                /* Only after the 4th */
                AND CURRENT_DATE >
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) + INTERVAL '3 day'

                /* Player has NOT paid this month */
                AND NOT EXISTS (

                  SELECT 1

                  FROM tbl_player_fees pf

                  WHERE pf.player_id = o.player_id

                    AND pf.status = 'Paid'

                    AND pf.is_active = TRUE

                    AND pf.payment_date >=
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        )

                    AND pf.payment_date <
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        ) + INTERVAL '1 month'
                )

            ) AS pending_players

          ) AS pending_fees,


          /* =========================
             1. ADMISSION FEE
             CURRENT MONTH
          ========================= */
          (
            SELECT COALESCE(
              SUM(p.admission_fee),
              0
            )
            FROM tbl_players p
            WHERE p.admission_date >=
              DATE_TRUNC('month', CURRENT_DATE)
              AND p.admission_date <
                DATE_TRUNC('month', CURRENT_DATE)
                + INTERVAL '1 month'
              AND p.admission_fee IS NOT NULL
          ) AS admission_fee,


          /* =========================
             2. REGULAR FEE
             CURRENT MONTH
          ========================= */
          (
            SELECT COALESCE(
              SUM(regular_amount),
              0
            )
            FROM (
              /* FIRST MONTH */
              SELECT
                COALESCE(p.regular_fee, 0) AS regular_amount
              FROM tbl_players p
              WHERE p.is_active = TRUE
                AND LOWER(TRIM(p.fee_type))
                    = 'regular fee'
                AND p.admission_date >=
                  DATE_TRUNC('month', CURRENT_DATE)
                AND p.admission_date <
                  DATE_TRUNC('month', CURRENT_DATE)
                  + INTERVAL '1 month'

              UNION ALL

              /* NEXT MONTHS */
              SELECT
                COALESCE(pf.amount, 0) AS regular_amount
              FROM tbl_player_fees pf
              INNER JOIN tbl_players p
                ON p.player_id = pf.player_id
              WHERE pf.is_active = TRUE
                AND pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type))
                    = 'regular fee'
                AND pf.payment_date >=
                  DATE_TRUNC('month', CURRENT_DATE)
                AND pf.payment_date <
                  DATE_TRUNC('month', CURRENT_DATE)
                  + INTERVAL '1 month'
                AND p.admission_date <
                  DATE_TRUNC('month', CURRENT_DATE)
            ) AS regular_fees
          ) AS regular_fee,


          /* =========================
             3. ONE-ON-ONE FEE
             CURRENT MONTH
          ========================= */
          (
            SELECT COALESCE(
              SUM(o.fee_amount),
              0
            )
            FROM tbl_one_on_one_applications o
            WHERE o.is_active = TRUE
              AND o.application_date >=
                DATE_TRUNC('month', CURRENT_DATE)
              AND o.application_date <
                DATE_TRUNC('month', CURRENT_DATE)
                + INTERVAL '1 month'
          ) AS one_on_one_fee,


          /* =========================
             4. ONLY ONE-ON-ONE FEE
             CURRENT MONTH
          ========================= */
          (
            SELECT COALESCE(
              SUM(o.fee_amount),
              0
            )
            FROM tbl_one_on_one_applications o

            INNER JOIN tbl_players p
              ON p.player_id = o.player_id

            WHERE o.is_active = TRUE

              AND o.application_date >=
                DATE_TRUNC('month', CURRENT_DATE)

              AND o.application_date <
                DATE_TRUNC('month', CURRENT_DATE)
                + INTERVAL '1 month'

              /* Player has only admission fee */
              AND LOWER(TRIM(p.fee_type)) = 'admission fee'

              /* No regular fee */
              AND p.regular_fee IS NULL

          ) AS only_one_on_one_fee
      `),
    ]);

    const stats = statistics.rows[0];

    // =========================
    // SUCCESS RESPONSE
    // =========================
    return sendSuccessResponse(
      res,
      200,
      "Players fetched successfully.",
      {
        statistics: {
          total_players: Number(
            stats.total_players
          ),

          active_players: Number(
            stats.active_players
          ),

          inactive_players: Number(
            stats.inactive_players
          ),

          pending_fees: Number(
            stats.pending_fees
          ),

          // =========================
          // FOUR FEE STATISTICS
          // =========================

          admission_fee: Number(
            stats.admission_fee
          ),

          regular_fee: Number(
            stats.regular_fee
          ),

          one_on_one_fee: Number(
            stats.one_on_one_fee
          ),

          only_one_on_one_fee: Number(
            stats.only_one_on_one_fee
          ),
        },

        players: players.rows,
      }
    );
  } catch (error) {
    console.error(
      "Get All Players Error:",
      error
    );

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
      "Player ID is required."
    );
  }

  if (!Number.isInteger(Number(player_id))) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Player ID."
    );
  }

  try {
    const today =
      new Date().toLocaleDateString(
        "en-CA",
        {
          timeZone: "Asia/Kolkata",
        }
      );

    const result = await pool.query(
      `
      SELECT
        p.*,

        a.attendance_id,
        a.payroll_date,

        CASE
          WHEN a.attendance_id IS NOT NULL
            THEN 'Present'
          ELSE 'Absent'
        END AS attendance_status,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'document_id',
              d.document_id,

              'document_url',
              d.document_url,

              'created_at',
              d.created_at
            )
            ORDER BY d.document_id
          ) FILTER (
            WHERE d.document_id IS NOT NULL
          ),
          '[]'
        ) AS documents

      FROM tbl_players p

      LEFT JOIN tbl_attendance a
        ON a.employee_code = p.admission_id
        AND a.payroll_date = $2

      LEFT JOIN tbl_documents d
        ON d.player_id = p.player_id

      WHERE p.player_id = $1

      GROUP BY
        p.player_id,
        a.attendance_id,
        a.payroll_date
      `,
      [player_id, today]
    );

    // ==========================================
    // Player not found
    // ==========================================

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );
    }

    const playerData =
      result.rows[0];

    const documents =
      await Promise.all(
        playerData.documents.map(
          async (document) => {

            if (
              !document.document_url
            ) {
              return {
                ...document,
                file_url: null,
              };
            }

            const signedUrl =
              await getSignedVideoUrl(
                document.document_url
              );

            return {
              ...document,
              file_url: signedUrl,
            };
          }
        )
      );

    const player = {
      ...playerData,

      status:
        playerData.is_active
          ? "Active"
          : "Inactive",

      document_urls: documents,
    };

    return sendSuccessResponse(
      res,
      200,
      "Player retrieved successfully.",
      player
    );

  } catch (error) {
    console.error(
      "Get player by ID error:",
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

exports.updatePlayer = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id) {
    return sendErrorResponse(
      res,
      400,
      "Player ID is required."
    );
  }

  if (!Number.isInteger(Number(player_id))) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Player ID."
    );
  }

  // Normalize input
  const trimFields = [
    "phone_number",
    "father_phone",
    "mother_phone",
    "contact_phone",
    "email",
  ];

  trimFields.forEach((field) => {
    if (req.body[field]) {
      req.body[field] =
        req.body[field].trim();
    }
  });

  // Phone validations
  const phoneFields = [
    {
      field: "phone_number",
      message:
        "Invalid player phone number.",
    },
    {
      field: "father_phone",
      message:
        "Invalid father phone number.",
    },
    {
      field: "mother_phone",
      message:
        "Invalid mother phone number.",
    },
    {
      field: "contact_phone",
      message:
        "Invalid emergency contact phone number.",
    },
  ];

  for (const phone of phoneFields) {
    if (
      req.body[phone.field] &&
      !/^[6-9]\d{9}$/.test(
        req.body[phone.field]
      )
    ) {
      return sendErrorResponse(
        res,
        400,
        phone.message
      );
    }
  }

  // Email validation
  if (
    req.body.email &&
    !/^\S+@\S+\.\S+$/.test(
      req.body.email
    )
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid email address."
    );
  }

  // Numeric validation
  const numericFields = [
    "age",
    "admission_fee",
    "height",
    "weight",
    "regular_fee",
  ];

  for (const field of numericFields) {
    if (
      req.body[field] !== undefined &&
      req.body[field] !== null &&
      req.body[field] !== "" &&
      isNaN(Number(req.body[field]))
    ) {
      return sendErrorResponse(
        res,
        400,
        `${field} must be a valid number.`
      );
    }
  }

  // Age validation
  if (
    req.body.age != null &&
    Number(req.body.age) <= 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Age must be greater than 0."
    );
  }

  // Admission fee validation
  if (
    req.body.admission_fee != null &&
    Number(req.body.admission_fee) < 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Admission fee cannot be negative."
    );
  }

  // Regular fee validation
  if (
    req.body.regular_fee != null &&
    Number(req.body.regular_fee) < 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Regular fee cannot be negative."
    );
  }

  // User validation
  if (!req.user?.user_id) {
    return sendErrorResponse(
      res,
      401,
      "Unauthorized user."
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
    // Check player exists
    // ==========================================

    const existingPlayer =
      await client.query(
        `
        SELECT *
        FROM tbl_players
        WHERE player_id = $1
        AND is_active = TRUE
        `,
        [player_id]
      );

    if (existingPlayer.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Active player not found."
      );
    }

    // ==========================================
    // Duplicate phone check
    // ==========================================

    if (req.body.phone_number) {
      const phoneExists =
        await client.query(
          `
          SELECT 1
          FROM tbl_players
          WHERE phone_number = $1
          AND player_id <> $2
          LIMIT 1
          `,
          [
            req.body.phone_number,
            player_id,
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
    // Duplicate email check
    // ==========================================

    if (req.body.email) {
      const emailExists =
        await client.query(
          `
          SELECT 1
          FROM tbl_players
          WHERE LOWER(email) = LOWER($1)
          AND player_id <> $2
          LIMIT 1
          `,
          [
            req.body.email,
            player_id,
          ]
        );

      if (emailExists.rowCount > 0) {
        await client.query("ROLLBACK");

        return sendErrorResponse(
          res,
          409,
          "Email already exists."
        );
      }
    }

    // ==========================================
    // Allowed fields
    // ==========================================

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
      "fee_type",
      "regular_fee",
    ];

    const updates = [];
    const values = [];

    let index = 1;

    // ==========================================
    // Build update query
    // ==========================================

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];

        if (typeof value === "string") {
          value = value.trim();
        }

        if (
          field === "email" &&
          value
        ) {
          value = value.toLowerCase();
        }

        if (
          numericFields.includes(field) &&
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

    // ==========================================
    // Update player
    // ==========================================

    let result;

    if (updates.length > 0) {
      values.push(player_id);

      result = await client.query(
        `
        UPDATE tbl_players
        SET ${updates.join(", ")}
        WHERE player_id = $${index}
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
          "Active player not found."
        );
      }
    } else {
      // No player fields to update.
      // We may still have files to upload.
      result = {
        rows: [
          existingPlayer.rows[0],
        ],
        rowCount: 1,
      };
    }

    const updatedPlayerId =
      result.rows[0].player_id;

    // ==========================================
    // Upload new documents to S3
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
              "players"
            );

          // Track uploaded file
          // for rollback cleanup
          uploadedS3Files.push(
            s3Key
          );

          // Store S3 key in common documents table
          await client.query(
            `
            INSERT INTO tbl_documents
            (
              player_id,
              document_url
            )
            VALUES
            ($1, $2)
            `,
            [
              updatedPlayerId,
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

    // ==========================================
    // Get all player documents
    // ==========================================

    const documents =
      await client.query(
        `
        SELECT
          document_id,
          document_url,
          created_at
        FROM tbl_documents
        WHERE player_id = $1
        ORDER BY document_id;
        `,
        [
          updatedPlayerId,
        ]
      );

    // ==========================================
    // Get logged-in user
    // ==========================================

    const reqUserDetails =
      await client.query(
        `
        SELECT full_name
        FROM tbl_users
        WHERE user_id = $1
        `,
        [
          req.user.user_id,
        ]
      );

    const reqUser =
      reqUserDetails.rows[0];

    if (!reqUser) {
      throw new Error(
        "Logged-in user not found."
      );
    }

    // ==========================================
    // Notification log
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
        "Player",
        "Updated",
        `Player ${result.rows[0].full_name} was updated.`,
        reqUser.full_name,
      ]
    );

    // ==========================================
    // Commit
    // ==========================================

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      200,
      "Player updated successfully.",
      {
        ...result.rows[0],
        documents:
          documents.rows,
      }
    );

  } catch (error) {

    console.error(
      "Update player error:",
      error
    );

    // ==========================================
    // Rollback database
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
    // Delete newly uploaded S3 files
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


exports.updatePlayerStatus = async (req, res) => {
  const { player_id } = req.params;
  const { is_active } = req.body;

  // Validate Player ID
  if (!player_id) {
    return sendErrorResponse(
      res,
      400,
      "Player ID is required."
    );
  }

  if (
    !Number.isInteger(Number(player_id)) ||
    Number(player_id) <= 0
  ) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Player ID."
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

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Check player exists
    const player = await client.query(
      `
      SELECT
        player_id,
        full_name,
        is_active,
        status
      FROM tbl_players
      WHERE player_id = $1;
      `,
      [player_id]
    );

    if (player.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );
    }

    // Check if status is already same
    if (player.rows[0].is_active === is_active) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        409,
        `Player is already ${is_active ? "active" : "inactive"
        }.`
      );
    }

    // Update both is_active and status
    const status = is_active ? "Active" : "Inactive";

    const result = await client.query(
      `
      UPDATE tbl_players
      SET
        is_active = $1,
        status = $2
      WHERE player_id = $3
      RETURNING *;
      `,
      [
        is_active,
        status,
        player_id,
      ]
    );

    // Deactivate related records when player is inactive
    if (!is_active) {
      await client.query(
        `
        UPDATE tbl_player_fees
        SET is_active = FALSE
        WHERE player_id = $1;
        `,
        [player_id]
      );

      await client.query(
        `
        UPDATE tbl_one_on_one_applications
        SET is_active = FALSE
        WHERE player_id = $1;
        `,
        [player_id]
      );
    } else {
      // Activate player fees
      await client.query(
        `
        UPDATE tbl_player_fees
        SET is_active = TRUE
        WHERE player_id = $1;
        `,
        [player_id]
      );
    }

    // Logged-in user details
    const reqUserDetails = await client.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1;
      `,
      [req.user.user_id]
    );

    const reqUser = reqUserDetails.rows[0];

    if (!reqUser) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Logged-in user not found."
      );
    }

    // Notification log
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
      ($1, $2, $3, $4);
      `,
      [
        "Player",
        is_active ? "Activated" : "Deactivated",
        `Player ${result.rows[0].full_name} was ${is_active ? "activated" : "deactivated"
        }.`,
        reqUser.full_name,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      200,
      `Player ${is_active ? "activated" : "deactivated"
      } successfully.`,
      result.rows[0]
    );

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("Update Player Status Error:", error);

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
      WHERE player_id = $1
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
    const searchKeyword = `% ${keyword.trim()}% `;

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


exports.getPlayersAndCoaches = async (req, res) => {
  try {
    const [players, coaches] = await Promise.all([

      // Players
      pool.query(`
        SELECT
          player_id AS id,
          full_name
        FROM tbl_players
        WHERE is_active = TRUE
        ORDER BY player_id DESC
      `),

      // Active Coaches
      pool.query(`
        SELECT
          coach_id AS id,
          full_name
        FROM tbl_coach
        WHERE is_active = TRUE
        ORDER BY coach_id DESC
      `),

    ]);

    return sendSuccessResponse(
      res,
      200,
      "Players and coaches fetched successfully.",
      {
        players: players.rows,
        coaches: coaches.rows,
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

exports.generateDues = async (req, res) => {
  try {
    const result = await generateMonthlyDues();

    return sendSuccessResponse(
      res,
      200,
      "Monthly dues generated successfully.",
      result
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message
    );
  }
};