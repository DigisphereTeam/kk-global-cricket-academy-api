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
      WITH attendance_summary AS (
        SELECT
          employee_code,

          DATE_TRUNC(
            'month',
            payroll_date
          ) AS month_start,

          COUNT(
            DISTINCT payroll_date
          ) AS days_present

        FROM tbl_attendance

        GROUP BY
          employee_code,
          DATE_TRUNC(
            'month',
            payroll_date
          )
      )

      SELECT

        c.coach_code AS trainer_id,

        c.coach_id,

        c.full_name AS trainer_name,

        c.specialization,


        TRIM(
          TO_CHAR(
            make_date(
              s.salary_year,
              s.salary_month,
              1
            ),
            'Month'
          )
        ) AS month,


        s.salary_year AS year,


        COALESCE(
          att.days_present,
          0
        ) AS days_present,


        GREATEST(

          (
            CASE

              /* Current month */
              WHEN make_date(
                     s.salary_year,
                     s.salary_month,
                     1
                   )
                   =
                   DATE_TRUNC(
                     'month',
                     CURRENT_DATE
                   )::date

              THEN
                CURRENT_DATE
                -
                make_date(
                  s.salary_year,
                  s.salary_month,
                  1
                )
                + 1


              /* Previous months */
              ELSE
                (
                  make_date(
                    s.salary_year,
                    s.salary_month,
                    1
                  )
                  + INTERVAL '1 month'
                  - INTERVAL '1 day'
                )::date

                -
                make_date(
                  s.salary_year,
                  s.salary_month,
                  1
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

        ) AS days_absent,


        s.net_salary AS salary_paid,


    
        s.payment_date AS salary_paid_date


      FROM tbl_employee_salary s


      INNER JOIN tbl_coach c
        ON c.coach_id = s.coach_id


      LEFT JOIN attendance_summary att

        ON att.employee_code =
           c.coach_code

        AND att.month_start =
            make_date(
              s.salary_year,
              s.salary_month,
              1
            )


      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;


    if (search) {
      query += `
        AND (
          c.full_name ILIKE $${index}
          OR c.coach_code ILIKE $${index}
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
        AND make_date(
          s.salary_year,
          s.salary_month,
          1
        ) >= DATE_TRUNC(
          'month',
          $${index}::date
        )
      `;

      values.push(from_date);
      index++;
    }


    if (to_date) {
      query += `
        AND make_date(
          s.salary_year,
          s.salary_month,
          1
        ) <= DATE_TRUNC(
          'month',
          $${index}::date
        )
      `;

      values.push(to_date);
      index++;
    }



    query += `
      ORDER BY
        s.salary_year DESC,
        s.salary_month DESC,
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
    staff_id,
    from_date,
    to_date,
  } = req.query;

  try {
    let query = `
      WITH attendance_summary AS (
        SELECT
          employee_code,

          DATE_TRUNC(
            'month',
            payroll_date
          ) AS month_start,

          COUNT(
            DISTINCT payroll_date
          ) AS days_present

        FROM tbl_attendance

        GROUP BY
          employee_code,
          DATE_TRUNC(
            'month',
            payroll_date
          )
      )

      SELECT

        s.staff_code,

        s.staff_id,

        s.full_name AS staff_name,

        s.designation,


        TRIM(
          TO_CHAR(
            make_date(
              es.salary_year,
              es.salary_month,
              1
            ),
            'Month'
          )
        ) AS month,


        es.salary_year AS year,


        COALESCE(
          att.days_present,
          0
        ) AS present,



        GREATEST(

          (
            CASE

              /* Current month */
              WHEN make_date(
                     es.salary_year,
                     es.salary_month,
                     1
                   )
                   =
                   DATE_TRUNC(
                     'month',
                     CURRENT_DATE
                   )::date

              THEN
                CURRENT_DATE
                -
                make_date(
                  es.salary_year,
                  es.salary_month,
                  1
                )
                + 1


              /* Previous months */
              ELSE
                (
                  make_date(
                    es.salary_year,
                    es.salary_month,
                    1
                  )
                  + INTERVAL '1 month'
                  - INTERVAL '1 day'
                )::date

                -
                make_date(
                  es.salary_year,
                  es.salary_month,
                  1
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


        

        es.net_salary AS salary_paid,


      

        es.payment_date AS salary_paid_date


      FROM tbl_employee_salary es



      INNER JOIN tbl_staff s
        ON s.staff_id = es.staff_id



      LEFT JOIN attendance_summary att

        ON att.employee_code =
           s.staff_code

        AND att.month_start =
            make_date(
              es.salary_year,
              es.salary_month,
              1
            )


      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    if (search) {
      query += `
        AND (
          s.full_name ILIKE $${index}
          OR s.staff_code ILIKE $${index}
          OR s.designation ILIKE $${index}
        )
      `;

      values.push(`%${search}%`);
      index++;
    }

    if (staff_id) {
      query += `
        AND s.staff_id = $${index}
      `;

      values.push(staff_id);
      index++;
    }


    if (from_date) {
      query += `
        AND make_date(
          es.salary_year,
          es.salary_month,
          1
        ) >= DATE_TRUNC(
          'month',
          $${index}::date
        )
      `;

      values.push(from_date);
      index++;
    }


    if (to_date) {
      query += `
        AND make_date(
          es.salary_year,
          es.salary_month,
          1
        ) <= DATE_TRUNC(
          'month',
          $${index}::date
        )
      `;

      values.push(to_date);
      index++;
    }


    query += `
      ORDER BY
        es.salary_year DESC,
        es.salary_month DESC,
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