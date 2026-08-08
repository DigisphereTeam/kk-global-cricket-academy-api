const cron = require("node-cron");
const pool = require("../config/dbConfig");

const feeDueNotificationCron = () => {
  // TESTING: Runs every 2 minutes
  // PRODUCTION: "0 9 5 * *" -> 9:00 AM on the 5th of every month

  cron.schedule(
    "0 9 5 * *",
    async () => {
      console.log("Running Fee Due notification cron...");

      let client;

      try {
        client = await pool.connect();

        await client.query("BEGIN");

        // ============================================================
        // REGULAR FEE DUE
        // ============================================================
        //
        // Player is considered regular-fee due when:
        // - Player is active
        // - No fee record exists for the current month
        //
        const regularFees = await client.query(`
          SELECT
            p.player_id,
            p.full_name,
            p.admission_id
          FROM tbl_players p
          WHERE p.is_active = TRUE

            AND NOT EXISTS (
              SELECT 1
              FROM tbl_player_fees pf
              WHERE pf.player_id = p.player_id
                AND pf.due_date >= DATE_TRUNC('month', CURRENT_DATE)
                AND pf.due_date < DATE_TRUNC('month', CURRENT_DATE)
                    + INTERVAL '1 month'
            )

          ORDER BY p.player_id;
        `);

        console.log(
          `Regular fee due players: ${regularFees.rows.length}`
        );

        // ============================================================
        // CREATE REGULAR FEE NOTIFICATIONS
        // ============================================================

        const MAX_PLAYERS_PER_NOTIFICATION = 10;

        let regularNotificationCount = 0;

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
            VALUES
            ($1, $2, $3, $4)
            `,
            [
              "Regular Fee Due",
              "Regular Fee Due",
              description,
              "System",
            ]
          );

          regularNotificationCount++;
        }

        // ============================================================
        // ONE-TO-ONE FEE DUE
        // ============================================================
        //
        // Player is considered One-to-One fee due when:
        //
        // 1. Player is active
        // 2. Player has had a One-to-One application previously
        // 3. Player does NOT have an active One-to-One application
        //    for the current month
        //
        const oneOnOneFees = await client.query(`
          SELECT
            p.player_id,
            p.full_name,
            p.admission_id
          FROM tbl_players p
          WHERE p.is_active = TRUE

            -- Player must have had One-to-One previously
            AND EXISTS (
              SELECT 1
              FROM tbl_one_on_one_applications previous_o
              WHERE previous_o.player_id = p.player_id
            )

            -- No active One-to-One application this month
            AND NOT EXISTS (
              SELECT 1
              FROM tbl_one_on_one_applications current_o
              WHERE current_o.player_id = p.player_id
                AND current_o.is_active = TRUE
                AND current_o.application_date >= DATE_TRUNC(
                  'month',
                  CURRENT_DATE
                )
                AND current_o.application_date < DATE_TRUNC(
                  'month',
                  CURRENT_DATE
                ) + INTERVAL '1 month'
            )

          ORDER BY p.player_id;
        `);

        console.log(
          `One-to-One fee due players: ${oneOnOneFees.rows.length}`
        );

        // ============================================================
        // CREATE ONE-TO-ONE NOTIFICATIONS
        // ============================================================

        let oneOnOneNotificationCount = 0;

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
            VALUES
            ($1, $2, $3, $4)
            `,
            [
              "One-to-One Fee Due",
              "One-to-One Fee Due",
              description,
              "System",
            ]
          );

          oneOnOneNotificationCount++;
        }

        await client.query("COMMIT");

        console.log(
          `Created ${regularNotificationCount} regular fee notification(s).`
        );

        console.log(
          `Created ${oneOnOneNotificationCount} One-to-One notification(s).`
        );
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