const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");


exports.createEmployeeSalary = async (req, res) => {
  const {
    staff_id,
    coach_id,
    salary_month,
    salary_year,
    basic_salary,
    bonus,
    deduction,
    payment_status,
    payment_date,
    remarks,
  } = req.body;

  try {
    // Validate employee
    if (!staff_id && !coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Either staff_id or coach_id is required."
      );
    }

    if (staff_id && coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Only one of staff_id or coach_id can be provided."
      );
    }

    if (
      salary_month === undefined ||
      salary_year === undefined ||
      basic_salary === undefined
    ) {
      return sendErrorResponse(
        res,
        400,
        "salary month, salary year and basic salary are required."
      );
    }

    const net_salary =
      Number(basic_salary) +
      Number(bonus || 0) -
      Number(deduction || 0);

    const result = await pool.query(
      `
      INSERT INTO tbl_employee_salary
      (
        staff_id,
        coach_id,
        salary_month,
        salary_year,
        basic_salary,
        bonus,
        deduction,
        net_salary,
        payment_status,
        payment_date,
        remarks
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      RETURNING *;
      `,
      [
        staff_id || null,
        coach_id || null,
        salary_month,
        salary_year,
        basic_salary,
        bonus || 0,
        deduction || 0,
        net_salary,
        payment_status || "Paid",
        payment_date || null,
        remarks || null,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Employee salary created successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to create employee salary.",
    );
  }
};

exports.getEmployeeSalaries = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        es.salary_id,
        es.staff_id,
        es.coach_id,

        CASE
          WHEN es.staff_id IS NOT NULL THEN s.full_name
          ELSE c.full_name
        END AS employee_name,

        CASE
          WHEN es.staff_id IS NOT NULL THEN 'Staff'
          ELSE 'Coach'
        END AS employee_type,

        es.salary_month,
        es.salary_year,
        es.basic_salary,
        es.bonus,
        es.deduction,
        es.net_salary,
        es.payment_status,
        es.payment_date,
        es.remarks,
        es.created_at

      FROM tbl_employee_salary es

      LEFT JOIN tbl_staff s
        ON es.staff_id = s.staff_id

      LEFT JOIN tbl_coach c
        ON es.coach_id = c.coach_id

      ORDER BY es.created_at DESC
    `);

    return sendSuccessResponse(
      res,
      200,
      "Employee salaries fetched successfully.",
      result.rows
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch employee salaries."
    );
  }
};


exports.getEmployeeSalaryById = async (req, res) => {
  const { salary_id } = req.params;

  if (!salary_id) {
    return sendErrorResponse(
      res,
      400,
      "Salary ID is required."
    );
  }

  if (isNaN(salary_id) || Number(salary_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Salary ID."
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT
        es.salary_id,
        es.staff_id,
        es.coach_id,

        CASE
          WHEN es.staff_id IS NOT NULL THEN s.full_name
          ELSE c.full_name
        END AS employee_name,

        CASE
          WHEN es.staff_id IS NOT NULL THEN 'Staff'
          ELSE 'Coach'
        END AS employee_type,

        es.salary_month,
        es.salary_year,
        es.basic_salary,
        es.bonus,
        es.deduction,
        es.net_salary,
        es.payment_status,
        es.payment_date,
        es.remarks,
        es.created_at

      FROM tbl_employee_salary es

      LEFT JOIN tbl_staff s
        ON es.staff_id = s.staff_id

      LEFT JOIN tbl_coach c
        ON es.coach_id = c.coach_id

      WHERE es.salary_id = $1
      `,
      [salary_id]
    );

    if (result.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee salary not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Employee salary fetched successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch employee salary."
    );
  }
};


exports.updateEmployeeSalary = async (req, res) => {
  const { salary_id } = req.params;

  if (!salary_id) {
    return sendErrorResponse(
      res,
      400,
      "Salary ID is required."
    );
  }

  if (isNaN(salary_id) || Number(salary_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Salary ID."
    );
  }

  const {
    staff_id,
    coach_id,
    salary_month,
    salary_year,
    basic_salary,
    bonus,
    deduction,
    payment_status,
    payment_date,
    remarks,
  } = req.body;

  try {
    if (!staff_id && !coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Either staff_id or coach_id is required."
      );
    }

    if (staff_id && coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Only one of staff_id or coach_id can be provided."
      );
    }

    const checkSalary = await pool.query(
      `SELECT salary_id FROM tbl_employee_salary WHERE salary_id = $1`,
      [salary_id]
    );

    if (checkSalary.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee salary not found."
      );
    }

    const net_salary =
      Number(basic_salary) +
      Number(bonus || 0) -
      Number(deduction || 0);

    const result = await pool.query(
      `
      UPDATE tbl_employee_salary
      SET
        staff_id = $1,
        coach_id = $2,
        salary_month = $3,
        salary_year = $4,
        basic_salary = $5,
        bonus = $6,
        deduction = $7,
        net_salary = $8,
        payment_status = $9,
        payment_date = $10,
        remarks = $11
      WHERE salary_id = $12
      RETURNING *;
      `,
      [
        staff_id || null,
        coach_id || null,
        salary_month,
        salary_year,
        basic_salary,
        bonus || 0,
        deduction || 0,
        net_salary,
        payment_status,
        payment_date || null,
        remarks || null,
        salary_id,
      ]
    );

    return sendSuccessResponse(
      res,
      200,
      "Employee salary updated successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to update employee salary."
    );
  }
};

// Delete Employee Salary
exports.deleteEmployeeSalary = async (req, res) => {
  const { salary_id } = req.params;

  if (!salary_id) {
    return sendErrorResponse(
      res,
      400,
      "Salary ID is required."
    );
  }

  if (isNaN(salary_id) || Number(salary_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Salary ID."
    );
  }

  try {
    const checkSalary = await pool.query(
      `
      SELECT salary_id
      FROM tbl_employee_salary
      WHERE salary_id = $1
      `,
      [salary_id]
    );

    if (checkSalary.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee salary not found."
      );
    }

    await pool.query(
      `
      DELETE FROM tbl_employee_salary
      WHERE salary_id = $1
      `,
      [salary_id]
    );

    return sendSuccessResponse(
      res,
      200,
      "Employee salary deleted successfully."
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to delete employee salary."
    );
  }
};