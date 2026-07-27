const pool = require("../config/dbConfig");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/apiResponse");


exports.createStudentAdmission = async (req, res) => {

  const {
    admission_id,
    full_name,
    gender,
    age,
    phone_number,
    email,
    address,
    school,
    playing_role,
    batting_style,
    admission_fee,
    father_name,
    father_phone,
    father_occupation,
    mother_name,
    mother_phone,
    contact_name,
    relation,
    contact_phone,
    blood_group,
    allergies,
    medical_conditions,
  } = req.body;


  try {

    const existingStudent = await pool.query(
      `
      SELECT 1
      FROM tbl_students
      WHERE admission_id = $1
        OR phone_number = $2
        OR email = $3
      LIMIT 1;
      `,
      [admission_id, phone_number, email]
    );

    if (existingStudent.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Student already exists"
      );
    }

    const result = await pool.query(
      `
      INSERT INTO tbl_students
      (
        admission_id,
        full_name,
        gender,
        age,
        phone_number,
        email,
        address,
        school,
        playing_role,
        batting_style,
        admission_fee,
        father_name,
        father_phone,
        father_occupation,
        mother_name,
        mother_phone,
        contact_name,
        relation,
        contact_phone,
        blood_group,
        allergies,
        medical_conditions
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      )
      RETURNING *
      `,
      [
        admission_id,
        full_name,
        gender,
        age,
        phone_number,
        email,
        address,
        school,
        playing_role,
        batting_style,
        admission_fee,
        father_name,
        father_phone,
        father_occupation,
        mother_name,
        mother_phone,
        contact_name,
        relation,
        contact_phone,
        blood_group,
        allergies,
        medical_conditions,
      ]
    );


    return sendSuccessResponse(
      res,
      201,
      "Student admission created successfully.",
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


exports.getAllStudents = async (req, res) => {

  try {

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_students
      ORDER BY student_id DESC
      `
    );


    return sendSuccessResponse(
      res,
      200,
      "Students fetched successfully.",
      {
        total_students: result.rowCount,
        students: result.rows,
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


exports.getStudentById = async (req, res) => {

  const { student_id } = req.params;

  if (!student_id) {
    return sendErrorResponse(
      res,
      400,
      "Student ID is required"
    );
  }
  if (!student_id || isNaN(student_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid student ID"
    );
  }


  try {

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_students
      WHERE student_id=$1
      `,
      [student_id]
    );


    if (result.rowCount === 0) {

      return sendErrorResponse(
        res,
        404,
        "Student not found."
      );

    }


    return sendSuccessResponse(
      res,
      200,
      "Student fetched successfully.",
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


exports.updateStudent = async (req, res) => {
  const { student_id } = req.params;

  if (!student_id) {
    return sendErrorResponse(res, 400, "Student ID is required");
  }

  if (isNaN(student_id)) {
    return sendErrorResponse(res, 400, "Invalid student ID");
  }

  try {
    const allowedFields = [
      "full_name",
      "gender",
      "age",
      "phone_number",
      "email",
      "address",
      "school",
      "playing_role",
      "batting_style",
      "admission_fee",
      "father_name",
      "father_phone",
      "father_occupation",
      "mother_name",
      "mother_phone",
      "contact_name",
      "relation",
      "contact_phone",
      "blood_group",
      "allergies",
      "medical_conditions",
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
        "No fields provided to update"
      );
    }

    // Check duplicate phone number
    if (req.body.phone_number) {
      const existingStudent = await pool.query(
        `
        SELECT 1
        FROM tbl_students
        WHERE phone_number = $1
          AND student_id <> $2
        LIMIT 1
        `,
        [req.body.phone_number, student_id]
      );

      if (existingStudent.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Phone number already exists"
        );
      }
    }

    // Check duplicate email
    if (req.body.email) {
      const existingEmail = await pool.query(
        `
        SELECT 1
        FROM tbl_students
        WHERE email = $1
          AND student_id <> $2
        LIMIT 1
        `,
        [req.body.email, student_id]
      );

      if (existingEmail.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Email already exists"
        );
      }
    }

    // Add student_id for WHERE clause
    values.push(student_id);

    const result = await pool.query(
      `
      UPDATE tbl_students
      SET ${updates.join(", ")}
      WHERE student_id = $${index}
      RETURNING *;
      `,
      values
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Student not found"
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Student updated successfully",
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


exports.deleteStudent = async (req, res) => {

  const { student_id } = req.params;

  if (!student_id) {
    return sendErrorResponse(
      res,
      400,
      "Student ID is required"
    );
  }
  if (!student_id || isNaN(student_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid student ID"
    );
  }


  try {

    const result = await pool.query(
      `
      DELETE FROM tbl_students
      WHERE student_id=$1
      RETURNING *
      `,
      [student_id]
    );


    if (result.rowCount === 0) {

      return sendErrorResponse(
        res,
        404,
        "Student not found."
      );

    }


    return sendSuccessResponse(
      res,
      200,
      "Student deleted successfully."
    );


  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }

};


exports.searchStudents = async (req, res) => {
  const { keyword } = req.query;

  if (!keyword || !keyword.trim()) {
    return sendErrorResponse(
      res,
      400,
      "Search keyword is required"
    );
  }

  try {
    const searchKeyword = `%${keyword.trim()}%`;

    const result = await pool.query(
      `
      SELECT *
      FROM tbl_students
      WHERE
        full_name ILIKE $1
        OR admission_id ILIKE $1
        OR phone_number ILIKE $1
        OR school ILIKE $1
      ORDER BY student_id DESC;
      `,
      [searchKeyword]
    );

    return sendSuccessResponse(
      res,
      200,
      "Students retrieved successfully.",
      {
        totalStudents: result.rowCount,
        students: result.rows,
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