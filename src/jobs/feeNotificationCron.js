const cron = require("node-cron");
const pool = require("../config/dbConfig");

const feeDueNotificationCron = () => {
  cron.schedule(
    "0 9 1-5 * *",
    async () => {
      let client;

      try {
        client = await pool.connect();

        await client.query("BEGIN");

        const MAX_PLAYERS_PER_NOTIFICATION = 10;

        const regularFees = await client.query(`
          SELECT DISTINCT
            p.player_id,
            p.full_name,
            p.admission_id
          FROM tbl_players p
          WHERE p.is_active = TRUE
            AND p.fee_type = 'Regular Fee'
            AND p.regular_fee >= 0
            AND p.admission_date <= CURRENT_DATE
            AND (
              (
                DATE_TRUNC('month', p.admission_date) =
                  DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                AND p.fee_status = 'Paid'
              )
              OR
              EXISTS (
                SELECT 1
                FROM tbl_player_fees pf_last
                WHERE pf_last.player_id = p.player_id
                  AND pf_last.status = 'Paid'
                  AND pf_last.is_active = TRUE
                  AND pf_last.payment_date >=
                    DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                  AND pf_last.payment_date <
                    DATE_TRUNC('month', CURRENT_DATE)
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM tbl_player_fees pf_current
              WHERE pf_current.player_id = p.player_id
                AND pf_current.status = 'Paid'
                AND pf_current.is_active = TRUE
                AND pf_current.payment_date >=
                  DATE_TRUNC('month', CURRENT_DATE)
                AND pf_current.payment_date <
                  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            )

          UNION

          SELECT DISTINCT
            p.player_id,
            p.full_name,
            p.admission_id
          FROM tbl_players p
          INNER JOIN tbl_player_fees pf_last
            ON pf_last.player_id = p.player_id
          WHERE p.is_active = TRUE
            AND pf_last.status = 'Paid'
            AND pf_last.is_active = TRUE
            AND pf_last.payment_date >=
              DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
            AND pf_last.payment_date <
              DATE_TRUNC('month', CURRENT_DATE)
            AND NOT EXISTS (
              SELECT 1
              FROM tbl_player_fees pf_current
              WHERE pf_current.player_id = pf_last.player_id
                AND pf_current.status = 'Paid'
                AND pf_current.is_active = TRUE
                AND pf_current.payment_date >=
                  DATE_TRUNC('month', CURRENT_DATE)
                AND pf_current.payment_date <
                  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            )

          ORDER BY player_id;
        `);

        for (
          let i = 0;
          i < regularFees.rows.length;
          i += MAX_PLAYERS_PER_NOTIFICATION
        ) {
          const batch = regularFees.rows.slice(
            i,
            i + MAX_PLAYERS_PER_NOTIFICATION
          );

          const playerList = batch
            .map(
              (player) =>
                `${player.full_name} (${player.admission_id})`
            )
            .join(", ");

          const description =
            `${batch.length} player${batch.length > 1 ? "s" : ""} ` +
            `have regular fee due: ${playerList}`;

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
              "Fee Due",
              "Regular Fee Due",
              description,
              "System",
            ]
          );
        }

        const oneOnOneFees = await client.query(`
          SELECT DISTINCT
            p.player_id,
            p.full_name,
            p.admission_id
          FROM tbl_one_on_one_applications last_month
          INNER JOIN tbl_players p
            ON p.player_id = last_month.player_id
          WHERE p.is_active = TRUE
            AND last_month.is_active = TRUE
            AND last_month.payment_status = 'Paid'
            AND last_month.application_date >=
              DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
            AND last_month.application_date <
              DATE_TRUNC('month', CURRENT_DATE)
            AND NOT EXISTS (
              SELECT 1
              FROM tbl_one_on_one_applications this_month
              WHERE this_month.player_id = last_month.player_id
                AND this_month.is_active = TRUE
                AND this_month.payment_status = 'Paid'
                AND this_month.application_date >=
                  DATE_TRUNC('month', CURRENT_DATE)
                AND this_month.application_date <
                  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            )
          ORDER BY p.player_id;
        `);

        for (
          let i = 0;
          i < oneOnOneFees.rows.length;
          i += MAX_PLAYERS_PER_NOTIFICATION
        ) {
          const batch = oneOnOneFees.rows.slice(
            i,
            i + MAX_PLAYERS_PER_NOTIFICATION
          );

          const playerList = batch
            .map(
              (player) =>
                `${player.full_name} (${player.admission_id})`
            )
            .join(", ");

          const description =
            `${batch.length} player${batch.length > 1 ? "s" : ""} ` +
            `have One-to-One fee due: ${playerList}`;

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
              "Fee Due",
              "One-to-One Fee Due",
              description,
              "System",
            ]
          );
        }

        await client.query("COMMIT");

        console.log("Fee Due notification cron completed successfully.");
      } catch (error) {
        if (client) {
          await client.query("ROLLBACK");
        }

        console.error(
          "Fee Due notification cron failed:",
          error.message
        );
      } finally {
        if (client) {
          client.release();
        }
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );
};

module.exports = feeDueNotificationCron;