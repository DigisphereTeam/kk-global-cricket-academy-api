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
          COALESCE(SUM(latest_fee.amount), 0) AS pending_fees

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

          AND pf2.payment_date >= DATE_TRUNC(
            'month',
            CURRENT_DATE
          )

          AND pf2.payment_date < DATE_TRUNC(
            'month',
            CURRENT_DATE
          ) + INTERVAL '1 month'

        )
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


      // Current Month Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(amount),0) AS monthly_revenue

        FROM (

          SELECT
            admission_fee AS amount,
            created_at
          FROM tbl_players


          UNION ALL


          SELECT
            fee_amount AS amount,
            created_at
          FROM tbl_one_on_one_applications


          UNION ALL


          SELECT
            total_amount AS amount,
            created_at
          FROM tbl_ground_booking

        ) revenue

        WHERE DATE_TRUNC('month', created_at)
        =
        DATE_TRUNC('month', CURRENT_DATE)
      `),



      // Regular Player Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(admission_fee),0) AS regular_revenue
        FROM tbl_players
      `),



      // One On One Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(fee_amount),0) AS one_on_one_revenue
        FROM tbl_one_on_one_applications
      `),



      // Ground Revenue
      pool.query(`
        SELECT
          COALESCE(SUM(total_amount),0) AS ground_revenue
        FROM tbl_ground_booking
      `),



      // Salary Expense
      pool.query(`
        SELECT
          COALESCE(SUM(net_salary),0) AS salary_expense
        FROM tbl_employee_salary
      `),



      // Other Expenditure
      pool.query(`
        SELECT
          COALESCE(SUM(amount),0) AS total_expenditure
        FROM tbl_expenditure
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
            - (INTERVAL '1 month' * generate_series(5,0,-1))
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

            DATE_TRUNC(
              'month',
              CURRENT_DATE
            ) AS start_date,


            DATE_TRUNC(
              'month',
              CURRENT_DATE
            ) + INTERVAL '1 month'
            AS end_date

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


          -- Paid this month

          COALESCE(

            SUM(
              CASE

                WHEN pf.status='Paid'
                AND pf.payment_date >= cm.start_date
                AND pf.payment_date < cm.end_date

                THEN pf.amount

                ELSE 0

              END
            ),

            0

          ) AS collected,



          -- Pending this month

          COALESCE(

            SUM(

              CASE

                WHEN NOT EXISTS (

                  SELECT 1

                  FROM tbl_player_fees paid

                  WHERE paid.player_id = p.player_id

                  AND paid.status='Paid'

                  AND paid.payment_date >= cm.start_date

                  AND paid.payment_date < cm.end_date

                )

                THEN lpf.amount

                ELSE 0

              END

            ),

            0

          ) AS pending



        FROM tbl_players p


        LEFT JOIN latest_player_fee lpf

        ON lpf.player_id = p.player_id


        LEFT JOIN tbl_player_fees pf

        ON pf.player_id = p.player_id


        CROSS JOIN current_month cm;

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


      // Revenue Trend - Last 6 Months
      pool.query(`
        WITH months AS (

          SELECT
            DATE_TRUNC('month', CURRENT_DATE)
            - (INTERVAL '1 month' * generate_series(5,0,-1))
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

          -- Player Fees Revenue
          SELECT
            amount,
            payment_date AS transaction_date

          FROM tbl_player_fees

          WHERE status = 'Paid'


          UNION ALL


          -- One On One Revenue
          SELECT
            fee_amount AS amount,
            created_at::date AS transaction_date

          FROM tbl_one_on_one_applications



          UNION ALL


          -- Ground Booking Revenue
          SELECT
            total_amount AS amount,
            booking_date AS transaction_date

          FROM tbl_ground_booking

          WHERE status != 'Cancelled'



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

        revenue_trend:
          revenueTrend.rows.map(row => ({
            month: row.month,
            revenue: Number(row.revenue)
          })),


        recent_activities:
          activities.rows.map(row => ({

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