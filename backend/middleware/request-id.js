// Request ID Middleware
// Adds unique request IDs to all requests

const crypto = require('crypto');

function createRequestIdMiddleware() {
    return (req, res, next) => {
        req.id = req.headers['x-request-id'] ||
                   `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        res.setHeader('X-Request-ID', req.id);
        next();
    };
}

module.exports = createRequestIdMiddleware;
