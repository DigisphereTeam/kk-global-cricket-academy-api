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

    try {
      await syncAttendanceData(date);
    } catch (error) {
      console.error(
        "Attendance sync failed:",
        error.message
      );

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

            ORDER BY
    p.full_name,
      l.punch_time;
    `;
    }

    // =========================
    // COACH
    // =========================
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

    // =========================
    // STAFF
    // =========================
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

    // =========================
    // EXECUTE QUERY
    // =========================
    const result = await pool.query(
      query,
      [date]
    );

    // =========================
    // ATTENDANCE MAP
    // =========================
    const attendanceMap = new Map();

    for (const row of result.rows) {
      // Skip if employee already processed
      if (attendanceMap.has(row.id)) {
        continue;
      }

      // =========================
      // GET ALL ROWS FOR EMPLOYEE
      // =========================
      const employeeRows = result.rows.filter(
        (item) => item.id === row.id
      );

      // =========================
      // GET ALL IN PUNCHES
      // =========================
      const inPunches = employeeRows.filter(
        (item) =>
          item.punch_type &&
          item.punch_type.toLowerCase() === "in"
      );

      // =========================
      // DEFAULT BATCH / SESSION
      // =========================
      let batch = "One-on-One";
      let session = 0;

      // =========================
      // REGULAR TIME SLOTS
      // =========================

      /*
       * REGULAR MORNING
       *
       * Actual: 06:00 AM - 08:00 AM
       * Buffer: 25 minutes before
       * Final: 05:35 AM - 08:00 AM
       */
      const regularMorningStart =
        5 * 60 + 35; // 05:35 AM

      const regularMorningEnd =
        8 * 60; // 08:00 AM

      /*
       * REGULAR EVENING
       *
       * Actual: 04:30 PM - 06:30 PM
       * Buffer: 25 minutes before
       * Final: 04:05 PM - 06:30 PM
       */
      const regularEveningStart =
        16 * 60 + 5; // 04:05 PM

      const regularEveningEnd =
        18 * 60 + 30; // 06:30 PM

      let regularSession = null;

      // =========================
      // CHECK ALL IN PUNCHES
      // =========================
      for (const punch of inPunches) {
        if (!punch.punch_time) {
          continue;
        }

        // PetPooja gives UTC timestamp
        // Convert to IST
        const punchDate =
          new Date(punch.punch_time);

        const istTime =
          punchDate.toLocaleTimeString(
            "en-GB",
            {
              timeZone: "Asia/Kolkata",
              hour12: false,
            }
          );

        const [
          hours,
          minutes,
          seconds = 0,
        ] = istTime
          .split(":")
          .map(Number);

        const punchMinutes =
          hours * 60 +
          minutes +
          seconds / 60;

        // =========================
        // REGULAR MORNING
        // =========================
        if (
          punchMinutes >=
          regularMorningStart &&
          punchMinutes <=
          regularMorningEnd
        ) {
          regularSession = "Morning";
          break;
        }

        // =========================
        // REGULAR EVENING
        // =========================
        if (
          punchMinutes >=
          regularEveningStart &&
          punchMinutes <=
          regularEveningEnd
        ) {
          regularSession = "Evening";
          break;
        }
      }

      // =========================
      // SET BATCH / SESSION
      // =========================
      if (regularSession) {
        batch = "Regular";
        session = regularSession;
      } else {
        batch = "One-on-One";
        session = inPunches.length;
      }

      // =========================
      // LATEST IN PUNCH
      // Used only for sorting
      // =========================
      let latestPunchIn = null;

      if (inPunches.length > 0) {
        latestPunchIn = inPunches.reduce(
          (latest, punch) => {
            const currentPunch =
              new Date(punch.punch_time);

            if (
              !latest ||
              currentPunch > latest
            ) {
              return currentPunch;
            }

            return latest;
          },
          null
        );
      }

      // =========================
      // CREATE EMPLOYEE RECORD
      // =========================
      attendanceMap.set(row.id, {
        // Employee ID
        id: row.attendance_id,

        // Attendance ID
        attendance_id:
          row.id,

        employee_type,

        code: row.code,

        name: row.name,

        date,

        batch,

        session,

        attendance_status:
          row.attendance_id
            ? "Present"
            : "Absent",

        // Internal field for sorting
        latest_punch_in:
          latestPunchIn,
      });
    }

    const data =
      Array.from(
        attendanceMap.values()
      ).sort((a, b) => {

        // Present employee first
        if (
          a.latest_punch_in &&
          !b.latest_punch_in
        ) {
          return -1;
        }

        if (
          !a.latest_punch_in &&
          b.latest_punch_in
        ) {
          return 1;
        }

        // Both have punch
        // Latest punch first
        if (
          a.latest_punch_in &&
          b.latest_punch_in
        ) {
          return (
            new Date(b.latest_punch_in) -
            new Date(a.latest_punch_in)
          );
        }

        // Both absent
        return a.name.localeCompare(
          b.name
        );
      });

    data.forEach((item) => {
      delete item.latest_punch_in;
    });

    const statistics = {
      present_today: data.filter(
        (item) =>
          item.attendance_status ===
          "Present"
      ).length,

      absent_today: data.filter(
        (item) =>
          item.attendance_status ===
          "Absent"
      ).length,

      late_today: 0,

      on_leave: 0,
    };

    // =========================
    // RESPONSE
    // =========================
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
      error.message ||
      "Failed to fetch attendance."
    );
  }
};


exports.getMonthlyAttendanceSummary = async (req, res) => {
  const now = new Date();

  const year = req.query.year
    ? Number(req.query.year)
    : now.getFullYear();

  const {
    employee_type,
    employee_id,
  } = req.query;

  try {
    // ============================================================
    // VALIDATE EMPLOYEE TYPE
    // ============================================================

    if (
      !employee_type ||
      !["Player", "Coach", "Staff"].includes(
        employee_type
      )
    ) {
      return sendErrorResponse(
        res,
        400,
        "Employee type must be Player, Coach or Staff."
      );
    }

    // ============================================================
    // VALIDATE EMPLOYEE ID
    // ============================================================

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

    // ============================================================
    // VALIDATE YEAR
    // ============================================================

    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid year."
      );
    }

    // ============================================================
    // GET EMPLOYEE DETAILS
    // ============================================================

    let employeeCodeQuery = "";

    // ============================================================
    // PLAYER
    // ============================================================

    if (employee_type === "Player") {
      employeeCodeQuery = `
        SELECT
          player_id AS employee_id,
          admission_id AS employee_code,
          full_name AS employee_name
        FROM tbl_players
        WHERE player_id = $1
      `;
    }

    // ============================================================
    // COACH
    // ============================================================

    if (employee_type === "Coach") {
      employeeCodeQuery = `
        SELECT
          coach_id AS employee_id,
          coach_code AS employee_code,
          full_name AS employee_name
        FROM tbl_coach
        WHERE coach_id = $1
      `;
    }

    // ============================================================
    // STAFF
    // ============================================================

    if (employee_type === "Staff") {
      employeeCodeQuery = `
        SELECT
          staff_id AS employee_id,
          staff_code AS employee_code,
          full_name AS employee_name
        FROM tbl_staff
        WHERE staff_id = $1
      `;
    }

    const employeeResult =
      await pool.query(
        employeeCodeQuery,
        [employee_id]
      );

    if (
      employeeResult.rowCount === 0
    ) {
      return sendErrorResponse(
        res,
        404,
        "Employee not found."
      );
    }

    const employee =
      employeeResult.rows[0];

    const employeeCode =
      employee.employee_code;

    // ============================================================
    // GET CURRENT DATE IN IST
    // ============================================================

    const istToday =
      now.toLocaleDateString(
        "en-CA",
        {
          timeZone:
            "Asia/Kolkata",
        }
      );

    const [
      currentYear,
      currentMonth,
    ] = istToday
      .split("-")
      .map(Number);

    // ============================================================
    // DETERMINE LAST MONTH
    //
    // Current year:
    // January -> current month
    //
    // Previous year:
    // January -> December
    //
    // Future year:
    // No months
    // ============================================================

    let lastMonth = 12;

    if (year === currentYear) {
      lastMonth = currentMonth;
    }

    if (year > currentYear) {
      lastMonth = 0;
    }

    // ============================================================
    // FUTURE YEAR
    // ============================================================

    if (lastMonth === 0) {
      return sendSuccessResponse(
        res,
        200,
        "Monthly attendance fetched successfully.",
        {
          employee: {
            id:
              Number(
                employee.employee_id
              ),

            code:
              employeeCode,

            name:
              employee.employee_name,

            employee_type,
          },

          year,

          statistics: {
            present: 0,
            absent: 0,
            late: 0,
            total_working_days: 0,
            attendance_percentage: "0%",
          },

          monthly_attendance: [],
        }
      );
    }

    // ============================================================
    // MONTHLY ATTENDANCE QUERY
    //
    // IMPORTANT:
    //
    // We generate EVERY DATE.
    //
    // Example:
    //
    // August 1
    // August 2
    // August 3
    // ...
    // August 12
    //
    // Then we check whether attendance exists.
    //
    // Attendance exists:
    //     Present
    //
    // Attendance does not exist:
    //     Absent
    // ============================================================

    const attendanceResult =
      await pool.query(
        `
        WITH months AS (

          SELECT
            generate_series(
              1,
              $3::int
            )::int AS month_number

        ),

        calendar AS (

          SELECT
            generate_series(
              make_date(
                $2::int,
                1,
                1
              ),

              CASE
                WHEN $2::int =
                  EXTRACT(
                    YEAR FROM CURRENT_DATE
                  )::int

                THEN CURRENT_DATE

                ELSE make_date(
                  $2::int,
                  12,
                  31
                )
              END,

              interval '1 day'

            )::date AS attendance_date

        ),

        attendance_days AS (

          SELECT DISTINCT

            payroll_date::date
              AS attendance_date

          FROM tbl_attendance

          WHERE employee_code = $1

            AND payroll_date::date >=
              make_date(
                $2::int,
                1,
                1
              )

            AND payroll_date::date <=

              CASE
                WHEN $2::int =
                  EXTRACT(
                    YEAR FROM CURRENT_DATE
                  )::int

                THEN CURRENT_DATE

                ELSE make_date(
                  $2::int,
                  12,
                  31
                )
              END

        ),

        monthly_summary AS (

          SELECT

            EXTRACT(
              MONTH FROM c.attendance_date
            )::int AS month_number,

            COUNT(*)::int
              AS working_days,

            COUNT(
              ad.attendance_date
            )::int
              AS present,

            (
              COUNT(*)
              -
              COUNT(
                ad.attendance_date
              )
            )::int
              AS absent

          FROM calendar c

          LEFT JOIN attendance_days ad
            ON ad.attendance_date =
               c.attendance_date

          GROUP BY
            EXTRACT(
              MONTH FROM c.attendance_date
            )

        )

        SELECT

          m.month_number,

          TRIM(
            TO_CHAR(
              TO_DATE(
                m.month_number::text,
                'MM'
              ),
              'Month'
            )
          ) AS month,

          COALESCE(
            ms.working_days,
            0
          ) AS working_days,

          COALESCE(
            ms.present,
            0
          ) AS present,

          COALESCE(
            ms.absent,
            0
          ) AS absent,

          0 AS leave,

          0 AS late,

          CASE

            WHEN COALESCE(
              ms.working_days,
              0
            ) = 0

            THEN 0

            ELSE ROUND(
              (
                COALESCE(
                  ms.present,
                  0
                )::numeric
                /
                ms.working_days::numeric
              ) * 100,
              0
            )

          END AS attendance_percentage

        FROM months m

        LEFT JOIN monthly_summary ms
          ON ms.month_number =
             m.month_number

        ORDER BY
          m.month_number DESC;
        `,
        [
          employeeCode,
          year,
          lastMonth,
        ]
      );

    // ============================================================
    // FORMAT MONTHLY DATA
    // ============================================================

    const monthlyData =
      attendanceResult.rows.map(
        (month) => ({
          month_number:
            Number(
              month.month_number
            ),

          month:
            month.month,

          working_days:
            Number(
              month.working_days
            ),

          present:
            Number(
              month.present
            ),

          absent:
            Number(
              month.absent
            ),

          leave:
            Number(
              month.leave
            ),

          late:
            Number(
              month.late
            ),

          attendance_percentage:
            Number(
              month.attendance_percentage
            ),
        })
      );

    // ============================================================
    // CALCULATE OVERALL STATISTICS
    // ============================================================

    const statistics =
      monthlyData.reduce(
        (acc, month) => {
          acc.present +=
            month.present;

          acc.absent +=
            month.absent;

          acc.late +=
            month.late;

          acc.totalWorkingDays +=
            month.working_days;

          return acc;
        },
        {
          present: 0,
          absent: 0,
          late: 0,
          totalWorkingDays: 0,
        }
      );

    // ============================================================
    // OVERALL ATTENDANCE PERCENTAGE
    // ============================================================

    const attendancePercentage =
      statistics.totalWorkingDays > 0
        ? Math.round(
          (
            statistics.present /
            statistics.totalWorkingDays
          ) * 100
        )
        : 0;

    // ============================================================
    // RESPONSE
    // ============================================================

    return sendSuccessResponse(
      res,
      200,
      "Monthly attendance fetched successfully.",
      {
        employee: {
          id:
            Number(
              employee.employee_id
            ),

          code:
            employeeCode,

          name:
            employee.employee_name,

          employee_type,
        },

        year,

        statistics: {
          present:
            statistics.present,

          absent:
            statistics.absent,

          late:
            statistics.late,

          total_working_days:
            statistics.totalWorkingDays,

          attendance_percentage:
            `${attendancePercentage}%`,
        },

        monthly_attendance:
          monthlyData,
      }
    );
  } catch (error) {
    console.error(
      "Get monthly attendance summary error:",
      error
    );

    return sendErrorResponse(
      res,
      500,
      error.message ||
      "Failed to fetch monthly attendance."
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
    // ============================================================
    // VALIDATE EMPLOYEE TYPE
    // ============================================================

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

    // ============================================================
    // VALIDATE EMPLOYEE ID
    // ============================================================

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

    // ============================================================
    // DATE RANGE
    // ============================================================

    const now = new Date();

    const today = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    let fromDate;
    let toDate;

    // ============================================================
    // DEFAULT:
    // FIRST DAY OF CURRENT MONTH -> TODAY
    // ============================================================

    if (!from_date && !to_date) {
      const currentMonthStart = new Date(
        now.toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        })
      );

      currentMonthStart.setDate(1);

      fromDate =
        currentMonthStart.toLocaleDateString(
          "en-CA",
          {
            timeZone: "Asia/Kolkata",
          }
        );

      toDate = today;
    } else {
      // ==========================================================
      // BOTH DATES REQUIRED
      // ==========================================================

      if (!from_date || !to_date) {
        return sendErrorResponse(
          res,
          400,
          "Both from_date and to_date are required."
        );
      }

      // ==========================================================
      // VALIDATE DATE FORMAT
      // ==========================================================

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          from_date
        ) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
          to_date
        )
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

    // ============================================================
    // VALIDATE DATE RANGE
    // ============================================================

    if (fromDate > toDate) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    // ============================================================
    // DON'T ALLOW FUTURE DATE
    // ============================================================

    if (toDate > today) {
      return sendErrorResponse(
        res,
        400,
        "to_date cannot be a future date."
      );
    }

    // ============================================================
    // GET EMPLOYEE CODE
    // ============================================================

    let employeeCodeQuery = "";

    // ============================================================
    // PLAYER
    // ============================================================

    if (employee_type === "Player") {
      employeeCodeQuery = `
        SELECT
          player_id AS employee_id,
          admission_id AS employee_code,
          full_name AS employee_name
        FROM tbl_players
        WHERE player_id = $1
      `;
    }

    // ============================================================
    // COACH
    // ============================================================

    if (employee_type === "Coach") {
      employeeCodeQuery = `
        SELECT
          coach_id AS employee_id,
          coach_code AS employee_code,
          full_name AS employee_name
        FROM tbl_coach
        WHERE coach_id = $1
      `;
    }

    // ============================================================
    // STAFF
    // ============================================================

    if (employee_type === "Staff") {
      employeeCodeQuery = `
        SELECT
          staff_id AS employee_id,
          staff_code AS employee_code,
          full_name AS employee_name
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

    const employeeData =
      employee.rows[0];

    const employeeCode =
      employeeData.employee_code;

    // ============================================================
    // REGULAR TIME SLOTS
    // ============================================================

    /*
     * REGULAR MORNING
     *
     * Actual:
     * 06:00 AM - 08:00 AM
     *
     * Buffer:
     * 25 minutes before
     *
     * Final:
     * 05:35 AM - 08:00 AM
     */

    const regularMorningStart =
      5 * 60 + 35;

    const regularMorningEnd =
      8 * 60;

    /*
     * REGULAR EVENING
     *
     * Actual:
     * 04:30 PM - 06:30 PM
     *
     * Buffer:
     * 25 minutes before
     *
     * Final:
     * 04:05 PM - 06:30 PM
     */

    const regularEveningStart =
      16 * 60 + 5;

    const regularEveningEnd =
      18 * 60 + 30;

    // ============================================================
    // ATTENDANCE QUERY
    //
    // IMPORTANT:
    // Every punch is fetched.
    //
    // We DO NOT use MIN()
    // We DO NOT use MAX()
    // ============================================================

    const result = await pool.query(
      `
      WITH dates AS (
        SELECT
          generate_series(
            $2::date,
            $3::date,
            interval '1 day'
          )::date AS attendance_date
      )

      SELECT
        d.attendance_date AS payroll_date,

        a.attendance_id,

        l.punch_type,

        l.punch_time,

        l.branch_name,

        l.device_id

      FROM dates d

      LEFT JOIN tbl_attendance a
        ON a.employee_code = $1
        AND a.payroll_date = d.attendance_date

      LEFT JOIN tbl_attendance_logs l
        ON l.attendance_id = a.attendance_id

      ORDER BY
        d.attendance_date DESC,
        l.punch_time ASC;
      `,
      [
        employeeCode,
        fromDate,
        toDate,
      ]
    );

    // ============================================================
    // GROUP DATABASE ROWS BY DATE
    // ============================================================

    const dateMap = new Map();

    for (const row of result.rows) {
      const dateKey =
        row.payroll_date;

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          attendance_id:
            row.attendance_id ||
            null,

          punches: [],
        });
      }

      const dateData =
        dateMap.get(dateKey);

      // ==========================================================
      // KEEP ATTENDANCE ID
      // ==========================================================

      if (
        row.attendance_id &&
        !dateData.attendance_id
      ) {
        dateData.attendance_id =
          row.attendance_id;
      }

      // ==========================================================
      // ADD EVERY PUNCH
      // ==========================================================

      if (
        row.punch_type &&
        row.punch_time
      ) {
        dateData.punches.push({
          punch_type:
            row.punch_type,

          punch_time:
            row.punch_time,

          branch_name:
            row.branch_name,

          device_id:
            row.device_id,
        });
      }
    }

    // ============================================================
    // FINAL ATTENDANCE
    // ============================================================

    const attendance = [];

    // ============================================================
    // PROCESS EACH DATE
    // ============================================================

    for (const [
      attendanceDate,
      dateData,
    ] of dateMap.entries()) {
      const punches =
        dateData.punches || [];

      // ==========================================================
      // STATUS
      //
      // ONLY:
      // Present
      // Absent
      // ==========================================================

      let status;
      let remarks;
      let marked_by = "-";

      if (dateData.attendance_id) {
        status = "Present";
        remarks = "On Time";
        marked_by = "Coach";
      } else {
        status = "Absent";
        remarks = "Not Attended";
      }

      // ==========================================================
      // NO PUNCHES
      // ==========================================================

      if (punches.length === 0) {
        attendance.push({
          attendance_id:
            dateData.attendance_id ||
            null,

          employee_id:
            Number(employee_id),

          employee_type,

          employee_code:
            employeeCode,

          employee_name:
            employeeData.employee_name,

          date: attendanceDate,

          batch: null,

          session: null,

          status,

          time_in: null,

          time_out: null,

          branch_name: null,

          device_id: null,

          marked_by,

          remarks,
        });

        continue;
      }

      // ==========================================================
      // CONVERT PUNCH TIMES TO IST
      // ==========================================================

      const punchesWithTime =
        punches.map((punch) => {
          const punchDate =
            new Date(
              punch.punch_time
            );

          const istTime =
            punchDate.toLocaleTimeString(
              "en-GB",
              {
                timeZone:
                  "Asia/Kolkata",

                hour12: false,
              }
            );

          const [
            hours,
            minutes,
            seconds = 0,
          ] = istTime
            .split(":")
            .map(Number);

          const punchMinutes =
            hours * 60 +
            minutes +
            seconds / 60;

          return {
            ...punch,

            punchMinutes,

            punchDate,
          };
        });

      // ==========================================================
      // SESSION VARIABLES
      // ==========================================================

      let sessionCounter = 0;

      let currentSession = null;

      // ==========================================================
      // PROCESS EVERY PUNCH
      // ==========================================================

      for (const punch of punchesWithTime) {
        const punchType =
          punch.punch_type
            ? punch.punch_type.toLowerCase()
            : "";

        // ========================================================
        // IN
        // ========================================================

        if (punchType === "in") {
          /*
           * Only create a new session when
           * there is currently NO active session.
           *
           * Therefore:
           *
           * IN
           * IN
           * OUT
           *
           * remains ONE session.
           */

          if (!currentSession) {
            sessionCounter++;

            let batch =
              "One-on-One";

            let session =
              sessionCounter;

            // ====================================================
            // REGULAR MORNING
            // ====================================================

            if (
              punch.punchMinutes >=
              regularMorningStart &&
              punch.punchMinutes <=
              regularMorningEnd
            ) {
              batch = "Regular";
              session = "Morning";
            }

            // ====================================================
            // REGULAR EVENING
            // ====================================================

            else if (
              punch.punchMinutes >=
              regularEveningStart &&
              punch.punchMinutes <=
              regularEveningEnd
            ) {
              batch = "Regular";
              session = "Evening";
            }

            // ====================================================
            // CREATE SESSION
            // ====================================================

            currentSession = {
              attendance_id:
                dateData.attendance_id,

              employee_id:
                Number(employee_id),

              employee_type,

              employee_code:
                employeeCode,

              employee_name:
                employeeData.employee_name,

              date: attendanceDate,

              batch,

              session,

              status,

              time_in:
                punch.punch_time,

              time_out: null,

              branch_name:
                punch.branch_name ||
                null,

              device_id:
                punch.device_id ||
                null,

              marked_by,

              remarks,
            };
          }

          // ======================================================
          // IMPORTANT:
          //
          // If currentSession already exists,
          // this IN does NOT create another session.
          //
          // Example:
          //
          // 05:56 IN
          // 06:00 IN
          //
          // Both belong to session 2.
          // ======================================================

          continue;
        }

        // ========================================================
        // OUT
        // ========================================================

        if (punchType === "out") {
          // ======================================================
          // OUT WITH ACTIVE SESSION
          // ======================================================

          if (currentSession) {
            currentSession.time_out =
              punch.punch_time;

            // ====================================================
            // Keep OUT branch/device information if available
            // ====================================================

            if (
              !currentSession.branch_name &&
              punch.branch_name
            ) {
              currentSession.branch_name =
                punch.branch_name;
            }

            if (
              !currentSession.device_id &&
              punch.device_id
            ) {
              currentSession.device_id =
                punch.device_id;
            }

            // ====================================================
            // ADD ONE COMPLETE SESSION RECORD
            // ====================================================

            attendance.push(
              currentSession
            );

            // ====================================================
            // CLOSE SESSION
            // ====================================================

            currentSession = null;
          } else {
            // ====================================================
            // OUT WITHOUT IN
            // ====================================================

            sessionCounter++;

            attendance.push({
              attendance_id:
                dateData.attendance_id,

              employee_id:
                Number(employee_id),

              employee_type,

              employee_code:
                employeeCode,

              employee_name:
                employeeData.employee_name,

              date: attendanceDate,

              batch: "One-on-One",

              session:
                sessionCounter,

              status,

              time_in: null,

              time_out:
                punch.punch_time,

              branch_name:
                punch.branch_name ||
                null,

              device_id:
                punch.device_id ||
                null,

              marked_by,

              remarks,
            });
          }

          continue;
        }

        // ========================================================
        // UNKNOWN PUNCH TYPE
        // ========================================================

        if (!currentSession) {
          sessionCounter++;

          currentSession = {
            attendance_id:
              dateData.attendance_id,

            employee_id:
              Number(employee_id),

            employee_type,

            employee_code:
              employeeCode,

            employee_name:
              employeeData.employee_name,

            date: attendanceDate,

            batch: "One-on-One",

            session:
              sessionCounter,

            status,

            time_in: null,

            time_out: null,

            branch_name:
              punch.branch_name ||
              null,

            device_id:
              punch.device_id ||
              null,

            marked_by,

            remarks,
          };
        }
      }

      // ==========================================================
      // IN WITHOUT OUT
      //
      // Example:
      //
      // IN 10:00
      //
      // Return:
      //
      // time_in  = 10:00
      // time_out = null
      // ==========================================================

      if (currentSession) {
        attendance.push(
          currentSession
        );
      }
    }

    // ============================================================
    // SORT
    //
    // Latest date first
    // Earliest session first
    // ============================================================

    attendance.sort(
      (a, b) => {
        // ========================================================
        // DATE DESCENDING
        // ========================================================

        if (a.date !== b.date) {
          return b.date.localeCompare(
            a.date
          );
        }

        // ========================================================
        // TIME IN ASCENDING
        // ========================================================

        if (
          !a.time_in &&
          !b.time_in
        ) {
          return 0;
        }

        if (!a.time_in) {
          return 1;
        }

        if (!b.time_in) {
          return -1;
        }

        return (
          new Date(a.time_in) -
          new Date(b.time_in)
        );
      }
    );

    // ============================================================
    // RESPONSE
    // ============================================================

    return sendSuccessResponse(
      res,
      200,
      "Attendance timeline fetched successfully.",
      {
        from_date: fromDate,

        to_date: toDate,

        employee_type,

        employee_id:
          Number(employee_id),

        employee: {
          id:
            Number(
              employeeData.employee_id
            ),

          code:
            employeeCode,

          name:
            employeeData.employee_name,
        },

        attendance,
      }
    );
  } catch (error) {
    console.error(
      "Get attendance timeline error:",
      error
    );

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

