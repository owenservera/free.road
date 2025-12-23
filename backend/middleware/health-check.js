// Health Check Middleware
// Provides health check endpoint

function createHealthCheckMiddleware(services = {}) {
    return async (req, res, next) => {
        if (req.path === '/health' || req.path === '/api/health') {
            const health = {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime(),
                services: {}
            };

            // Check each service
            for (const [name, service] of Object.entries(services)) {
                try {
                    if (typeof service.check === 'function') {
                        health.services[name] = await service.check();
                    } else {
                        health.services[name] = 'ok';
                    }
                } catch (error) {
                    health.services[name] = {
                        status: 'error',
                        error: error.message
                    };
                    health.status = 'degraded';
                }
            }

            // Set status code based on health
            const statusCode = health.status === 'healthy' ? 200 :
                              health.status === 'degraded' ? 503 : 500;

            res.status(statusCode).json(health);
        } else {
            next();
        }
    };
}

module.exports = { createHealthCheckMiddleware };
