const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.getNotifications = async (req, res) => {
  try {
    const userResult = await pool.query(
      `
      SELECT role
      FROM tbl_users
      WHERE user_id = $1
      `,
      [req.user.user_id]
    );

    // User not found
    if (userResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    const role = userResult.rows[0].role;

    let query = "";

    // =====================================
    // ADMIN
    // =====================================
    // ADMIN gets:
    // 1. Fee Due notifications
    // 2. Ground Booking Pending notifications
    // 3. Other notifications
    //
    // ADMIN does NOT get:
    // Ground Booking Confirmed
    // Ground Booking Cancelled
    // =====================================

    if (role === "ADMIN") {
      query = `
        SELECT *
        FROM tbl_notification_logs
        WHERE
          (
            module_name = 'Ground Booking'
            AND action = 'Pending'
          )
          OR
          (
            module_name = 'Fee Due'
          )
          OR
          (
            module_name <> 'Ground Booking'
            AND module_name <> 'Fee Due'
          )
        ORDER BY created_at DESC;
      `;
    }

    // =====================================
    // PRIMARY
    // =====================================
    // PRIMARY gets:
    // Ground Booking Confirmed
    // Ground Booking Cancelled
    // Fee Due
    // =====================================

    else if (role === "PRIMARY") {
      query = `
        SELECT *
        FROM tbl_notification_logs
        WHERE
          (
            module_name = 'Ground Booking'
            AND action IN ('Confirmed', 'Cancelled')
          )
          OR
          (
            module_name = 'Fee Due'
          )
        ORDER BY created_at DESC;
      `;
    }

    // =====================================
    // UNAUTHORIZED ROLE
    // =====================================

    else {
      return sendErrorResponse(
        res,
        403,
        "Unauthorized access."
      );
    }

    const result = await pool.query(query);

    return sendSuccessResponse(
      res,
      200,
      "Notifications fetched successfully.",
      result.rows
    );

  } catch (error) {
    console.error("Get Notifications Error:", error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.deleteNotification = async (req, res) => {
  const { log_id } = req.params;

  try {

    if (!log_id || isNaN(log_id)) {
      return sendErrorResponse(
        res,
        400,
        "Valid notification ID is required."
      );
    }

    const result = await pool.query(
      `
      DELETE FROM tbl_notification_logs
      WHERE log_id = $1
      RETURNING *
      `,
      [log_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Notification not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Notification deleted successfully.",
      result.rows[0]
    );

  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }
};