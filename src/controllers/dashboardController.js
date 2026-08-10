const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {
    const statisticsQuery = `
      SELECT

        /* Total Players */
        (
          SELECT COUNT(*)
          FROM tbl_players
        ) AS total_players,


        /* Active Players */
        (
          SELECT COUNT(*)
          FROM tbl_players
          WHERE is_active = TRUE
        ) AS active_players,


        /* Total Trainers */
        (
          SELECT COUNT(*)
          FROM tbl_coach
        ) AS total_trainers,


        /* Total Ground Bookings */
        (
          SELECT COUNT(*)
          FROM tbl_ground_booking
        ) AS ground_bookings,


        /* Pending Approvals */
        (
          SELECT COUNT(*)
          FROM tbl_ground_booking
          WHERE status = 'Pending'
        ) AS approvals;
    `;


    const revenueQuery = `
      SELECT

        /* =========================================
           PENDING FEES
           ========================================= */

        (
          SELECT COUNT(DISTINCT pending_players.player_id)
          FROM (

            /* =====================================
               REGULAR PLAYERS
               ===================================== */

            SELECT
              p.player_id

            FROM tbl_players p

            WHERE p.is_active = TRUE

              /* Due date is 4th
                 Count only after 4th */
              AND CURRENT_DATE >
                  DATE_TRUNC('month', CURRENT_DATE)
                  + INTERVAL '3 day'

              /* Player has NOT paid this month */
              AND NOT EXISTS (
                SELECT 1
                FROM tbl_player_fees pf

                WHERE pf.player_id = p.player_id
                  AND pf.status = 'Paid'
                  AND pf.is_active = TRUE

                  AND pf.payment_date >=
                      DATE_TRUNC('month', CURRENT_DATE)

                  AND pf.payment_date <
                      DATE_TRUNC('month', CURRENT_DATE)
                      + INTERVAL '1 month'
              )


            UNION


            /* =====================================
               ONE-ON-ONE PLAYERS
               ===================================== */

            SELECT
              o.player_id

            FROM tbl_one_on_one_applications o

            INNER JOIN tbl_players p
              ON p.player_id = o.player_id
             AND p.is_active = TRUE

            WHERE o.is_active = TRUE
              AND o.renewal_status = 'Active'

              /* Due date is 4th
                 Count only after 4th */
              AND CURRENT_DATE >
                  DATE_TRUNC('month', CURRENT_DATE)
                  + INTERVAL '3 day'

              /* Player has NOT paid this month */
              AND NOT EXISTS (
                SELECT 1
                FROM tbl_player_fees pf

                WHERE pf.player_id = o.player_id
                  AND pf.status = 'Paid'
                  AND pf.is_active = TRUE

                  AND pf.payment_date >=
                      DATE_TRUNC('month', CURRENT_DATE)

                  AND pf.payment_date <
                      DATE_TRUNC('month', CURRENT_DATE)
                      + INTERVAL '1 month'
              )

          ) pending_players
        ) AS pending_fees,


        /* =========================================
           REGULAR REVENUE
           ========================================= */

        (
          SELECT COALESCE(SUM(amount), 0)

          FROM tbl_player_fees

          WHERE status = 'Paid'

            AND DATE_TRUNC('month', payment_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS regular_revenue,


        /* =========================================
           ONE-ON-ONE REVENUE
           ========================================= */

        (
          SELECT COALESCE(SUM(fee_amount), 0)

          FROM tbl_one_on_one_applications

          WHERE DATE_TRUNC('month', application_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS one_on_one_revenue,


        /* =========================================
           GROUND REVENUE
           ========================================= */

        (
          SELECT COALESCE(SUM(total_amount), 0)

          FROM tbl_ground_booking

          WHERE status = 'Confirmed'

            AND DATE_TRUNC('month', booking_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS ground_revenue,


        /* =========================================
           SALARY EXPENSE
           ========================================= */

        (
          SELECT COALESCE(SUM(net_salary), 0)

          FROM tbl_employee_salary

          WHERE DATE_TRUNC('month', payment_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS salary_expense,


        /* =========================================
           TOTAL EXPENDITURE
           ========================================= */

        (
          SELECT COALESCE(SUM(amount), 0)

          FROM tbl_expenditure

          WHERE DATE_TRUNC('month', expenditure_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS total_expenditure,


        /* =========================================
           MONTHLY REVENUE
           ========================================= */

        (
          SELECT COALESCE(SUM(amount), 0)

          FROM (

            /* Player Fees */
            SELECT
              amount,
              payment_date AS revenue_date

            FROM tbl_player_fees

            WHERE status = 'Paid'


            UNION ALL


            /* One-On-One */
            SELECT
              fee_amount,
              application_date

            FROM tbl_one_on_one_applications


            UNION ALL


            /* Ground Booking */
            SELECT
              total_amount,
              booking_date

            FROM tbl_ground_booking

            WHERE status = 'Confirmed'


            UNION ALL


            /* Salary */
            SELECT
              -net_salary,
              payment_date

            FROM tbl_employee_salary


            UNION ALL


            /* Other Expenses */
            SELECT
              -amount,
              expenditure_date

            FROM tbl_expenditure

          ) revenue

          WHERE DATE_TRUNC('month', revenue_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS monthly_revenue;

    `;


    const [
      statisticsResult,
      revenueResult
    ] = await Promise.all([
      pool.query(statisticsQuery),
      pool.query(revenueQuery)
    ]);


    const stats = statisticsResult.rows[0];
    const revenue = revenueResult.rows[0];


    return sendSuccessResponse(
      res,
      200,
      "Dashboard statistics fetched successfully.",
      {
        total_players:
          Number(stats.total_players),

        active_players:
          Number(stats.active_players),

        trainers:
          Number(stats.total_trainers),

        pending_fees:
          Number(revenue.pending_fees),

        ground_bookings:
          Number(stats.ground_bookings),

        approvals:
          Number(stats.approvals),

        monthly_revenue:
          Number(revenue.monthly_revenue),

        regular_revenue:
          Number(revenue.regular_revenue),

        one_on_one_revenue:
          Number(revenue.one_on_one_revenue),

        ground_revenue:
          Number(revenue.ground_revenue),

        salary_expense:
          Number(revenue.salary_expense),

        total_expenditure:
          Number(revenue.total_expenditure)
      }
    );

  } catch (error) {

    console.error("Dashboard Error:", error);

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
      feeCollection,
      attendance
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


          (
            SELECT
              COALESCE(SUM(amount),0)

            FROM tbl_player_fees pf

            CROSS JOIN current_month cm

            WHERE
              pf.status='Paid'

              AND pf.payment_date >= cm.start_date

              AND pf.payment_date < cm.end_date

          ) AS collected,



          (
            SELECT
              COALESCE(SUM(lpf.amount),0)

            FROM tbl_players p

            CROSS JOIN current_month cm

            LEFT JOIN latest_player_fee lpf

              ON lpf.player_id=p.player_id

            WHERE NOT EXISTS (

              SELECT 1

              FROM tbl_player_fees pf

              WHERE pf.player_id=p.player_id

              AND pf.status='Paid'

              AND pf.payment_date >= cm.start_date

              AND pf.payment_date < cm.end_date

            )

          ) AS pending;

      `),

      // Weekly Attendance Chart
      pool.query(`
  WITH days AS (

    SELECT generate_series(
      CURRENT_DATE - INTERVAL '5 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS attendance_date

  ),

  total_players AS (

    SELECT
      COUNT(*) AS total
    FROM tbl_players
    WHERE is_active = TRUE

  ),

  attendance_data AS (

    SELECT
      ta.payroll_date,
      COUNT(DISTINCT ta.employee_code) AS present

    FROM tbl_attendance ta

    INNER JOIN tbl_players p
      ON p.admission_id = ta.employee_code

    WHERE ta.payroll_date >= CURRENT_DATE - INTERVAL '5 days'
      AND ta.payroll_date <= CURRENT_DATE
      AND p.is_active = TRUE

    GROUP BY ta.payroll_date

  )

  SELECT

    TO_CHAR(
      d.attendance_date,
      'Dy'
    ) AS day,

    d.attendance_date,

    /* Present Count */
    COALESCE(
      ad.present,
      0
    )::INT AS present_count,

    /* Absent Count */
    GREATEST(
      tp.total - COALESCE(ad.present, 0),
      0
    )::INT AS absent_count,

    /* Present Percentage */
    COALESCE(
      LEAST(
        100,
        ROUND(
          (
            COALESCE(ad.present, 0)::numeric
            /
            NULLIF(tp.total, 0)
          ) * 100
        )
      ),
      0
    )::INT AS present_percentage,

    /* Absent Percentage */
    COALESCE(
      GREATEST(
        0,
        100 -
        LEAST(
          100,
          ROUND(
            (
              COALESCE(ad.present, 0)::numeric
              /
              NULLIF(tp.total, 0)
            ) * 100
          )
        )
      ),
      0
    )::INT AS absent_percentage

  FROM days d

  CROSS JOIN total_players tp

  LEFT JOIN attendance_data ad
    ON ad.payroll_date = d.attendance_date

  ORDER BY
    d.attendance_date;
`)

    ]);



    return sendSuccessResponse(
      res,
      200,
      "Dashboard charts fetched successfully.",
      {

        player_growth:
          playerGrowth.rows,


        fee_collection: {

          collected:
            Number(
              feeCollection.rows[0].collected
            ),

          pending:
            Number(
              feeCollection.rows[0].pending
            )

        },


        attendance:
          attendance.rows

      }
    );


  } catch (error) {

    console.error(error);


    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Failed to fetch dashboard charts."
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
        WHERE NOT (
          module_name = 'Ground Booking'
          AND action IN ('Confirmed', 'Cancelled')
        )
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