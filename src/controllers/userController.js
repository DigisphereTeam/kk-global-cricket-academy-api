const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const pool = require("../config/dbConfig");

exports.registerPrimary = async (req, res) => {
  let {
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

    full_name = full_name.trim();
    email = email.trim().toLowerCase();
    phone_number = phone_number.trim();

    const existingUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE email = $1
         OR phone_number = $2
      `,
      [email, phone_number]
    );

    if (existingUser.rowCount > 0) {
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

  if (!user_id || isNaN(user_id) || Number(user_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid user ID."
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

  if (!user_id || isNaN(user_id) || Number(user_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid user ID."
    );
  }

  try {
    const user = await pool.query(
      `
      SELECT *
      FROM tbl_users
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (user.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "User not found."
      );
    }

    const allowedFields = [
      "full_name",
      "email",
      "phone_number",
      "password",
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];

        if (typeof value === "string") {
          value = value.trim();
        }

        if (field === "email" && value) {
          value = value.toLowerCase();

          if (!/^\S+@\S+\.\S+$/.test(value)) {
            return sendErrorResponse(
              res,
              400,
              "Invalid email address."
            );
          }
        }

        if (field === "phone_number" && value) {
          if (!/^[6-9]\d{9}$/.test(value)) {
            return sendErrorResponse(
              res,
              400,
              "Invalid phone number."
            );
          }
        }

        if (field === "password") {
          if (!value) {
            return sendErrorResponse(
              res,
              400,
              "Password cannot be empty."
            );
          }

          if (value.length < 8) {
            return sendErrorResponse(
              res,
              400,
              "Password must be at least 8 characters long."
            );
          }

          // Hash the password before storing it
          value = await bcrypt.hash(value, 10);
        }

        updates.push(`${field} = $${index}`);
        values.push(value === "" ? null : value);
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

    const email =
      req.body.email?.trim().toLowerCase() ||
      user.rows[0].email;

    const phone_number =
      req.body.phone_number?.trim() ||
      user.rows[0].phone_number;

    const existingUser = await pool.query(
      `
      SELECT user_id
      FROM tbl_users
      WHERE
        (
          LOWER(email) = LOWER($1)
          OR phone_number = $2
        )
        AND user_id <> $3
      `,
      [
        email,
        phone_number,
        user_id,
      ]
    );

    if (existingUser.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Email or phone number already exists."
      );
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    values.push(user_id);

    const result = await pool.query(
      `
      UPDATE tbl_users
      SET ${updates.join(", ")}
      WHERE user_id = $${index}
      RETURNING
        user_id,
        full_name,
        email,
        phone_number,
        role,
        created_at,
        updated_at;
      `,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "User updated successfully.",
      result.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Failed to update user."
    );
  }
};

exports.deleteUser = async (req, res) => {
  const { user_id } = req.params;

  if (!user_id || isNaN(user_id) || Number(user_id) <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Invalid user ID."
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