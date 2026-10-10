const pool = require("../config/dbConfig");

const paymentTables = {
  admission: {
    table: "tbl_players",
    idColumn: "player_id",
  },
  "player-fee": {
    table: "tbl_player_fees",
    idColumn: "fee_id",
  },
  "one-on-one": {
    table: "tbl_one_on_one_applications",
    idColumn: "application_id",
  },
};

const confirmPayment = async (req, res) => {
  try {
    const { payment_type, payment_id } = req.params;

    if (!Object.prototype.hasOwnProperty.call(paymentTables, payment_type)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid payment type is required",
      });
    }

    if (!/^[1-9]\d*$/.test(payment_id)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid payment ID is required",
      });
    }

    const { table, idColumn } = paymentTables[payment_type];

    const result = await pool.query(
      `UPDATE ${table}
       SET is_payment_confirmed = TRUE
       WHERE ${idColumn} = $1
         AND is_payment_confirmed = FALSE
       RETURNING *`,
      [Number(payment_id)]
    );

    if (result.rowCount === 0) {
      const existingPayment = await pool.query(
        `SELECT is_payment_confirmed
         FROM ${table}
         WHERE ${idColumn} = $1`,
        [Number(payment_id)]
      );

      if (existingPayment.rowCount === 0) {
        return res.status(404).json({
          success: false,
          statusCode: 404,
          message: "Payment record not found",
        });
      }

      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Payment is already confirmed",
      });
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Payment confirmed successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.log("Confirm payment error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

module.exports = { confirmPayment };