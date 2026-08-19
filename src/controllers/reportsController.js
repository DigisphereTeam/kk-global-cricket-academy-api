const pool = require("../config/dbConfig");
const {
  sendErrorResponse,
  sendSuccessResponse,
} = require("../utils/apiResponse");

exports.getPlayerWiseReport = async (req, res) => {
  let { from_date, to_date } = req.query;

  try {

    const today = new Date();

    if (
      !from_date ||
      from_date === "undefined" ||
      from_date === "null"
    ) {
      from_date = `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-01`;
    } else {
      from_date = from_date.trim();
    }

    if (
      !to_date ||
      to_date === "undefined" ||
      to_date === "null"
    ) {
      to_date = `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;
    } else {
      to_date = to_date.trim();
    }

    /* =========================
       QUERY
    ========================= */

    const query = `
      SELECT
        p.player_id,
        p.admission_id,
        p.full_name AS player_name,
        p.status,

        CASE
          WHEN oo.player_id IS NOT NULL
            THEN 'One-on-One'
          ELSE 'Regular'
        END AS batch,

        p.gender,
        p.age,
        p.date_of_birth,
        p.admission_date,
        p.phone_number AS contact_number,
        p.father_name,
        p.address

      FROM tbl_players p

      /* =========================
         ONE-ON-ONE PLAYER CHECK
      ========================= */

      LEFT JOIN LATERAL (
        SELECT
          o.player_id
        FROM tbl_one_on_one_applications o
        WHERE o.player_id = p.player_id
          AND o.is_active = TRUE
          AND LOWER(TRIM(o.renewal_status)) = 'active'
          AND LOWER(TRIM(o.payment_status)) = 'paid'
        ORDER BY
          o.application_date DESC,
          o.application_id DESC
        LIMIT 1
      ) oo ON TRUE

      WHERE p.admission_date >= $1::date
        AND p.admission_date <= $2::date

      ORDER BY
        p.admission_date DESC,
        p.full_name ASC
    `;

    const values = [
      from_date,
      to_date,
    ];

    /* =========================
       EXECUTE QUERY
    ========================= */

    const result = await pool.query(query, values);

    const data = result.rows;

    /* =========================
       STATISTICS
    ========================= */

    const statistics = {
      total_players: data.length,

      regular_players: data.filter(
        (player) => player.batch === "Regular"
      ).length,

      one_on_one_players: data.filter(
        (player) => player.batch === "One-on-One"
      ).length,

      active_players: data.filter(
        (player) =>
          player.status &&
          player.status.toLowerCase() === "active"
      ).length,

      inactive_players: data.filter(
        (player) =>
          !player.status ||
          player.status.toLowerCase() !== "active"
      ).length,
    };

    /* =========================
       RESPONSE
    ========================= */

    return sendSuccessResponse(
      res,
      200,
      "Player report retrieved successfully.",
      {
        from_date,
        to_date,
        statistics,
        data,
      }
    );

  } catch (error) {
    console.error(
      "Player Wise Report Error:",
      error
    );

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

exports.getPlayerMonthlyReport = async (req, res) => {
  const {
    from_date,
    to_date,
  } = req.query;

  try {
    const normalizeDate = (value) => {
      if (!value) return null;

      return String(value)
        .trim()
        .replace(/\s+/g, "")
        .replace(/-+/g, "-");
    };

    const cleanedFromDate = normalizeDate(from_date);
    const cleanedToDate = normalizeDate(to_date);

    const isValidDate = (dateString) => {
      if (!dateString) return false;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
      }

      const [year, month, day] =
        dateString.split("-").map(Number);

      const date = new Date(
        Date.UTC(year, month - 1, day)
      );

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    };

    // Validate from_date
    if (
      cleanedFromDate &&
      !isValidDate(cleanedFromDate)
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid from_date. Use YYYY-MM-DD format."
      );
    }

    // Validate to_date
    if (
      cleanedToDate &&
      !isValidDate(cleanedToDate)
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid to_date. Use YYYY-MM-DD format."
      );
    }

    // Get current date in India
    const now = new Date();

    const indiaDate = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    const currentYear =
      indiaDate.getFullYear();

    const currentMonth =
      indiaDate.getMonth();

    const currentDay =
      indiaDate.getDate();

    // Default from date = first day of current month
    const defaultFromDate =
      `${currentYear}-${String(
        currentMonth + 1
      ).padStart(2, "0")}-01`;

    // Default to date = today
    const defaultToDate =
      `${currentYear}-${String(
        currentMonth + 1
      ).padStart(2, "0")}-${String(
        currentDay
      ).padStart(2, "0")}`;

    const fromDate =
      cleanedFromDate || defaultFromDate;

    const toDate =
      cleanedToDate || defaultToDate;

    if (fromDate > toDate) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    const query = `
      WITH months AS (
        SELECT
          DATE_TRUNC(
            'month',
            generate_series(
              $1::date,
              LEAST(
                $2::date,
                CURRENT_DATE
              ),
              INTERVAL '1 month'
            )
          )::date AS month_start
      ),

      regular_fee_summary AS (
        SELECT
          p.player_id,
          m.month_start,

          (
            CASE
              WHEN DATE_TRUNC(
                'month',
                p.admission_date
              ) = m.month_start

              THEN COALESCE(
                p.regular_fee,
                0
              )

              ELSE 0
            END

            +

            COALESCE(
              SUM(
                CASE
                  WHEN DATE_TRUNC(
                    'month',
                    pf.payment_date
                  ) = m.month_start

                  AND pf.status = 'Paid'

                  THEN COALESCE(
                    pf.amount,
                    0
                  )

                  ELSE 0
                END
              ),
              0
            )
          ) AS regular_fee,

          CASE
            WHEN DATE_TRUNC(
              'month',
              p.admission_date
            ) = m.month_start

            AND COALESCE(
              p.regular_fee,
              0
            ) > 0

            THEN p.admission_date

            ELSE MIN(
              CASE
                WHEN DATE_TRUNC(
                  'month',
                  pf.payment_date
                ) = m.month_start

                AND pf.status = 'Paid'

                THEN pf.payment_date
              END
            )
          END AS regular_payment_date

        FROM tbl_players p

        CROSS JOIN months m

        LEFT JOIN tbl_player_fees pf
          ON pf.player_id = p.player_id

          AND pf.payment_date IS NOT NULL

          AND pf.payment_date >= m.month_start

          AND pf.payment_date < (
            m.month_start
            + INTERVAL '1 month'
          )

          AND pf.status = 'Paid'

        WHERE
          p.admission_date <= LEAST(
            $2::date,
            CURRENT_DATE
          )

          AND m.month_start >= DATE_TRUNC(
            'month',
            p.admission_date
          )

          AND COALESCE(
            p.regular_fee,
            0
          ) >= 0

          AND COALESCE(
            p.regular_fee,
            0
          ) <> 'NaN'::numeric

        GROUP BY
          p.player_id,
          p.regular_fee,
          p.admission_date,
          m.month_start
      ),

      one_on_one_summary AS (
        SELECT
          o.player_id,
          m.month_start,

          SUM(
            COALESCE(
              o.fee_amount,
              0
            )
          ) AS one_on_one_fee,

          MIN(
            o.application_date
          ) AS one_on_one_payment_date

        FROM tbl_one_on_one_applications o

        CROSS JOIN months m

        WHERE
          o.application_date IS NOT NULL

          AND o.application_date >= m.month_start

          AND o.application_date < (
            m.month_start
            + INTERVAL '1 month'
          )

          AND COALESCE(
            o.fee_amount,
            0
          ) >= 0

          AND COALESCE(
            o.fee_amount,
            0
          ) <> 'NaN'::numeric

        GROUP BY
          o.player_id,
          m.month_start
      ),

      attendance_summary AS (
        SELECT
          p.player_id,
          m.month_start,

          COUNT(*) FILTER (
            WHERE first_punch.first_punch_time IS NOT NULL
          ) AS present_days,

          COUNT(*) FILTER (
            WHERE first_punch.first_punch_time IS NULL
          ) AS absent_days,

          COUNT(*) AS total_attendance_days

        FROM tbl_players p

        CROSS JOIN months m

        INNER JOIN tbl_attendance a
          ON a.employee_code = p.admission_id

          AND a.payroll_date >= GREATEST(
            p.admission_date,
            $1::date,
            m.month_start
          )

          AND a.payroll_date <= LEAST(
            LEAST(
              $2::date,
              CURRENT_DATE
            ),
            (
              m.month_start
              + INTERVAL '1 month - 1 day'
            )::date
          )

        LEFT JOIN LATERAL (
          SELECT
            MIN(
              al.punch_time
            ) AS first_punch_time

          FROM tbl_attendance_logs al

          WHERE
            al.attendance_id = a.attendance_id
        ) first_punch
          ON TRUE

        WHERE
          p.admission_date <= LEAST(
            $2::date,
            CURRENT_DATE
          )

          AND m.month_start >= DATE_TRUNC(
            'month',
            p.admission_date
          )

        GROUP BY
          p.player_id,
          m.month_start
      )

      SELECT

        p.admission_id,

        p.player_id,

        p.full_name AS player_name,

        p.fee_type,

        p.admission_date,

        /*
         * Return month as string
         * Example: August
         */
        TO_CHAR(
          m.month_start,
          'FMMonth'
        ) AS month,

        EXTRACT(
          YEAR FROM m.month_start
        )::integer AS year,

        CASE
          WHEN DATE_TRUNC(
            'month',
            p.admission_date
          ) = m.month_start

          AND p.admission_date BETWEEN
            $1::date
            AND LEAST(
              $2::date,
              CURRENT_DATE
            )

          THEN COALESCE(
            p.admission_fee,
            0
          )

          ELSE 0
        END AS admission_fee,

        CASE
          WHEN DATE_TRUNC(
            'month',
            p.admission_date
          ) = m.month_start

          AND p.admission_date BETWEEN
            $1::date
            AND LEAST(
              $2::date,
              CURRENT_DATE
            )

          THEN p.admission_date

          ELSE NULL
        END AS admission_payment_date,

        COALESCE(
          regular.regular_fee,
          0
        ) AS regular_fee,

        regular.regular_payment_date,

        COALESCE(
          one_on_one.one_on_one_fee,
          0
        ) AS one_on_one_fee,

        one_on_one.one_on_one_payment_date,

        CASE
          WHEN
            COALESCE(
              one_on_one.one_on_one_fee,
              0
            ) > 0

            AND LOWER(
              TRIM(p.fee_type)
            ) = 'admission fee'

            AND COALESCE(
              p.regular_fee,
              0
            ) = 0

          THEN COALESCE(
            one_on_one.one_on_one_fee,
            0
          )

          ELSE 0
        END AS only_one_on_one_fee,

        CASE
          WHEN
            COALESCE(
              one_on_one.one_on_one_fee,
              0
            ) > 0

            AND LOWER(
              TRIM(p.fee_type)
            ) = 'admission fee'

            AND COALESCE(
              p.regular_fee,
              0
            ) = 0

          THEN one_on_one.one_on_one_payment_date

          ELSE NULL
        END AS only_one_on_one_payment_date,

        COALESCE(
          attendance.present_days,
          0
        ) AS present_days,

        COALESCE(
          attendance.absent_days,
          0
        ) AS absent_days,

        COALESCE(
          attendance.total_attendance_days,
          0
        ) AS total_attendance_days,

        (
          CASE
            WHEN DATE_TRUNC(
              'month',
              p.admission_date
            ) = m.month_start

            AND p.admission_date BETWEEN
              $1::date
              AND LEAST(
                $2::date,
                CURRENT_DATE
              )

            THEN COALESCE(
              p.admission_fee,
              0
            )

            ELSE 0
          END

          +

          COALESCE(
            regular.regular_fee,
            0
          )

          +

          COALESCE(
            one_on_one.one_on_one_fee,
            0
          )

        ) AS fee_paid

      FROM tbl_players p

      CROSS JOIN months m

      LEFT JOIN regular_fee_summary regular
        ON regular.player_id = p.player_id
        AND regular.month_start = m.month_start

      LEFT JOIN one_on_one_summary one_on_one
        ON one_on_one.player_id = p.player_id
        AND one_on_one.month_start = m.month_start

      LEFT JOIN attendance_summary attendance
        ON attendance.player_id = p.player_id
        AND attendance.month_start = m.month_start

      WHERE
        p.admission_date <= LEAST(
          $2::date,
          CURRENT_DATE
        )

        AND m.month_start >= DATE_TRUNC(
          'month',
          p.admission_date
        )

      ORDER BY
        p.full_name ASC,
        m.month_start ASC
    `;

    const result = await pool.query(
      query,
      [fromDate, toDate]
    );

    const data = result.rows.map((row) => ({
      admission_id: row.admission_id,

      player_id: Number(
        row.player_id
      ),

      player_name: row.player_name,

      fee_type: row.fee_type,

      admission_date:
        row.admission_date,

      // Example: "August"
      month: row.month,

      // Example: 2026
      year: Number(
        row.year
      ),

      admission_fee: Number(
        row.admission_fee || 0
      ),

      regular_fee: Number(
        row.regular_fee || 0
      ),

      regular_payment_date:
        row.regular_payment_date,

      one_on_one_fee:
        Number(
          row.one_on_one_fee || 0
        ) -
        Number(
          row.only_one_on_one_fee || 0
        ),

      one_on_one_payment_date:
        Number(
          row.one_on_one_fee || 0
        ) -
          Number(
            row.only_one_on_one_fee || 0
          ) > 0
          ? row.one_on_one_payment_date
          : null,

      only_one_on_one_fee:
        Number(
          row.only_one_on_one_fee || 0
        ),

      only_one_on_one_payment_date:
        row.only_one_on_one_payment_date,

      fee_paid: Number(
        row.fee_paid || 0
      ),

      present: Number(
        row.present_days || 0
      ),

      absent: Number(
        row.absent_days || 0
      ),

      total_attendance_days:
        Number(
          row.total_attendance_days || 0
        )
    }));

    const statistics = data.reduce(
      (acc, player) => {
        acc.total_admission_fee +=
          player.admission_fee;

        acc.total_regular_fee +=
          player.regular_fee;

        acc.total_one_on_one_fee +=
          Number(
            player.one_on_one_fee || 0
          );

        acc.total_only_one_on_one_fee +=
          player.only_one_on_one_fee;

        acc.total_fee_paid +=
          player.fee_paid;

        acc.total_present_days +=
          player.present;

        acc.total_absent_days +=
          player.absent;

        acc.total_attendance_days +=
          player.total_attendance_days;

        return acc;
      },
      {
        total_admission_fee: 0,
        total_regular_fee: 0,
        total_one_on_one_fee: 0,
        total_only_one_on_one_fee: 0,
        total_fee_paid: 0,
        total_present_days: 0,
        total_absent_days: 0,
        total_attendance_days: 0
      }
    );

    return sendSuccessResponse(
      res,
      200,
      "Player report retrieved successfully.",
      {
        from_date: fromDate,
        to_date: toDate,
        statistics,
        data
      }
    );

  } catch (error) {
    console.error(
      "Player report error:",
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

exports.getTrainerWiseReport = async (req, res) => {
  const {
    search,
    coach_id,
    from_date,
    to_date,
  } = req.query;

  try {
    // ==========================================
    // DATE VALIDATION
    // ==========================================

    const isValidDate = (dateString) => {
      if (!dateString) {
        return true;
      }

      // Must be YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
      }

      const [year, month, day] =
        dateString.split("-").map(Number);

      const date = new Date(
        Date.UTC(year, month - 1, day)
      );

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    };

    // ==========================================
    // VALIDATE FROM DATE
    // ==========================================

    if (from_date && !isValidDate(from_date)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid from_date. Use YYYY-MM-DD format."
      );
    }

    // ==========================================
    // VALIDATE TO DATE
    // ==========================================

    if (to_date && !isValidDate(to_date)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid to_date. Use YYYY-MM-DD format."
      );
    }

    // ==========================================
    // CURRENT DATE - INDIA
    // ==========================================

    const today = new Date();

    const currentDate = new Date(
      today.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // ==========================================
    // DEFAULT DATE RANGE
    // Current month
    // ==========================================

    // First day of current month
    const defaultFromDate =
      `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // Last day of current month
    const lastDay =
      new Date(year, month + 1, 0).getDate();

    const defaultToDate =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const fromDate = from_date || defaultFromDate;
    const toDate = to_date || defaultToDate;

    // ==========================================
    // DATE RANGE VALIDATION
    // ==========================================

    if (
      new Date(fromDate) > new Date(toDate)
    ) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    // ==========================================
    // BASE QUERY
    // ==========================================

    let query = `
      SELECT
        c.coach_id,
        c.coach_code AS trainer_id,
        c.full_name AS trainer_name,

        CASE
          WHEN c.is_active = TRUE THEN 'Active'
          ELSE 'Inactive'
        END AS status,

        c.specialization,
        c.phone_number AS contact_number,
        c.experience,
        c.join_date

      FROM tbl_coach c

      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    // ==========================================
    // SEARCH
    // ==========================================

    if (search) {
      query += `
        AND (
          c.full_name ILIKE $${index}
          OR c.coach_code ILIKE $${index}
          OR c.specialization ILIKE $${index}
        )
      `;

      values.push(`%${search}%`);
      index++;
    }

    // ==========================================
    // COACH FILTER
    // ==========================================

    if (coach_id) {
      query += `
        AND c.coach_id = $${index}
      `;

      values.push(coach_id);
      index++;
    }

    // ==========================================
    // DATE FILTER
    // ==========================================

    query += `
      AND c.join_date >= $${index}::date
    `;

    values.push(fromDate);
    index++;

    query += `
      AND c.join_date <= $${index}::date
    `;

    values.push(toDate);
    index++;

    // ==========================================
    // ORDER
    // ==========================================

    query += `
      ORDER BY
        c.join_date DESC,
        c.full_name ASC
    `;

    // ==========================================
    // EXECUTE QUERY
    // ==========================================

    const result = await pool.query(
      query,
      values
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    return sendSuccessResponse(
      res,
      200,
      "Trainer-wise report fetched successfully.",
      {
        from_date: fromDate,
        to_date: toDate,
        data: result.rows,
      }
    );

  } catch (error) {
    console.error(
      "Trainer Wise Report Error:",
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

exports.getTrainerMonthlyReport = async (req, res) => {
  const {
    from_date,
    to_date,
  } = req.query;

  try {
    // ==========================================
    // QUERY
    // ==========================================

    const query = `
      WITH report_months AS (

        SELECT
          generate_series(
            DATE_TRUNC(
              'month',
              COALESCE($1::date, CURRENT_DATE)
            ),
            DATE_TRUNC(
              'month',
              COALESCE($2::date, CURRENT_DATE)
            ),
            INTERVAL '1 month'
          )::date AS month_start

      ),

      attendance_summary AS (

        SELECT
          employee_code,

          DATE_TRUNC(
            'month',
            payroll_date
          )::date AS month_start,

          COUNT(
            DISTINCT payroll_date
          ) AS days_present

        FROM tbl_attendance

        GROUP BY
          employee_code,
          DATE_TRUNC(
            'month',
            payroll_date
          )::date
      )

      SELECT

        /* Trainer ID */
        c.coach_code AS trainer_id,

        /* Trainer Name */
        c.full_name AS trainer_name,

        /* Specialization */
        c.specialization,

        /* Month */
        TO_CHAR(
          rm.month_start,
          'FMMonth'
        ) AS month,

        /* Year */
        EXTRACT(
          YEAR FROM rm.month_start
        )::INTEGER AS year,

        /* Present */
        COALESCE(
          att.days_present,
          0
        ) AS present,

        /* Absent */
        GREATEST(
          CASE

            /* Current Month */
            WHEN rm.month_start =
              DATE_TRUNC(
                'month',
                CURRENT_DATE
              )::date

            THEN
              (
                CURRENT_DATE
                - rm.month_start
                + 1
              )

            /* Previous Months */
            ELSE
              (
                (
                  rm.month_start
                  + INTERVAL '1 month'
                  - INTERVAL '1 day'
                )::date
                - rm.month_start
                + 1
              )

          END
          - COALESCE(
              att.days_present,
              0
            ),
          0
        ) AS absent,

        /* Salary Paid */
        salary.net_salary AS salary_paid,

        /* Salary Paid Date */
        salary.payment_date AS salary_paid_date,

        /* Incentives */
        salary.incentive_1,

        salary.incentive_2,

        salary.incentive_3

      FROM tbl_coach c

      CROSS JOIN report_months rm

      /* ==========================================
         ATTENDANCE
         ========================================== */

      LEFT JOIN attendance_summary att
        ON att.employee_code = c.coach_code
        AND att.month_start = rm.month_start

      /* ==========================================
         SALARY
         ========================================== */

      LEFT JOIN LATERAL (

        SELECT
          es.net_salary,
          es.payment_date,
          es.incentive_1,
          es.incentive_2,
          es.incentive_3

        FROM tbl_employee_salary es

        WHERE es.coach_id = c.coach_id

          AND es.salary_year =
            EXTRACT(
              YEAR FROM rm.month_start
            )::INTEGER

          AND es.salary_month =
            EXTRACT(
              MONTH FROM rm.month_start
            )::INTEGER

        ORDER BY
          es.payment_date DESC NULLS LAST

        LIMIT 1

      ) salary ON TRUE

      ORDER BY
        rm.month_start DESC,
        c.full_name ASC;
    `;

    // ==========================================
    // VALUES
    // ==========================================

    const values = [
      from_date || null,
      to_date || null,
    ];

    // ==========================================
    // EXECUTE QUERY
    // ==========================================

    const result = await pool.query(
      query,
      values
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    return sendSuccessResponse(
      res,
      200,
      "Trainer monthly report fetched successfully.",
      result.rows
    );

  } catch (error) {
    console.error(
      "Trainer Monthly Report Error:",
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

exports.getStaffWiseReport = async (req, res) => {
  const {
    search,
    staff_id,
    from_date,
    to_date,
  } = req.query;

  try {
    // ==========================================
    // STRICT DATE VALIDATION
    // ==========================================

    const isValidDate = (dateString) => {
      if (!dateString) {
        return true;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
      }

      const [year, month, day] =
        dateString.split("-").map(Number);

      const date = new Date(
        Date.UTC(year, month - 1, day)
      );

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    };

    // ==========================================
    // VALIDATE DATES
    // ==========================================

    if (from_date && !isValidDate(from_date)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid from_date. Use YYYY-MM-DD format."
      );
    }

    if (to_date && !isValidDate(to_date)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid to_date. Use YYYY-MM-DD format."
      );
    }

    // ==========================================
    // DEFAULT DATE RANGE — CURRENT MONTH
    // ==========================================

    const today = new Date();

    const currentDate = new Date(
      today.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of current month
    const defaultFromDate =
      `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // Last day of current month
    const lastDay =
      new Date(year, month + 1, 0).getDate();

    const defaultToDate =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const fromDate = from_date || defaultFromDate;
    const toDate = to_date || defaultToDate;

    // ==========================================
    // VALIDATE DATE RANGE
    // ==========================================

    if (fromDate > toDate) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    // ==========================================
    // BUILD QUERY
    // ==========================================

    let query = `
      SELECT
        s.staff_id,
        s.staff_code,
        s.full_name AS staff_name,
        s.status,
        s.designation,
        s.join_date AS joining_date,
        s.phone_number AS contact_number

      FROM tbl_staff s

      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    // ==========================================
    // SEARCH
    // ==========================================

    if (search) {
      query += `
        AND (
          s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.role ILIKE $${index}
          OR s.designation ILIKE $${index}
        )
      `;

      values.push(`%${search}%`);
      index++;
    }

    // ==========================================
    // STAFF ID
    // ==========================================

    if (staff_id) {
      query += `
        AND s.staff_id = $${index}
      `;

      values.push(staff_id);
      index++;
    }

    // ==========================================
    // DATE RANGE
    // ==========================================

    query += `
      AND s.join_date >= $${index}::date
      AND s.join_date <= $${index + 1}::date
    `;

    values.push(fromDate);
    values.push(toDate);
    index += 2;

    // ==========================================
    // ORDER
    // ==========================================

    query += `
      ORDER BY
        s.join_date DESC,
        s.full_name ASC
    `;

    // ==========================================
    // EXECUTE QUERY
    // ==========================================

    const result = await pool.query(
      query,
      values
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    return sendSuccessResponse(
      res,
      200,
      "Staff report fetched successfully.",
      {
        from_date: fromDate,
        to_date: toDate,
        data: result.rows,
      }
    );

  } catch (error) {
    console.error(
      "Staff Wise Report Error:",
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

exports.getStaffMonthlyReport = async (req, res) => {
  const {
    search,
    staff_code,
    from_date,
    to_date,
  } = req.query;

  try {
    let query = `
      WITH report_months AS(

      SELECT
          generate_series(
        DATE_TRUNC(
          'month',
          COALESCE($1:: date, CURRENT_DATE)
        ),
        DATE_TRUNC(
          'month',
          COALESCE($2:: date, CURRENT_DATE)
        ),
        INTERVAL '1 month'
      ):: date AS month_start

    ),

  attendance_summary AS(

    SELECT
          employee_code,

    DATE_TRUNC(
      'month',
      payroll_date
    ):: date AS month_start,

    COUNT(
      DISTINCT payroll_date
    ) AS days_present

        FROM tbl_attendance

        GROUP BY
          employee_code,
    DATE_TRUNC(
      'month',
      payroll_date
    ):: date

  )

SELECT

/* Staff Code */
s.staff_code AS staff_code,

  /* Staff Primary ID */
  s.staff_id AS staff_id,

    /* Staff Name */
    s.full_name AS staff_name,

      /* Designation */
      s.designation,

      /* Month */
      TO_CHAR(
        rm.month_start,
        'FMMonth'
      ) AS month,

        /* Year */
        EXTRACT(
          YEAR FROM rm.month_start
        )::INTEGER AS year,

          /* Present */
          COALESCE(
            att.days_present,
            0
          ) AS present,

            /* Absent */
            GREATEST(

              CASE

            /* Current Month */
            WHEN rm.month_start =
            DATE_TRUNC(
              'month',
              CURRENT_DATE
            ):: date

            THEN
                (
                  CURRENT_DATE
                  - rm.month_start
                  + 1
                )

            /* Previous Months */
            ELSE
                (
                  (
                    rm.month_start
                    + INTERVAL '1 month'
                - INTERVAL '1 day'
                ):: date
                - rm.month_start
            + 1
            )

END

  -
  COALESCE(
    att.days_present,
    0
  ),

  0

        ) AS absent,

  /* Salary Paid */
  salary.net_salary AS salary_paid,

    /* Salary Paid Date */
    salary.payment_date AS salary_paid_date

      FROM tbl_staff s

      CROSS JOIN report_months rm

      /* Attendance */
      LEFT JOIN attendance_summary att

        ON att.employee_code =
  s.staff_code

        AND att.month_start =
  rm.month_start

      /* Salary */
      LEFT JOIN LATERAL(

    SELECT
          es.net_salary,
    es.payment_date

        FROM tbl_employee_salary es

        WHERE
          es.staff_id = s.staff_id

          AND es.salary_year =
  EXTRACT(
    YEAR FROM rm.month_start
  ):: INTEGER

          AND es.salary_month =
  EXTRACT(
    MONTH FROM rm.month_start
  ):: INTEGER

        ORDER BY
          es.payment_date DESC NULLS LAST

        LIMIT 1

  ) salary ON TRUE

      WHERE 1 = 1
  `;

    const values = [
      from_date || null,
      to_date || null,
    ];

    let index = 3;

    /* =========================
       SEARCH
    ========================= */

    if (
      search &&
      search.trim() !== ""
    ) {
      query += `
AND(
  s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.designation ILIKE $${index}
)
  `;

      values.push(
        `% ${search.trim()}% `
      );

      index++;
    }

    /* =========================
       STAFF CODE FILTER
    ========================= */

    if (
      staff_code &&
      staff_code !== "undefined" &&
      staff_code !== "null" &&
      staff_code.trim() !== ""
    ) {
      query += `
        AND s.staff_code = $${index}
`;

      values.push(
        staff_code.trim()
      );

      index++;
    }

    /* =========================
       ORDER
    ========================= */

    query += `
      ORDER BY
rm.month_start DESC,
  s.full_name ASC;
`;

    const result = await pool.query(
      query,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "Staff monthly report fetched successfully.",
      result.rows
    );

  } catch (error) {

    console.error(
      "Staff Monthly Report Error:",
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


exports.getEmployeeStatistics = async (req, res) => {
  const {
    employee_type,
    from_date,
    to_date,
  } = req.query;

  if (!employee_type) {
    return sendErrorResponse(
      res,
      400,
      "Employee type is required."
    );
  }

  const allowedTypes = [
    "Player",
    "Coach",
    "Staff",
  ];

  if (!allowedTypes.includes(employee_type)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid employee type. Allowed values are Player, Coach, Staff."
    );
  }

  const isValidDate = (dateString) => {
    if (!dateString) {
      return true;
    }

    // Must be YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return false;
    }

    const [year, month, day] =
      dateString.split("-").map(Number);

    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };

  if (from_date && !isValidDate(from_date)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid from_date. Use YYYY-MM-DD format."
    );
  }

  if (to_date && !isValidDate(to_date)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid to_date. Use YYYY-MM-DD format."
    );
  }

  const today = new Date();

  const currentDate = new Date(
    today.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    })
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of current month
  const defaultFromDate =
    `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // Last day of current month
  const lastDayDate = new Date(
    year,
    month + 1,
    0
  );

  const defaultToDate =
    `${lastDayDate.getFullYear()}-${String(
      lastDayDate.getMonth() + 1
    ).padStart(2, "0")}-${String(
      lastDayDate.getDate()
    ).padStart(2, "0")}`;

  const fromDate = from_date || defaultFromDate;
  const toDate = to_date || defaultToDate;

  // ==========================================
  // VALIDATE DATE RANGE
  // ==========================================

  if (
    new Date(fromDate) >
    new Date(toDate)
  ) {
    return sendErrorResponse(
      res,
      400,
      "from_date cannot be greater than to_date."
    );
  }

  try {

    if (employee_type === "Player") {
      const result = await pool.query(
        `
      SELECT

      (
        SELECT COALESCE(SUM(p.admission_fee), 0)
        FROM tbl_players p
        WHERE p.admission_date >= $1::date
          AND p.admission_date < ($2::date + INTERVAL '1 day')
          AND COALESCE(p.admission_fee, 0) >= 0
          AND COALESCE(p.admission_fee, 0) <> 'NaN'::numeric
      ) AS admission_fee,

      (
        SELECT COALESCE(SUM(regular_amount), 0)
        FROM (

          SELECT
            COALESCE(pf.amount, 0) AS regular_amount
          FROM tbl_player_fees pf
          WHERE pf.status = 'Paid'
            AND pf.payment_date >= $1::date
            AND pf.payment_date < ($2::date + INTERVAL '1 day')

          UNION ALL

          SELECT
            COALESCE(p.regular_fee, 0) AS regular_amount
          FROM tbl_players p
          WHERE LOWER(TRIM(p.fee_type)) = 'regular fee'
            AND COALESCE(p.regular_fee, 0) >= 0
            AND p.regular_fee <> 'NaN'::numeric
            AND p.admission_date >= $1::date
            AND p.admission_date < ($2::date + INTERVAL '1 day')

        ) AS regular_revenue_data
      ) AS regular_fee,

      (
        SELECT COALESCE(SUM(o.fee_amount), 0)
        FROM tbl_one_on_one_applications o
        WHERE o.application_date >= $1::date
          AND o.application_date < ($2::date + INTERVAL '1 day')
      ) AS one_on_one_fee,

      (
        SELECT COALESCE(SUM(o.fee_amount), 0)
        FROM tbl_one_on_one_applications o
        INNER JOIN tbl_players p
          ON p.player_id = o.player_id
        WHERE o.application_date >= $1::date
          AND o.application_date < ($2::date + INTERVAL '1 day')
          AND p.fee_type = 'Admission Fee'
          AND p.regular_fee = 0
      ) AS only_one_on_one_fee
    `,
        [fromDate, toDate]
      );

      const row = result.rows[0];

      return sendSuccessResponse(
        res,
        200,
        "Player statistics retrieved successfully.",
        {
          employee_type: "Player",

          from_date: fromDate,
          to_date: toDate,

          statistics: {

            admission_fee: Number(
              row.admission_fee || 0
            ),

            regular_fee: Number(
              row.regular_fee || 0
            ),

            // one_on_one_fee: Number(
            //   row.one_on_one_fee || 0
            // ),

            one_on_one_fee: Number(row.one_on_one_fee) - Number(
              row.only_one_on_one_fee
            ),

            only_one_on_one_fee: Number(
              row.only_one_on_one_fee || 0
            ),
          },
        }
      );
    }

    if (employee_type === "Staff") {
      const result = await pool.query(
        `
        SELECT

          COUNT(*) AS total_staff,

          COUNT(*) FILTER (
            WHERE is_active = TRUE
          ) AS active_staff,

          COUNT(*) FILTER (
            WHERE is_active = FALSE
          ) AS inactive_staff,

          COUNT(
            DISTINCT department
          ) AS total_departments

        FROM tbl_staff

        WHERE join_date >= $1::date
          AND join_date <= $2::date
        `,
        [fromDate, toDate]
      );

      const row = result.rows[0];

      return sendSuccessResponse(
        res,
        200,
        "Staff statistics retrieved successfully.",
        {
          employee_type: "Staff",
          from_date: fromDate,
          to_date: toDate,

          statistics: {
            total_staff: Number(
              row.total_staff || 0
            ),

            active_staff: Number(
              row.active_staff || 0
            ),

            inactive_staff: Number(
              row.inactive_staff || 0
            ),

            total_departments: Number(
              row.total_departments || 0
            )
          },
        }
      );
    }

    if (employee_type === "Coach") {
      const result = await pool.query(
        `
        SELECT

          COUNT(*) AS total_trainers,

          COUNT(*) FILTER (
            WHERE is_active = TRUE
          ) AS active_trainers,

          COUNT(*) FILTER (
            WHERE is_active = FALSE
          ) AS inactive_trainers,

          COALESCE(
            ROUND(
              AVG(
                experience::numeric
              ),
              1
            ),
            0
          ) AS average_experience

        FROM tbl_coach

        WHERE join_date >= $1::date
          AND join_date <= $2::date
        `,
        [fromDate, toDate]
      );

      const row = result.rows[0];

      return sendSuccessResponse(
        res,
        200,
        "Coach statistics retrieved successfully.",
        {
          employee_type: "Coach",
          from_date: fromDate,
          to_date: toDate,

          statistics: {
            total_trainers: Number(
              row.total_trainers || 0
            ),

            active_trainers: Number(
              row.active_trainers || 0
            ),

            inactive_trainers: Number(
              row.inactive_trainers || 0
            ),

            average_experience: Number(
              row.average_experience || 0
            ),
          },
        }
      );
    }
  } catch (error) {
    console.error(
      "Employee Statistics Error:",
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

