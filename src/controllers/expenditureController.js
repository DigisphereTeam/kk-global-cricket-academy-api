const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.createExpenditure = async (req, res) => {
  const {
    title,
    amount,
    payment_method,
    expenditure_date,
    purpose,
  } = req.body;

  try {

    if (
      !title ||
      amount == null ||
      !payment_method ||
      !expenditure_date
    ) {
      return sendErrorResponse(
        res,
        400,
        "All required fields must be provided."
      );
    }

    if (amount <= 0) {
      return sendErrorResponse(
        res,
        400,
        "Amount must be greater than zero."
      );
    }

    const result = await pool.query(
      `
      INSERT INTO tbl_expenditure
      (
        title,
        amount,
        payment_method,
        expenditure_date,
        purpose
      )
      VALUES
      ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [
        title.trim(),
        amount,
        payment_method,
        expenditure_date,
        purpose,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Expenditure added successfully.",
      result.rows[0]
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

exports.getAllExpenditures = async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT *
       FROM tbl_expenditure
       ORDER BY expenditure_id DESC`
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "No expenditure records found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Expenditures retrieved successfully.",
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

exports.getExpenditureById = async (req, res) => {
  const { expenditure_id } = req.params;

  if (!expenditure_id || isNaN(expenditure_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid expenditure ID."
    );
  }

  try {

    const result = await pool.query(
      `SELECT *
       FROM tbl_expenditure
       WHERE expenditure_id = $1`,
      [expenditure_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Expenditure not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Expenditure retrieved successfully.",
      result.rows[0]
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};

exports.updateExpenditure = async (req, res) => {
  const { expenditure_id } = req.params;

  if (!expenditure_id || isNaN(expenditure_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid expenditure ID."
    );
  }

  try {

    const allowedFields = [
      "title",
      "amount",
      "payment_method",
      "expenditure_date",
      "purpose"
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${index}`);
        values.push(req.body[field]);
        index++;
      }
    }

    if (updates.length === 0) {
      return sendErrorResponse(
        res,
        400,
        "No fields provided to update."
      );
    }

    values.push(expenditure_id);

    const result = await pool.query(
      `
      UPDATE tbl_expenditure
      SET ${updates.join(", ")}
      WHERE expenditure_id = $${index}
      RETURNING *
      `,
      values
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Expenditure not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Expenditure updated successfully.",
      result.rows[0]
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.deleteExpenditure = async (req, res) => {
  const { expenditure_id } = req.params;

  if (!expenditure_id || isNaN(expenditure_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid expenditure ID."
    );
  }

  try {

    const result = await pool.query(
      `
      DELETE FROM tbl_expenditure
      WHERE expenditure_id = $1
      RETURNING *
      `,
      [expenditure_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Expenditure not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Expenditure deleted successfully.",
      result.rows[0]
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};