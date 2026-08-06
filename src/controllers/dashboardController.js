const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {

    const [
      players,
      activePlayers,
      trainers,
      pendingFees,
      groundBookings,
      approvals,
    ] = await Promise.all([

      // Total Players
      pool.query(`
        SELECT COUNT(*) AS total_players
        FROM tbl_players
      `),


      // Active Players
      pool.query(`
        SELECT COUNT(*) AS active_players
        FROM tbl_players
        WHERE status = 'Active'
      `),


      // Total Trainers
      pool.query(`
        SELECT COUNT(*) AS total_trainers
        FROM tbl_coach
      `),


      // Pending Fees Amount This Month
      pool.query(`
        SELECT
          COALESCE(player_fee.pending_amount, 0) +
          COALESCE(one_on_one.pending_amount, 0) AS pending_fees

        FROM

        (
          -- Regular Player Pending Fees
          SELECT
            COALESCE(SUM(latest_fee.amount), 0) AS pending_amount

          FROM tbl_players p

          LEFT JOIN LATERAL (
            SELECT
              pf.amount
            FROM tbl_player_fees pf
            WHERE pf.player_id = p.player_id
            ORDER BY
              pf.created_at DESC
            LIMIT 1
          ) latest_fee ON TRUE

          WHERE NOT EXISTS (

            SELECT 1
            FROM tbl_player_fees pf2

            WHERE pf2.player_id = p.player_id
              AND pf2.status = 'Paid'
              AND pf2.payment_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND pf2.payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

          )

        ) player_fee,

        (
          -- One-On-One Pending Fees
          SELECT
            COALESCE(SUM(latest_application.fee_amount), 0) AS pending_amount

          FROM (

            SELECT DISTINCT ON (player_id)

              player_id,
              fee_amount,
              application_date

            FROM tbl_one_on_one_applications

            WHERE is_active = TRUE

            ORDER BY
              player_id,
              application_date DESC,
              application_id DESC

          ) latest_application

          WHERE DATE_TRUNC('month', latest_application.application_date)
                < DATE_TRUNC('month', CURRENT_DATE)

        ) one_on_one;
      `),


      // Total Ground Bookings
      pool.query(`
        SELECT COUNT(*) AS ground_bookings
        FROM tbl_ground_booking
      `),


      // Pending Approvals
      pool.query(`
        SELECT COUNT(*) AS approvals
        FROM tbl_ground_booking
        WHERE status = 'Pending'
      `),

    ]);


    const [
      monthlyRevenue,
      regularRevenue,
      oneOnOneRevenue,
      groundRevenue,
      salaryExpense,
      totalExpenditure,
    ] = await Promise.all([

      // Net Monthly Revenue
      pool.query(`
          SELECT
            COALESCE(SUM(amount), 0) AS monthly_revenue
          FROM (

            -- Regular Player Fee Revenue
            SELECT
              amount,
              payment_date AS revenue_date
            FROM tbl_player_fees
            WHERE status = 'Paid'

            UNION ALL

            -- One-On-One Revenue
            SELECT
              fee_amount AS amount,
              application_date AS revenue_date
            FROM tbl_one_on_one_applications

            UNION ALL

            -- Ground Booking Revenue
            SELECT
              total_amount AS amount,
              booking_date AS revenue_date
            FROM tbl_ground_booking
            WHERE status = 'Confirmed'

            UNION ALL

            -- Salary Expense
            SELECT
              -net_salary AS amount,
              payment_date AS revenue_date
            FROM tbl_employee_salary

            UNION ALL

            -- Other Expenditure
            SELECT
              -amount AS amount,
              expenditure_date AS revenue_date
            FROM tbl_expenditure

          ) revenue

          WHERE DATE_TRUNC('month', revenue_date) =
                DATE_TRUNC('month', CURRENT_DATE)
        `),

      // Current Month Regular Revenue (Player Fees)
      pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS regular_revenue
        FROM tbl_player_fees
        WHERE status = 'Paid'
          AND DATE_TRUNC('month', payment_date) =
              DATE_TRUNC('month', CURRENT_DATE)
      `),

      // Current Month One-On-One Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(fee_amount), 0) AS one_on_one_revenue
        FROM tbl_one_on_one_applications
        WHERE DATE_TRUNC('month', application_date) =
              DATE_TRUNC('month', CURRENT_DATE)
      `),

      // Current Month Ground Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(total_amount), 0) AS ground_revenue
        FROM tbl_ground_booking
        WHERE status = 'Confirmed'
          AND DATE_TRUNC('month', booking_date) =
              DATE_TRUNC('month', CURRENT_DATE)
      `),

      // Current Month Salary Expense
      pool.query(`
          SELECT
            COALESCE(SUM(net_salary), 0) AS salary_expense
          FROM tbl_employee_salary
          WHERE DATE_TRUNC('month', payment_date) =
                DATE_TRUNC('month', CURRENT_DATE)
        `),

      // Current Month Other Expenditure
      pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS total_expenditure
        FROM tbl_expenditure
        WHERE DATE_TRUNC('month', expenditure_date) =
              DATE_TRUNC('month', CURRENT_DATE)
      `),

    ]);

    return sendSuccessResponse(
      res,
      200,
      "Dashboard statistics fetched successfully.",
      {

        total_players:
          Number(players.rows[0].total_players),


        active_players:
          Number(activePlayers.rows[0].active_players),


        trainers:
          Number(trainers.rows[0].total_trainers),


        pending_fees:
          Number(pendingFees.rows[0].pending_fees),


        ground_bookings:
          Number(groundBookings.rows[0].ground_bookings),


        approvals:
          Number(approvals.rows[0].approvals),


        monthly_revenue:
          Number(monthlyRevenue.rows[0].monthly_revenue),


        regular_revenue:
          Number(regularRevenue.rows[0].regular_revenue),


        one_on_one_revenue:
          Number(oneOnOneRevenue.rows[0].one_on_one_revenue),


        ground_revenue:
          Number(groundRevenue.rows[0].ground_revenue),


        salary_expense:
          Number(salaryExpense.rows[0].salary_expense),


        total_expenditure:
          Number(totalExpenditure.rows[0].total_expenditure)

      }
    );


  } catch (error) {

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};

exports.getDashboardCharts = async (req, res) => {
  try {

    const [
      playerGrowth,
      feeCollection
    ] = await Promise.all([

      // Player Growth - Last 6 Months
      pool.query(`
        WITH months AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (INTERVAL '1 month' * generate_series(5, 0, -1))
            AS month_date

        )

        SELECT

          TO_CHAR(
            months.month_date,
            'Mon'
          ) AS month,

          COUNT(p.player_id)::INT AS players

        FROM months

        LEFT JOIN tbl_players p

          ON DATE_TRUNC(
              'month',
              p.admission_date
            ) <= months.month_date

        GROUP BY
          months.month_date

        ORDER BY
          months.month_date;
      `),

      // Fee Collection - Current Month
      pool.query(`
        WITH current_month AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE) AS start_date,

            DATE_TRUNC('month', CURRENT_DATE)
            + INTERVAL '1 month' AS end_date

        ),

        latest_player_fee AS (

          SELECT DISTINCT ON (player_id)

            player_id,
            amount

          FROM tbl_player_fees

          ORDER BY
            player_id,
            created_at DESC

        )

        SELECT

          -- Collected This Month
          (

            SELECT
              COALESCE(SUM(amount), 0)

            FROM tbl_player_fees pf

            CROSS JOIN current_month cm

            WHERE
              pf.status = 'Paid'

              AND pf.payment_date >= cm.start_date

              AND pf.payment_date < cm.end_date

          ) AS collected,



          -- Pending This Month
          (

            SELECT
              COALESCE(SUM(lpf.amount), 0)

            FROM tbl_players p

            CROSS JOIN current_month cm

            LEFT JOIN latest_player_fee lpf

              ON lpf.player_id = p.player_id

            WHERE NOT EXISTS (

              SELECT 1

              FROM tbl_player_fees pf

              WHERE pf.player_id = p.player_id

                AND pf.status = 'Paid'

                AND pf.payment_date >= cm.start_date

                AND pf.payment_date < cm.end_date

            )

          ) AS pending;
      `)

    ]);

    return sendSuccessResponse(
      res,
      200,
      "Dashboard charts fetched successfully.",
      {

        player_growth: playerGrowth.rows,

        fee_collection: {

          collected: Number(
            feeCollection.rows[0].collected
          ),

          pending: Number(
            feeCollection.rows[0].pending
          )

        }

      }
    );

  } catch (error) {

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch dashboard charts."
    );

  }
};


exports.getDashboardRevenueAndActivities = async (req, res) => {
  try {

    const [
      revenueTrend,
      activities
    ] = await Promise.all([

      // Revenue Trend - Last 6 Months (Net Revenue)
      pool.query(`
        WITH months AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (INTERVAL '1 month' * generate_series(5, 0, -1))
            AS month_date

        )

        SELECT

          TO_CHAR(
            months.month_date,
            'Mon'
          ) AS month,

          COALESCE(
            SUM(transactions.amount),
            0
          ) AS revenue

        FROM months

        LEFT JOIN (

          -- Regular Player Fee Revenue
          SELECT
            amount,
            payment_date AS transaction_date
          FROM tbl_player_fees
          WHERE status = 'Paid'

          UNION ALL

          -- One-On-One Revenue
          SELECT
            fee_amount AS amount,
            application_date AS transaction_date
          FROM tbl_one_on_one_applications

          UNION ALL

          -- Ground Booking Revenue
          SELECT
            total_amount AS amount,
            booking_date AS transaction_date
          FROM tbl_ground_booking
          WHERE status = 'Confirmed'

          UNION ALL

          -- Salary Expense
          SELECT
            -net_salary AS amount,
            payment_date AS transaction_date
          FROM tbl_employee_salary

          UNION ALL

          -- Other Expenditure
          SELECT
            -amount AS amount,
            expenditure_date AS transaction_date
          FROM tbl_expenditure

        ) transactions

        ON DATE_TRUNC(
          'month',
          transactions.transaction_date
        ) = months.month_date

        GROUP BY
          months.month_date

        ORDER BY
          months.month_date;
      `),

      // Recent Activities
      pool.query(`
        SELECT
          module_name,
          action,
          description,
          performed_by,
          created_at
        FROM tbl_notification_logs
        ORDER BY created_at DESC
        LIMIT 4;
      `)

    ]);

    return sendSuccessResponse(
      res,
      200,
      "Revenue trend and activities fetched successfully.",
      {
        revenue_trend: revenueTrend.rows.map(row => ({
          month: row.month,
          revenue: Number(row.revenue)
        })),

        recent_activities: activities.rows.map(row => ({
          type: row.module_name,
          action: row.action,
          message: row.description,
          performed_by: row.performed_by,
          created_at: row.created_at
        }))
      }
    );

  } catch (error) {

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch dashboard data."
    );

  }
};