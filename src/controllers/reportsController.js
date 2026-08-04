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
      result.rows
    );

  } catch (error) {
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

    let query = `
  SELECT
    p.admission_id,
    p.player_id,
    p.full_name AS player_name,
    p.batch,

    TO_CHAR(f.payment_date, 'FMMonth') AS month,
    EXTRACT(YEAR FROM f.payment_date)::INT AS year,

    p.phone_number AS contact_number,
    p.email,

    f.amount,
    f.payment_date,

    24 AS days_present,
    2 AS days_absent

  FROM tbl_players p

  LEFT JOIN tbl_player_fees f
    ON p.player_id = f.player_id

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
      "Monthly player report fetched successfully.",
      result.rows
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
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
      result.rows
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
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
      SELECT
        c.coach_code AS trainer_id,
        c.full_name AS trainer_name,
        c.specialization,

        TO_CHAR(
          TO_DATE(s.salary_month::text, 'MM'),
          'Month'
        ) AS month,

        s.salary_year AS year,

        24 AS days_present,
        2 AS days_absent,

        s.net_salary AS salary_paid,
        s.payment_date AS salary_paid_date

      FROM tbl_employee_salary s
      INNER JOIN tbl_coach c
        ON c.coach_id = s.coach_id

      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Search
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

    // Trainer Filter
    if (coach_id) {
      query += `
        AND c.coach_id = $${index}
      `;
      values.push(coach_id);
      index++;
    }

    // From Date
    if (from_date) {
      query += `
        AND make_date(
          s.salary_year,
          s.salary_month,
          1
        ) >= $${index}
      `;
      values.push(from_date);
      index++;
    }

    // To Date
    if (to_date) {
      query += `
        AND make_date(
          s.salary_year,
          s.salary_month,
          1
        ) <= $${index}
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

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Trainer monthly report fetched successfully.",
      result.rows
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
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
      result.rows
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
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
      SELECT
        s.staff_code,
        s.full_name AS staff_name,
        s.designation,

        TRIM(
          TO_CHAR(
            TO_DATE(es.salary_month::text, 'MM'),
            'Month'
          )
        ) AS month,

        es.salary_year AS year,

        23 AS present,
        3 AS absent,

        es.net_salary AS salary_paid,
        es.payment_date AS salary_paid_date

      FROM tbl_employee_salary es

      INNER JOIN tbl_staff s
      ON s.staff_id = es.staff_id

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
        AND es.payment_date >= $${index}
      `;
      values.push(from_date);
      index++;
    }

    // To Date
    if (to_date) {
      query += `
        AND es.payment_date <= $${index}
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

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Staff monthly report fetched successfully.",
      result.rows
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};