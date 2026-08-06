const pool = require("../config/dbConfig");


async function generateMonthlyDues() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Prevent multiple cron instances from generating dues simultaneously
    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [987654321]
    );

    // First day of current month
    const billingMonth = new Date();
    billingMonth.setDate(1);
    billingMonth.setHours(0, 0, 0, 0);

    // Due date (4th of current month)
    const dueDate = new Date(billingMonth);
    dueDate.setDate(4);

    // ---------------------------------------
    // Regular Monthly Dues
    // ---------------------------------------

    const regularResult = await client.query(
      `
      INSERT INTO tbl_monthly_dues
      (
          player_id,
          fee_type,
          billing_month,
          amount,
          due_date
      )

      SELECT
          p.player_id,
          'regular',
          $1,
          p.admission_fee,
          $2

      FROM tbl_players p

      WHERE
          p.status = 'Active'
          AND COALESCE(p.admission_fee, 0) > 0

      ON CONFLICT DO NOTHING;
      `,
      [billingMonth, dueDate]
    );

    // ---------------------------------------
    // One-On-One Monthly Dues
    // ---------------------------------------

    const oneOnOneResult = await client.query(
      `
        INSERT INTO tbl_monthly_dues
        (
            player_id,
            fee_type,
            one_on_one_application_id,
            billing_month,
            amount,
            due_date
        )

        SELECT
            latest.player_id,
            'one_on_one',
            latest.application_id,
            $1,
            latest.fee_amount,
            $2

        FROM (

            SELECT DISTINCT ON (player_id)

                application_id,
                player_id,
                fee_amount,
                application_date

            FROM tbl_one_on_one_applications

            WHERE
                is_active = TRUE
                AND COALESCE(fee_amount, 0) > 0

            ORDER BY
                player_id,
                application_date DESC,
                application_id DESC

        ) latest

        ON CONFLICT DO NOTHING;
        `,
      [billingMonth, dueDate]
    );

    await client.query("COMMIT");

    return {
      billing_month: billingMonth.toISOString().split("T")[0],
      regular: regularResult.rowCount,
      one_on_one: oneOnOneResult.rowCount,
      total: regularResult.rowCount + oneOnOneResult.rowCount,
    };

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Monthly due generation failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  generateMonthlyDues,
};