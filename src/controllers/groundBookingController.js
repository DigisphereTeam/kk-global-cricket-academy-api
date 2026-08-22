const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

const statusFlow = {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Completed", "Cancelled"],
    Completed: [],
    Cancelled: [],
};

exports.createGroundBooking = async (req, res) => {
    let client;

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

        // Time slot validation (HH:MM - HH:MM)
        // if (
        //     !/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/.test(
        //         time_slot
        //     )
        // ) {
        //     return sendErrorResponse(
        //         res,
        //         400,
        //         "Invalid time slot format. Use HH:MM - HH:MM."
        //     );
        // }

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

        const remaining_amount = total_amount - advance_paid;

        client = await pool.connect();

        await client.query("BEGIN");

        // Generate Booking Code (GB260001)
        const currentYear = new Date().getFullYear();
        const yearCode = String(currentYear).slice(-2);
        const prefix = `GB${yearCode}`;

        await client.query(
            `SELECT pg_advisory_xact_lock($1)`,
            [currentYear]
        );

        const bookingResult = await client.query(
            `
            SELECT COALESCE(
                MAX(
                CAST(SUBSTRING(booking_code FROM 5) AS INTEGER)
                ),
                0
            ) AS last_number
            FROM tbl_ground_booking
            WHERE booking_code LIKE $1
            `,
            [`${prefix}%`]
        );

        const nextNumber = Number(bookingResult.rows[0].last_number) + 1;

        const booking_code = `${prefix}${String(nextNumber).padStart(4, "0")}`;
        // Check duplicate booking
        const existingBooking = await client.query(
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
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                409,
                "The selected time slot is already booked."
            );
        }

        // Create booking
        const booking = await client.query(
            `
      INSERT INTO tbl_ground_booking (
        booking_code,
        customer_name,
        customer_phone,
        purpose,
        booking_date,
        time_slot,
        payment_type,
        total_amount,
        advance_paid,
        remaining_amount,
        remarks,
        id_increment
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *;
      `,
            [
                booking_code,
                customer_name,
                customer_phone,
                purpose,
                booking_date,
                time_slot,
                payment_type,
                total_amount,
                advance_paid,
                remaining_amount,
                remarks,
                nextNumber,
            ]
        );

        // Get logged-in user
        const userResult = await client.query(
            `
      SELECT full_name
      FROM tbl_users
      WHERE user_id = $1
      `,
            [req.user.user_id]
        );

        const performedBy = userResult.rows[0];

        if (!performedBy) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                404,
                "Logged-in user not found."
            );
        }

        // Notification
        await client.query(
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
                `Ground booking ${booking.rows[0].booking_code} was created by ${booking.rows[0].customer_name} for ${booking.rows[0].booking_date} (${booking.rows[0].time_slot}).`,
                performedBy.full_name,
            ]
        );

        await client.query("COMMIT");

        return sendSuccessResponse(
            res,
            201,
            "Ground booking created successfully.",
            booking.rows[0]
        );
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }

        return sendErrorResponse(
            res,
            500,
            error.message || "Internal Server Error"
        );
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateExpiredGroundBookings = async (client) => {
    await client.query(`
        UPDATE tbl_ground_booking
        SET status = CASE
            WHEN LOWER(status) = 'pending' THEN 'Cancelled'
            WHEN LOWER(status) = 'confirmed' THEN 'Completed'
            ELSE status
        END
        WHERE LOWER(status) IN ('pending', 'confirmed')
          AND (
              booking_date < CURRENT_DATE
              OR (
                  booking_date = CURRENT_DATE
                  AND CURRENT_TIME >=
                      TO_TIMESTAMP(
                          booking_date::text || ' ' ||
                          TRIM(SPLIT_PART(time_slot, '-', 2)),
                          'YYYY-MM-DD HH12:MI AM'
                      )::time
              )
          )
    `);
};

exports.getAllGroundBookings = async (req, res) => {
    let client;

    try {
        client = await pool.connect();

        await client.query("BEGIN");

        await updateExpiredGroundBookings(client);

        const [bookings, statistics] = await Promise.all([
            client.query(`
                SELECT *
                FROM tbl_ground_booking
                ORDER BY booking_id DESC
            `),

            client.query(`
                SELECT
                    COUNT(*) AS total_bookings,

                    COUNT(*) FILTER (
                        WHERE LOWER(status) = 'confirmed'
                    ) AS confirmed_bookings,

                    COUNT(*) FILTER (
                        WHERE LOWER(status) = 'pending'
                    ) AS pending_bookings,

                    COUNT(*) FILTER (
                        WHERE LOWER(status) = 'completed'
                    ) AS completed_bookings,

                    COUNT(*) FILTER (
                        WHERE LOWER(status) = 'cancelled'
                    ) AS cancelled_bookings,

                    COUNT(*) FILTER (
                        WHERE booking_date >= CURRENT_DATE
                          AND LOWER(status) = 'confirmed'
                    ) AS upcoming_bookings

                FROM tbl_ground_booking
            `),
        ]);

        await client.query("COMMIT");

        const stats = statistics.rows[0];

        return sendSuccessResponse(
            res,
            200,
            "Ground bookings fetched successfully.",
            {
                statistics: {
                    total_bookings: Number(stats.total_bookings),
                    confirmed_bookings: Number(stats.confirmed_bookings),
                    pending_bookings: Number(stats.pending_bookings),
                    completed_bookings: Number(stats.completed_bookings),
                    cancelled_bookings: Number(stats.cancelled_bookings),
                    upcoming_bookings: Number(stats.upcoming_bookings),
                },
                bookings: bookings.rows,
            }
        );
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }

        console.error("Get All Ground Bookings Error:", error);

        return sendErrorResponse(
            res,
            500,
            error.message || "Internal Server Error"
        );
    } finally {
        if (client) {
            client.release();
        }
    }
};

exports.getMonthlyGroundBookingSlots = async (req, res) => {
    try {
        const { month, year } = req.query;

        const currentDate = new Date();

        const selectedMonth = month
            ? Number(month)
            : currentDate.getMonth() + 1;

        const selectedYear = year
            ? Number(year)
            : currentDate.getFullYear();

        if (
            !Number.isInteger(selectedMonth) ||
            selectedMonth < 1 ||
            selectedMonth > 12
        ) {
            return sendErrorResponse(
                res,
                400,
                "Month must be between 1 and 12."
            );
        }

        if (!Number.isInteger(selectedYear) || selectedYear < 2000) {
            return sendErrorResponse(
                res,
                400,
                "Invalid year."
            );
        }

        const result = await pool.query(
            `
            SELECT
                booking_date,
                time_slot
            FROM tbl_ground_booking
            WHERE EXTRACT(MONTH FROM booking_date) = $1
              AND EXTRACT(YEAR FROM booking_date) = $2
              AND LOWER(status) = 'confirmed'
            ORDER BY booking_date ASC, time_slot ASC
            `,
            [selectedMonth, selectedYear]
        );

        return sendSuccessResponse(
            res,
            200,
            "Monthly confirmed ground booking slots fetched successfully.",
            {
                month: selectedMonth,
                year: selectedYear,
                bookings: result.rows
            }
        );

    } catch (error) {
        console.error("Get Monthly Ground Booking Slots Error:", error);

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
    let client;

    const { booking_id } = req.params;

    if (!booking_id) {
        return sendErrorResponse(
            res,
            400,
            "Booking ID is required."
        );
    }

    if (!/^\d+$/.test(booking_id) || Number(booking_id) <= 0) {
        return sendErrorResponse(
            res,
            400,
            "Invalid booking ID."
        );
    }

    const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
        "Rescheduled Approved",
    ];

    if (
        req.body.status !== undefined &&
        !allowedStatuses.includes(req.body.status)
    ) {
        return sendErrorResponse(
            res,
            400,
            `Invalid status. Allowed values are: ${allowedStatuses.join(", ")}.`
        );
    }

    if (
        req.body.status === "Confirmed" &&
        req.user.role !== "ADMIN"
    ) {
        return sendErrorResponse(
            res,
            403,
            "Only admin can confirm ground bookings."
        );
    }

    try {
        client = await pool.connect();

        await client.query("BEGIN");

        const bookingResult = await client.query(
            `
            SELECT *
            FROM tbl_ground_booking
            WHERE booking_id = $1
            FOR UPDATE
            `,
            [Number(booking_id)]
        );

        if (bookingResult.rowCount === 0) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                404,
                "Ground booking not found."
            );
        }

        const currentBooking = bookingResult.rows[0];

        let {
            customer_name,
            customer_phone,
            purpose,
            booking_date,
            time_slot,
            payment_type,
            total_amount,
            advance_paid,
            remaining_amount,
            remarks,
            status,
        } = req.body;

        customer_name = customer_name?.trim();
        customer_phone = customer_phone?.trim();
        purpose = purpose?.trim();
        payment_type = payment_type?.trim();
        time_slot = time_slot?.trim();
        remarks = remarks?.trim() || null;

        if (booking_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const selectedDate = new Date(booking_date);

            if (Number.isNaN(selectedDate.getTime())) {
                await client.query("ROLLBACK");

                return sendErrorResponse(
                    res,
                    400,
                    "Invalid booking date."
                );
            }

            selectedDate.setHours(0, 0, 0, 0);

            if (
                selectedDate > today &&
                (
                    currentBooking.status === "Cancelled" ||
                    currentBooking.status === "Pending"
                ) &&
                status === undefined
            ) {
                status = "Rescheduled Approved";
            }
        }

        if (
            customer_phone &&
            !/^[6-9]\d{9}$/.test(customer_phone)
        ) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Invalid customer phone number."
            );
        }

        const allowedPaymentTypes = [
            "Cash",
            "UPI",
            "Card",
            "Bank Transfer",
        ];

        if (
            payment_type &&
            !allowedPaymentTypes.includes(payment_type)
        ) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Invalid payment type."
            );
        }

        const finalTotalAmount =
            total_amount !== undefined
                ? Number(total_amount)
                : Number(currentBooking.total_amount);

        const finalAdvancePaid =
            advance_paid !== undefined
                ? Number(advance_paid)
                : Number(currentBooking.advance_paid);

        const finalRemainingAmount =
            remaining_amount !== undefined
                ? Number(remaining_amount)
                : finalTotalAmount - finalAdvancePaid;

        if (
            Number.isNaN(finalTotalAmount) ||
            finalTotalAmount <= 0
        ) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Total amount must be greater than 0."
            );
        }

        if (
            Number.isNaN(finalAdvancePaid) ||
            finalAdvancePaid < 0
        ) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Advance paid cannot be negative."
            );
        }

        if (finalAdvancePaid > finalTotalAmount) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Advance paid cannot be greater than the total amount."
            );
        }

        if (
            Number.isNaN(finalRemainingAmount) ||
            finalRemainingAmount < 0
        ) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                400,
                "Remaining amount cannot be negative."
            );
        }

        const checkDate =
            booking_date || currentBooking.booking_date;

        const checkSlot =
            time_slot || currentBooking.time_slot;

        const duplicateBooking = await client.query(
            `
            SELECT booking_id
            FROM tbl_ground_booking
            WHERE booking_date = $1
                AND time_slot = $2
                AND status != 'Cancelled'
                AND booking_id <> $3
            LIMIT 1
            `,
            [
                checkDate,
                checkSlot,
                Number(booking_id),
            ]
        );

        if (duplicateBooking.rowCount > 0) {
            await client.query("ROLLBACK");

            return sendErrorResponse(
                res,
                409,
                "The selected time slot is already booked."
            );
        }

        const allowedFields = [
            "customer_name",
            "customer_phone",
            "purpose",
            "booking_date",
            "time_slot",
            "payment_type",
            "total_amount",
            "advance_paid",
            "remaining_amount",
            "remarks",
            "status",
        ];

        const updates = [];
        const values = [];
        let index = 1;

        for (const field of allowedFields) {
            let value;

            if (field === "remaining_amount") {
                if (remaining_amount !== undefined) {
                    value = finalRemainingAmount;
                } else {
                    value = finalTotalAmount - finalAdvancePaid;
                }
            } else if (field === "status") {
                if (status !== undefined) {
                    value = status;
                } else {
                    continue;
                }
            } else if (req.body[field] !== undefined) {
                value = req.body[field];
            } else {
                continue;
            }

            if (typeof value === "string") {
                value = value.trim();
            }

            updates.push(
                `${field} = $${index}`
            );

            values.push(
                value === "" ? null : value
            );

            index++;
        }

        updates.push(
            "updated_at = CURRENT_TIMESTAMP"
        );

        values.push(Number(booking_id));

        const updatedBooking = await client.query(
            `
            UPDATE tbl_ground_booking
            SET
                ${updates.join(", ")}
            WHERE booking_id = $${index}
            RETURNING *;
            `,
            values
        );

        const userResult = await client.query(
            `
            SELECT full_name
            FROM tbl_users
            WHERE user_id = $1
            `,
            [req.user.user_id]
        );

        const performedBy =
            userResult.rows[0]?.full_name ||
            "Unknown User";

        let action = "Updated";

        let description =
            `Ground booking ${updatedBooking.rows[0].booking_code} was updated.`;

        if (
            currentBooking.status === "Cancelled" &&
            status === "Rescheduled Approved"
        ) {
            action = "Rescheduled Approved";

            description =
                `Ground booking ${updatedBooking.rows[0].booking_code} was rescheduled and approved.`;
        } else if (
            currentBooking.status === "Pending" &&
            status === "Rescheduled Approved"
        ) {
            action = "Rescheduled Approved";

            description =
                `Ground booking ${updatedBooking.rows[0].booking_code} was rescheduled and approved.`;
        } else if (status === "Confirmed") {
            action = "Confirmed";

            description =
                `Ground booking ${updatedBooking.rows[0].booking_code} for ${updatedBooking.rows[0].customer_name} has been approved.`;
        } else if (status === "Cancelled") {
            action = "Cancelled";

            description =
                `Reason: ${updatedBooking.rows[0].remarks || "Not provided"}`;
        } else if (status === "Completed") {
            action = "Completed";

            description =
                `Ground booking ${updatedBooking.rows[0].booking_code} has been completed.`;
        }

        await client.query(
            `
            INSERT INTO tbl_notification_logs
            (
                module_name,
                action,
                description,
                performed_by
            )
            VALUES
            ($1, $2, $3, $4)
            `,
            [
                "Ground Booking",
                action,
                description,
                performedBy,
            ]
        );

        await client.query("COMMIT");

        return sendSuccessResponse(
            res,
            200,
            "Ground booking updated successfully.",
            updatedBooking.rows[0]
        );
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }

        console.error(
            "Update ground booking error:",
            error
        );

        return sendErrorResponse(
            res,
            500,
            error.message || "Internal Server Error"
        );
    } finally {
        if (client) {
            client.release();
        }
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