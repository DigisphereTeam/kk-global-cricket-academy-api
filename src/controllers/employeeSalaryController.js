const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");


exports.createEmployeeSalary = async (req, res) => {
  const {
    staff_id,
    coach_id,
    basic_salary,
    bonus,
    deduction,
    payment_type,
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

    // Required fields
    if (basic_salary === undefined || !payment_date || !payment_type) {
      return sendErrorResponse(
        res,
        400,
        "Basic salary, payment type and payment date are required."
      );
    }

    // Validate payment date
    const paymentDateObj = new Date(payment_date);

    if (isNaN(paymentDateObj.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment date."
      );
    }

    const salary_month = paymentDateObj.getMonth() + 1;
    const salary_year = paymentDateObj.getFullYear();

    // Validate payment type
    const allowedPaymentTypes = [
      "Cash",
      "UPI",
      "Bank Transfer",
    ];

    if (!allowedPaymentTypes.includes(payment_type)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment type. Allowed values are Cash, UPI and Bank Transfer."
      );
    }

    // Basic salary validation
    if (Number(basic_salary) <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Basic salary must be greater than zero."
      );
    }

    // Bonus validation
    if (bonus != null && Number(bonus) < 0) {
      return sendErrorResponse(
        res,
        400,
        "Bonus cannot be negative."
      );
    }

    // Deduction validation
    if (deduction != null && Number(deduction) < 0) {
      return sendErrorResponse(
        res,
        400,
        "Deduction cannot be negative."
      );
    }

    // Prevent duplicate salary
    let existingSalary;

    if (staff_id) {
      existingSalary = await pool.query(
        `
        SELECT salary_id
        FROM tbl_employee_salary
        WHERE staff_id = $1
          AND salary_month = $2
          AND salary_year = $3
        LIMIT 1;
        `,
        [
          staff_id,
          salary_month,
          salary_year,
        ]
      );
    } else {
      existingSalary = await pool.query(
        `
        SELECT salary_id
        FROM tbl_employee_salary
        WHERE coach_id = $1
          AND salary_month = $2
          AND salary_year = $3
        LIMIT 1;
        `,
        [
          coach_id,
          salary_month,
          salary_year,
        ]
      );
    }

    if (existingSalary.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Salary has already been created for the selected employee for this month and year."
      );
    }

    const net_salary =
      Number(basic_salary) +
      Number(bonus || 0) -
      Number(deduction || 0);

    // Insert salary
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
        payment_type,
        payment_date,
        remarks
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING *;
      `,
      [
        staff_id || null,
        coach_id || null,
        salary_month,
        salary_year,
        Number(basic_salary),
        Number(bonus || 0),
        Number(deduction || 0),
        net_salary,
        "Paid",
        payment_type,
        payment_date,
        remarks?.trim() || null,
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
      error.message || "Failed to create employee salary."
    );
  }
};

exports.creditEmployeeSalary = async (req, res) => {
  const { salary_id } = req.params;

  if (!salary_id || isNaN(salary_id) || Number(salary_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Valid salary ID is required."
    );
  }

  const {
    basic_salary,
    bonus,
    deduction,
    payment_type,
    payment_date,
    remarks,
  } = req.body;

  try {

    // Required fields
    if (
      basic_salary == null ||
      !payment_type ||
      !payment_date
    ) {
      return sendErrorResponse(
        res,
        400,
        "Basic salary, payment type and payment date are required."
      );
    }


    // Validate payment date
    const paymentDateObj = new Date(payment_date);

    if (isNaN(paymentDateObj.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment date."
      );
    }


    // Salary month/year from payment date
    const salary_month =
      paymentDateObj.getMonth() + 1;

    const salary_year =
      paymentDateObj.getFullYear();


    // Validate payment type
    const allowedPaymentTypes = [
      "Cash",
      "UPI",
      "Bank Transfer",
    ];

    if (!allowedPaymentTypes.includes(payment_type)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment type. Allowed values are Cash, UPI and Bank Transfer."
      );
    }


    // Validate salary amount
    if (Number(basic_salary) <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Basic salary must be greater than zero."
      );
    }


    if (bonus != null && Number(bonus) < 0) {
      return sendErrorResponse(
        res,
        400,
        "Bonus cannot be negative."
      );
    }


    if (deduction != null && Number(deduction) < 0) {
      return sendErrorResponse(
        res,
        400,
        "Deduction cannot be negative."
      );
    }


    // Get existing salary record
    const salaryResult = await pool.query(
      `
      SELECT *
      FROM tbl_employee_salary
      WHERE salary_id = $1
      `,
      [salary_id]
    );


    if (salaryResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Salary record not found."
      );
    }


    const salary = salaryResult.rows[0];


    // Check latest salary record
    const latestSalary = await pool.query(
      `
      SELECT salary_id
      FROM tbl_employee_salary
      WHERE
      (
        (staff_id = $1 AND $1 IS NOT NULL)
        OR
        (coach_id = $2 AND $2 IS NOT NULL)
      )
      ORDER BY
        salary_year DESC,
        salary_month DESC,
        salary_id DESC
      LIMIT 1
      `,
      [
        salary.staff_id,
        salary.coach_id,
      ]
    );


    if (
      latestSalary.rows[0].salary_id !== Number(salary_id)
    ) {
      return sendErrorResponse(
        res,
        409,
        "Only the latest salary record can be credited."
      );
    }


    // Prevent duplicate salary for same month/year
    const existingSalary = await pool.query(
      `
      SELECT salary_id
      FROM tbl_employee_salary
      WHERE
      (
        (staff_id = $1 AND $1 IS NOT NULL)
        OR
        (coach_id = $2 AND $2 IS NOT NULL)
      )
      AND salary_month = $3
      AND salary_year = $4
      LIMIT 1
      `,
      [
        salary.staff_id,
        salary.coach_id,
        salary_month,
        salary_year,
      ]
    );


    if (existingSalary.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Salary already exists for this employee for the selected month."
      );
    }


    // Calculate net salary
    const net_salary =
      Number(basic_salary) +
      Number(bonus || 0) -
      Number(deduction || 0);



    // Insert new salary
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
        payment_type,
        payment_date,
        remarks
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING *;
      `,
      [
        salary.staff_id,
        salary.coach_id,
        salary_month,
        salary_year,
        Number(basic_salary),
        Number(bonus || 0),
        Number(deduction || 0),
        net_salary,
        "Paid",
        payment_type,
        payment_date,
        remarks?.trim() || null,
      ]
    );


    return sendSuccessResponse(
      res,
      201,
      "Salary credited successfully.",
      result.rows[0]
    );


  } catch (error) {

    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to credit salary."
    );
  }
};

exports.getEmployeeSalaries = async (req, res) => {
  const now = new Date();

  const salary_month = req.query.salary_month
    ? Number(req.query.salary_month)
    : now.getMonth() + 1;

  const salary_year = req.query.salary_year
    ? Number(req.query.salary_year)
    : now.getFullYear();

  const { employee_type } = req.query;

  try {
    if (
      !Number.isInteger(salary_month) ||
      salary_month < 1 ||
      salary_month > 12
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid salary month."
      );
    }

    if (
      !Number.isInteger(salary_year) ||
      salary_year < 2000
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid salary year."
      );
    }

    let employeeCondition = "";

    if (employee_type) {
      if (employee_type === "Coach") {
        employeeCondition = `
          AND es.coach_id IS NOT NULL
        `;
      } else if (employee_type === "Staff") {
        employeeCondition = `
          AND es.staff_id IS NOT NULL
        `;
      } else {
        return sendErrorResponse(
          res,
          400,
          "Invalid employee_type. Use Coach or Staff."
        );
      }
    }

    let query = `
    (
      SELECT
        es.salary_id,
        c.coach_id AS employee_id,
        c.coach_code AS employee_code,
        c.full_name AS employee_name,
        'Coach' AS employee_type,

        $1::INTEGER AS salary_month,
        $2::INTEGER AS salary_year,

        es.salary_month AS actual_salary_month,
        es.salary_year AS actual_salary_year,

        es.basic_salary,
        es.bonus,
        es.deduction,
        es.net_salary,

        es.payment_status,
        es.payment_date,
        es.payment_type,
        es.remarks

      FROM tbl_coach c

      JOIN LATERAL (
        SELECT *
        FROM tbl_employee_salary
        WHERE coach_id = c.coach_id
          AND (
            salary_year < $2
            OR (
              salary_year = $2
              AND salary_month <= $1
            )
          )
        ORDER BY
          salary_year DESC,
          salary_month DESC,
          created_at DESC
        LIMIT 1
      ) es ON TRUE
    )

    UNION ALL

    (
      SELECT
        es.salary_id,
        s.staff_id AS employee_id,
        s.staff_code AS employee_code,
        s.full_name AS employee_name,
        'Staff' AS employee_type,

        $1::INTEGER AS salary_month,
        $2::INTEGER AS salary_year,

        es.salary_month AS actual_salary_month,
        es.salary_year AS actual_salary_year,

        es.basic_salary,
        es.bonus,
        es.deduction,
        es.net_salary,

        es.payment_status,
        es.payment_date,
        es.payment_type,
        es.remarks

      FROM tbl_staff s

      JOIN LATERAL (
        SELECT *
        FROM tbl_employee_salary
        WHERE staff_id = s.staff_id
          AND (
            salary_year < $2
            OR (
              salary_year = $2
              AND salary_month <= $1
            )
          )
        ORDER BY
          salary_year DESC,
          salary_month DESC,
          created_at DESC
        LIMIT 1
      ) es ON TRUE
    )
    `;
    if (employee_type === "Coach") {
      query = `
        SELECT *
        FROM (${query}) employees
        WHERE employee_type = 'Coach'
        ORDER BY employee_name;
      `;
    } else if (employee_type === "Staff") {
      query = `
        SELECT *
        FROM (${query}) employees
        WHERE employee_type = 'Staff'
        ORDER BY employee_name;
      `;
    } else {
      query = `
        SELECT *
        FROM (${query}) employees
        ORDER BY employee_type, employee_name;
      `;
    }

    const result = await pool.query(query, [
      salary_month,
      salary_year,
    ]);

    const requestedMonth = salary_month;
    const requestedYear = salary_year;

    const today = new Date();
    const currentDay = today.getDate();

    const data = result.rows.map((row) => {
      const actualMonth = Number(row.actual_salary_month);
      const actualYear = Number(row.actual_salary_year);

      // Salary already exists for requested month/year
      if (
        actualMonth === requestedMonth &&
        actualYear === requestedYear
      ) {
        return {
          ...row,
          salary_month: requestedMonth,
          salary_year: requestedYear,
          payment_status: row.payment_status,
          payment_date: row.payment_date,
        };
      }

      // Next eligible salary month
      let nextMonth = actualMonth + 1;
      let nextYear = actualYear;

      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }

      let paymentStatus = "Pending";
      let paymentDate = null;

      if (
        requestedMonth === nextMonth &&
        requestedYear === nextYear
      ) {
        if (currentDay <= 5) {
          paymentStatus = "Paid";
          paymentDate = row.payment_date;
        } else {
          paymentStatus = "Pending";
          paymentDate = null;
        }
      } else {
        paymentStatus = "Pending";
        paymentDate = null;
      }

      return {
        ...row,
        salary_month: requestedMonth,
        salary_year: requestedYear,
        payment_status: paymentStatus,
        payment_date: paymentDate,
      };
    });

    const statistics = {
      total_salary: 0,
      paid_salary: 0,
      pending_salary: 0,
      employees: data.length,
    };

    data.forEach((employee) => {
      if (employee.payment_status === "Paid") {
        statistics.paid_salary += 1;
        statistics.total_salary += Number(employee.net_salary || 0);
      } else {
        statistics.pending_salary += 1;
      }
    });

    return sendSuccessResponse(
      res,
      200,
      "Employee salaries fetched successfully.",
      {
        statistics,
        salaries: data,
      }
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

exports.getEligibleEmployees = async (req, res) => {
  const {
    employee_type,
    payment_date,
  } = req.query;

  try {
    if (!employee_type || !payment_date) {
      return sendErrorResponse(
        res,
        400,
        "employee_type and payment_date are required."
      );
    }

    if (!["Coach", "Staff"].includes(employee_type)) {
      return sendErrorResponse(
        res,
        400,
        "employee_type must be Coach or Staff."
      );
    }

    const paymentDateObj = new Date(payment_date);

    if (isNaN(paymentDateObj.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment date."
      );
    }

    const salary_month = paymentDateObj.getMonth() + 1;
    const salary_year = paymentDateObj.getFullYear();

    let query = "";

    if (employee_type === "Coach") {
      query = `
        SELECT
          coach_id AS employee_id,
          full_name AS employee_name
        FROM tbl_coach c
        WHERE c.is_active = TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM tbl_employee_salary es
            WHERE es.coach_id = c.coach_id
              AND es.salary_month = $1
              AND es.salary_year = $2
              AND es.payment_status = 'Paid'
          )
        ORDER BY full_name;
      `;
    } else {
      query = `
        SELECT
          staff_id AS employee_id,
          full_name AS employee_name
        FROM tbl_staff s
        WHERE s.is_active = TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM tbl_employee_salary es
            WHERE es.staff_id = s.staff_id
              AND es.salary_month = $1
              AND es.salary_year = $2
              AND es.payment_status = 'Paid'
          )
        ORDER BY full_name;
      `;
    }

    const result = await pool.query(query, [
      salary_month,
      salary_year,
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Employees fetched successfully.",
      result.rows
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch employees."
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

        CASE
          WHEN es.staff_id IS NOT NULL THEN s.salary
          ELSE c.salary
        END AS employee_salary,

        es.salary_month,
        es.salary_year,
        es.basic_salary,
        es.bonus,
        es.deduction,
        es.net_salary,
        es.payment_status,
        es.payment_date::DATE AS payment_date,
        es.remarks,
        es.created_at

      FROM tbl_employee_salary es

      LEFT JOIN tbl_staff s
        ON es.staff_id = s.staff_id

      LEFT JOIN tbl_coach c
        ON es.coach_id = c.coach_id

      WHERE es.salary_id = $1;
      `,
      [Number(salary_id)]
    );

    if (result.rowCount === 0) {
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

exports.getEmployeeSalaryHistory = async (req, res) => {
  const { staff_id, coach_id } = req.query;

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
      (staff_id &&
        (!Number.isInteger(Number(staff_id)) || Number(staff_id) <= 0)) ||
      (coach_id &&
        (!Number.isInteger(Number(coach_id)) || Number(coach_id) <= 0))
    ) {
      return sendErrorResponse(
        res,
        400,
        "Invalid employee ID."
      );
    }

    let profileQuery;
    let historyQuery;
    let params;

    if (staff_id) {
      params = [Number(staff_id)];

      // Staff Profile
      profileQuery = `
        SELECT
          staff_id AS employee_id,
          staff_code,
          full_name,
          phone_number,
          designation,
          salary,
          join_date,
          'Staff' AS employee_type
        FROM tbl_staff
        WHERE staff_id = $1;
      `;

      // Staff Salary History
      historyQuery = `
        SELECT
          salary_id,
          salary_month,
          salary_year,
          basic_salary,
          bonus,
          deduction,
          net_salary,
          payment_status,
          payment_date,
          remarks,
          created_at
        FROM tbl_employee_salary
        WHERE staff_id = $1
        ORDER BY
          salary_year DESC,
          salary_month DESC,
          created_at DESC;
      `;
    } else {
      params = [Number(coach_id)];

      // Coach Profile
      profileQuery = `
        SELECT
          coach_id AS employee_id,
          coach_code,
          full_name,
          phone_number,
          specialization,
          experience,
          rating,
          salary,
          join_date,
          is_active,
          'Coach' AS employee_type
        FROM tbl_coach
        WHERE coach_id = $1;
      `;

      // Coach Salary History
      historyQuery = `
        SELECT
          salary_id,
          salary_month,
          salary_year,
          basic_salary,
          bonus,
          deduction,
          net_salary,
          payment_status,
          payment_date,
          remarks,
          created_at
        FROM tbl_employee_salary
        WHERE coach_id = $1
        ORDER BY
          salary_year DESC,
          salary_month DESC,
          created_at DESC;
      `;
    }

    const [profileResult, historyResult] = await Promise.all([
      pool.query(profileQuery, params),
      pool.query(historyQuery, params),
    ]);

    if (profileResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Salary history fetched successfully.",
      {
        profile: profileResult.rows[0],
        salary_history: historyResult.rows,
      }
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch salary history."
    );
  }
};

exports.updateEmployeeSalary = async (req, res) => {
  const { salary_id } = req.params;

  if (!salary_id || isNaN(salary_id) || Number(salary_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid Salary ID."
    );
  }

  try {
    // Check salary exists
    const existingSalaryResult = await pool.query(
      `
      SELECT *
      FROM tbl_employee_salary
      WHERE salary_id = $1
      LIMIT 1;
      `,
      [salary_id]
    );

    if (existingSalaryResult.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Employee salary not found."
      );
    }

    const existingSalary = existingSalaryResult.rows[0];

    // Merge existing values with request body
    const updatedData = {
      staff_id:
        req.body.staff_id !== undefined
          ? req.body.staff_id
          : existingSalary.staff_id,

      coach_id:
        req.body.coach_id !== undefined
          ? req.body.coach_id
          : existingSalary.coach_id,

      basic_salary:
        req.body.basic_salary !== undefined
          ? Number(req.body.basic_salary)
          : Number(existingSalary.basic_salary),

      bonus:
        req.body.bonus !== undefined
          ? Number(req.body.bonus)
          : Number(existingSalary.bonus),

      deduction:
        req.body.deduction !== undefined
          ? Number(req.body.deduction)
          : Number(existingSalary.deduction),

      payment_date:
        req.body.payment_date !== undefined
          ? req.body.payment_date
          : existingSalary.payment_date,

      remarks:
        req.body.remarks !== undefined
          ? req.body.remarks
          : existingSalary.remarks,
    };

    // Employee validation
    if (!updatedData.staff_id && !updatedData.coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Either staff_id or coach_id is required."
      );
    }

    if (updatedData.staff_id && updatedData.coach_id) {
      return sendErrorResponse(
        res,
        400,
        "Only one of staff_id or coach_id can be provided."
      );
    }

    // Payment date validation
    const paymentDateObj = new Date(updatedData.payment_date);

    if (isNaN(paymentDateObj.getTime())) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment date."
      );
    }

    // Salary month/year from payment date
    let salary_month = existingSalary.salary_month;
    let salary_year = existingSalary.salary_year;

    if (req.body.payment_date !== undefined) {
      const paymentDateObj = new Date(updatedData.payment_date);

      if (isNaN(paymentDateObj.getTime())) {
        return sendErrorResponse(
          res,
          400,
          "Invalid payment date."
        );
      }

      salary_month = paymentDateObj.getMonth() + 1;
      salary_year = paymentDateObj.getFullYear();
    }

    // Salary validations
    if (updatedData.basic_salary <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Basic salary must be greater than zero."
      );
    }

    if (updatedData.bonus < 0) {
      return sendErrorResponse(
        res,
        400,
        "Bonus cannot be negative."
      );
    }

    if (updatedData.deduction < 0) {
      return sendErrorResponse(
        res,
        400,
        "Deduction cannot be negative."
      );
    }

    // Prevent duplicate salary
    let duplicateSalary;

    if (updatedData.staff_id) {
      duplicateSalary = await pool.query(
        `
        SELECT salary_id
        FROM tbl_employee_salary
        WHERE staff_id = $1
          AND salary_month = $2
          AND salary_year = $3
          AND salary_id <> $4
        LIMIT 1;
        `,
        [
          updatedData.staff_id,
          salary_month,
          salary_year,
          salary_id,
        ]
      );
    } else {
      duplicateSalary = await pool.query(
        `
        SELECT salary_id
        FROM tbl_employee_salary
        WHERE coach_id = $1
          AND salary_month = $2
          AND salary_year = $3
          AND salary_id <> $4
        LIMIT 1;
        `,
        [
          updatedData.coach_id,
          salary_month,
          salary_year,
          salary_id,
        ]
      );
    }

    if (duplicateSalary.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Salary has already been created for the selected employee for this month and year."
      );
    }

    // Calculate net salary
    const net_salary =
      updatedData.basic_salary +
      updatedData.bonus -
      updatedData.deduction;

    // Update record
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
        payment_status = 'Paid',
        payment_date = $9,
        remarks = $10
      WHERE salary_id = $11
      RETURNING *;
      `,
      [
        updatedData.staff_id || null,
        updatedData.coach_id || null,
        salary_month,
        salary_year,
        updatedData.basic_salary,
        updatedData.bonus,
        updatedData.deduction,
        net_salary,
        updatedData.payment_date,
        updatedData.remarks?.trim() || null,
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