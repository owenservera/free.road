// Error Handling Middleware
// Centralized error handling with logging

function createErrorHandlerMiddleware(logger) {
    return (err, req, res, next) => {
        const reqId = req.id || 'unknown';
        const statusCode = err.statusCode || err.status || 500;

        // Log error
        logger.error('Request error', {
            reqId,
            path: req.path,
            method: req.method,
            error: err.message,
            stack: err.stack,
            statusCode
        });

        // Send error response
        res.status(statusCode).json({
            error: err.message || 'Internal Server Error',
            code: err.code || 'INTERNAL_ERROR',
            reqId,
            timestamp: Date.now()
        });
    };
}

function createNotFoundHandler() {
    return (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            code: 'NOT_FOUND',
            path: req.path,
            reqId: req.id,
            timestamp: Date.now()
        });
    };
}

function createAsyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    createErrorHandlerMiddleware,
    createNotFoundHandler,
    createAsyncHandler
};
