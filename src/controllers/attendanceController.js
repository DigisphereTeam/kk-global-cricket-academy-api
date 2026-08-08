const axios = require("axios");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const pool = require("../config/dbConfig");
const { getTokenExpiry, getAccessToken, setAccessToken, setTokenExpiry } = require("../utils/petpoojaToken");

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

    // Sync latest attendance from PetPooja
    try {
      await syncAttendanceData(date);
    } catch (error) {
      console.error("Attendance sync failed:", error.message);
      // Continue fetching attendance from DB
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

              ORDER BY p.full_name, l.punch_time;
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

              ORDER BY c.full_name, l.punch_time;
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

              ORDER BY s.full_name, l.punch_time;
      `;
    }

    const result = await pool.query(query, [date]);

    const attendanceMap = new Map();

    for (const row of result.rows) {
      if (!attendanceMap.has(row.id)) {
        const employeeRows = result.rows.filter(
          (item) => item.id === row.id
        );

        // Get all IN punches for this employee
        const inPunches = employeeRows.filter(
          (item) =>
            item.punch_type &&
            item.punch_type.toLowerCase() === "in"
        );

        let batch = "One-to-One";
        let session = 0;

        /*
          Regular Morning:
          Original: 06:00 AM - 08:00 AM
          Buffer: 25 minutes BEFORE start

          Final: 05:35 AM - 08:00 AM

          Regular Evening:
          Original: 04:30 PM - 06:30 PM
          Buffer: 25 minutes BEFORE start

          Final: 04:05 PM - 06:30 PM
        */

        const regularMorningStart = 5 * 60 + 35; // 05:35 AM
        const regularMorningEnd = 8 * 60;         // 08:00 AM

        // const regularEveningStart = 15 * 60 + 20; // 03:20 PM - testing
        const regularEveningStart = 16 * 60 + 5; // 04:05 PM - production
        const regularEveningEnd = 18 * 60 + 30;   // 06:30 PM

        let regularSession = null;

        for (const punch of inPunches) {
          if (!punch.punch_time) continue;

          // PetPooja gives UTC timestamp, convert to IST
          const punchDate = new Date(punch.punch_time);

          const istTime = punchDate.toLocaleTimeString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour12: false,
          });

          const [hours, minutes, seconds = 0] =
            istTime.split(":").map(Number);

          const punchMinutes =
            hours * 60 + minutes + seconds / 60;

          console.log(
            `Employee: ${row.name}, UTC: ${punch.punch_time}, IST: ${istTime}`
          );

          if (
            punchMinutes >= regularMorningStart &&
            punchMinutes <= regularMorningEnd
          ) {
            regularSession = "Morning";
            break;
          }

          if (
            punchMinutes >= regularEveningStart &&
            punchMinutes <= regularEveningEnd
          ) {
            regularSession = "Evening";
            break;
          }
        }

        if (regularSession) {
          batch = "Regular";
          session = regularSession;
        } else {
          batch = "One-to-One";
          session = inPunches.length;
        }

        attendanceMap.set(row.id, {
          id: row.attendance_id,
          attendance_id: row.id,
          employee_type,
          code: row.code,
          name: row.name,
          date,
          batch,
          session,
          attendance_status: row.attendance_id
            ? "Present"
            : "Absent"
        });
      }
    }

    const data = Array.from(attendanceMap.values());

    const statistics = {
      present_today: data.filter(
        (item) => item.attendance_status === "Present"
      ).length,

      absent_today: data.filter(
        (item) => item.attendance_status === "Absent"
      ).length,

      late_today: 0,
      on_leave: 0,
    };

    return sendSuccessResponse(
      res,
      200,
      "Attendance fetched successfully.",
      {
        statistics,
        attendance: data,
      }
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

exports.getMonthlyAttendanceSummary = async (req, res) => {
  const now = new Date();

  const year = req.query.year
    ? Number(req.query.year)
    : now.getFullYear();

  const { employee_type, employee_id } = req.query;

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

    if (!employee_id) {
      return sendErrorResponse(res, 400, "Employee ID is required.");
    }

    let employeeCodeQuery = "";

    if (employee_type === "Player") {
      employeeCodeQuery = `
        SELECT admission_id AS employee_code
        FROM tbl_players
        WHERE player_id = $1
  `;
    }

    if (employee_type === "Coach") {
      employeeCodeQuery = `
        SELECT coach_code AS employee_code
        FROM tbl_coach
        WHERE coach_id = $1
  `;
    }

    if (employee_type === "Staff") {
      employeeCodeQuery = `
        SELECT staff_code AS employee_code
        FROM tbl_staff
        WHERE staff_id = $1
  `;
    }

    const employeeResult = await pool.query(employeeCodeQuery, [employee_id]);

    if (employeeResult.rowCount === 0) {
      return sendErrorResponse(res, 404, "Employee not found.");
    }

    const employeeCode = employeeResult.rows[0].employee_code;

    // Show months from January to current month if current year,
    // otherwise show all 12 months.
    const currentYear = now.getFullYear();
    const lastMonth =
      year === currentYear ? now.getMonth() + 1 : 12;

    const attendanceResult = await pool.query(
      `
      WITH months AS(
    SELECT generate_series(1, $3:: int) AS month_number
  ),
  attendance AS(
    SELECT
              EXTRACT(MONTH FROM payroll_date):: int AS month_number,
    COUNT(DISTINCT payroll_date) AS working_days,
    COUNT(DISTINCT payroll_date) AS present
          FROM tbl_attendance
          WHERE employee_code = $1
            AND EXTRACT(YEAR FROM payroll_date) = $2
          GROUP BY EXTRACT(MONTH FROM payroll_date)
  )

SELECT
m.month_number,
  TRIM(
    TO_CHAR(
      TO_DATE(m.month_number:: text, 'MM'),
      'Month'
    )
  ) AS month,
    COALESCE(a.working_days, 0) AS working_days,
      COALESCE(a.present, 0) AS present,
        0 AS absent,
          0 AS leave,
            0 AS late,
              CASE
            WHEN COALESCE(a.working_days, 0) = 0 THEN 0
            ELSE ROUND(
                (a.present:: numeric / a.working_days) * 100,
  0
            )
          END AS attendance_percentage
      FROM months m
      LEFT JOIN attendance a
        ON m.month_number = a.month_number
      ORDER BY m.month_number;
`,
      [employeeCode, year, lastMonth]
    );

    const monthlyData = attendanceResult.rows;

    const statistics = monthlyData.reduce(
      (acc, month) => {
        acc.present += Number(month.present);
        acc.absent += Number(month.absent);
        acc.late += Number(month.late);

        acc.totalWorkingDays += Number(month.working_days);

        return acc;
      },
      {
        present: 0,
        absent: 0,
        late: 0,
        totalWorkingDays: 0,
      }
    );

    statistics.attendance_percentage =
      statistics.totalWorkingDays > 0
        ? Math.round(
          (statistics.present / statistics.totalWorkingDays) * 100
        )
        : 0;

    return sendSuccessResponse(
      res,
      200,
      "Monthly attendance fetched successfully.",
      {
        statistics: {
          present: statistics.present,
          absent: statistics.absent,
          late: statistics.late,
          attendance_percentage: `${statistics.attendance_percentage}% `,
        },
        monthly_attendance: monthlyData,
      }
    );

  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch monthly attendance."
    );
  }
};

exports.syncAttendanceForCron = async (date) => {
  try {
    const syncDate =
      date ||
      new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });

    const syncedCount = await syncAttendanceData(syncDate);

    if (syncedCount === 0) {
      console.log(
        `Attendance cron: No attendance records found for ${syncDate}.`
      );

      return {
        success: true,
        synced_records: 0,
        date: syncDate,
      };
    }

    return {
      success: true,
      synced_records: syncedCount,
      date: syncDate,
    };
  } catch (error) {
    console.error(
      "Attendance cron sync failed:",
      error.response?.data || error.message
    );

    throw error;
  }
};

exports.syncAttendance = async (req, res) => {
  try {
    const today = req.query.date
      ? req.query.date
      : new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });

    const syncedCount = await syncAttendanceData(today);

    if (syncedCount === 0) {
      return sendSuccessResponse(
        res,
        200,
        "No attendance records found.",
        []
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Attendance synced successfully.",
      { synced_records: syncedCount }
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

exports.getAttendanceTimeline = async (req, res) => {
  const {
    employee_type,
    employee_id,
    from_date,
    to_date,
  } = req.query;

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

    if (!employee_id) {
      return sendErrorResponse(
        res,
        400,
        "Employee ID is required."
      );
    }

    if (isNaN(employee_id)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid Employee ID."
      );
    }

    /*
     * ============================================================
     * DATE RANGE
     * ============================================================
     *
     * If dates are not provided:
     * from_date = first day of current month
     * to_date   = today
     *
     * If dates are provided:
     * use the provided date range.
     */

    const now = new Date();

    const today = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    let fromDate;
    let toDate;

    if (!from_date && !to_date) {
      // First day of current month
      const currentMonthStart = new Date(
        now.toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        })
      );

      currentMonthStart.setDate(1);

      fromDate = currentMonthStart.toLocaleDateString(
        "en-CA",
        {
          timeZone: "Asia/Kolkata",
        }
      );

      toDate = today;
    } else {
      // If one is provided, both are required
      if (!from_date || !to_date) {
        return sendErrorResponse(
          res,
          400,
          "Both from_date and to_date are required."
        );
      }

      // Validate date format
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(from_date) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to_date)
      ) {
        return sendErrorResponse(
          res,
          400,
          "Invalid date format. Use YYYY-MM-DD."
        );
      }

      fromDate = from_date;
      toDate = to_date;
    }

    // Validate date range
    if (fromDate > toDate) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    // Don't allow future to_date
    if (toDate > today) {
      return sendErrorResponse(
        res,
        400,
        "To date cannot be a future date."
      );
    }

    /*
     * ============================================================
     * GET EMPLOYEE CODE
     * ============================================================
     */

    let employeeCodeQuery = "";

    if (employee_type === "Player") {
      employeeCodeQuery = `
        SELECT admission_id AS employee_code
        FROM tbl_players
        WHERE player_id = $1
  `;
    }

    if (employee_type === "Coach") {
      employeeCodeQuery = `
        SELECT coach_code AS employee_code
        FROM tbl_coach
        WHERE coach_id = $1
  `;
    }

    if (employee_type === "Staff") {
      employeeCodeQuery = `
        SELECT staff_code AS employee_code
        FROM tbl_staff
        WHERE staff_id = $1
  `;
    }

    const employee = await pool.query(
      employeeCodeQuery,
      [employee_id]
    );

    if (employee.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee not found."
      );
    }

    const employeeCode =
      employee.rows[0].employee_code;

    /*
     * ============================================================
     * ATTENDANCE TIMELINE
     * ============================================================
     */

    const result = await pool.query(
      `
      WITH dates AS(
    SELECT generate_series(
      $2:: date,
      $3:: date,
      interval '1 day'
    ):: date AS attendance_date
  )

SELECT
d.attendance_date AS payroll_date,
  a.attendance_id,

  MIN(
    CASE
            WHEN LOWER(l.punch_type) = 'in'
            THEN l.punch_time
          END
  ) AS time_in,

    MAX(
      CASE
            WHEN LOWER(l.punch_type) = 'out'
            THEN l.punch_time
          END
    ) AS time_out

      FROM dates d

      LEFT JOIN tbl_attendance a
        ON a.employee_code = $1
        AND a.payroll_date = d.attendance_date

      LEFT JOIN tbl_attendance_logs l
        ON l.attendance_id = a.attendance_id

      GROUP BY
d.attendance_date,
  a.attendance_id

      ORDER BY
d.attendance_date DESC;
`,
      [
        employeeCode,
        fromDate,
        toDate,
      ]
    );

    /*
     * ============================================================
     * FORMAT RESPONSE
     * ============================================================
     */

    const attendance = result.rows.map((row) => {
      let status;
      let remarks;
      let marked_by = "-";

      if (row.attendance_id) {
        status = "Present";
        remarks = "On Time";
        marked_by = "Coach";

        if (
          row.time_in &&
          row.time_in > "09:00:00"
        ) {
          status = "Late";
          remarks = "Late Entry";
        }
      } else if (row.payroll_date === today) {
        status = "Pending";
        remarks = "Attendance Yet to be Marked";
      } else {
        status = "Absent";
        remarks = "Not Attended";
      }

      return {
        attendance_id: row.attendance_id,
        date: row.payroll_date,
        session: "Morning",
        status,
        time_in: row.time_in || "-",
        time_out: row.time_out || "-",
        marked_by,
        remarks,
      };
    });

    return sendSuccessResponse(
      res,
      200,
      "Attendance timeline fetched successfully.",
      {
        from_date: fromDate,
        to_date: toDate,
        employee_type,
        employee_id: Number(employee_id),
        attendance,
      }
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Failed to fetch attendance timeline."
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

const syncAttendanceData = async (date) => {
  let accessToken = getAccessToken();
  if (
    !accessToken ||
    !getTokenExpiry() ||
    new Date() >= getTokenExpiry()
  ) {
    const tokenResponse = await axios.post(
      process.env.PETPOOJA_TOKEN_URL,
      {
        client_id: process.env.PETPOOJA_CLIENT_ID,
        client_secret: process.env.PETPOOJA_CLIENT_SECRET,
      }
    );

    accessToken =
      tokenResponse.data?.data?.access_token ||
      tokenResponse.data?.access_token;

    const expiresIn =
      tokenResponse.data?.data?.access_token_expire_in || 900;

    setAccessToken(accessToken);
    setTokenExpiry(
      new Date(Date.now() + (expiresIn - 30) * 1000)
    );
  }

  if (!accessToken) {
    throw new Error("Failed to retrieve access token.");
  }

  const punchesResponse = await axios({
    method: "GET",
    url: process.env.PETPOOJA_PUNCHES_URL,
    headers: {
      Authorization: `Bearer ${accessToken} `,
      "Content-Type": "application/json",
    },
    data: {
      payroll_date: date,
    },
  });

  const punchData = punchesResponse.data?.data?.punch_data || [];

  if (punchData.length > 0) {
    await syncPetpoojaAttendance(punchData);
  }

  return punchData.length;
};

