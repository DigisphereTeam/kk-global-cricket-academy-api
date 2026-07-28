const pool = require("../config/dbConfig");
const { sendErrorResponse, sendSuccessResponse } = require("../utils/apiResponse");

exports.createEvent = async (req, res) => {
  const {
    event_name,
    event_type,
    event_date,
    venue,
    total_teams,
    description,
  } = req.body;

  try {

    const existingEvent = await pool.query(
      `
      SELECT event_id
      FROM tbl_events
      WHERE
        LOWER(event_name) = LOWER($1)
        AND event_date = $2
      LIMIT 1
      `,
      [event_name, event_date]
    );

    if (existingEvent.rowCount > 0) {
      return sendErrorResponse(
        res,
        409,
        "Event already exists for the selected date."
      );
    }

    const event = await pool.query(
      `
      INSERT INTO tbl_events
      (
        event_name,
        event_type,
        event_date,
        venue,
        total_teams,
        description
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6
      )
      RETURNING *
      `,
      [
        event_name,
        event_type,
        event_date,
        venue,
        total_teams,
        description,
      ]
    );

    return sendSuccessResponse(
      res,
      201,
      "Event created successfully.",
      event.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.getAllEvents = async (req, res) => {
  try {
    const [events, statistics] = await Promise.all([
      pool.query(
        `
        SELECT
          event_id,
          event_name,
          event_type,
          event_date,
          venue,
          total_teams,
          winner,
          status,
          description,
          created_at,
          updated_at
        FROM tbl_events
        ORDER BY event_date DESC, event_id DESC
        `
      ),

      pool.query(`
        SELECT
          COUNT(*) AS total_events,
          COUNT(*) FILTER (WHERE LOWER(status) = 'upcoming') AS upcoming_events,
          COUNT(*) FILTER (WHERE LOWER(status) = 'completed') AS completed_events,
          COALESCE(SUM(total_teams), 0) AS total_teams
        FROM tbl_events
      `),
    ]);

    return sendSuccessResponse(
      res,
      200,
      "Events fetched successfully.",
      {
        statistics: {
          total_events: Number(statistics.rows[0].total_events),
          upcoming_events: Number(statistics.rows[0].upcoming_events),
          completed_events: Number(statistics.rows[0].completed_events),
          total_teams: Number(statistics.rows[0].total_teams),
        },
        events: events.rows,
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


exports.getEventById = async (req, res) => {
  const { event_id } = req.params;

  if (!event_id || isNaN(event_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid event ID."
    );
  }

  const eventId = Number(event_id);

  if (eventId <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Event ID must be a positive number."
    );
  }

  try {
    const event = await pool.query(
      `
      SELECT
        event_id,
        event_name,
        event_type,
        event_date,
        venue,
        total_teams,
        winner,
        status,
        description,
        created_at,
        updated_at
      FROM tbl_events
      WHERE event_id = $1
      `,
      [eventId]
    );

    if (event.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Event not found."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Event fetched successfully.",
      event.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.updateEvent = async (req, res) => {
  const { event_id } = req.params;

  if (!event_id || isNaN(event_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid event ID."
    );
  }

  const eventId = Number(event_id);

  if (eventId <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Event ID must be a positive number."
    );
  }

  const allowedStatuses = [
    "Upcoming",
    "Ongoing",
    "Completed",
    "Cancelled",
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

  try {

    const allowedFields = [
      "event_name",
      "event_type",
      "event_date",
      "venue",
      "total_teams",
      "winner",
      "status",
      "description",
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

    const existingEvent = await pool.query(
      `
      SELECT event_id
      FROM tbl_events
      WHERE event_id = $1
      `,
      [eventId]
    );

    if (existingEvent.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Event not found."
      );
    }

    if (
      req.body.event_name !== undefined &&
      req.body.event_date !== undefined
    ) {
      const duplicateEvent = await pool.query(
        `
        SELECT event_id
        FROM tbl_events
        WHERE
          LOWER(event_name) = LOWER($1)
          AND event_date = $2
          AND event_id <> $3
        LIMIT 1
        `,
        [
          req.body.event_name,
          req.body.event_date,
          eventId,
        ]
      );

      if (duplicateEvent.rowCount > 0) {
        return sendErrorResponse(
          res,
          409,
          "Another event already exists with the same name and date."
        );
      }
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(eventId);

    const updatedEvent = await pool.query(
      `
      UPDATE tbl_events
      SET
        ${updates.join(", ")}
      WHERE event_id = $${index}
      RETURNING *
      `,
      values
    );

    return sendSuccessResponse(
      res,
      200,
      "Event updated successfully.",
      updatedEvent.rows[0]
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );
  }
};


exports.deleteEvent = async (req, res) => {

  const { event_id } = req.params;

  if (!event_id || isNaN(event_id)) {
    return sendErrorResponse(
      res,
      400,
      "Invalid event ID."
    );
  }

  const eventId = Number(event_id);

  if (eventId <= 0) {
    return sendErrorResponse(
      res,
      400,
      "Event ID must be a positive number."
    );
  }

  try {

    const existingEvent = await pool.query(
      `
      SELECT event_id
      FROM tbl_events
      WHERE event_id = $1
      `,
      [eventId]
    );

    if (existingEvent.rowCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "Event not found."
      );
    }

    await pool.query(
      `
      DELETE FROM tbl_events
      WHERE event_id = $1
      `,
      [eventId]
    );

    return sendSuccessResponse(
      res,
      200,
      "Event deleted successfully."
    );

  } catch (error) {

    return sendErrorResponse(
      res,
      500,
      error.message || "Internal Server Error"
    );

  }

};