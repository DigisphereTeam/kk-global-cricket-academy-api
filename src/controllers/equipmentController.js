const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.createEquipment = async (req, res) => {
  const {
    equipment_name,
    equipment_code,
    purchased_quantity,
    unit_price,
    broken_quantity = 0,
    lost_quantity = 0,
    issued_quantity = 0,
  } = req.body;

  try {
    // Required field validation
    if (
      !equipment_name ||
      !equipment_code ||
      purchased_quantity === undefined ||
      unit_price === undefined
    ) {
      return sendErrorResponse(
        res,
        400,
        "Equipment name, equipment code, purchased quantity and unit price are required."
      );
    }

    // Name validation
    if (equipment_name.trim().length < 3) {
      return sendErrorResponse(
        res,
        400,
        "Equipment name must contain at least 3 characters."
      );
    }

    // Code validation
    if (equipment_code.trim().length < 3) {
      return sendErrorResponse(
        res,
        400,
        "Equipment code is invalid."
      );
    }

    // Negative value validation
    if (
      purchased_quantity < 0 ||
      unit_price < 0 ||
      broken_quantity < 0 ||
      lost_quantity < 0 ||
      issued_quantity < 0
    ) {
      return sendErrorResponse(
        res,
        400,
        "Quantity and price cannot be negative."
      );
    }

    // Quantity validations
    if (broken_quantity > purchased_quantity) {
      return sendErrorResponse(
        res,
        400,
        "Broken quantity cannot exceed purchased quantity."
      );
    }

    if (lost_quantity > purchased_quantity) {
      return sendErrorResponse(
        res,
        400,
        "Lost quantity cannot exceed purchased quantity."
      );
    }

    if (issued_quantity > purchased_quantity) {
      return sendErrorResponse(
        res,
        400,
        "Issued quantity cannot exceed purchased quantity."
      );
    }

    if (
      broken_quantity + lost_quantity + issued_quantity >
      purchased_quantity
    ) {
      return sendErrorResponse(
        res,
        400,
        "Broken, lost and issued quantities together cannot exceed purchased quantity."
      );
    }

    // Duplicate equipment code
    const equipmentExists = await pool.query(
      `SELECT equipment_id
       FROM tbl_equipment
       WHERE LOWER(equipment_code) = LOWER($1)`,
      [equipment_code.trim()]
    );

    if (equipmentExists.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Equipment code already exists."
      );
    }

    // Calculate available quantity
    const available_quantity =
      purchased_quantity -
      broken_quantity -
      lost_quantity -
      issued_quantity;

    // Status
    let status = "In Stock";

    if (available_quantity === 0) {
      status = "Out of Stock";
    } else if (available_quantity <= 5) {
      status = "Low Stock";
    }

    // Insert
    const result = await pool.query(
      `INSERT INTO tbl_equipment
      (
        equipment_name,
        equipment_code,
        purchased_quantity,
        unit_price,
        broken_quantity,
        lost_quantity,
        issued_quantity,
        available_quantity,
        status
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        equipment_name.trim(),
        equipment_code.trim().toUpperCase(),
        purchased_quantity,
        unit_price,
        broken_quantity,
        lost_quantity,
        issued_quantity,
        available_quantity,
        status,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Equipment created successfully.",
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


exports.getAllEquipment = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM tbl_equipment
      ORDER BY equipment_id ASC
    `);

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "No equipment found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Equipment retrieved successfully.",
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

exports.getEquipmentById = async (req, res) => {
  const { equipment_id } = req.params;

  if (!equipment_id) {
    return sendErrorResponse(
      res,
      400,
      "Equipment ID is required."
    );
  }

  if (isNaN(equipment_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid equipment ID."
    );
  }

  try {
    const result = await pool.query(
      `SELECT *
       FROM tbl_equipment
       WHERE equipment_id = $1`,
      [equipment_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Equipment not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Equipment retrieved successfully.",
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


exports.updateEquipment = async (req, res) => {
  const { equipment_id } = req.params;

  if (!equipment_id) {
    return sendErrorResponse(res, 400, "Equipment ID is required.");
  }

  if (isNaN(equipment_id)) {
    return sendErrorResponse(res, 400, "Invalid equipment ID.");
  }

  try {
    const allowedFields = [
      "equipment_name",
      "equipment_code",
      "purchased_quantity",
      "unit_price",
      "broken_quantity",
      "lost_quantity",
      "issued_quantity"
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
      return sendErrorResponse(res, 400, "No fields provided to update.");
    }

    // Get existing equipment
    const existingEquipment = await pool.query(
      `SELECT * FROM tbl_equipment WHERE equipment_id = $1`,
      [equipment_id]
    );

    if (existingEquipment.rowCount === 0) {
      return sendErrorResponse(res, 404, "Equipment not found.");
    }

    const equipment = existingEquipment.rows[0];

    const purchased_quantity =
      req.body.purchased_quantity ?? equipment.purchased_quantity;

    const broken_quantity =
      req.body.broken_quantity ?? equipment.broken_quantity;

    const lost_quantity =
      req.body.lost_quantity ?? equipment.lost_quantity;

    const issued_quantity =
      req.body.issued_quantity ?? equipment.issued_quantity;

    if (
      broken_quantity + lost_quantity + issued_quantity >
      purchased_quantity
    ) {
      return sendErrorResponse(
        res,
        400,
        "Broken, lost and issued quantities together cannot exceed purchased quantity."
      );
    }

    const available_quantity =
      purchased_quantity -
      broken_quantity -
      lost_quantity -
      issued_quantity;

    let status = "In Stock";

    if (available_quantity === 0) {
      status = "Out of Stock";
    } else if (available_quantity <= 5) {
      status = "Low Stock";
    }

    updates.push(`available_quantity = $${index}`);
    values.push(available_quantity);
    index++;

    updates.push(`status = $${index}`);
    values.push(status);
    index++;

    values.push(equipment_id);

    const result = await pool.query(
      `
      UPDATE tbl_equipment
      SET ${updates.join(", ")}
      WHERE equipment_id = $${index}
      RETURNING *;
      `,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "Equipment updated successfully.",
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


exports.deleteEquipment = async (req, res) => {
  const { equipment_id } = req.params;

  if (!equipment_id) {
    return sendErrorResponse(
      res,
      400,
      "Equipment ID is required."
    );
  }

  if (isNaN(equipment_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid equipment ID."
    );
  }

  try {
    const result = await pool.query(
      `DELETE FROM tbl_equipment
       WHERE equipment_id = $1
       RETURNING *`,
      [equipment_id]
    );

    if (result.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Equipment not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Equipment deleted successfully.",
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