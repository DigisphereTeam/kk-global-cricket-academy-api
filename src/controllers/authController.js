const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");
const pool = require("../config/dbConfig");

exports.signUp = async (req, res) => {
  const {
    full_name,
    email,
    phone_number,
    password,
    role,
  } = req.body;

  if (!full_name) {
    return sendErrorResponse(res, 400, "Full name is required");
  }

  if (!email) {
    return sendErrorResponse(res, 400, "Email is required");
  }

  if (!password) {
    return sendErrorResponse(res, 400, "Password is required");
  }

  const allowedRoles = ["ADMIN"];

  if (role && !allowedRoles.includes(role.toUpperCase())) {
    return sendErrorResponse(
      res,
      400,
      "Invalid role"
    );
  }

  try {
    // Check email already exists
    const existingEmail = await pool.query(
      `
      SELECT 1
      FROM tbl_users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (existingEmail.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Email already exists"
      );
    }

    // Check phone number already exists
    if (phone_number) {
      const existingPhone = await pool.query(
        `
        SELECT 1
        FROM tbl_users
        WHERE phone_number = $1
        LIMIT 1
        `,
        [phone_number]
      );

      if (existingPhone.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Phone number already exists"
        );
      }
    }

    // Hash password
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
        $1,$2,$3,$4,$5
      )
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
        phone_number || null,
        hashedPassword,
        role || "PRIMARY",
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "User created successfully.",
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

exports.signIn = async (req, res) => {
  let { email, password } = req.body;

  if (!email) {
    return sendErrorResponse(
      res,
      400,
      "Email is required."
    );
  }

  if (!password) {
    return sendErrorResponse(
      res,
      400,
      "Password is required."
    );
  }

  try {
    // Normalize email
    email = email.trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_users
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Invalid email or password."
      );
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return sendErrorResponse(
        res,
        404,
        "Invalid email or password."
      );
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2m",
      }
    );

    delete user.password;

    return sendSuccessResponse(
      res,
      200,
      "Sign in successful.",
      {
        token,
        user,
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};