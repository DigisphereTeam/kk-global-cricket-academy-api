function sendSuccessResponse(res, statusCode, message, data = null) {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
  });
}

function sendErrorResponse(
  res,
  statusCode = 500,
  message = "Internal Server Error",
  errors = null
) {
  const response = {
    success: false,
    statusCode,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

module.exports = { sendSuccessResponse, sendErrorResponse };
