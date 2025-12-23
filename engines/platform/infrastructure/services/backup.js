// Backup Service - Infrastructure Module
// Provides automated database backups

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BackupService {
    constructor(config = {}, context = {}) {
        this.config = config;
        this.context = context;
        this.interval = null;
        this.isRunning = false;
        this.backupHistory = [];

        this.backupDir = config.backupDir || path.join(process.cwd(), 'backups');
        this.dbPath = config.dbPath || path.join(process.cwd(), 'data/repositories.db');
        this.reposDir = config.reposDir || path.join(process.cwd(), 'data/repos');
    }

    async start() {
        if (this.isRunning) {
            console.log('Backup service already running');
            return;
        }

        await fs.mkdir(this.backupDir, { recursive: true });
        await this.loadBackupHistory();

        await this.createBackup('manual');

        if (this.config.interval > 0) {
            this.interval = setInterval(async () => {
                await this.createBackup('scheduled');
            }, this.config.interval);
        }

        this.isRunning = true;
        console.log('Backup service started');
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        if (this.interval) {
            clearInterval(this.interval);
        }

        await this.createBackup('final');
        this.isRunning = false;
        console.log('Backup service stopped');
    }

    async createBackup(trigger = 'manual') {
        const timestamp = Date.now();
        const backupId = `backup_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

        console.log(`Creating backup: ${backupId} (${trigger})`);

        const startTime = Date.now();

        try {
            const backupDir = path.join(this.backupDir, backupId);
            await fs.mkdir(backupDir, { recursive: true });

            await this.backupDatabase(backupDir);
            console.log('   ✓ Database backed up');

            await this.backupRepositories(backupDir);
            console.log('   ✓ Repositories backed up');

            const metadata = {
                id: backupId,
                timestamp,
                trigger,
                status: 'complete'
            };
            const metadataPath = path.join(backupDir, 'metadata.json');
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

            const duration = Date.now() - startTime;
            this.backupHistory.push({ ...metadata, duration });
            await this.saveBackupHistory();

            console.log(`   ✓ Backup complete (${duration}ms)`);
            await this.cleanupOldBackups();

            return metadata;
        } catch (error) {
            console.error('   ✗ Backup failed:', error.message);
            this.backupHistory.push({
                id: backupId,
                timestamp: Date.now(),
                trigger,
                duration: Date.now() - startTime,
                status: 'failed',
                error: error.message
            });
            await this.saveBackupHistory();
            throw error;
        }
    }

    async backupDatabase(backupDir) {
        const dbBackupPath = path.join(backupDir, 'repositories.db');
        await fs.copyFile(this.dbPath, dbBackupPath);

        const hash = await this.calculateHash(dbBackupPath);
        const stats = await fs.stat(dbBackupPath);

        return { path: 'repositories.db', size: stats.size, hash };
    }

    async backupRepositories(backupDir) {
        const reposBackupPath = path.join(backupDir, 'repos');

        try {
            await fs.mkdir(reposBackupPath, { recursive: true });
            await this.copyDirectory(this.reposDir, reposBackupPath);
            const stats = await this.getDirectorySize(reposBackupPath);
            const fileCount = await this.countFiles(reposBackupPath);
            return { path: 'repos', size: stats.size, fileCount };
        } catch {
            return { path: 'repos', size: 0, fileCount: 0 };
        }
    }

    async cleanupOldBackups() {
        const now = Date.now();
        const retentionMs = (this.config.retentionDays || 30) * 24 * 60 * 60 * 1000;

        const files = await fs.readdir(this.backupDir);

        for (const file of files) {
            if (file.startsWith('backup_')) {
                const match = file.match(/^backup_(\d+)_/);
                if (match) {
                    const timestamp = parseInt(match[1]);
                    const age = now - timestamp;

                    if (age > retentionMs) {
                        const backupPath = path.join(this.backupDir, file);
                        await this.removeBackup(backupPath);
                    }
                }
            }
        }
    }

    async removeBackup(backupPath) {
        try {
            const stats = await fs.stat(backupPath);

            if (stats.isDirectory()) {
                await this.removeDirectory(backupPath);
            } else {
                await fs.unlink(backupPath);
            }
        } catch {
        }
    }

    async removeDirectory(dirPath) {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                await this.removeDirectory(filePath);
            } else {
                await fs.unlink(filePath);
            }
        }

        await fs.rmdir(dirPath);
    }

    async restoreBackup(backupId) {
        const backupRecord = this.backupHistory.find(b => b.id === backupId);

        if (!backupRecord || backupRecord.status !== 'complete') {
            throw new Error(`Backup not found or incomplete: ${backupId}`);
        }

        console.log(`Restoring backup: ${backupId}`);

        const backupDir = path.join(this.backupDir, backupId);

        const dbPath = path.join(backupDir, 'repositories.db');
        await fs.copyFile(dbPath, this.dbPath);
        console.log('   ✓ Database restored');

        const reposBackupPath = path.join(backupDir, 'repos');
        const destReposDir = this.reposDir;

        if (await this.directoryExists(destReposDir)) {
            await this.removeDirectory(destReposDir);
        }
        await this.copyDirectory(reposBackupPath, destReposDir);
        console.log('   ✓ Repositories restored');

        console.log('   ✓ Restore complete!');

        return backupRecord;
    }

    async loadBackupHistory() {
        const historyPath = path.join(this.backupDir, 'history.json');
        try {
            const content = await fs.readFile(historyPath, 'utf8');
            this.backupHistory = JSON.parse(content);
        } catch {
            this.backupHistory = [];
        }
    }

    async saveBackupHistory() {
        const historyPath = path.join(this.backupDir, 'history.json');
        await fs.writeFile(historyPath, JSON.stringify(this.backupHistory, null, 2));
    }

    async directoryExists(dirPath) {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    async calculateHash(filePath) {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async getDirectorySize(dirPath) {
        let totalSize = 0;
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);
                if (stats.isDirectory()) {
                    totalSize += await this.getDirectorySize(filePath);
                } else {
                    totalSize += stats.size;
                }
            }
        } catch {
        }
        return { size: totalSize };
    }

    async countFiles(dirPath) {
        let count = 0;
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);
                if (stats.isDirectory()) {
                    count += await this.countFiles(filePath);
                } else {
                    count++;
                }
            }
        } catch {
        }
        return count;
    }

    async copyDirectory(source, dest) {
        await fs.mkdir(dest, { recursive: true });
        const files = await fs.readdir(source);

        for (const file of files) {
            const srcPath = path.join(source, file);
            const destPath = path.join(dest, file);
            const stats = await fs.stat(srcPath);

            if (stats.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    async getBackupList() {
        return this.backupHistory.sort((a, b) => b.timestamp - a.timestamp);
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Backup service is running',
            running: this.isRunning,
            totalBackups: this.backupHistory.length,
            lastBackup: this.backupHistory[this.backupHistory.length - 1]
        };
    }
}

module.exports = BackupService;
