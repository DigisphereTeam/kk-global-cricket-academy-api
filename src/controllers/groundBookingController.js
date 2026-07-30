const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

const statusFlow = {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Completed", "Cancelled"],
    Completed: [],
    Cancelled: [],
};

exports.createGroundBooking = async (req, res) => {
    try {
        let {
            customer_name,
            customer_phone,
            purpose,
            booking_date,
            time_slot,
            payment_type,
            total_amount,
            advance_paid,
            remarks,
        } = req.body;

        // Trim string values
        customer_name = customer_name?.trim();
        customer_phone = customer_phone?.trim();
        purpose = purpose?.trim();
        payment_type = payment_type?.trim();
        time_slot = time_slot?.trim();
        remarks = remarks?.trim() || null;

        // Required field validation
        if (
            !customer_name ||
            !customer_phone ||
            !booking_date ||
            !time_slot ||
            !payment_type ||
            total_amount == null ||
            advance_paid == null
        ) {
            return sendErrorResponse(
                res,
                400,
                "Customer name, phone number, booking date, time slot, payment type, total amount, and advance paid are required."
            );
        }

        // Phone validation
        if (!/^[6-9]\d{9}$/.test(customer_phone)) {
            return sendErrorResponse(
                res,
                400,
                "Invalid customer phone number."
            );
        }

        // Booking date validation
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const bookingDate = new Date(booking_date);
        bookingDate.setHours(0, 0, 0, 0);

        if (bookingDate < today) {
            return sendErrorResponse(
                res,
                400,
                "Booking date cannot be in the past."
            );
        }

        // Payment type validation
        const allowedPaymentTypes = [
            "Cash",
            "UPI",
            "Card",
            "Bank Transfer",
        ];

        if (!allowedPaymentTypes.includes(payment_type)) {
            return sendErrorResponse(
                res,
                400,
                "Invalid payment type."
            );
        }

        // Amount validation
        total_amount = Number(total_amount);
        advance_paid = Number(advance_paid);

        if (isNaN(total_amount) || total_amount <= 0) {
            return sendErrorResponse(
                res,
                400,
                "Total amount must be greater than 0."
            );
        }

        if (isNaN(advance_paid) || advance_paid < 0) {
            return sendErrorResponse(
                res,
                400,
                "Advance paid cannot be negative."
            );
        }

        if (advance_paid > total_amount) {
            return sendErrorResponse(
                res,
                400,
                "Advance paid cannot be greater than the total amount."
            );
        }

        // Check duplicate booking for same date & slot
        const existingBooking = await pool.query(
            `
            SELECT booking_id
            FROM tbl_ground_booking
            WHERE booking_date = $1
                AND time_slot = $2
                AND status != 'Cancelled'
            `,
            [booking_date, time_slot]
        );

        if (existingBooking.rowCount > 0) {
            return sendErrorResponse(
                res,
                409,
                "The selected time slot is already booked."
            );
        }

        // Insert booking
        const booking = await pool.query(
            `
      INSERT INTO tbl_ground_booking (
        customer_name,
        customer_phone,
        purpose,
        booking_date,
        time_slot,
        payment_type,
        total_amount,
        advance_paid,
        remarks
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
            [
                customer_name,
                customer_phone,
                purpose,
                booking_date,
                time_slot,
                payment_type,
                total_amount,
                advance_paid,
                remarks,
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