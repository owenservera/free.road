const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CommandRegistry {
    constructor(db) {
        this.db = db;
        this.commands = new Map();
        this.configDirs = [
            path.join(process.env.HOME || process.env.USERPROFILE || '.', '.config', 'finallica', 'commands'),
            path.join(process.cwd(), '.finallica', 'commands')
        ];
    }

    generateId() {
        return 'cmd_' + crypto.randomBytes(8).toString('hex');
    }

    async initialize() {
        await this.loadFromDatabase();
        await this.loadFromConfigFiles();
        console.log('Command Registry initialized');
    }

    async loadFromDatabase() {
        const stmt = this.db.db.prepare('SELECT * FROM custom_commands ORDER BY name');
        const commands = [];

        while (stmt.step()) {
            const cmd = stmt.getAsObject();
            commands.push(cmd);
        }

        for (const cmd of commands) {
            this.commands.set(cmd.name, cmd);
        }
    }

    async loadFromConfigFiles() {
        for (const dir of this.configDirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
                const files = await fs.readdir(dir);

                for (const file of files) {
                    if (file.endsWith('.md')) {
                        const filePath = path.join(dir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const command = this.parseCommandFrontmatter(content, file);

                        if (command) {
                            await this.registerCommand(command);
                        }
                    }
                }
            } catch {
            }
        }
    }

    parseCommandFrontmatter(content, filename) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) {
            return null;
        }

        const [, frontmatter, body] = frontmatterMatch;
        const metadata = this.parseYaml(frontmatter);

        const command = {
            id: this.generateId(),
            name: filename.replace('.md', ''),
            description: metadata.description || '',
            agent_type: metadata.agent || null,
            model: metadata.model || null,
            template: body.trim(),
            is_system: false,
            created_by: 'config_file'
        };

        return command;
    }

    parseYaml(str) {
        const result = {};
        const lines = str.split('\n');

        for (const line of lines) {
            const match = line.match(/^([^:]+):\s*(.+)$/);
            if (match) {
                result[match[1]] = match[2];
            }
        }

        return result;
    }

    async registerCommand(command) {
        this.db.db.prepare(`
            INSERT OR REPLACE INTO custom_commands (
                id, name, description, agent_type, model, template, is_system, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            command.id,
            command.name,
            command.description,
            command.agent_type,
            command.model,
            command.template,
            command.is_system,
            command.created_by
        );

        this.commands.set(command.name, command);
    }

    async listCommands(filters = {}) {
        let commands = Array.from(this.commands.values());

        if (filters.agentType) {
            commands = commands.filter(c => c.agent_type === filters.agentType);
        }

        if (filters.systemOnly) {
            commands = commands.filter(c => c.is_system);
        }

        if (filters.userOnly) {
            commands = commands.filter(c => !c.is_system);
        }

        return commands;
    }

    async searchCommands(q) {
        const commands = Array.from(this.commands.values());
        const lowerQuery = q.toLowerCase();

        return commands.filter(c =>
            c.name.toLowerCase().includes(lowerQuery) ||
            c.description?.toLowerCase().includes(lowerQuery)
        );
    }

    getCommand(name) {
        return this.commands.get(name);
    }

    async stop() {
        console.log('Command Registry stopped');
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Command Registry is running',
            commandsCount: this.commands.size
        };
    }
}

module.exports = CommandRegistry;
