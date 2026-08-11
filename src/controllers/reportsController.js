const pool = require("../config/dbConfig");
const {
  sendErrorResponse,
  sendSuccessResponse,
} = require("../utils/apiResponse");

exports.getPlayerWiseReport = async (req, res) => {
  const { search, player_id, from_date, to_date } = req.query;

  try {
    let query = `
      SELECT
        p.player_id,
        p.admission_id,
        p.full_name,
        p.batch,
        p.gender,
        p.age,
        p.admission_date,
        p.date_of_birth,
        p.phone_number AS contact_number,
        p.email,
        p.father_name,
        p.address
      FROM tbl_players p
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (search) {
      query += `
        AND (
          p.full_name ILIKE $${index}
          OR p.admission_id ILIKE $${index}
        )
      `;
      values.push(`%${search}%`);
      index++;
    }

    if (player_id) {
      query += ` AND p.player_id = $${index}`;
      values.push(player_id);
      index++;
    }

    if (from_date) {
      query += ` AND p.admission_date >= $${index}`;
      values.push(from_date);
      index++;
    }

    if (to_date) {
      query += ` AND p.admission_date <= $${index}`;
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
      result.rows,
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
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
    // ==========================================
    // MONTHLY PLAYER REPORT
    // ==========================================

    const query = `
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
  ) AS month_start
),

  /* ==========================================
     ATTENDANCE SUMMARY
     ========================================== */

  attendance_summary AS(
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

        GROUP BY
          a.employee_code,
    DATE_TRUNC(
      'month',
      a.payroll_date
    )
  ),

    /* ==========================================
       FEE SUMMARY
       One row per player per month
       ========================================== */

    fee_summary AS(
      SELECT
          pf.player_id,

      DATE_TRUNC(
        'month',
        pf.payment_date
      ) AS month_start,

      /* ======================================
         TOTAL FEE PAID
         ====================================== */

      SUM(
        CASE
              WHEN pf.status = 'Paid'
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ) AS fee_paid,

      /* ======================================
         ADMISSION FEE
         ====================================== */

      SUM(
        CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
          'admission',
          'admission fee'
        )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ) AS admission_fee,

      /* ======================================
         REGULAR FEE
         ====================================== */

      SUM(
        CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
          'regular',
          'regular fee'
        )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ) AS regular_fee,

      /* ======================================
         ONE ON ONE FEE
         ====================================== */

      SUM(
        CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
          'one on one',
          'one-on-one',
          'one on one fee'
        )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ) AS one_on_one_fee,

      /* ======================================
         ONLY ONE ON ONE FEE
         ====================================== */

      SUM(
        CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
          'only one on one',
          'only one-on-one',
          'only one on one fee'
        )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ) AS only_one_on_one_fee,

      /* ======================================
         LAST PAID DATE
         ====================================== */

      MAX(
        CASE
              WHEN pf.status = 'Paid'
              THEN pf.payment_date
            END
      ) AS fee_paid_date

        FROM tbl_player_fees pf

        WHERE
          pf.payment_date IS NOT NULL

        GROUP BY
          pf.player_id,
      DATE_TRUNC(
        'month',
        pf.payment_date
      )
    )

/* ==========================================
   MAIN REPORT
   ========================================== */

SELECT

p.admission_id,

  p.player_id,

  p.full_name AS player_name,

    p.fee_type AS fee_type,

      TRIM(
        TO_CHAR(
          rm.month_start,
          'Month'
        )
      ) AS month,

        EXTRACT(
          YEAR FROM rm.month_start
        )::INT AS year,

          /* ======================================
             PRESENT
             ====================================== */

          COALESCE(
            att.days_present,
            0
          ) AS present,

            /* ======================================
               ABSENT
               ====================================== */

            GREATEST(
              (
                CASE

              /* Current Month */
              WHEN rm.month_start =
            DATE_TRUNC(
              'month',
              CURRENT_DATE
            )

              THEN
                CURRENT_DATE
              -
              GREATEST(
                p.admission_date,
                rm.month_start:: date
              )
              + 1

              /* Previous Months */
              ELSE
                (
                  rm.month_start
                  + INTERVAL '1 month'
                - INTERVAL '1 day'
                ):: date
                -
                GREATEST(
                  p.admission_date,
                  rm.month_start:: date
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

  /* ======================================
     TOTAL FEE PAID
     ====================================== */

  CASE
          WHEN COALESCE(
    fee.fee_paid,
    0
  ) > 0
          THEN fee.fee_paid
          ELSE NULL
        END AS fee_paid,

  /* ======================================
     MONTHLY FEE STATISTICS
     ====================================== */

  COALESCE(
    fee.admission_fee,
    0
  ) AS admission_fee,

    COALESCE(
      fee.regular_fee,
      0
    ) AS regular_fee,

      COALESCE(
        fee.one_on_one_fee,
        0
      ) AS one_on_one_fee,

        COALESCE(
          fee.only_one_on_one_fee,
          0
        ) AS only_one_on_one_fee,

          fee.fee_paid_date

      FROM tbl_players p

      CROSS JOIN report_months rm

      /* ==========================================
         ATTENDANCE
         ========================================== */

      LEFT JOIN attendance_summary att
        ON att.employee_code =
  p.admission_id

        AND att.month_start =
  rm.month_start

      /* ==========================================
         FEES
         ========================================== */

      LEFT JOIN fee_summary fee
        ON fee.player_id =
  p.player_id

        AND fee.month_start =
  rm.month_start

/* ==========================================
   PLAYER MUST HAVE JOINED
   BY END OF REPORT MONTH
   ========================================== */

WHERE

p.admission_date <=
  (
    rm.month_start
    + INTERVAL '1 month'
      - INTERVAL '1 day'
        ):: date
  `;

    // ==========================================
    // MAIN QUERY VALUES
    // ==========================================

    const values = [
      from_date || null,
      to_date || null,
    ];

    let index = 3;

    let finalQuery = query;

    // ==========================================
    // SEARCH FILTER
    // ==========================================

    if (search) {
      finalQuery += `
AND(
  p.full_name ILIKE $${index}
          OR p.admission_id ILIKE $${index}
)
  `;

      values.push(
        `% ${search}% `
      );

      index++;
    }

    // ==========================================
    // PLAYER FILTER
    // ==========================================

    if (player_id) {
      finalQuery += `
        AND p.player_id = $${index}
`;

      values.push(
        player_id
      );

      index++;
    }

    // ==========================================
    // ORDER
    // ==========================================

    finalQuery += `
      ORDER BY
rm.month_start DESC,
  p.full_name ASC;
`;

    // ==========================================
    // EXECUTE MAIN QUERY
    // ==========================================

    const result = await pool.query(
      finalQuery,
      values
    );

    // ==========================================
    // CONVERT MONTHLY VALUES TO NUMBERS
    // ==========================================

    const rows = result.rows.map((row) => ({
      ...row,

      present: Number(
        row.present || 0
      ),

      absent: Number(
        row.absent || 0
      ),

      fee_paid:
        row.fee_paid !== null
          ? Number(row.fee_paid)
          : null,

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
    }));

    // ==========================================
    // OVERALL STATISTICS
    // ==========================================

    let statsQuery = `
SELECT

/* ======================================
   ADMISSION FEE
   ====================================== */

COALESCE(
  SUM(
    CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
      'admission',
      'admission fee'
    )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
  ),
  0
) AS admission_fee,

  /* ======================================
     REGULAR FEE
     ====================================== */

  COALESCE(
    SUM(
      CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
        'regular',
        'regular fee'
      )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
    ),
    0
  ) AS regular_fee,

    /* ======================================
       ONE ON ONE FEE
       ====================================== */

    COALESCE(
      SUM(
        CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
          'one on one',
          'one-on-one',
          'one on one fee'
        )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
      ),
      0
    ) AS one_on_one_fee,

      /* ======================================
         ONLY ONE ON ONE FEE
         ====================================== */

      COALESCE(
        SUM(
          CASE
              WHEN pf.status = 'Paid'
                AND LOWER(TRIM(pf.fee_type)) IN(
            'only one on one',
            'only one-on-one',
            'only one on one fee'
          )
              THEN COALESCE(pf.amount, 0)
              ELSE 0
            END
        ),
        0
      ) AS only_one_on_one_fee

      FROM tbl_player_fees pf

      INNER JOIN tbl_players p
        ON p.player_id = pf.player_id

WHERE

pf.status = 'Paid'

        AND pf.payment_date IS NOT NULL

        AND pf.payment_date:: date >=
  COALESCE(
    $1:: date,
    DATE_TRUNC(
      'month',
      CURRENT_DATE
    ):: date
  )

        AND pf.payment_date:: date <=
  COALESCE(
    $2:: date,
    CURRENT_DATE
  )
    `;

    // ==========================================
    // STATISTICS VALUES
    // ==========================================

    const statsValues = [
      from_date || null,
      to_date || null,
    ];

    let statsIndex = 3;

    // ==========================================
    // STATISTICS SEARCH FILTER
    // ==========================================

    if (search) {
      statsQuery += `
AND(
  p.full_name ILIKE $${statsIndex}
          OR p.admission_id ILIKE $${statsIndex}
)
  `;

      statsValues.push(
        `% ${search}% `
      );

      statsIndex++;
    }

    // ==========================================
    // STATISTICS PLAYER FILTER
    // ==========================================

    if (player_id) {
      statsQuery += `
        AND p.player_id = $${statsIndex}
`;

      statsValues.push(
        player_id
      );

      statsIndex++;
    }

    // ==========================================
    // EXECUTE STATISTICS QUERY
    // ==========================================

    const statsResult = await pool.query(
      statsQuery,
      statsValues
    );

    const stats =
      statsResult.rows[0];

    // ==========================================
    // FINAL STATISTICS OBJECT
    // ==========================================

    const statistics = {
      admission_fee: Number(
        stats.admission_fee || 0
      ),

      regular_fee: Number(
        stats.regular_fee || 0
      ),

      one_on_one_fee: Number(
        stats.one_on_one_fee || 0
      ),

      only_one_on_one_fee: Number(
        stats.only_one_on_one_fee || 0
      ),
    };

    // ==========================================
    // FINAL RESPONSE
    // ==========================================

    return sendSuccessResponse(
      res,
      200,
      "Monthly player report fetched successfully.",
      {
        statistics,
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
  const { search, coach_id, from_date, to_date } = req.query;

  try {
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

    if (from_date) {
      query += `
        AND c.join_date >= $${index}
`;
      values.push(from_date);
      index++;
    }

    if (to_date) {
      query += `
        AND c.join_date <= $${index}
`;
      values.push(to_date);
      index++;
    }

    query += `
      ORDER BY
c.join_date DESC,
  c.full_name ASC;
`;

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Trainer-wise report fetched successfully.",
      result.rows,
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
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
      LEFT JOIN LATERAL (
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
            )::INTEGER

          AND es.salary_month =
            EXTRACT(
              MONTH FROM rm.month_start
            )::INTEGER

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
        AND (
          c.full_name ILIKE $${index}
          OR c.coach_code ILIKE $${index}
          OR c.specialization ILIKE $${index}
        )
      `;

      values.push(`%${search.trim()}%`);

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
  const { search, staff_id, from_date, to_date } = req.query;

  try {
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

    // Search
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

    // Staff Filter
    if (staff_id) {
      query += `
        AND s.staff_id = $${index}
`;
      values.push(staff_id);
      index++;
    }

    // From Date
    if (from_date) {
      query += `
        AND s.join_date >= $${index}
`;
      values.push(from_date);
      index++;
    }

    // To Date
    if (to_date) {
      query += `
        AND s.join_date <= $${index}
`;
      values.push(to_date);
      index++;
    }

    query += `
      ORDER BY
s.join_date DESC,
  s.full_name ASC;
`;

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Staff report fetched successfully.",
      result.rows,
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error",
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

  // ==========================================
  // VALIDATE EMPLOYEE TYPE
  // ==========================================

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

  // Get actual last day of current month
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
    new Date(fromDate) > new Date(toDate)
  ) {
    return sendErrorResponse(
      res,
      400,
      "from_date cannot be greater than to_date."
    );
  }

  try {
    // ==========================================
    // PLAYER STATISTICS
    // ==========================================

    if (employee_type === "Player") {
      const result = await pool.query(
        `
        SELECT

          COUNT(*) AS total_players,

          COUNT(*) FILTER (
            WHERE p.is_active = TRUE
          ) AS active_players,

          COUNT(*) FILTER (
            WHERE p.is_active = FALSE
          ) AS inactive_players,

          COUNT(
            DISTINCT pending_players.player_id
          ) AS pending_fees

        FROM tbl_players p

        LEFT JOIN LATERAL (

          /* =================================
             REGULAR FEE PLAYERS
          ================================= */

          SELECT
            p1.player_id

          FROM tbl_players p1

          WHERE p1.player_id = p.player_id

            AND p1.is_active = TRUE

            AND p1.admission_date <= $2::date

            AND $2::date >
                DATE_TRUNC(
                  'month',
                  $2::date
                ) + INTERVAL '3 day'

            AND NOT EXISTS (

              SELECT 1

              FROM tbl_player_fees pf

              WHERE pf.player_id =
                    p1.player_id

                AND pf.status = 'Paid'

                AND pf.is_active = TRUE

                AND pf.payment_date >=
                    DATE_TRUNC(
                      'month',
                      $2::date
                    )

                AND pf.payment_date <
                    DATE_TRUNC(
                      'month',
                      $2::date
                    ) + INTERVAL '1 month'
            )

          UNION

          /* =================================
             ONE-ON-ONE PLAYERS
          ================================= */

          SELECT
            o.player_id

          FROM tbl_one_on_one_applications o

          INNER JOIN tbl_players p2
            ON p2.player_id = o.player_id
            AND p2.is_active = TRUE

          WHERE o.is_active = TRUE

            AND o.renewal_status = 'Active'

            AND p2.admission_date <= $2::date

            AND NOT EXISTS (

              SELECT 1

              FROM tbl_player_fees pf

              WHERE pf.player_id =
                    o.player_id

                AND pf.status = 'Paid'

                AND pf.is_active = TRUE

                AND pf.payment_date >=
                    DATE_TRUNC(
                      'month',
                      $2::date
                    )

                AND pf.payment_date <
                    DATE_TRUNC(
                      'month',
                      $2::date
                    ) + INTERVAL '1 month'
            )

        ) AS pending_players
          ON pending_players.player_id =
             p.player_id

        WHERE
          p.admission_date >= $1::date
          AND p.admission_date <= $2::date
        `,
        [fromDate, toDate]
      );

      return sendSuccessResponse(
        res,
        200,
        "Player statistics retrieved successfully.",
        {
          employee_type: "Player",
          from_date: fromDate,
          to_date: toDate,
          statistics: {
            total_players: Number(
              result.rows[0].total_players
            ),
            active_players: Number(
              result.rows[0].active_players
            ),
            inactive_players: Number(
              result.rows[0].inactive_players
            ),
            pending_fees: Number(
              result.rows[0].pending_fees
            ),
          },
        }
      );
    }

    // ==========================================
    // STAFF STATISTICS
    // ==========================================

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

        WHERE
          join_date >= $1::date
          AND join_date <= $2::date
        `,
        [fromDate, toDate]
      );

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
              result.rows[0].total_staff
            ),
            active_staff: Number(
              result.rows[0].active_staff
            ),
            inactive_staff: Number(
              result.rows[0].inactive_staff
            ),
            total_departments: Number(
              result.rows[0].total_departments
            ),
            leave_staff: Number(
              result.rows[0].leave_staff
            ),
          },
        }
      );
    }

    // ==========================================
    // COACH STATISTICS
    // ==========================================

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
                experience::NUMERIC
              ),
              1
            ),
            0
          ) AS average_experience

        FROM tbl_coach

        WHERE
          join_date >= $1::date
          AND join_date <= $2::date
        `,
        [fromDate, toDate]
      );

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
              result.rows[0].total_trainers
            ),
            active_trainers: Number(
              result.rows[0].active_trainers
            ),
            inactive_trainers: Number(
              result.rows[0].inactive_trainers
            ),
            average_experience: Number(
              result.rows[0].average_experience
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