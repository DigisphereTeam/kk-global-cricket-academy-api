const pool = require("../config/dbConfig");
const {
  sendErrorResponse,
  sendSuccessResponse,
} = require("../utils/apiResponse");

exports.getPlayerWiseReport = async (req, res) => {
  const { year } = req.query;

  try {
    let query = `
      SELECT
        p.player_id,
        p.admission_id,
        p.full_name,
        p.gender,
        p.age,
        EXTRACT(YEAR FROM p.admission_date) AS admission_year,
        COALESCE(SUM(f.amount), 0) AS total_paid
      FROM tbl_players p
      LEFT JOIN tbl_player_fees f
        ON p.player_id = f.player_id
        AND f.status = 'Paid'
    `;

    const values = [];

    if (year) {
      query += `
        AND EXTRACT(YEAR FROM f.payment_date) = $1
        WHERE EXTRACT(YEAR FROM p.admission_date) = $1
      `;
      values.push(year);
    }

    query += `
      GROUP BY
        p.player_id,
        p.admission_id,
        p.full_name,
        p.gender,
        p.age,
        p.admission_date
      ORDER BY p.admission_id;
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

exports.getYearWisePlayerReport = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        EXTRACT(YEAR FROM p.admission_date) AS admission_year,

        COUNT(DISTINCT p.player_id) AS total_players,

        COUNT(DISTINCT CASE
          WHEN p.batch = 'Regular'
          THEN p.player_id
        END) AS regular_players,

        COUNT(DISTINCT CASE
          WHEN p.batch = 'One-on-One'
          THEN p.player_id
        END) AS one_on_one_players,

        COALESCE(SUM(CASE
          WHEN f.status = 'Paid'
          THEN f.amount
          ELSE 0
        END),0) AS total_collected

      FROM tbl_players p

      LEFT JOIN tbl_player_fees f
        ON p.player_id = f.player_id
        AND EXTRACT(YEAR FROM f.payment_date) =
            EXTRACT(YEAR FROM p.admission_date)

      GROUP BY
        EXTRACT(YEAR FROM p.admission_date)

      ORDER BY
        admission_year DESC
      `,
    );

    return sendSuccessResponse(
      res,
      200,
      "Year-wise player report fetched successfully.",
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

exports.getMonthlyPlayerReport = async (req, res) => {
  const { year, category } = req.query;

  try {

    let query = `
      SELECT
        EXTRACT(YEAR FROM f.payment_date)::INT AS year,
        TO_CHAR(DATE_TRUNC('month', f.payment_date), 'FMMonth') AS month,
        p.batch AS category,
        COUNT(DISTINCT p.player_id) AS player_count,
        COALESCE(SUM(f.amount), 0) AS revenue
      FROM tbl_player_fees f
      INNER JOIN tbl_players p
        ON p.player_id = f.player_id
      WHERE f.status = 'Paid'
    `;

    const values = [];
    let index = 1;

    if (year) {
      query += ` AND EXTRACT(YEAR FROM f.payment_date) = $${index}`;
      values.push(year);
      index++;
    }

    if (category) {
      query += ` AND p.batch = $${index}`;
      values.push(category);
      index++;
    }

    query += `
      GROUP BY
        EXTRACT(YEAR FROM f.payment_date),
        DATE_TRUNC('month', f.payment_date),
        p.batch
      ORDER BY
        EXTRACT(YEAR FROM f.payment_date) DESC,
        DATE_TRUNC('month', f.payment_date) ASC,
        p.batch;
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

exports.getTrainerWiseSalaryReport = async (req, res) => {
  const { search } = req.query;

  try {
    let query = `
      SELECT
        c.coach_code AS trainer_id,
        c.full_name AS trainer_name,
        c.specialization AS role,
        COUNT(es.salary_id) AS months_count,
        COALESCE(AVG(es.net_salary), 0) AS avg_salary_per_month,
        COALESCE(SUM(es.net_salary), 0) AS total_salary_paid
      FROM tbl_coach c
      LEFT JOIN tbl_employee_salary es
        ON c.coach_id = es.coach_id
        AND es.payment_status = 'Paid'
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

    query += `
      GROUP BY
        c.coach_code,
        c.full_name,
        c.specialization
      ORDER BY
        c.full_name ASC
    `;

    const result = await pool.query(query, values);

    return sendSuccessResponse(
      res,
      200,
      "Trainer salary report fetched successfully.",
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