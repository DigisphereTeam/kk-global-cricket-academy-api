function notFoundHandler(req, res, next) {
  return res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route not found: ${req.originalUrl}`,
    data: null,
  });
}

module.exports = notFoundHandler;