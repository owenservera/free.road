// CORS Middleware
// Configurable CORS handling

const cors = require('cors');

function createCorsMiddleware(config) {
    const corsOptions = {
        origin: config.origins || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        credentials: true,
        maxAge: 86400 // 24 hours
    };

    return cors(corsOptions);
}

module.exports = { createCorsMiddleware };
