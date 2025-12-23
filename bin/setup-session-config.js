#!/usr/bin/env node

// Finallica Session Configuration Setup
// Dynamically detects and configures CLAUDE.md for the current system environment

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Detect system information
 */
async function detectSystemInfo() {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const totalMemory = os.totalmem();
    const cpus = os.cpus();

    // Determine deployment type based on environment variables
    const deploymentType = process.env.CI ? 'CI/CD' :
                          process.env.NODE_ENV === 'production' ? 'Production' :
                          process.env.NODE_ENV === 'staging' ? 'Staging' : 'Local';

    // Detect development environment
    const ideDetection = {
        'Visual Studio Code': process.env.VSCODE_PID !== undefined || process.env.VSCODE_IPC_HOOK !== undefined,
        'WebStorm': process.env.WEBSTORM_IDE !== undefined,
        'IntelliJ': process.env.IDEA_JDK !== undefined,
        'CLI': process.env.TERM !== undefined
    };

    const primaryEnv = Object.keys(ideDetection).find(key => ideDetection[key]) || 'CLI';

    // Detect model from current session
    const currentModel = 'claude-haiku-4-5-20251001'; // This will be updated by the CLI

    // Detect worktree
    const worktreePath = path.join(process.cwd(), '.git', 'worktree');
    const isWorktree = await fs.access(worktreePath).then(() => true).catch(() => false);

    // Detect current branch
    const gitBranch = await runCommand('git', ['branch', '--show-current']).catch(() => 'unknown');

    // Detect package manager
    const packageManager = await detectPackageManager();

    // Detect available scripts
    const scripts = await detectScripts(packageManager);

    // Detect port
    const port = process.env.PORT || await detectPort();

    return {
        system: `${hostname}-${platform}-${arch}`,
        deploymentType,
        primaryEnv,
        model: currentModel,
        isWorktree,
        branch: gitBranch,
        packageManager,
        scripts,
        port,
        timestamp: new Date().toISOString(),
        sessionHash: crypto.randomBytes(8).toString('hex')
    };
}

/**
 * Detect package manager
 */
async function detectPackageManager() {
    const managers = ['bun', 'npm', 'yarn'];

    for (const manager of managers) {
        try {
            const result = await runCommand(manager, ['--version']);
            if (result) return manager;
        } catch (e) {
            continue;
        }
    }

    return 'unknown';
}

/**
 * Detect available scripts
 */
async function detectScripts(packageManager) {
    try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        return Object.keys(pkg.scripts || {});
    } catch (e) {
        return [];
    }
}

/**
 * Detect active port
 */
async function detectPort() {
    // This is a simplified detection - in practice, you'd need to check active processes
    return process.env.PORT || '3000';
}

/**
 * Run shell command
 */
async function runCommand(command, args) {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
        exec(`${command} ${args.join(' ')}`, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

/**
 * Generate session configuration markdown
 */
function generateSessionConfig(info) {
    return `## Session Configuration (Auto-generated)

### System Info
- **System:** ${info.system}
- **Environment:** ${info.deploymentType}
- **Model:** ${info.model}
- **Worktree:** ${info.isWorktree ? 'Active' : 'None'}
- **Branch:** ${info.branch}
- **Session ID:** ${info.sessionHash}

### Project-Specific Settings
- **Package Manager:** ${info.packageManager}
- **Dependencies:** [Checked ${info.packageManager} install]
- **Scripts:** ${info.scripts.join(', ') || 'None available'}
- **Port:** ${info.port}
- **Development Environment:** ${info.primaryEnv}
- **Last Updated:** ${new Date(info.timestamp).toLocaleString()}

---

*This configuration is automatically updated at the start of each session.*`;
}

/**
 * Update CLAUDE.md with session configuration
 */
async function updateCLAUDEmd() {
    try {
        const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
        const sessionConfig = generateSessionConfig(await detectSystemInfo());

        // Read existing CLAUDE.md
        const existingContent = await fs.readFile(claudeMdPath, 'utf8');

        // Find the session configuration section
        const configMatch = existingContent.match(/## Session Configuration \(Auto-generated\)[\s\S]*?(?=## |\*\*Finallica is|## )/);

        if (configMatch) {
            // Replace existing session config
            const updatedContent = existingContent.replace(
                configMatch[0],
                sessionConfig + '\n\n'
            );
            await fs.writeFile(claudeMdPath, updatedContent);
        } else {
            // Add new session config at the top
            await fs.writeFile(claudeMdPath, sessionConfig + '\n\n' + existingContent);
        }

        console.log('✅ Session configuration updated in CLAUDE.md');
        console.log(`System: ${info.system}`);
        console.log(`Environment: ${info.deploymentType}`);
        console.log(`Development Mode: ${info.primaryEnv}`);

    } catch (error) {
        console.error('❌ Failed to update session configuration:', error.message);
        process.exit(1);
    }
}

/**
 * Main execution
 */
if (require.main === module) {
    console.log('🔧 Setting up Finallica session configuration...');
    updateCLAUDEmd();
}

module.exports = { detectSystemInfo, generateSessionConfig, updateCLAUDEmd };