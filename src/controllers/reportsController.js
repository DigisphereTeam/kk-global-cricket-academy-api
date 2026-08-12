const pool = require("../config/dbConfig");
const {
  sendErrorResponse,
  sendSuccessResponse,
} = require("../utils/apiResponse");

exports.getPlayerWiseReport = async (req, res) => {
  const {
    search,
    player_id,
    from_date,
    to_date,
    player_type,
  } = req.query;

  try {
    let query = `
      SELECT
        p.admission_id,
        p.full_name AS player_name,

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

      LEFT JOIN LATERAL (
        SELECT
          pf.player_id
        FROM tbl_player_fees pf
        WHERE pf.player_id = p.player_id
          AND pf.is_active = TRUE
          AND LOWER(pf.fee_type) = 'regular'
          AND LOWER(pf.status) = 'paid'
        ORDER BY
          pf.payment_date DESC NULLS LAST,
          pf.fee_id DESC
        LIMIT 1
      ) regular_fee ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          o.player_id
        FROM tbl_one_on_one_applications o
        WHERE o.player_id = p.player_id
          AND o.is_active = TRUE
          AND o.renewal_status = 'Active'
          AND LOWER(o.payment_status) = 'paid'
        ORDER BY
          o.application_date DESC,
          o.application_id DESC
        LIMIT 1
      ) oo ON TRUE

      WHERE p.is_active = TRUE
    `;

    const values = [];
    let index = 1;

    if (
      player_type &&
      player_type !== "undefined" &&
      player_type !== "null"
    ) {
      query += `
        AND (
          CASE
            WHEN oo.player_id IS NOT NULL
              THEN 'One-on-One'
            ELSE 'Regular'
          END
        ) = $${index}
      `;

      values.push(player_type);
      index++;
    }

    if (search && search.trim() !== "") {
      query += `
        AND (
          p.full_name ILIKE $${index}
          OR p.admission_id ILIKE $${index}
          OR p.phone_number ILIKE $${index}
        )
      `;

      values.push(`%${search.trim()}%`);
      index++;
    }

    if (
      player_id &&
      player_id !== "undefined" &&
      player_id !== "null"
    ) {
      query += `
        AND p.player_id = $${index}
      `;

      values.push(Number(player_id));
      index++;
    }

    if (from_date) {
      query += `
        AND p.admission_date >= $${index}::date
      `;

      values.push(from_date);
      index++;
    }

    if (to_date) {
      query += `
        AND p.admission_date <= $${index}::date
      `;

      values.push(to_date);
      index++;
    }

    query += `
      ORDER BY
        p.admission_date DESC,
        p.full_name ASC
    `;

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Player report fetched successfully.",
      result.rows
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
    search,
    player_id,
    from_date,
    to_date,
  } = req.query;

  try {
    // ============================================================
    // NORMALIZE DATE
    // ============================================================

    const normalizeDate = (value) => {
      if (!value) {
        return null;
      }

      return String(value)
        .trim()
        .replace(/\s+/g, "")
        .replace(/-+/g, "-");
    };

    const cleanedFromDate = normalizeDate(from_date);
    const cleanedToDate = normalizeDate(to_date);

    // ============================================================
    // DATE VALIDATION
    // ============================================================

    const isValidDate = (dateString) => {
      if (!dateString) {
        return false;
      }

      // Must be YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
      }

      const [year, month, day] =
        dateString.split("-").map(Number);

      const date = new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    };

    // ============================================================
    // VALIDATE FROM DATE
    // ============================================================

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

    // ============================================================
    // VALIDATE TO DATE
    // ============================================================

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

    // ============================================================
    // CURRENT DATE - INDIA
    // ============================================================

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

    // ============================================================
    // DEFAULT FROM DATE
    // ============================================================

    const defaultFromDate =
      `${currentYear}-${String(
        currentMonth + 1
      ).padStart(2, "0")}-01`;

    // ============================================================
    // DEFAULT TO DATE
    //
    // For current month, use today's date.
    // This prevents future days from being counted.
    // ============================================================

    const defaultToDate =
      `${currentYear}-${String(
        currentMonth + 1
      ).padStart(2, "0")}-${String(
        currentDay
      ).padStart(2, "0")}`;

    // ============================================================
    // FINAL DATES
    // ============================================================

    const fromDate =
      cleanedFromDate ||
      defaultFromDate;

    const toDate =
      cleanedToDate ||
      defaultToDate;

    // ============================================================
    // FINAL DATE VALIDATION
    // ============================================================

    if (!isValidDate(fromDate)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid from_date. Use YYYY-MM-DD format."
      );
    }

    if (!isValidDate(toDate)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid to_date. Use YYYY-MM-DD format."
      );
    }

    // ============================================================
    // DATE RANGE VALIDATION
    // ============================================================

    if (fromDate > toDate) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }

    // ============================================================
    // PLAYER ID VALIDATION
    // ============================================================

    if (player_id) {
      if (
        !/^\d+$/.test(
          String(player_id).trim()
        )
      ) {
        return sendErrorResponse(
          res,
          400,
          "Invalid player_id."
        );
      }
    }

    // ============================================================
    // MAIN QUERY
    // ============================================================

    let query = `

      WITH report_months AS (

        /*
         * Generate one record for every month
         * between from_date and to_date.
         *
         * Example:
         *
         * from = 2026-07-01
         * to   = 2026-09-30
         *
         * Result:
         * July
         * August
         * September
         */

        SELECT
          generate_series(
            DATE_TRUNC(
              'month',
              $1::date
            ),
            DATE_TRUNC(
              'month',
              $2::date
            ),
            INTERVAL '1 month'
          ) AS month_start
      ),

      /* ==========================================================
         ATTENDANCE
         ========================================================== */

      attendance_summary AS (

        SELECT

          a.employee_code,

          DATE_TRUNC(
            'month',
            a.payroll_date
          ) AS month_start,

          COUNT(
            DISTINCT a.payroll_date
          ) AS days_present

        FROM tbl_attendance a

        WHERE
          a.payroll_date IS NOT NULL

        GROUP BY

          a.employee_code,

          DATE_TRUNC(
            'month',
            a.payroll_date
          )
      ),

      /* ==========================================================
         REGULAR FEE

         Amount:
         tbl_player_fees.amount

         We DO NOT use:
         pf.fee_type

         Each payment is grouped by the month
         in which payment was made.
         ========================================================== */

      regular_fee_summary AS (

        SELECT

          pf.player_id,

          DATE_TRUNC(
            'month',
            pf.payment_date
          ) AS month_start,

          SUM(
            COALESCE(
              pf.amount,
              0
            )
          ) AS regular_fee,

          MAX(
            pf.payment_date
          ) AS regular_payment_date

        FROM tbl_player_fees pf

        WHERE

          pf.status = 'Paid'

          AND pf.payment_date IS NOT NULL

          AND pf.is_active = TRUE

        GROUP BY

          pf.player_id,

          DATE_TRUNC(
            'month',
            pf.payment_date
          )
      ),

      /* ==========================================================
         ONE-TO-ONE FEE

         Amount:
         tbl_one_on_one_applications.fee_amount

         Date:
         tbl_one_on_one_applications.application_date
         ========================================================== */

      one_on_one_summary AS (

        SELECT

          o.player_id,

          DATE_TRUNC(
            'month',
            o.application_date
          ) AS month_start,

          SUM(
            COALESCE(
              o.fee_amount,
              0
            )
          ) AS one_on_one_fee,

          MAX(
            o.application_date
          ) AS one_on_one_payment_date

        FROM tbl_one_on_one_applications o

        WHERE

          o.is_active = TRUE

          AND o.application_date IS NOT NULL

        GROUP BY

          o.player_id,

          DATE_TRUNC(
            'month',
            o.application_date
          )
      )

      /* ==========================================================
         MAIN REPORT
         ========================================================== */

      SELECT

        p.admission_id,

        p.player_id,

        p.full_name AS player_name,

        p.fee_type,

        /* ========================================================
           ADMISSION DATE
           ======================================================== */

        p.admission_date,

        /* ========================================================
           MONTH

           Each month gets its own record.

           Example:

           {
             month: "July",
             year: 2026
           }

           {
             month: "August",
             year: 2026
           }

           {
             month: "September",
             year: 2026
           }
           ======================================================== */

        TRIM(
          TO_CHAR(
            rm.month_start,
            'Month'
          )
        ) AS month,

        EXTRACT(
          YEAR FROM rm.month_start
        )::INT AS year,

        /* ========================================================
           PRESENT
           ======================================================== */

        COALESCE(
          att.days_present,
          0
        ) AS present,

        /* ========================================================
           ABSENT
           ======================================================== */

        GREATEST(

          (
            CASE

              /*
               * Current month:
               * count only until today
               */

              WHEN
                rm.month_start =
                DATE_TRUNC(
                  'month',
                  CURRENT_DATE
                )

              THEN

                CURRENT_DATE
                -
                GREATEST(
                  p.admission_date,
                  rm.month_start::date
                )
                + 1

              /*
               * Previous month:
               * count until month end
               */

              ELSE

                (
                  rm.month_start
                  + INTERVAL '1 month'
                  - INTERVAL '1 day'
                )::date
                -
                GREATEST(
                  p.admission_date,
                  rm.month_start::date
                )
                + 1

            END

            -
            COALESCE(
              att.days_present,
              0
            )
          ),

          0

        ) AS absent,

        /* ========================================================
           ADMISSION FEE

           ALWAYS from tbl_players.

           It is NOT restricted to admission month.
           ======================================================== */

        COALESCE(
          p.admission_fee,
          0
        ) AS admission_fee,

        /* ========================================================
           REGULAR FEE

           ONLY THIS MONTH
           ======================================================== */

        COALESCE(
          regular.regular_fee,
          0
        ) AS regular_fee,

        /* ========================================================
           ONE-TO-ONE FEE

           ONLY THIS MONTH
           ======================================================== */

        COALESCE(
          one_on_one.one_on_one_fee,
          0
        ) AS one_on_one_fee,

        /* ========================================================
           TOTAL FEE PAID

           regular_fee + one_on_one_fee

           Admission fee is NOT included.
           ======================================================== */

        (
          COALESCE(
            regular.regular_fee,
            0
          )
          +
          COALESCE(
            one_on_one.one_on_one_fee,
            0
          )
        ) AS fee_paid,

        /* ========================================================
           REGULAR PAYMENT DATE

           Only this month's payment date.
           ======================================================== */

        regular.regular_payment_date::date
          AS regular_payment_date,

        /* ========================================================
           ONE-TO-ONE PAYMENT DATE

           Only this month's payment date.
           ======================================================== */

        one_on_one.one_on_one_payment_date::date
          AS one_on_one_payment_date

      FROM tbl_players p

      /*
       * This is important.
       *
       * Every player is combined with every
       * report month.
       *
       * Therefore:
       *
       * 30 players × 3 months
       *
       * gives monthly records for every player.
       */

      CROSS JOIN report_months rm

      /* ==========================================================
         ATTENDANCE JOIN
         ========================================================== */

      LEFT JOIN attendance_summary att

        ON att.employee_code =
           p.admission_id

        AND att.month_start =
            rm.month_start

      /* ==========================================================
         REGULAR FEE JOIN
         ========================================================== */

      LEFT JOIN regular_fee_summary regular

        ON regular.player_id =
           p.player_id

        AND regular.month_start =
            rm.month_start

      /* ==========================================================
         ONE-TO-ONE JOIN
         ========================================================== */

      LEFT JOIN one_on_one_summary one_on_one

        ON one_on_one.player_id =
           p.player_id

        AND one_on_one.month_start =
            rm.month_start

      /* ==========================================================
         PLAYER MUST HAVE JOINED BY MONTH END
         ========================================================== */

      WHERE

        p.admission_date <=
        (
          rm.month_start
          + INTERVAL '1 month'
          - INTERVAL '1 day'
        )::date
    `;

    // ============================================================
    // QUERY VALUES
    // ============================================================

    const values = [
      fromDate,
      toDate,
    ];

    let index = 3;

    // ============================================================
    // SEARCH
    // ============================================================

    if (search) {
      query += `

        AND (
          p.full_name ILIKE $${index}

          OR

          p.admission_id ILIKE $${index}
        )

      `;

      values.push(
        `%${String(search).trim()}%`
      );

      index++;
    }

    // ============================================================
    // PLAYER FILTER
    // ============================================================

    if (player_id) {

      query += `

        AND p.player_id = $${index}

      `;

      values.push(
        Number(player_id)
      );

      index++;
    }

    // ============================================================
    // ORDER
    // ============================================================

    query += `

      ORDER BY

        rm.month_start DESC,

        p.full_name ASC

    `;

    // ============================================================
    // EXECUTE
    // ============================================================

    console.log(
      "Monthly Report From Date:",
      fromDate
    );

    console.log(
      "Monthly Report To Date:",
      toDate
    );

    const result =
      await pool.query(
        query,
        values
      );

    // ============================================================
    // FORMAT RESPONSE
    // ============================================================

    const rows =
      result.rows.map(
        (row) => ({

          admission_id:
            row.admission_id,

          player_id:
            Number(
              row.player_id
            ),

          player_name:
            row.player_name,

          fee_type:
            row.fee_type,

          admission_date:
            row.admission_date,

          /*
           * Example:
           * July
           * August
           * September
           */

          month:
            row.month,

          year:
            Number(
              row.year
            ),

          present:
            Number(
              row.present || 0
            ),

          absent:
            Number(
              row.absent || 0
            ),

          /*
           * Admission fee is always
           * player's admission fee.
           */

          admission_fee:
            Number(
              row.admission_fee || 0
            ),

          /*
           * Regular fee for THIS MONTH
           */

          regular_fee:
            Number(
              row.regular_fee || 0
            ),

          /*
           * One-to-one fee for THIS MONTH
           */

          one_on_one_fee:
            Number(
              row.one_on_one_fee || 0
            ),

          /*
           * Regular + One-to-one
           */

          fee_paid:
            Number(
              row.fee_paid || 0
            ),

          regular_payment_date:
            row.regular_payment_date,

          one_on_one_payment_date:
            row.one_on_one_payment_date,
        })
      );

    // ============================================================
    // RESPONSE
    // ============================================================

    return sendSuccessResponse(
      res,
      200,
      "Monthly player report fetched successfully.",
      {
        from_date: fromDate,
        to_date: toDate,
        data: rows,
      }
    );

  } catch (error) {

    console.error(
      "Monthly Player Report Error:",
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
      `${year} -${String(month + 1).padStart(2, "0")}-01`;

    // Last day of current month
    const lastDay =
      new Date(year, month + 1, 0).getDate();

    const defaultToDate =
      `${year} -${String(month + 1).padStart(2, "0")} -${String(lastDay).padStart(2, "0")} `;

    const fromDate = from_date || defaultFromDate;
    const toDate = to_date || defaultToDate;


    if (
      new Date(fromDate) > new Date(toDate)
    ) {
      return sendErrorResponse(
        res,
        400,
        "from_date cannot be greater than to_date."
      );
    }


    let query = `
SELECT
c.coach_id,
  c.coach_code AS trainer_id,
    c.full_name AS trainer_name,
      c.specialization,
      c.phone_number AS contact_number,
        c.experience,
        c.join_date

      FROM tbl_coach c

      WHERE 1 = 1
  `;

    const values = [];
    let index = 1;

    if (search) {
      query += `
AND(
  c.full_name ILIKE $${index}
          OR c.coach_code ILIKE $${index}
          OR c.specialization ILIKE $${index}
)
  `;

      values.push(`% ${search}% `);
      index++;
    }


    if (coach_id) {
      query += `
        AND c.coach_id = $${index}
`;

      values.push(coach_id);
      index++;
    }

    query += `
      AND c.join_date >= $${index}:: date
  `;

    values.push(fromDate);
    index++;

    query += `
      AND c.join_date <= $${index}:: date
  `;

    values.push(toDate);
    index++;

    query += `
      ORDER BY
c.join_date DESC,
  c.full_name ASC
    `;


    const result = await pool.query(
      query,
      values
    );

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
    search,
    coach_id,
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

/* Trainer ID */
c.coach_code AS trainer_id,

  /* Trainer Primary Key */
  c.coach_id,

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
    salary.payment_date AS salary_paid_date,

      /* Incentives */
      salary.incentive_1,

      salary.incentive_2,

      salary.incentive_3

      FROM tbl_coach c

      CROSS JOIN report_months rm

      /* Attendance */
      LEFT JOIN attendance_summary att
        ON att.employee_code = c.coach_code
        AND att.month_start = rm.month_start

      /* Salary */
      LEFT JOIN LATERAL(
        SELECT
          es.net_salary,
        es.payment_date,
        es.incentive_1,
        es.incentive_2,
        es.incentive_3

        FROM tbl_employee_salary es

        WHERE
          es.coach_id = c.coach_id

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

    if (search && search.trim() !== "") {
      query += `
AND(
  c.full_name ILIKE $${index}
          OR c.coach_code ILIKE $${index}
          OR c.specialization ILIKE $${index}
)
  `;

      values.push(`% ${search.trim()}% `);

      index++;
    }

    /* =========================
       TRAINER FILTER
    ========================= */

    if (
      coach_id &&
      coach_id !== "undefined" &&
      coach_id !== "null"
    ) {
      query += `
        AND c.coach_id = $${index}
`;

      values.push(Number(coach_id));

      index++;
    }

    /* =========================
       ORDER
    ========================= */

    query += `
      ORDER BY
rm.month_start DESC,
  c.full_name ASC;
`;

    const result = await pool.query(
      query,
      values
    );

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
      `${year} -${String(month + 1).padStart(2, "0")}-01`;

    // Last day of current month
    const lastDay =
      new Date(year, month + 1, 0).getDate();

    const defaultToDate =
      `${year} -${String(month + 1).padStart(2, "0")} -${String(lastDay).padStart(2, "0")} `;

    const fromDate = from_date || defaultFromDate;
    const toDate = to_date || defaultToDate;

    // ==========================================
    // VALIDATE DATE RANGE
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
    // BUILD QUERY
    // ==========================================

    let query = `
SELECT
s.staff_code,
  s.full_name AS staff_name,
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
AND(
  s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.role ILIKE $${index}
)
  `;

      values.push(`% ${search}% `);
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
      AND s.join_date >= $${index}:: date
  `;

    values.push(fromDate);
    index++;

    query += `
      AND s.join_date <= $${index}:: date
  `;

    values.push(toDate);
    index++;

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
        SELECT COALESCE(
          SUM(p.admission_fee),
          0
        )
        FROM tbl_players p

        WHERE p.admission_date >= $1::date
          AND p.admission_date <= $2::date
          AND p.admission_fee IS NOT NULL

      ) AS admission_fee,


      (
        SELECT COALESCE(
          SUM(regular_amount),
          0
        )

        FROM (

          SELECT
            COALESCE(
              p.regular_fee,
              0
            ) AS regular_amount

          FROM tbl_players p

          WHERE p.regular_fee > 0
            AND p.fee_type = 'Regular Fee'

            AND p.admission_date >= $1::date
            AND p.admission_date < (
              $2::date + INTERVAL '1 day'
            )


          UNION ALL

          SELECT
            COALESCE(
              pf.amount,
              0
            ) AS regular_amount

          FROM tbl_player_fees pf

          INNER JOIN tbl_players p
            ON p.player_id = pf.player_id

          WHERE pf.payment_date >= $1::date
            AND pf.payment_date < (
              $2::date + INTERVAL '1 day'
            )

            /* Existing players */
            AND p.admission_date < $2::date

        ) AS regular_fees
      ) AS regular_fee,

      (
        SELECT COALESCE(
          SUM(o.fee_amount),
          0
        )

        FROM tbl_one_on_one_applications o

        WHERE o.application_date >= $1::date
          AND o.application_date < (
            $2::date + INTERVAL '1 day'
          )

      ) AS one_on_one_fee,

      (
        SELECT COALESCE(
          SUM(o.fee_amount),
          0
        )

        FROM tbl_one_on_one_applications o

        INNER JOIN tbl_players p
          ON p.player_id = o.player_id

        WHERE o.application_date >= $1::date
          AND o.application_date < (
            $2::date + INTERVAL '1 day'
          )

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

            one_on_one_fee: Number(
              row.one_on_one_fee || 0
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
          ) AS total_departments,

          0 AS leave_staff

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
            ),

            leave_staff: Number(
              row.leave_staff || 0
            ),
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

