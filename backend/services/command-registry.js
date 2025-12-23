// Command Registry - OpenCode-style custom commands
// Supports YAML frontmatter in markdown files and JSON config

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

    // Initialize - load commands from DB and files
    async initialize() {
        // Load from database
        await this.loadFromDatabase();

        // Load from config files
        await this.loadFromConfigFiles();
    }

    // Load commands from database
    async loadFromDatabase() {
        const stmt = this.db.db.prepare('SELECT * FROM custom_commands ORDER BY name');
        const commands = [];

        while (stmt.step()) {
            const cmd = stmt.getAsObject();
            commands.push(cmd);
        }
        stmt.free();

        for (const cmd of commands) {
            this.commands.set(cmd.name, cmd);
        }

        console.log(`Loaded ${commands.length} commands from database`);
    }

    // Load commands from config directories
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
            } catch (err) {
                // Directory might not exist, that's fine
                if (err.code !== 'ENOENT') {
                    console.error(`Error loading commands from ${dir}:`, err.message);
                }
            }
        }
    }

    // Parse YAML frontmatter from markdown
    parseCommandFrontmatter(content, filename) {
        // Check for frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) {
            return null;
        }

        const [, frontmatter, body] = frontmatterMatch;
        const metadata = this.parseYaml(frontmatter);

        const command = {
            id: 'cmd_' + crypto.randomBytes(8).toString('hex'),
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

    // Simple YAML parser for frontmatter
    parseYaml(str) {
        const result = {};
        const lines = str.split('\n');

        for (const line of lines) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const [, key, value] = match;
                // Try to parse as JSON for arrays/objects
                try {
                    result[key] = JSON.parse(value);
                } catch {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    // Register a new command
    async registerCommand(command) {
        // Check if exists
        const existing = this.commands.get(command.name);

        if (existing && existing.is_system) {
            throw new Error('Cannot override system command');
        }

        const now = Math.floor(Date.now() / 1000);
        const cmd = {
            id: command.id || ('cmd_' + crypto.randomBytes(8).toString('hex')),
            name: command.name,
            description: command.description || '',
            agent_type: command.agent_type || null,
            model: command.model || null,
            template: command.template,
            is_system: command.is_system ? 1 : 0,
            created_by: command.created_by || null,
            created_at: existing ? existing.created_at : now,
            updated_at: now
        };

        if (existing) {
            this.db.db.run(`
                UPDATE custom_commands
                SET description = ?, agent_type = ?, model = ?, template = ?, updated_at = ?
                WHERE name = ?
            `, [cmd.description, cmd.agent_type, cmd.model, cmd.template, cmd.updated_at, cmd.name]);
        } else {
            this.db.db.run(`
                INSERT INTO custom_commands (id, name, description, agent_type, model, template, is_system, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [cmd.id, cmd.name, cmd.description, cmd.agent_type, cmd.model, cmd.template, cmd.is_system, cmd.created_by, cmd.created_at, cmd.updated_at]);
        }

        await this.db.save();
        this.commands.set(cmd.name, cmd);

        return cmd;
    }

    // Get command by name
    async getCommand(name) {
        return this.commands.get(name) || null;
    }

    // List all commands
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

    // Execute command - return rendered prompt
    async executeCommand(name, args = {}, context = {}) {
        const command = await this.getCommand(name);
        if (!command) {
            throw new Error(`Command not found: ${name}`);
        }

        let prompt = command.template;

        // Replace placeholders
        prompt = this.replacePlaceholders(prompt, args, context);

        return {
            prompt,
            agent_type: command.agent_type,
            model: command.model,
            command_name: command.name
        };
    }

    // Replace placeholders in template
    replacePlaceholders(template, args, context) {
        let result = template;

        // $ARGUMENTS - replace with args string
        if (args.ARGUMENTS !== undefined) {
            result = result.replace(/\$ARGUMENTS/g, args.ARGUMENTS);
        }

        // Replace other $PLACEHOLDER with args
        for (const [key, value] of Object.entries(args)) {
            const regex = new RegExp(`\\$${key}`, 'g');
            result = result.replace(regex, value);
        }

        // !`command` - shell command output
        result = result.replace(/!`([^`]+)`/g, (match, command) => {
            // In a real implementation, you'd execute this
            // For now, return a placeholder
            return `[Output of: ${command}]`;
        });

        // @filename - file content
        result = result.replace(/@([^\s\n]+)/g, (match, filename) => {
            if (context.files && context.files[filename]) {
                return context.files[filename];
            }
            return `[File: ${filename}]`;
        });

        return result;
    }

    // Delete a command
    async deleteCommand(name) {
        const command = await this.getCommand(name);
        if (!command) {
            throw new Error(`Command not found: ${name}`);
        }

        if (command.is_system) {
            throw new Error('Cannot delete system command');
        }

        this.db.db.run(`DELETE FROM custom_commands WHERE name = ?`, [name]);
        await this.db.save();
        this.commands.delete(name);

        return true;
    }

    // Update a command
    async updateCommand(name, updates) {
        const command = await this.getCommand(name);
        if (!command) {
            throw new Error(`Command not found: ${name}`);
        }

        const updated = { ...command, ...updates };
        return await this.registerCommand(updated);
    }

    // Create command from markdown string
    async createCommandFromMarkdown(content, createdBy = null) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) {
            throw new Error('Invalid command format - missing frontmatter');
        }

        const [, frontmatter, body] = frontmatterMatch;
        const metadata = this.parseYaml(frontmatter);

        if (!metadata.name) {
            throw new Error('Command name is required in frontmatter');
        }

        const command = {
            name: metadata.name,
            description: metadata.description || '',
            agent_type: metadata.agent || null,
            model: metadata.model || null,
            template: body.trim(),
            is_system: false,
            created_by: createdBy
        };

        return await this.registerCommand(command);
    }

    // Export command as markdown
    exportCommandAsMarkdown(name) {
        const command = this.commands.get(name);
        if (!command) {
            throw new Error(`Command not found: ${name}`);
        }

        let md = '---\n';
        md += `name: ${command.name}\n`;
        if (command.description) md += `description: ${command.description}\n`;
        if (command.agent_type) md += `agent: ${command.agent_type}\n`;
        if (command.model) md += `model: ${command.model}\n`;
        md += '---\n\n';
        md += command.template;

        return md;
    }

    // Get command suggestions for search
    async searchCommands(query) {
        const commands = await this.listCommands();
        const q = query.toLowerCase();

        return commands
            .filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.description && c.description.toLowerCase().includes(q))
            )
            .slice(0, 10); // Limit results
    }
}

module.exports = CommandRegistry;
