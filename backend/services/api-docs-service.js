// API Documentation Service
// Auto-generates OpenAPI/Swagger specification from code annotations

const fs = require('fs').promises;
const path = require('path');

// ============================================
// OpenAPI Specification Builder
// ============================================

class OpenAPIBuilder {
    constructor() {
        this.spec = {
            openapi: '3.0.3',
            info: {
                title: 'Finallica Documentation API',
                description: 'Multi-repository documentation platform with AI-powered features',
                version: process.env.API_VERSION || '1.0.0',
                contact: {
                    name: 'Finallica Team',
                    email: 'support@finallica.io',
                    url: 'https://finallica.io'
                },
                license: {
                    name: 'MIT',
                    url: 'https://opensource.org/licenses/MIT'
                }
            },
            servers: [
                {
                    url: process.env.API_BASE_URL || 'http://localhost:3000',
                    description: 'Development server'
                },
                {
                    url: 'https://api.finallica.io',
                    description: 'Production server'
                }
            ],
            paths: {},
            components: {
                schemas: {},
                responses: {},
                parameters: {},
                examples: {}
            },
            tags: [
                {
                    name: 'Documents',
                    description: 'Document management operations'
                },
                {
                    name: 'Repositories',
                    description: 'Repository management operations'
                },
                {
                    name: 'AI',
                    description: 'AI-powered features'
                },
                {
                    name: 'Proposals',
                    description: 'Governance and voting'
                },
                {
                    name: 'Monitoring',
                    description: 'System monitoring'
                },
                {
                    name: 'Agent Fleet',
                    description: 'Agent fleet management'
                }
            ]
        };
    }

    /**
     * Add a path to the specification
     */
    addPath(method, path, definition) {
        const pathLower = path.toLowerCase();

        if (!this.spec.paths[pathLower]) {
            this.spec.paths[pathLower] = {};
        }

        this.spec.paths[pathLower][method.toLowerCase()] = definition;
    }

    /**
     * Add a schema definition
     */
    addSchema(name, schema) {
        this.spec.components.schemas[name] = schema;
    }

    /**
     * Add a parameter definition
     */
    addParameter(name, parameter) {
        this.spec.components.parameters[name] = parameter;
    }

    /**
     * Add a response definition
     */
    addResponse(name, response) {
        this.spec.components.responses[name] = response;
    }

    /**
     * Generate the OpenAPI specification
     */
    generate() {
        return JSON.stringify(this.spec, null, 2);
    }

    /**
     * Save specification to file
     */
    async save(outputPath) {
        const spec = this.generate();
        await fs.writeFile(outputPath, spec, 'utf8');
        console.log(`OpenAPI specification saved to: ${outputPath}`);
    }
}

// ============================================
// Annotation Parser
// ============================================

class AnnotationParser {
    /**
     * Parse route file for API annotations
     */
    static async parseRouteFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const annotations = [];

        // Look for annotations in comments
        const annotationRegex = /@openapi\s+({[\s\S]*?})/g;
        const matches = content.matchAll(annotationRegex);

        for (const match of matches) {
            try {
                const annotation = JSON.parse(match[1]);
                annotations.push(annotation);
            } catch (error) {
                console.warn(`Failed to parse annotation: ${match[0]}`, error.message);
            }
        }

        return annotations;
    }

    /**
     * Scan all route files for annotations
     */
    static async scanRoutes(routesDir) {
        const annotations = [];

        try {
            const files = await fs.readdir(routesDir);
            const routeFiles = files.filter(f => f.endsWith('.js') && f !== 'index.js');

            for (const file of routeFiles) {
                const filePath = path.join(routesDir, file);
                const fileAnnotations = await this.parseRouteFile(filePath);
                annotations.push(...fileAnnotations);
            }
        } catch (error) {
            console.error('Failed to scan routes:', error.message);
        }

        return annotations;
    }
}

// ============================================
// Schema Definitions
// ============================================

const Schemas = {
    Repository: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'Unique repository identifier' },
            name: { type: 'string', description: 'Repository name' },
            source_type: { type: 'string', enum: ['github', 'gitlab', 'bitbucket', 'https', 'ssh', 'zip', 'api'] },
            url: { type: 'string', format: 'uri' },
            branch: { type: 'string', default: 'main' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            is_private: { type: 'boolean', default: false },
            status: { type: 'string', enum: ['pending', 'cloning', 'active', 'error', 'archived'] },
            created_at: { type: 'integer', description: 'Unix timestamp' },
            updated_at: { type: 'integer', description: 'Unix timestamp' }
        },
        required: ['name', 'source_type', 'url']
    },
    Collection: {
        type: 'object',
        properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string', format: 'slug' },
            description: { type: 'string' },
            is_featured: { type: 'boolean', default: false },
            repository_ids: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'slug']
    },
    Proposal: {
        type: 'object',
        properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['document_edit', 'new_section', 'protocol_change', 'parameter_update'] },
            title: { type: 'string' },
            document: { type: 'string' },
            diff: { type: 'string' },
            rationale: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            votesFor: { type: 'number' },
            votesAgainst: { type: 'number' },
            totalStake: { type: 'number' },
            proposer: { type: 'string', format: 'address' },
            createdAt: { type: 'integer', description: 'Unix timestamp' }
        },
        required: ['type', 'title']
    },
    Error: {
        type: 'object',
        properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'integer' }
        }
    },
    HealthStatus: {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy'] },
            uptime: { type: 'number' },
            metrics: {
                type: 'object',
                properties: {
                    uptime: { type: 'string' },
                    counters: { type: 'number' },
                    gauges: { type: 'number' },
                    histograms: { type: 'number' }
                }
            },
            alerts: {
                type: 'object',
                properties: {
                    active: { type: 'number' },
                    total: { type: 'number' }
                }
            }
        }
    }
};

// ============================================
// Common Responses
// ============================================

const Responses = {
    OK: { description: 'Request successful' },
    Created: { description: 'Resource created successfully' },
    BadRequest: {
        description: 'Bad request',
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
            }
        }
    },
    Unauthorized: {
        description: 'Unauthorized',
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
            }
        }
    },
    NotFound: {
        description: 'Resource not found',
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
            }
        }
    },
    InternalError: {
        description: 'Internal server error',
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
            }
        }
    }
};

// ============================================
// Generate Specification
// ============================================

async function generateSpecification() {
    const builder = new OpenAPIBuilder();

    // Add all schemas
    Object.entries(Schemas).forEach(([name, schema]) => {
        builder.addSchema(name, schema);
    });

    // Add common responses
    Object.entries(Responses).forEach(([name, response]) => {
        builder.addResponse(name, response);
    });

    // Define document routes
    builder.addPath('get', '/documents', {
        tags: ['Documents'],
        summary: 'List all documents',
        description: 'Returns a list of all available documents',
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                documents: {
                                    type: 'object',
                                    additionalProperties: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    builder.addPath('get', '/documents/{docName}', {
        tags: ['Documents'],
        summary: 'Get document content',
        parameters: [
            {
                name: 'docName',
                in: 'path',
                required: true,
                schema: { type: 'string' }
            }
        ],
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                docName: { type: 'string' },
                                content: { type: 'string' }
                            }
                        }
                    }
                }
            },
            '404': Responses.NotFound
        }
    });

    // Define repository routes
    builder.addPath('get', '/repositories', {
        tags: ['Repositories'],
        summary: 'List all repositories',
        parameters: [
            {
                name: 'status',
                in: 'query',
                description: 'Filter by status',
                schema: { type: 'string', enum: ['pending', 'cloning', 'active', 'error', 'archived'] }
            },
            {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 100 }
            }
        ],
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Repository' }
                        }
                    }
                }
            }
        }
    });

    builder.addPath('post', '/repositories', {
        tags: ['Repositories'],
        summary: 'Create new repository',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/Repository' }
                }
            }
        },
        responses: {
            '201': Responses.Created,
            '400': Responses.BadRequest
        }
    });

    // Define proposal routes
    builder.addPath('get', '/proposals', {
        tags: ['Proposals'],
        summary: 'List all proposals',
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Proposal' }
                        }
                    }
                }
            }
        }
    });

    builder.addPath('post', '/proposals', {
        tags: ['Proposals'],
        summary: 'Create new proposal',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/Proposal' }
                }
            }
        },
        responses: {
            '201': Responses.Created,
            '400': Responses.BadRequest
        }
    });

    // Define AI routes
    builder.addPath('get', '/ai/models', {
        tags: ['AI'],
        summary: 'List available AI models',
        parameters: [
            {
                name: 'provider',
                in: 'query',
                schema: { type: 'string', enum: ['anthropic', 'openai', 'openrouter', 'groq', 'google'] }
            }
        ],
        responses: {
            '200': {
                ...Responses.OK,
                description: 'Returns list of available models'
            }
        }
    });

    builder.addPath('post', '/ai/chat', {
        tags: ['AI'],
        summary: 'Send chat message to AI',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            message: { type: 'string' },
                            provider: { type: 'string' },
                            model: { type: 'string' },
                            context: { type: 'object' },
                            stream: { type: 'boolean', default: false }
                        },
                        required: ['message']
                    }
                }
            }
        },
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                response: { type: 'string' },
                                model: { type: 'string' },
                                provider: { type: 'string' },
                                tokensUsed: {
                                    type: 'object',
                                    properties: {
                                        input: { type: 'integer' },
                                        output: { type: 'integer' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // Define monitoring routes
    builder.addPath('get', '/health', {
        tags: ['Monitoring'],
        summary: 'Health check endpoint',
        responses: {
            '200': {
                ...Responses.OK,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/HealthStatus' }
                    }
                }
            }
        }
    });

    builder.addPath('get', '/metrics', {
        tags: ['Monitoring'],
        summary: 'Prometheus metrics endpoint',
        produces: ['text/plain'],
        responses: {
            '200': {
                description: 'Prometheus format metrics',
                content: {
                    'text/plain': {
                        schema: { type: 'string' }
                    }
                }
            }
        }
    });

    // Define agent fleet routes
    builder.addPath('get', '/agent-fleet/status', {
        tags: ['Agent Fleet'],
        summary: 'Get agent fleet status',
        responses: {
            '200': {
                ...Responses.OK,
                description: 'Returns current fleet status and agent information'
            }
        }
    });

    builder.addPath('post', '/agent-fleet/start', {
        tags: ['Agent Fleet'],
        summary: 'Start agent fleet',
        requestBody: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            agents: {
                                type: 'array',
                                items: { type: 'string' },
                                enum: ['code_review', 'documentation', 'repo_manager', 'tooling', 'debugger', 'visualization', 'cost_observability']
                            }
                        }
                    }
                }
            }
        },
        responses: {
            '200': Responses.OK
        }
    });

    builder.addPath('post', '/agent-fleet/stop', {
        tags: ['Agent Fleet'],
        summary: 'Stop agent fleet',
        responses: {
            '200': Responses.OK
        }
    });

    return builder;
}

// ============================================
// Main Export
// ============================================

async function generateOpenAPISpec(outputPath) {
    console.log('Generating OpenAPI specification...\n');

    const builder = await generateSpecification();

    await builder.save(outputPath);

    console.log('\n' + '='.repeat(60));
    console.log('Generation complete!');
    console.log('='.repeat(60));
    console.log(`\nSpecification saved to: ${outputPath}`);
    console.log('\nYou can view the documentation using:');
    console.log('1. Swagger UI: https://editor.swagger.io/');
    console.log('2. Redoc: https://redocly.github.io/redoc/');
    console.log('3. Stoplight: https://stoplight.io/studio/\n');
}

// Generate if called directly
if (require.main === module) {
    const outputPath = process.argv[2] ||
        path.join(__dirname, '../../docs/openapi.json');
    generateOpenAPISpec(outputPath).catch(console.error);
}

module.exports = {
    OpenAPIBuilder,
    AnnotationParser,
    Schemas,
    Responses,
    generateSpecification,
    generateOpenAPISpec
};
