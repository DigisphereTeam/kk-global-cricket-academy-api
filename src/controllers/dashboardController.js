const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {
    // First Promise.all - Counts & Status
    // const [
    //   players,
    //   // activePlayers,
    //   trainers,
    //   // pendingFees,
    //   groundBookings,
    //   approvals,
    // ] = await Promise.all([
    //   pool.query(`
    //     SELECT COUNT(*) AS total_players
    //     FROM tbl_players
    //   `),

    //   // pool.query(`
    //   //   SELECT COUNT(*) AS active_players
    //   //   FROM tbl_players
    //   //   WHERE status = 'Active'
    //   // `),

    //   pool.query(`
    //     SELECT COUNT(*) AS total_trainers
    //     FROM tbl_coach
    //   `),

    //   // pool.query(`
    //   //   SELECT COALESCE(SUM(remaining_amount), 0) AS pending_fees
    //   //   FROM tbl_player_fee
    //   // `),

    //   pool.query(`
    //     SELECT COUNT(*) AS ground_bookings
    //     FROM tbl_ground_booking
    //   `),

    //   pool.query(`
    //     SELECT COUNT(*) AS approvals
    //     FROM tbl_ground_booking
    //     WHERE status = 'Pending'
    //   `),
    // ]);

    // Second Promise.all - Revenue & Expenses
    // const [
    //   monthlyRevenue,
    //   regularRevenue,
    //   oneOnOneRevenue,
    //   groundRevenue,
    //   salaryExpense,
    //   totalExpenditure,
    // ] = await Promise.all([
    //   pool.query(`
    //     SELECT COALESCE(SUM(amount), 0) AS monthly_revenue
    //     FROM (
    //       SELECT admission_fee AS amount, created_at
    //       FROM tbl_players

    //       UNION ALL

    //       SELECT fee_amount AS amount, created_at
    //       FROM tbl_one_on_one_applications

    //       UNION ALL

    //       SELECT total_amount AS amount, created_at
    //       FROM tbl_ground_booking
    //     ) revenue
    //     WHERE DATE_TRUNC('month', created_at) =
    //           DATE_TRUNC('month', CURRENT_DATE)
    //   `),

    //   pool.query(`
    //     SELECT COALESCE(SUM(admission_fee), 0) AS regular_revenue
    //     FROM tbl_players
    //   `),

    //   pool.query(`
    //     SELECT COALESCE(SUM(fee_amount), 0) AS one_on_one_revenue
    //     FROM tbl_one_on_one_applications
    //   `),

    //   pool.query(`
    //     SELECT COALESCE(SUM(total_amount), 0) AS ground_revenue
    //     FROM tbl_ground_booking
    //   `),

    //   pool.query(`
    //     SELECT COALESCE(SUM(net_salary), 0) AS salary_expense
    //     FROM tbl_employee_salary
    //   `),

    //   pool.query(`
    //     SELECT COALESCE(SUM(amount), 0) AS total_expenditure
    //     FROM tbl_expenditure
    //   `),
    // ]);

    return sendSuccessResponse(
      res,
      200,
      "Dashboard statistics fetched successfully.",
      // {
      //   total_players: Number(players.rows[0].total_players),
      //   active_players: Number(activePlayers.rows[0].active_players),
      //   trainers: Number(trainers.rows[0].total_trainers),
      //   pending_fees: Number(pendingFees.rows[0].pending_fees),
      //   ground_bookings: Number(groundBookings.rows[0].ground_bookings),
      //   approvals: Number(approvals.rows[0].approvals),
      //   monthly_revenue: Number(monthlyRevenue.rows[0].monthly_revenue),
      //   regular_revenue: Number(regularRevenue.rows[0].regular_revenue),
      //   one_on_one_revenue: Number(oneOnOneRevenue.rows[0].one_on_one_revenue),
      //   ground_revenue: Number(groundRevenue.rows[0].ground_revenue),
      //   salary_expense: Number(salaryExpense.rows[0].salary_expense),
      //   total_expenditure: Number(totalExpenditure.rows[0].total_expenditure),
      // }
      {}
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};