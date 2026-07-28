const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

// exports.createGround = async (req, res) => {
//     const {
//         ground_name,
//         ground_type,
//         location,
//         hourly_rate,
//         status
//     } = req.body;

//     try {

//         const groundExists = await pool.query(
//             `SELECT * FROM tbl_ground
//              WHERE LOWER(ground_name) = LOWER($1)`,
//             [ground_name]
//         );

//         if (groundExists.rows.length > 0) {
//             return res.status(409).json({
//                 success: false,
//                 statusCode: 409,
//                 message: "Ground already exists."
//             });
//         }

//         const result = await pool.query(
//             `INSERT INTO tbl_ground
//             (
//                 ground_name,
//                 ground_type,
//                 location,
//                 hourly_rate,
//                 status
//             )
//             VALUES
//             ($1,$2,$3,$4,$5)
//             RETURNING *`,
//             [
//                 ground_name,
//                 ground_type,
//                 location,
//                 hourly_rate,
//                 status
//             ]
//         );

//         return res.status(201).json({
//             success: true,
//             statusCode: 201,
//             message: "Ground created successfully.",
//             data: result.rows[0]
//         });

//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             statusCode: 500,
//             message: error.message
//         });
//     }
// };

exports.createGroundBooking = async (req, res) => {
  const {
    customer_name,
    customer_phone,
    ground_name,
    purpose,
    booking_date,
    time_slot,
    payment_type,
    total_amount,
    advance_paid,
  } = req.body;

  try {

    if (
      !customer_name ||
      !customer_phone ||
      !ground_name ||
      !purpose ||
      !booking_date ||
      !time_slot ||
      !payment_type ||
      total_amount == null ||
      advance_paid == null
    ) {
      return sendErrorResponse(
        res,
        400,
        "All fields are required."
      );
    }

    if (!/^[6-9]\d{9}$/.test(customer_phone)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid customer phone number."
      );
    }

    if (total_amount <= 0 || advance_paid < 0) {
      return sendErrorResponse(
        res,
        400,
        "Invalid payment amount."
      );
    }

    if (advance_paid > total_amount) {
      return sendErrorResponse(
        res,
        400,
        "Advance amount cannot be greater than total amount."
      );
    }

    const existingBooking = await pool.query(
      `
      SELECT 1
      FROM tbl_ground_booking
      WHERE LOWER(ground_name) = LOWER($1)
      AND booking_date = $2
      AND time_slot = $3
      `,
      [
        ground_name.trim(),
        booking_date,
        time_slot,
      ]
    );

    if (existingBooking.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "This ground is already booked for the selected date and time slot."
      );
    }

    const booking = await pool.query(
      `
      INSERT INTO tbl_ground_booking
      (
        customer_name,
        customer_phone,
        ground_name,
        purpose,
        booking_date,
        time_slot,
        payment_type,
        total_amount,
        advance_paid
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        customer_name.trim(),
        customer_phone,
        ground_name.trim(),
        purpose.trim(),
        booking_date,
        time_slot,
        payment_type,
        total_amount,
        advance_paid,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Ground booking created successfully.",
      booking.rows[0]
    );

  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.getAllGroundBookings = async (req, res) => {

    try {

        const bookings = await pool.query(
            `
            SELECT *
            FROM tbl_ground_booking
            ORDER BY booking_id DESC
            `
        );

        return sendSuccessResponse(
            res,
            200,
            "Ground bookings fetched successfully.",
            {
                total_bookings: bookings.rowCount,
                bookings: bookings.rows,
            }
        );


    } catch (error) {

        return sendErrorResponse(
            res,
            500,
            "Internal Server Error",
            error.message
        );

    }

};


exports.getGroundBookingById = async (req, res) => {

    const { booking_id } = req.params;


    if (!booking_id || isNaN(booking_id)) {

        return sendErrorResponse(
            res,
            400,
            "Invalid booking ID."
        );

    }


    try {

        const booking = await pool.query(
            `
            SELECT *
            FROM tbl_ground_booking
            WHERE booking_id = $1
            `,
            [booking_id]
        );

        if (booking.rowCount === 0) {

            return sendErrorResponse(
                res,
                404,
                "Ground booking not found."
            );

        }

        return sendSuccessResponse(
            res,
            200,
            "Ground booking fetched successfully.",
            booking.rows[0]
        );


    } catch (error) {

        return sendErrorResponse(
            res,
            500,
            "Internal Server Error",
            error.message
        );

    }

};


exports.updateGroundBooking = async (req, res) => {

    const { booking_id } = req.params;


    if (!booking_id) {

        return sendErrorResponse(
            res,
            400,
            "Booking ID is required."
        );

    }

    if (isNaN(booking_id)) {

        return sendErrorResponse(
            res,
            400,
            "Invalid booking ID."
        );

    }

    try {


        const allowedFields = [
            "customer_name",
            "customer_phone",
            "ground_name",
            "purpose",
            "booking_date",
            "time_slot",
            "payment_type",
            "total_amount",
            "advance_paid",
            "status"
        ];



        const updates = [];
        const values = [];

        let index = 1;

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(
                    `${field} = $${index}`
                );
                values.push(
                    req.body[field]
                );
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

        const existingBooking = await pool.query(
            `
            SELECT booking_id
            FROM tbl_ground_booking
            WHERE booking_id = $1
            `,
            [booking_id]
        );


        if (existingBooking.rowCount === 0) {
            return sendErrorResponse(
                res,
                404,
                "Ground booking not found."
            );

        }

        updates.push(
            "updated_at = CURRENT_TIMESTAMP"
        );

        values.push(booking_id);

        const updatedBooking = await pool.query(
            `
            UPDATE tbl_ground_booking
            SET ${updates.join(", ")}
            WHERE booking_id = $${index}
            RETURNING *
            `,
            values
        );


        return sendSuccessResponse(
            res,
            200,
            "Ground booking updated successfully.",
            updatedBooking.rows[0]
        );


    } catch (error) {

        return sendErrorResponse(
            res,
            500,
            "Internal Server Error",
            error.message
        );

    }

};


exports.deleteGroundBooking = async (req, res) => {

    const { booking_id } = req.params;

    if (!booking_id || isNaN(booking_id)) {

        return sendErrorResponse(
            res,
            400,
            "Invalid booking ID."
        );

    }

    try {


        const deleted = await pool.query(
            `
            DELETE FROM tbl_ground_booking
            WHERE booking_id = $1
            RETURNING *
            `,
            [booking_id]
        );


        if (deleted.rowCount === 0) {
            return sendErrorResponse(
                res,
                404,
                "Ground booking not found."
            );

        }

        return sendSuccessResponse(
            res,
            200,
            "Ground booking deleted successfully."
        );


    } catch (error) {

        return sendErrorResponse(
            res,
            500,
            "Internal Server Error",
            error.message
        );

    }

};