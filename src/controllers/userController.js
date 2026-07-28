const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");


exports.registerPrimary = async (req, res) => {
  const {
    full_name,
    email,
    phone_number,
    password,
  } = req.body;

  try {
    if (
      !full_name ||
      !email ||
      !phone_number ||
      !password
    ) {
      return sendErrorResponse(
        res,
        400,
        "Full name, email, phone number and password are required."
      );
    }

    const existingUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE email = $1
         OR phone_number = $2
      `,
      [email, phone_number]
    );

    if (existingUser.rows.length > 0) {
      return sendErrorResponse(
        res,
        409,
        "User already exists."
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO tbl_users
      (
        full_name,
        email,
        phone_number,
        password,
        role
      )
      VALUES
      (
        $1,$2,$3,$4,'PRIMARY'
      )
      RETURNING
      user_id,
      full_name,
      email,
      phone_number,
      role,
      created_at;
      `,
      [
        full_name,
        email,
        phone_number,
        hashedPassword,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Primary user registered successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to register primary user."
    );
  }
};

exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        user_id,
        full_name,
        email,
        phone_number,
        role,
        created_at
      FROM tbl_users
      ORDER BY created_at DESC
    `);

    return sendSuccessResponse(
      res,
      200,
      "Users fetched successfully.",
      result.rows
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch users."
    );
  }
};

exports.getUserById = async (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    return sendErrorResponse(
      res,
      400,
      "User ID is required."
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT
        user_id,
        full_name,
        email,
        phone_number,
        role,
        created_at
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (result.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "User fetched successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch user."
    );
  }
};

exports.updateUser = async (req, res) => {
  const { user_id } = req.params;

  const {
    full_name,
    email,
    phone_number,
  } = req.body;

  if (!user_id) {
    return sendErrorResponse(
      res,
      400,
      "User ID is required."
    );
  }

  if (!full_name || !email || !phone_number) {
    return sendErrorResponse(
      res,
      400,
      "Full name, email and phone number are required."
    );
  }

  try {
    const checkUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (checkUser.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    const existingUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE (email = $1 OR phone_number = $2)
      AND user_id <> $3
      `,
      [email, phone_number, user_id]
    );

    if (existingUser.rows.length > 0) {
      return sendErrorResponse(
        res,
        409,
        "Email or phone number already exists."
      );
    }

    const result = await pool.query(
      `
      UPDATE tbl_users
      SET
        full_name = $1,
        email = $2,
        phone_number = $3
      WHERE user_id = $4
      RETURNING
        user_id,
        full_name,
        email,
        phone_number,
        role,
        created_at
      `,
      [
        full_name,
        email,
        phone_number,
        user_id,
      ]
    );

    return sendSuccessResponse(
      res,
      200,
      "User updated successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to update user."
    );
  }
};

exports.deleteUser = async (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    return sendErrorResponse(
      res,
      400,
      "User ID is required."
    );
  }

  try {
    const checkUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (checkUser.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    await pool.query(
      `
      DELETE FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    return sendSuccessResponse(
      res,
      200,
      "User deleted successfully."
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to delete user."
    );
  }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  const { user_id } = req.user || {};

  if (!user_id) {
    return sendErrorResponse(
      res,
      401,
      "Unauthorized."
    );
  }

  if (!current_password || !new_password) {
    return sendErrorResponse(
      res,
      400,
      "Current password and new password are required."
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT password
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (result.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    const isPasswordMatched = await bcrypt.compare(
      current_password,
      result.rows[0].password
    );

    if (!isPasswordMatched) {
      return sendErrorResponse(
        res,
        400,
        "Current password is incorrect."
      );
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      `
      UPDATE tbl_users
      SET password = $1
      WHERE user_id = $2
      `,
      [hashedPassword, user_id]
    );

    return sendSuccessResponse(
      res,
      200,
      "Password changed successfully."
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to change password."
    );
  }
};

exports.getProfile = async (req, res) => {
  const { user_id } = req.user || {};

  if (!user_id) {
    return sendErrorResponse(
      res,
      401,
      "Unauthorized."
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT
        user_id,
        full_name,
        email,
        phone_number,
        role,
        created_at
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (result.rows.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Profile fetched successfully.",
      result.rows[0]
    );
  } catch (error) {
    console.error(error);

    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to fetch profile."
    );
  }
};