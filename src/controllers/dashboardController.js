const pool = require("../config/dbConfig");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {
    const statisticsQuery = `
      SELECT

        (
          SELECT COUNT(*)
          FROM tbl_players
        ) AS total_players,

        (
          SELECT COUNT(*)
          FROM tbl_players
          WHERE is_active = TRUE
        ) AS active_players,

        (
          SELECT COUNT(*)
          FROM tbl_coach
        ) AS total_trainers,

        (
          SELECT COUNT(*)
          FROM tbl_ground_booking
        ) AS ground_bookings,

        (
          SELECT COUNT(*)
          FROM tbl_ground_booking
          WHERE status = 'Pending'
        ) AS approvals;
      `;


    const revenueQuery = `
      SELECT

        (
          SELECT COUNT(*) AS pending_fee_count
        FROM (

    /* =========================
       REGULAR PLAYERS
       ========================= */

    SELECT DISTINCT p.player_id
    FROM tbl_players p
    WHERE p.is_active = TRUE
      AND p.fee_type = 'Regular Fee'
      AND p.regular_fee >= 0
      AND p.admission_date <= CURRENT_DATE

      -- Paid/covered last month
      AND (
          -- First month payment was stored in tbl_players
          (
              DATE_TRUNC('month', p.admission_date) =
                  DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
              AND p.fee_status = 'Paid'
          )

          OR

          -- Subsequent month payment was stored in tbl_player_fees
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

      -- Has NOT paid this month
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


    /* =========================
       PLAYERS FROM FEE TABLE
       ========================= */

    SELECT DISTINCT pf_last.player_id
    FROM tbl_player_fees pf_last
    WHERE pf_last.status = 'Paid'
      AND pf_last.is_active = TRUE

      -- Paid last month
      AND pf_last.payment_date >=
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      AND pf_last.payment_date <
          DATE_TRUNC('month', CURRENT_DATE)

      -- Has NOT paid this month
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


    UNION


    /* =========================
       ONE-ON-ONE PLAYERS
       ========================= */

        SELECT DISTINCT last_month.player_id
        FROM tbl_one_on_one_applications last_month
        WHERE last_month.is_active = TRUE
          AND last_month.payment_status = 'Paid'

          -- Paid last month
        AND last_month.application_date >=
              DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
        AND last_month.application_date <
              DATE_TRUNC('month', CURRENT_DATE)

          -- Has NOT paid this month
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

          ) AS pending_players

          ) AS pending_fees,



        (

          SELECT COALESCE(SUM(regular_amount), 0)
          FROM (

            SELECT
              COALESCE(pf.amount, 0) AS regular_amount
            FROM tbl_player_fees pf
            WHERE pf.status = 'Paid'
              AND DATE_TRUNC('month', pf.payment_date)
                  = DATE_TRUNC('month', CURRENT_DATE)

            UNION ALL

            SELECT
              COALESCE(p.regular_fee, 0) AS regular_amount
            FROM tbl_players p
            WHERE p.regular_fee > 0
              AND DATE_TRUNC('month', p.admission_date)
                  = DATE_TRUNC('month', CURRENT_DATE)

          ) AS regular_revenue_data

        ) AS regular_revenue,


        (
          SELECT COALESCE(SUM(fee_amount), 0)

          FROM tbl_one_on_one_applications

          WHERE DATE_TRUNC('month', application_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS one_on_one_revenue,


        (
        SELECT COALESCE(
          SUM(total_amount),
          0
        )
        FROM tbl_ground_booking
        WHERE status IN ('Confirmed', 'Completed')
          AND DATE_TRUNC('month', booking_date)
              = DATE_TRUNC('month', CURRENT_DATE)
      ) AS ground_revenue,


        (
          SELECT COALESCE(SUM(net_salary), 0)

          FROM tbl_employee_salary

          WHERE DATE_TRUNC('month', payment_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS salary_expense,


        (
          SELECT COALESCE(SUM(amount), 0)

          FROM tbl_expenditure

          WHERE DATE_TRUNC('month', expenditure_date)
                = DATE_TRUNC('month', CURRENT_DATE)

        ) AS total_expenditure,


        (
          SELECT COALESCE(SUM(amount), 0)
          FROM (

            SELECT amount
            FROM tbl_player_fees
            WHERE status = 'Paid'
              AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

            UNION ALL

            SELECT regular_fee
            FROM tbl_players
            WHERE regular_fee > 0
              AND admission_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND admission_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

            UNION ALL

            SELECT fee_amount
            FROM tbl_one_on_one_applications
            WHERE application_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND application_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

            UNION ALL

            SELECT total_amount
            FROM tbl_ground_booking
            WHERE status = 'Confirmed'
              AND booking_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND booking_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

            UNION ALL

            SELECT -net_salary
            FROM tbl_employee_salary
            WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

            UNION ALL

            SELECT -amount
            FROM tbl_expenditure
            WHERE expenditure_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND expenditure_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

          ) revenue
          ) AS monthly_revenue
        `;


    const [
      statisticsResult,
      revenueResult
    ] = await Promise.all([
      pool.query(statisticsQuery),
      pool.query(revenueQuery),
    ]);


    const stats = statisticsResult.rows[0];
    const revenue = revenueResult.rows[0];


    return sendSuccessResponse(
      res,
      200,
      "Dashboard statistics fetched successfully.",
      {
        total_players: Number(
          stats.total_players
        ),

        active_players: Number(
          stats.active_players
        ),

        trainers: Number(
          stats.total_trainers
        ),

        pending_fees: Number(
          revenue.pending_fees
        ),

        ground_bookings: Number(
          stats.ground_bookings
        ),

        approvals: Number(
          stats.approvals
        ),

        monthly_revenue: Number(
          revenue.monthly_revenue
        ),

        regular_revenue: Number(
          revenue.regular_revenue
        ),

        one_on_one_revenue: Number(
          revenue.one_on_one_revenue
        ),

        ground_revenue: Number(
          revenue.ground_revenue
        ),

        salary_expense: Number(
          revenue.salary_expense
        ),

        total_expenditure: Number(
          revenue.total_expenditure
        ),
      }
    );

  } catch (error) {

    console.error(
      "Dashboard Error:",
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

exports.getDashboardCharts = async (req, res) => {
  try {
    const [playerGrowth, feeCollection, attendance] = await Promise.all([

      // =========================================
      // Player Growth Chart
      // =========================================

      pool.query(`
        WITH months AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (
                INTERVAL '1 month'
                * generate_series(5, 0, -1)
              ) AS month_date

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


      // =========================================
      // Fee Collection
      // =========================================

      pool.query(`
        SELECT

          /* =====================================
             PENDING FEES - PLAYER COUNT
             ===================================== */

          (
            SELECT COUNT(*)

            FROM (

              /* =========================
                 REGULAR PLAYERS
                 ========================= */

              SELECT DISTINCT p.player_id

              FROM tbl_players p

              WHERE p.is_active = TRUE
                AND p.fee_type = 'Regular Fee'
                AND p.regular_fee >= 0
                AND p.admission_date <= CURRENT_DATE

                /* =========================
                   PAID / COVERED LAST MONTH
                   ========================= */

                AND (
                  /* First month payment stored in tbl_players */

                  (
                    DATE_TRUNC(
                      'month',
                      p.admission_date
                    ) =
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) - INTERVAL '1 month'

                    AND p.fee_status = 'Paid'
                  )

                  OR

                  /* Subsequent month payment stored in tbl_player_fees */

                  EXISTS (
                    SELECT 1

                    FROM tbl_player_fees pf_last

                    WHERE pf_last.player_id = p.player_id
                      AND pf_last.status = 'Paid'
                      AND pf_last.is_active = TRUE

                      AND pf_last.payment_date >=
                          DATE_TRUNC(
                            'month',
                            CURRENT_DATE
                          ) - INTERVAL '1 month'

                      AND pf_last.payment_date <
                          DATE_TRUNC(
                            'month',
                            CURRENT_DATE
                          )
                  )
                )

                /* =========================
                   HAS NOT PAID THIS MONTH
                   ========================= */

                AND NOT EXISTS (
                  SELECT 1

                  FROM tbl_player_fees pf_current

                  WHERE pf_current.player_id = p.player_id
                    AND pf_current.status = 'Paid'
                    AND pf_current.is_active = TRUE

                    AND pf_current.payment_date >=
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        )

                    AND pf_current.payment_date <
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        ) + INTERVAL '1 month'
                )


              UNION


              /* =========================
                 PLAYERS FROM FEE TABLE
                 ========================= */

              SELECT DISTINCT pf_last.player_id

              FROM tbl_player_fees pf_last

              WHERE pf_last.status = 'Paid'
                AND pf_last.is_active = TRUE

                /* Paid last month */

                AND pf_last.payment_date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) - INTERVAL '1 month'

                AND pf_last.payment_date <
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )

                /* Has NOT paid this month */

                AND NOT EXISTS (
                  SELECT 1

                  FROM tbl_player_fees pf_current

                  WHERE pf_current.player_id =
                        pf_last.player_id

                    AND pf_current.status = 'Paid'
                    AND pf_current.is_active = TRUE

                    AND pf_current.payment_date >=
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        )

                    AND pf_current.payment_date <
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        ) + INTERVAL '1 month'
                )


              UNION


              /* =========================
                 ONE-ON-ONE PLAYERS
                 ========================= */

              SELECT DISTINCT last_month.player_id

              FROM tbl_one_on_one_applications last_month

              WHERE last_month.is_active = TRUE
                AND last_month.payment_status = 'Paid'

                /* Paid last month */

                AND last_month.application_date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) - INTERVAL '1 month'

                AND last_month.application_date <
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )

                /* Has NOT paid this month */

                AND NOT EXISTS (
                  SELECT 1

                  FROM tbl_one_on_one_applications this_month

                  WHERE this_month.player_id =
                        last_month.player_id

                    AND this_month.is_active = TRUE
                    AND this_month.payment_status = 'Paid'

                    AND this_month.application_date >=
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        )

                    AND this_month.application_date <
                        DATE_TRUNC(
                          'month',
                          CURRENT_DATE
                        ) + INTERVAL '1 month'
                )

            ) AS pending_players

          ) AS pending,


          /* =====================================
             PAID FEES - CURRENT MONTH
             ===================================== */

          (
            SELECT COUNT(
              DISTINCT paid_players.player_id
            )

            FROM (

              /* =========================
                 REGULAR PLAYERS
                 ========================= */

              SELECT DISTINCT p.player_id

              FROM tbl_players p

              WHERE p.is_active = TRUE
                AND p.fee_type = 'Regular Fee'
                AND p.regular_fee >= 0
                AND p.admission_date <= CURRENT_DATE

                /* Paid this month */

                AND (
                  /* First month payment stored in tbl_players */

                  (
                    DATE_TRUNC(
                      'month',
                      p.admission_date
                    ) =
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )

                    AND p.fee_status = 'Paid'
                  )

                  OR

                  /* Payment stored in tbl_player_fees */

                  EXISTS (
                    SELECT 1

                    FROM tbl_player_fees pf_current

                    WHERE pf_current.player_id =
                          p.player_id

                      AND pf_current.status = 'Paid'
                      AND pf_current.is_active = TRUE

                      AND pf_current.payment_date >=
                          DATE_TRUNC(
                            'month',
                            CURRENT_DATE
                          )

                      AND pf_current.payment_date <
                          DATE_TRUNC(
                            'month',
                            CURRENT_DATE
                          ) + INTERVAL '1 month'
                  )
                )


              UNION


              /* =========================
                 PLAYERS FROM FEE TABLE
                 ========================= */

              SELECT DISTINCT pf_current.player_id

              FROM tbl_player_fees pf_current

              WHERE pf_current.status = 'Paid'
                AND pf_current.is_active = TRUE

                /* Paid this month */

                AND pf_current.payment_date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )

                AND pf_current.payment_date <
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) + INTERVAL '1 month'


              UNION


              /* =========================
                 ONE-ON-ONE PLAYERS
                 ========================= */

              SELECT DISTINCT this_month.player_id

              FROM tbl_one_on_one_applications this_month

              WHERE this_month.is_active = TRUE
                AND this_month.payment_status = 'Paid'

                /* Paid this month */

                AND this_month.application_date >=
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )

                AND this_month.application_date <
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    ) + INTERVAL '1 month'

            ) AS paid_players

          ) AS paid;

      `),


      // =========================================
      // Weekly Attendance Chart
      // =========================================

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

          WHERE ta.payroll_date >=
                CURRENT_DATE - INTERVAL '5 days'

            AND ta.payroll_date <= CURRENT_DATE

            AND p.is_active = TRUE

          GROUP BY
            ta.payroll_date

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
                  COALESCE(
                    ad.present,
                    0
                  )::numeric
                  /
                  NULLIF(
                    tp.total,
                    0
                  )
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
                    COALESCE(
                      ad.present,
                      0
                    )::numeric
                    /
                    NULLIF(
                      tp.total,
                      0
                    )
                  ) * 100
                )
              )
            ),
            0
          )::INT AS absent_percentage

        FROM days d

        CROSS JOIN total_players tp

        LEFT JOIN attendance_data ad
          ON ad.payroll_date =
             d.attendance_date

        ORDER BY
          d.attendance_date;

      `)

    ]);


    // =========================================
    // Response
    // =========================================

    return sendSuccessResponse(
      res,
      200,
      "Dashboard charts fetched successfully.",
      {
        player_growth: playerGrowth.rows,

        fee_collection: {
          collected: Number(
            feeCollection.rows[0].paid
          ),

          pending: Number(
            feeCollection.rows[0].pending
          ),
        },

        attendance: attendance.rows,
      },
    );

  } catch (error) {

    console.error(
      "Dashboard Charts Error:",
      error
    );

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Failed to fetch dashboard charts.",
    );
  }
};

exports.getDashboardRevenueAndActivities = async (req, res) => {
  try {
    const [revenueTrend, activities] = await Promise.all([

      // =========================================
      // Revenue Trend - Last 6 Months
      // Net Revenue
      // =========================================

      pool.query(`
        WITH months AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (
                INTERVAL '1 month'
                * generate_series(5, 0, -1)
              ) AS month_date

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

          SELECT
            amount,
            payment_date AS transaction_date

          FROM tbl_player_fees

          WHERE status = 'Paid'

          UNION ALL

          SELECT
            regular_fee AS amount,
            admission_date AS transaction_date

          FROM tbl_players

          WHERE regular_fee > 0


          UNION ALL

          SELECT
            fee_amount AS amount,
            application_date AS transaction_date

          FROM tbl_one_on_one_applications

          UNION ALL

          SELECT
            total_amount AS amount,
            booking_date AS transaction_date

          FROM tbl_ground_booking

          WHERE status = 'Confirmed'

          UNION ALL

          SELECT
            -net_salary AS amount,
            payment_date AS transaction_date

          FROM tbl_employee_salary


          UNION ALL

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
          AND action IN (
            'Confirmed',
            'Cancelled'
          )
        )

        ORDER BY
          created_at DESC

        LIMIT 4;
      `),
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Revenue trend and activities fetched successfully.",
      {
        revenue_trend: revenueTrend.rows.map((row) => ({
          month: row.month,
          revenue: Number(row.revenue),
        })),

        recent_activities: activities.rows.map((row) => ({
          type: row.module_name,
          action: row.action,
          message: row.description,
          performed_by: row.performed_by,
          created_at: row.created_at,
        })),
      },
    );

  } catch (error) {

    console.error(
      "Revenue Trend Error:",
      error
    );

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Failed to fetch dashboard data.",
    );
  }
};
