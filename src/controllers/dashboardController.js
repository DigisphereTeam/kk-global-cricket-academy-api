const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");

exports.getDashboardStatistics = async (req, res) => {
  try {
    const [
      students,
      trainers,
      groundBookings
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
      `)
    ]);

    const [
      upcomingEventsCount,
      upcomingEvents,
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS upcoming_events
        FROM tbl_events
        WHERE LOWER(status) = 'upcoming'
      `),
      pool.query(`
        SELECT
          event_id,
          event_name,
          event_type,
          venue,
          event_date
        FROM tbl_events
        WHERE LOWER(status) = 'upcoming'
        ORDER BY event_date ASC
        LIMIT 3
      `),
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
        attendance: 0,
        approvals: 0,
        upcoming_events: Number(upcomingEventsCount.rows[0].upcoming_events),
        upcoming_events_list: upcomingEvents.rows,
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