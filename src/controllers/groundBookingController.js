const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

const statusFlow = {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Completed", "Cancelled"],
    Completed: [],
    Cancelled: [],
};

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


const userResult = await pool.query(
  `
  SELECT full_name
  FROM tbl_users
  WHERE user_id = $1
  `,
  [req.user.user_id]
);

const performedBy = userResult.rows[0].full_name;


await pool.query(
  `
  INSERT INTO tbl_notification_logs
  (
    module_name,
    action,
    description,
    performed_by
  )
  VALUES
  ($1,$2,$3,$4)
  `,
  [
    "Ground Booking",
    "Created",
    `Ground was booked by ${booking.rows[0].customer_name} for ${booking.rows[0].booking_date} for time slot (${booking.rows[0].time_slot}).`,
    performedBy,
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
        const [bookings, statistics] = await Promise.all([
            pool.query(
                `
                SELECT *
                FROM tbl_ground_booking
                ORDER BY booking_id DESC
                `
            ),

            pool.query(
                `
            SELECT
                COUNT(*) AS total_bookings,
                COUNT(*) FILTER ( WHERE LOWER(status) = 'confirmed') AS confirmed_bookings,
                COUNT(*) FILTER ( WHERE LOWER(status) = 'pending' ) AS pending_bookings,
                COUNT(*) FILTER ( WHERE LOWER(status) = 'completed' ) AS completed_bookings,
                COUNT(*) FILTER ( WHERE booking_date >= CURRENT_DATE ) AS upcoming_bookings
            FROM tbl_ground_booking
            `
            ),
        ]);

        return sendSuccessResponse(
            res,
            200,
            "Ground bookings fetched successfully.",
            {
                statistics: {
                    total_bookings: Number(statistics.rows[0].total_bookings),
                    confirmed_bookings: Number(statistics.rows[0].confirmed_bookings),
                    pending_bookings: Number(statistics.rows[0].pending_bookings),
                    completed_bookings: Number(statistics.rows[0].completed_bookings),
                    upcoming_bookings: Number(statistics.rows[0].upcoming_bookings),
                },
                bookings: bookings.rows,
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
            error.message || "Internal Server Error"
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

    const allowedStatuses = ["Pending", "Confirmed", "Completed", "Cancelled"];

    if (req.body.status !== undefined) {
        const isValidStatus = allowedStatuses.some(
            (status) =>
                status === req.body.status
        );

        if (!isValidStatus) {
            return sendErrorResponse(
                res,
                400,
                `Invalid status. Allowed values are: ${allowedStatuses.join(", ")}.`
            );
        }
    }

    const userRole = req.user.role;

    if (req.body.status === "Confirmed" && userRole !== "Admin") {
        return sendErrorResponse(
            res,
            403,
            "Only admins can approve ground bookings."
        );
    }

    try {

        const allowedFields = ["customer_name", "customer_phone", "ground_name", "purpose", "booking_date", "time_slot", "payment_type", "total_amount", "advance_paid", "status"];

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

        const existingBooking = await pool.query(
            `
            SELECT booking_id , status
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

        const currentStatus = existingBooking.rows[0].status;
        const newStatus = req.body.status;

        if (newStatus && newStatus !== currentStatus) {
            const allowedTransitions = statusFlow[currentStatus] || [];

            if (!allowedTransitions.includes(newStatus)) {
                return sendErrorResponse(
                    res,
                    400,
                    `Status cannot be changed from ${currentStatus} to ${newStatus}.`
                );
            }
        }

        updates.push("updated_at = CURRENT_TIMESTAMP");
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
            error.message || "Internal Server Error"
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
            error.message || "Internal Server Error"
        );

    }

};