// Initialize and export all middleware

const { createRequestIdMiddleware } = require('./request-id');
const { createCorsMiddleware } = require('./cors');
const { createErrorHandlerMiddleware, createNotFoundHandler, createAsyncHandler } = require('./error-handler');
const { createBodyParserMiddleware } = require('./body-parser');
const { createHealthCheckMiddleware } = require('./health-check');

module.exports = {
    createRequestIdMiddleware,
    createCorsMiddleware,
    createErrorHandlerMiddleware,
    createNotFoundHandler,
    createAsyncHandler,
    createBodyParserMiddleware,
    createHealthCheckMiddleware
};
