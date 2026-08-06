const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.createPlayerFee = async (req, res) => {
  const {
    player_id,
    fee_type,
    amount,
    payment_type,
    payment_date,
    remarks,
  } = req.body;

  let client;

  try {
    // Required fields
    if (
      !player_id ||
      !fee_type ||
      amount == null ||
      !payment_type
    ) {
      return sendErrorResponse(
        res,
        400,
        "Player, fee type, amount and payment type are required."
      );
    }

    // Player validation
    if (
      isNaN(player_id) ||
      Number(player_id) <= 0
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid player ID."
      );
    }

    // Amount validation
    if (Number(amount) <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Amount must be greater than zero."
      );
    }

    // Payment date validation
    const paymentDate = payment_date
      ? new Date(payment_date)
      : new Date();

    if (isNaN(paymentDate.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment date."
      );
    }

    // Format payment date (YYYY-MM-DD)
    const formattedPaymentDate = `${paymentDate.getFullYear()}-${String(
      paymentDate.getMonth() + 1
    ).padStart(2, "0")}-${String(
      paymentDate.getDate()
    ).padStart(2, "0")}`;

    // Due date = 4th of next month
    const dueDate = new Date(
      paymentDate.getFullYear(),
      paymentDate.getMonth() + 1,
      4
    );

    // Format due date (YYYY-MM-DD)
    const due_date = `${dueDate.getFullYear()}-${String(
      dueDate.getMonth() + 1
    ).padStart(2, "0")}-${String(
      dueDate.getDate()
    ).padStart(2, "0")}`;

    client = await pool.connect();

    await client.query("BEGIN");

    // Check player exists
    const playerResult = await client.query(
      `
      SELECT
        player_id,
        full_name
      FROM tbl_players
      WHERE player_id = $1
      `,
      [Number(player_id)]
    );

    if (playerResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );
    }

    // Check duplicate fee for same player and payment date
    const existingFee = await client.query(
      `
        SELECT fee_id
        FROM tbl_player_fees
        WHERE player_id = $1
          AND payment_date >= DATE_TRUNC('month', $2::date)
          AND payment_date < DATE_TRUNC('month', $2::date) + INTERVAL '1 month'
        LIMIT 1
      `,
      [
        Number(player_id),
        formattedPaymentDate,
      ]
    );

    if (existingFee.rowCount > 0) {
      await client.query("ROLLBACK");

      return sendErrorResponse(
        res,
        409,
        "Fee has already been paid for this month."
      );
    }


    // Insert fee
    const result = await client.query(
      `
        INSERT INTO tbl_player_fees
        (
          player_id,
          fee_type,
          amount,
          payment_type,
          due_date,
          payment_date,
          status,
          remarks
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8
        )
        RETURNING *;
        `,
      [
        Number(player_id),
        fee_type.trim(),
        Number(amount),
        payment_type.trim(),
        due_date,
        formattedPaymentDate,
        "Paid",
        remarks?.trim() || null,
      ]
    );

    // Logged-in user
    const userResult = await client.query(
      `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    const performedBy = userResult.rows[0].full_name;

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
      (
        $1,$2,$3,$4
      )
      `,
      [
        "Player Fee",
        "Created",
        `${playerResult.rows[0].full_name}'s fee was added.`,
        performedBy,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      201,
      "Player fee created successfully.",
      result.rows[0]
    );

  } catch (error) {

    if (client) {
      await client.query("ROLLBACK");
    }

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to create player fee."
    );

  } finally {

    if (client) {
      client.release();
    }

  }
};

// exports.getAllPlayerFees = async (req, res) => {
//   const { date } = req.query;

//   try {
//     const query = `
//       SELECT
//         pf.*,
//         p.admission_id,
//         p.full_name
//       FROM tbl_player_fees pf
//       INNER JOIN tbl_players p
//         ON pf.player_id = p.player_id
//       INNER JOIN (
//         SELECT
//           player_id,
//           MAX(fee_id) AS latest_fee_id
//         FROM tbl_player_fees
//         GROUP BY player_id
//       ) latest
//         ON latest.latest_fee_id = pf.fee_id
//       ORDER BY
//         pf.fee_id DESC;
//     `;

//     const result = await pool.query(query);

//     const currentDate = date ? new Date(date) : new Date();

//     if (isNaN(currentDate.getTime())) {
//       return sendErrorResponse(
//         res,
//         400,
//         "Invalid date."
//       );
//     }

//     const data = result.rows.map((fee) => {
//       if (
//         fee.status === "Paid" &&
//         fee.due_date &&
//         currentDate > new Date(fee.due_date)
//       ) {
//         return {
//           ...fee,
//           status: "Unpaid",
//         };
//       }

//       return fee;
//     });

//     return sendSuccessResponse(
//       res,
//       200,
//       "Player fees fetched successfully.",
//       data
//     );

//   } catch (error) {
//     console.error(error);

//     return sendErrorResponse(
//       res,
//       500,
//       error.message || "Failed to fetch player fees."
//     );
//   }
// };


exports.getAllPlayerFees = async (req, res) => {
  const { date } = req.query;

  try {
    const query = `
      SELECT
        pf.*,
        p.admission_id,
        p.full_name
      FROM tbl_player_fees pf
      INNER JOIN tbl_players p
        ON pf.player_id = p.player_id
      INNER JOIN (
        SELECT
          player_id,
          MAX(fee_id) AS latest_fee_id
        FROM tbl_player_fees
        GROUP BY player_id
      ) latest
        ON latest.latest_fee_id = pf.fee_id
      ORDER BY
        pf.fee_id DESC;
    `;

    const result = await pool.query(query);

    const currentDate = date ? new Date(date) : new Date();

    if (isNaN(currentDate.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid date."
      );
    }

    const data = result.rows.map((fee) => {
      if (fee.status === "Paid" && fee.due_date) {
        const dueDate = new Date(fee.due_date);

        const isCurrentOrLaterMonth =
          currentDate.getFullYear() > dueDate.getFullYear() ||
          (currentDate.getFullYear() === dueDate.getFullYear() &&
            currentDate.getMonth() >= dueDate.getMonth());

        if (isCurrentOrLaterMonth) {
          return {
            ...fee,
            status: "Pending",
          };
        }
      }

      return fee;
    });
    return sendSuccessResponse(
      res,
      200,
      "Player fees fetched successfully.",
      data
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch player fees."
    );
  }
};

exports.getPlayerFeeById = async (req, res) => {
  const { fee_id } = req.params;

  if (!fee_id || isNaN(fee_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Fee ID."
    );
  }

  try {
    const result = await pool.query(
      `
    SELECT
      pf.*,
      p.admission_id,
      p.full_name
    FROM tbl_player_fees pf
    INNER JOIN tbl_players p
      ON pf.player_id = p.player_id
    WHERE pf.fee_id = $1
    `,
      [fee_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Fee record not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Fee fetched successfully.",
      result.rows[0]
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch fee."
    );
  }
};


exports.updatePlayerFee = async (req, res) => {
  const { fee_id } = req.params;

  if (!fee_id || isNaN(fee_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Fee ID."
    );
  }

  try {
    const existingFee = await pool.query(
      `
      SELECT *
      FROM tbl_player_fees
      WHERE fee_id = $1
      `,
      [fee_id]
    );

    if (existingFee.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Fee record not found."
      );
    }

    const oldFee = existingFee.rows[0];

    const updatedFee = {
      fee_type:
        req.body.fee_type ?? oldFee.fee_type,

      amount:
        req.body.amount !== undefined
          ? Number(req.body.amount)
          : Number(oldFee.amount),

      payment_type:
        req.body.payment_type ?? oldFee.payment_type,

      due_date:
        req.body.due_date ?? oldFee.due_date,

      payment_date:
        req.body.payment_date ?? oldFee.payment_date,

      status:
        req.body.status ?? oldFee.status,

      remarks:
        req.body.remarks ?? oldFee.remarks,
    };

    if (updatedFee.amount <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Amount must be greater than zero."
      );
    }

    const result = await pool.query(
      `
      UPDATE tbl_player_fees
      SET
        fee_type = $1,
        amount = $2,
        payment_type = $3,
        due_date = $4,
        payment_date = $5,
        status = $6,
        remarks = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE fee_id = $8
      RETURNING *;
      `,
      [
        updatedFee.fee_type,
        updatedFee.amount,
        updatedFee.payment_type,
        updatedFee.due_date,
        updatedFee.payment_date,
        updatedFee.status,
        updatedFee.remarks,
        fee_id,
      ]
    );

    return sendSuccessResponse(
      res,
      200,
      "Player fee updated successfully.",
      result.rows[0]
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to update fee."
    );
  }
};


exports.deletePlayerFee = async (req, res) => {
  const { fee_id } = req.params;

  if (!fee_id || isNaN(fee_id) || Number(fee_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Valid fee ID is required."
    );
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM tbl_player_fees
      WHERE fee_id = $1
      RETURNING *;
      `,
      [fee_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Player fee not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Player fee deleted successfully."
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to delete player fee."
    );
  }
};

exports.getPlayerFeesByPlayerId = async (req, res) => {
  const { player_id } = req.params;

  if (!player_id || isNaN(player_id) || Number(player_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Valid player ID is required."
    );
  }

  try {
    const [playerResult, feeResult] = await Promise.all([
      pool.query(
        `
        SELECT
          player_id,
          admission_id,
          full_name,
          phone_number,
          email,
          admission_date,
          batch
        FROM tbl_players
        WHERE player_id = $1
        `,
        [player_id]
      ),

      pool.query(
        `
        SELECT
          fee_id,
          fee_type,
          amount,
          payment_type,
          due_date,
          payment_date,
          status,
          remarks,
          created_at,
          updated_at
        FROM tbl_player_fees
        WHERE player_id = $1
        ORDER BY created_at DESC
        `,
        [player_id]
      ),
    ]);

    if (playerResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Player not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Player fees fetched successfully.",
      {
        player: playerResult.rows[0],
        fees: feeResult.rows,
      }
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch player fees."
    );
  }
};


exports.getPlayerFeeStatistics = async (req, res) => {
  try {
    const [
      totalCollection,
      paidFees,
      pendingFees,
      thisMonthCollection,
      collectionSummary,
    ] = await Promise.all([

      // Total Collection
      pool.query(`
        SELECT
          COALESCE(SUM(amount),0) AS total_collection
        FROM tbl_player_fees
        WHERE status = 'Paid'
      `),


      // Paid Unique Players This Month
      pool.query(`
        SELECT
          COUNT(DISTINCT player_id)::INT AS paid_members
        FROM tbl_player_fees
        WHERE status = 'Paid'
          AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
          AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `),


      // Pending Unique Players This Month
      pool.query(`
        SELECT
          COUNT(DISTINCT pf.player_id)::INT AS pending_fees
        FROM tbl_player_fees pf

        WHERE NOT EXISTS (
          SELECT 1
          FROM tbl_player_fees paid

          WHERE paid.player_id = pf.player_id
            AND paid.status = 'Paid'
            AND paid.payment_date >= DATE_TRUNC('month', CURRENT_DATE)
            AND paid.payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        )
      `),

      // Current Month Collection
      pool.query(`
        SELECT
          COALESCE(SUM(amount),0) AS this_month_collection
        FROM tbl_player_fees
        WHERE status = 'Paid'
          AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
          AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `),


      // Last 6 Months Collection
      pool.query(`
        SELECT
          EXTRACT(MONTH FROM months.month_date)::INT AS month_number,
          TO_CHAR(months.month_date, 'Mon') AS month,
          COALESCE(SUM(pf.amount), 0) AS collected

        FROM (
          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (INTERVAL '1 month' * generate_series(5, 0, -1))
            AS month_date
        ) months

        LEFT JOIN tbl_player_fees pf
          ON DATE_TRUNC('month', pf.payment_date) = months.month_date
          AND pf.status = 'Paid'

        GROUP BY months.month_date

        ORDER BY months.month_date
      `)

    ]);


    return sendSuccessResponse(
      res,
      200,
      "Player fee statistics fetched successfully.",
      {
        statistics: {

          total_collection: Number(
            totalCollection.rows[0].total_collection
          ),

          paid_fees: Number(
            paidFees.rows[0].paid_members
          ),

          pending_fees: Number(
            pendingFees.rows[0].pending_fees
          ),

          this_month_collection: Number(
            thisMonthCollection.rows[0].this_month_collection
          ),

        },

        collection_summary: collectionSummary.rows,
      }
    );


  } catch (error) {

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch player fee statistics."
    );

  }
};