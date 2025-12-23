// Body Parser Middleware
// Configurable body parsing with limits

const bodyParser = require('body-parser');

function createBodyParserMiddleware() {
    return {
        json: bodyParser.json({
            limit: '10mb',
            strict: false
        }),
        urlencoded: bodyParser.urlencoded({
            extended: true,
            limit: '10mb'
        })
    };
}

module.exports = { createBodyParserMiddleware };
