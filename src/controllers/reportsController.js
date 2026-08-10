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
          ) AS month_start
      ),

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

        GROUP BY
          a.employee_code,
          DATE_TRUNC(
            'month',
            a.payroll_date
          )
      ),

      fee_summary AS (
        SELECT
          pf.player_id,

          DATE_TRUNC(
            'month',
            pf.payment_date
          ) AS month_start,

          SUM(
            CASE
              WHEN pf.status = 'Paid'
              THEN pf.amount
              ELSE 0
            END
          ) AS fee_paid,

          MAX(
            CASE
              WHEN pf.status = 'Paid'
              THEN pf.payment_date
            END
          ) AS fee_paid_date

        FROM tbl_player_fees pf

        WHERE pf.payment_date IS NOT NULL

        GROUP BY
          pf.player_id,
          DATE_TRUNC(
            'month',
            pf.payment_date
          )
      )

      SELECT

        p.admission_id,

        p.player_id,

        p.full_name AS player_name,

        p.batch,



        TRIM(
          TO_CHAR(
            rm.month_start,
            'Month'
          )
        ) AS month,

        EXTRACT(
          YEAR FROM rm.month_start
        )::INT AS year,


        COALESCE(
          att.days_present,
          0
        ) AS present,


        GREATEST(

          (
            CASE

              
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
                  rm.month_start::date
                )
                + 1

             
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


        CASE
          WHEN COALESCE(
            fee.fee_paid,
            0
          ) > 0

          THEN fee.fee_paid

          ELSE NULL
        END AS fee_paid,


        fee.fee_paid_date


      FROM tbl_players p

      

      CROSS JOIN report_months rm


      

      LEFT JOIN attendance_summary att
        ON att.employee_code =
           p.admission_id

        AND att.month_start =
            rm.month_start


      LEFT JOIN fee_summary fee
        ON fee.player_id =
           p.player_id

        AND fee.month_start =
            rm.month_start


      WHERE

        p.admission_date <=
        (
          rm.month_start
          + INTERVAL '1 month'
          - INTERVAL '1 day'
        )::date
    `;

    const values = [
      from_date || null,
      to_date || null,
    ];

    let index = 3;


    let finalQuery = query;

    if (search) {
      finalQuery += `
        AND (
          p.full_name ILIKE $${index}
          OR p.admission_id ILIKE $${index}
        )
      `;

      values.push(`%${search}%`);
      index++;
    }

    if (player_id) {
      finalQuery += `
        AND p.player_id = $${index}
      `;

      values.push(player_id);
      index++;
    }


    finalQuery += `
      ORDER BY
        rm.month_start DESC,
        p.full_name ASC;
    `;


    const result = await pool.query(
      finalQuery,
      values
    );


    return sendSuccessResponse(
      res,
      200,
      "Monthly player report fetched successfully.",
      result.rows
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
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

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

            /* Previous Month */
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
        salary.payment_date AS salary_paid_date

      FROM tbl_coach c

      CROSS JOIN report_months rm

      /* Attendance */
      LEFT JOIN attendance_summary att

        ON att.employee_code =
           c.coach_code

        AND att.month_start =
            rm.month_start

      /* Salary */
      LEFT JOIN LATERAL (

        SELECT
          es.net_salary,
          es.payment_date

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

      values.push(
        `%${search.trim()}%`
      );

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

      values.push(
        Number(coach_id)
      );

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

      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Search
    if (search) {
      query += `
        AND (
          s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.role ILIKE $${index}
        )
      `;
      values.push(`%${search}%`);
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
      LEFT JOIN LATERAL (

        SELECT
          es.net_salary,
          es.payment_date

        FROM tbl_employee_salary es

        WHERE
          es.staff_id = s.staff_id

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

    if (
      search &&
      search.trim() !== ""
    ) {
      query += `
        AND (
          s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.designation ILIKE $${index}
        )
      `;

      values.push(
        `%${search.trim()}%`
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