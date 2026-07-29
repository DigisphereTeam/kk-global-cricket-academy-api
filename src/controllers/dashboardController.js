const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {
    const [
      students,
      trainers,
      groundBookings,
      upcomingEvents
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total_students
        FROM tbl_students
      `),
      pool.query(`
        SELECT COUNT(*) AS total_trainers
        FROM tbl_coach
      `),
      pool.query(`
        SELECT COUNT(*) AS ground_bookings
        FROM tbl_ground_booking
      `),
      pool.query(`
        SELECT COUNT(*) AS upcoming_events
        FROM tbl_events
        WHERE LOWER(status) = 'upcoming'
      `)
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Dashboard statistics fetched successfully.",
      {
        total_students: Number(students.rows[0].total_students),
        active_students: 0,
        trainers: Number(trainers.rows[0].total_trainers),
        pending_fees: 0,
        ground_bookings: Number(groundBookings.rows[0].ground_bookings),
        upcoming_events: Number(upcomingEvents.rows[0].upcoming_events),
        attendance: 0,
        approvals: 0
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};