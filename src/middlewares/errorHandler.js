function globalErrorHandler(err, req, res, next) {

  return res.status(err.statusCode || 500).json({
    success: false,
    statusCode: err.statusCode || 500,
    message: err.message || "Internal Server Error",
    errors: err.errors || null,
  });
}

module.exports = globalErrorHandler;