const axios = require("axios");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const pool = require("../config/dbConfig");

exports.getAttendance = async (req, res) => {
  const now = new Date();

  const date = req.query.date
    ? req.query.date
    : now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

  const { employee_type } = req.query;

  try {
    if (
      !employee_type ||
      !["Player", "Coach", "Staff"].includes(employee_type)
    ) {
      return sendErrorResponse(
        res,
        400,
        "Employee type must be Player, Coach or Staff."
      );
    }

    let query = "";

    if (employee_type === "Player") {
      query = `
        SELECT
          p.player_id AS id,
          p.admission_id AS code,
          p.full_name AS name,

          a.attendance_id,
          a.payroll_date,

          l.punch_type,
          l.punch_time,
          l.branch_name,
          l.device_id

        FROM tbl_players p

        LEFT JOIN tbl_attendance a
          ON a.employee_code = p.admission_id
          AND a.payroll_date = $1

        LEFT JOIN tbl_attendance_logs l
          ON l.attendance_id = a.attendance_id

        ORDER BY
          p.full_name,
          l.punch_time;
      `;
    }

    if (employee_type === "Coach") {
      query = `
        SELECT
          c.coach_id AS id,
          c.coach_code AS code,
          c.full_name AS name,

          a.attendance_id,
          a.payroll_date,

          l.punch_type,
          l.punch_time,
          l.branch_name,
          l.device_id

        FROM tbl_coach c

        LEFT JOIN tbl_attendance a
          ON a.employee_code = c.coach_code
          AND a.payroll_date = $1

        LEFT JOIN tbl_attendance_logs l
          ON l.attendance_id = a.attendance_id

        ORDER BY
          c.full_name,
          l.punch_time;
      `;
    }

    if (employee_type === "Staff") {
      query = `
        SELECT
          s.staff_id AS id,
          s.staff_code AS code,
          s.full_name AS name,

          a.attendance_id,
          a.payroll_date,

          l.punch_type,
          l.punch_time,
          l.branch_name,
          l.device_id

        FROM tbl_staff s

        LEFT JOIN tbl_attendance a
          ON a.employee_code = s.staff_code
          AND a.payroll_date = $1

        LEFT JOIN tbl_attendance_logs l
          ON l.attendance_id = a.attendance_id

        ORDER BY
          s.full_name,
          l.punch_time;
      `;
    }

    const result = await pool.query(query, [date]);

    const attendanceMap = new Map();

    for (const row of result.rows) {
      if (!attendanceMap.has(row.id)) {
        attendanceMap.set(row.id, {
          id: row.id,
          code: row.code,
          name: row.name,
          attendance_status: row.attendance_id
            ? "Present"
            : "Absent",
          punch_details: [],
        });
      }

      if (row.punch_time) {
        attendanceMap.get(row.id).punch_details.push({
          punch_type: row.punch_type,
          punch_time: row.punch_time,
          branch_name: row.branch_name,
          device_id: row.device_id,
        });
      }
    }

    const data = Array.from(attendanceMap.values());

    return sendSuccessResponse(
      res,
      200,
      "Attendance fetched successfully.",
      data
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch attendance."
    );
  }
};

exports.syncAttendance = async (req, res) => {
  try {

    // Get Access Token

    const tokenResponse = await axios.post(
      process.env.PETPOOJA_TOKEN_URL,
      {
        client_id: process.env.PETPOOJA_CLIENT_ID,
        client_secret: process.env.PETPOOJA_CLIENT_SECRET,
      }
    );

    const accessToken =
      tokenResponse.data?.data?.access_token ||
      tokenResponse.data?.access_token;

    if (!accessToken) {
      return sendErrorResponse(
        res,
        400,
        "Failed to retrieve access token."
      );
    }

    // Today's date
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    // Fetch Punches
    const punchesResponse = await axios({
      method: "GET",
      url: process.env.PETPOOJA_PUNCHES_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: {
        payroll_date: today,
      },
    });

    const punchData =
      punchesResponse.data?.data?.punch_data || [];

    if (punchData.length === 0) {
      return sendSuccessResponse(
        res,
        200,
        "No attendance records found.",
        []
      );
    }

    const result = await syncPetpoojaAttendance(punchData);

    return sendSuccessResponse(
      res,
      200,
      "Attendance synced successfully.",
      result
    );

  } catch (error) {

    console.error(error.response?.data || error.message);

    return sendErrorResponse(
      res,
      error.response?.status || 500,
      error.response?.data?.message ||
      error.message ||
      "Failed to sync attendance."
    );
  }
};

const syncPetpoojaAttendance = async (punchData) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let attendanceCount = 0;
    let logCount = 0;

    for (const employee of punchData) {

      const attendanceResult = await client.query(
        `
        INSERT INTO tbl_attendance
        (
          employee_code,
          employee_name,
          payroll_date
        )
        VALUES
        (
          $1,
          $2,
          $3
        )
        ON CONFLICT
        (
          employee_code,
          payroll_date
        )
        DO UPDATE
        SET
          employee_name = EXCLUDED.employee_name,
          updated_at = CURRENT_TIMESTAMP
        RETURNING attendance_id;
        `,
        [
          employee.emp_id,
          employee.name,
          employee.payroll_date,
        ]
      );

      const attendanceId =
        attendanceResult.rows[0].attendance_id;

      attendanceCount++;

      for (const punch of employee.punch_detail) {

        const logResult = await client.query(
          `
          INSERT INTO tbl_attendance_logs
          (
            attendance_id,
            punch_type,
            punch_time,
            branch_name,
            device_id
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          ON CONFLICT
          (
            attendance_id,
            punch_time,
            punch_type
          )
          DO NOTHING
          RETURNING log_id;
          `,
          [
            attendanceId,
            punch.op,
            punch.log_date_time,
            punch.branch_name,
            punch.device_id,
          ]
        );

        if (logResult.rowCount > 0) {
          logCount++;
        }
      }
    }

    await client.query("COMMIT");

    return {
      attendance_records: attendanceCount,
      punch_logs: logCount,
    };

  } catch (error) {

    await client.query("ROLLBACK");
    throw error;

  } finally {

    client.release();
  }
};