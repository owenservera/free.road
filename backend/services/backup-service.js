// Backup Service
// Provides automated database backups with retention and restore functionality

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const archiver = require('archiver');

// ============================================
// Configuration
// ============================================

const BACKUP_CONFIG = {
    dir: path.join(__dirname, '../backups'),
    dbPath: path.join(__dirname, '../data/repositories.db'),
    repoPath: path.join(__dirname, '../data/repos'),
    intervalMs: parseInt(process.env.BACKUP_INTERVAL_MS) || 3600000, // 1 hour
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || '30',
    maxBackups: parseInt(process.env.BACKUP_MAX_COUNT) || '50',
    encryptionEnabled: process.env.BACKUP_ENCRYPTION === 'true',
    compressionEnabled: process.env.BACKUP_COMPRESSION !== 'false',
    cloudEnabled: process.env.BACKUP_CLOUD_ENABLED === 'true',
    cloudProvider: process.env.BACKUP_CLOUD_PROVIDER || 'aws' // 'aws', 'gcp', 'azure'
};

// ============================================
// Backup Service Class
// ============================================

class BackupService {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        this.backupHistory = [];
        this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
    }

    /**
     * Start backup service
     */
    async start() {
        if (this.isRunning) {
            console.log('Backup service already running');
            return;
        }

        // Ensure backup directory exists
        await fs.mkdir(BACKUP_CONFIG.dir, { recursive: true });

        // Load backup history
        await this.loadBackupHistory();

        // Perform initial backup
        await this.createBackup('manual');

        // Start scheduled backups
        this.interval = setInterval(async () => {
            await this.createBackup('scheduled');
        }, BACKUP_CONFIG.intervalMs);

        this.isRunning = true;

        console.log('Backup service started', {
            interval: `${BACKUP_CONFIG.intervalMs}ms`,
            retention: `${BACKUP_CONFIG.retentionDays} days`,
            maxBackups: BACKUP_CONFIG.maxBackups,
            encryption: BACKUP_CONFIG.encryptionEnabled,
            compression: BACKUP_CONFIG.compressionEnabled
        });
    }

    /**
     * Stop backup service
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        if (this.interval) {
            clearInterval(this.interval);
        }

        // Perform final backup
        await this.createBackup('final');

        this.isRunning = false;

        console.log('Backup service stopped');
    }

    /**
     * Create a backup
     */
    async createBackup(trigger = 'manual') {
        const timestamp = Date.now();
        const backupId = `backup_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;

        console.log(`Creating backup: ${backupId} (${trigger})`);

        const startTime = Date.now();

        try {
            // 1. Create backup directory
            const backupDir = path.join(BACKUP_CONFIG.dir, backupId);
            await fs.mkdir(backupDir, { recursive: true });

            // 2. Backup database
            const dbBackup = await this.backupDatabase(backupDir);
            console.log('   ✓ Database backed up');

            // 3. Backup repositories
            const reposBackup = await this.backupRepositories(backupDir);
            console.log('   ✓ Repositories backed up');

            // 4. Create metadata
            const metadata = await this.createMetadata(backupId, trigger, dbBackup, reposBackup);
            const metadataPath = path.join(backupDir, 'metadata.json');
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            console.log('   ✓ Metadata created');

            // 5. Compress if enabled
            let backupPath = backupDir;
            if (BACKUP_CONFIG.compressionEnabled) {
                backupPath = await this.compressBackup(backupDir, backupId);
                console.log('   ✓ Backup compressed');
            }

            // 6. Encrypt if enabled
            if (BACKUP_CONFIG.encryptionEnabled) {
                await this.encryptBackup(backupPath);
                console.log('   ✓ Backup encrypted');
            }

            // 7. Upload to cloud if enabled
            if (BACKUP_CONFIG.cloudEnabled) {
                await this.uploadToCloud(backupPath, backupId);
                console.log('   ✓ Uploaded to cloud');
            }

            // 8. Update history
            const duration = Date.now() - startTime;
            const backupRecord = {
                id: backupId,
                timestamp,
                trigger,
                duration,
                size: await this.getBackupSize(backupPath),
                metadata,
                status: 'complete'
            };

            this.backupHistory.push(backupRecord);
            await this.saveBackupHistory();

            console.log(`   ✓ Backup complete (${duration}ms)`);

            // 9. Cleanup old backups
            await this.cleanupOldBackups();

            return backupRecord;
        } catch (error) {
            console.error('   ✗ Backup failed:', error.message);

            // Record failure in history
            const backupRecord = {
                id: backupId,
                timestamp: Date.now(),
                trigger,
                duration: Date.now() - startTime,
                status: 'failed',
                error: error.message
            };

            this.backupHistory.push(backupRecord);
            await this.saveBackupHistory();

            throw error;
        }
    }

    /**
     * Backup database file
     */
    async backupDatabase(backupDir) {
        const dbPath = BACKUP_CONFIG.dbPath;
        const backupPath = path.join(backupDir, 'repositories.db');

        await fs.copyFile(dbPath, backupPath);

        const stats = await fs.stat(backupPath);
        return {
            path: 'repositories.db',
            size: stats.size,
            hash: await this.calculateHash(backupPath)
        };
    }

    /**
     * Backup repositories directory
     */
    async backupRepositories(backupDir) {
        const sourceDir = BACKUP_CONFIG.repoPath;
        const backupPath = path.join(backupDir, 'repos');

        if (await this.directoryExists(sourceDir)) {
            await this.copyDirectory(sourceDir, backupPath);

            const stats = await this.getDirectorySize(backupPath);
            const fileCount = await this.countFiles(backupPath);

            return {
                path: 'repos',
                size: stats.size,
                fileCount
            };
        }

        return {
            path: 'repos',
            size: 0,
            fileCount: 0
        };
    }

    /**
     * Create backup metadata
     */
    async createMetadata(backupId, trigger, dbBackup, reposBackup) {
        return {
            id: backupId,
            version: process.env.API_VERSION || '1.0.0',
            timestamp: Date.now(),
            trigger,
            environment: process.env.NODE_ENV || 'development',
            host: require('os').hostname(),
            nodeVersion: process.version,
            components: {
                database: dbBackup,
                repositories: reposBackup
            },
            tags: [
                trigger,
                process.env.NODE_ENV,
                `db_${dbBackup.size}`,
                `files_${reposBackup.fileCount}`
            ]
        };
    }

    /**
     * Compress backup directory
     */
    async compressBackup(backupDir, backupId) {
        return new Promise((resolve, reject) => {
            const outputPath = path.join(BACKUP_CONFIG.dir, `${backupId}.tar.gz`);
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('tar', {
                gzip: true,
                gzipOptions: { level: 6 }
            });

            output.on('close', () => {
                resolve(outputPath);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(backupDir, false);
            archive.finalize();
        });
    }

    /**
     * Encrypt backup file
     */
    async encryptBackup(filePath) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }

        const content = await fs.readFile(filePath);
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(
            'aes-256-gcm',
            this.encryptionKey,
            iv
        );

        let encrypted = cipher.update(content);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();
        const encryptedPath = `${filePath}.enc`;

        await fs.writeFile(encryptedPath, Buffer.concat([iv, authTag, encrypted]));

        return encryptedPath;
    }

    /**
     * Upload backup to cloud storage
     */
    async uploadToCloud(filePath, backupId) {
        // Placeholder for cloud upload
        // Implement AWS S3, GCP Storage, or Azure Blob upload here
        const cloudUploadScript = path.join(__dirname, '../scripts/cloud-upload.js');

        if (await this.fileExists(cloudUploadScript)) {
            return new Promise((resolve, reject) => {
                const proc = spawn('node', [cloudUploadScript, filePath, backupId], {
                    stdio: 'inherit'
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Cloud upload failed with code ${code}`));
                    }
                });
            });
        }

        console.log('   - Cloud upload skipped (script not found)');
    }

    /**
     * Cleanup old backups
     */
    async cleanupOldBackups() {
        const now = Date.now();
        const retentionMs = BACKUP_CONFIG.retentionDays * 24 * 60 * 60 * 1000;
        const backupIds = [];

        try {
            const files = await fs.readdir(BACKUP_CONFIG.dir);

            for (const file of files) {
                if (file.startsWith('backup_')) {
                    const match = file.match(/^backup_(\d+)_/);
                    if (match) {
                        const timestamp = parseInt(match[1]);
                        const age = now - timestamp;

                        if (age > retentionMs) {
                            const filePath = path.join(BACKUP_CONFIG.dir, file);
                            await this.removeBackup(filePath);
                            backupIds.push(file);
                        }
                    }
                }
            }

            // Also enforce max backup count
            const sortedBackups = this.backupHistory
                .filter(b => b.status === 'complete')
                .sort((a, b) => b.timestamp - a.timestamp);

            if (sortedBackups.length > BACKUP_CONFIG.maxBackups) {
                const toDelete = sortedBackups.slice(BACKUP_CONFIG.maxBackups);
                for (const backup of toDelete) {
                    const backupPath = path.join(BACKUP_CONFIG.dir, backup.id);
                    if (await this.fileExists(backupPath)) {
                        await this.removeBackup(backupPath);
                        backupIds.push(backup.id);
                    }
                }
            }

            if (backupIds.length > 0) {
                console.log(`   ✓ Cleaned up ${backupIds.length} old backups`);
            }
        } catch (error) {
            console.error('Cleanup failed:', error.message);
        }
    }

    /**
     * Remove a backup
     */
    async removeBackup(backupPath) {
        // Check if it's a directory or file
        const stats = await fs.stat(backupPath);

        if (stats.isDirectory()) {
            await this.removeDirectory(backupPath);
        } else {
            await fs.unlink(backupPath);
        }
    }

    /**
     * Remove directory recursively
     */
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

    /**
     * Restore a backup
     */
    async restoreBackup(backupId) {
        const backupRecord = this.backupHistory.find(b => b.id === backupId);

        if (!backupRecord) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        if (backupRecord.status !== 'complete') {
            throw new Error(`Backup ${backupId} is not complete`);
        }

        console.log(`Restoring backup: ${backupId}\n`);

        try {
            // 1. Decrypt if needed
            let backupPath = path.join(BACKUP_CONFIG.dir, backupId);

            if (BACKUP_CONFIG.encryptionEnabled) {
                const encryptedPath = `${backupPath}.enc`;
                if (await this.fileExists(encryptedPath)) {
                    backupPath = await this.decryptBackup(encryptedPath);
                }
            }

            // 2. Decompress if needed
            if (BACKUP_CONFIG.compressionEnabled) {
                const compressedPath = `${backupPath}.tar.gz`;
                if (await this.fileExists(compressedPath)) {
                    backupPath = await this.decompressBackup(compressedPath);
                }
            }

            // 3. Restore database
            const dbBackup = backupRecord.metadata.components.database;
            if (dbBackup) {
                await this.restoreDatabase(backupPath, dbBackup);
                console.log('   ✓ Database restored');
            }

            // 4. Restore repositories
            const reposBackup = backupRecord.metadata.components.repositories;
            if (reposBackup) {
                await this.restoreRepositories(backupPath, reposBackup);
                console.log('   ✓ Repositories restored');
            }

            // 5. Verify restore
            await this.verifyRestore(backupRecord);

            console.log('\n   ✓ Restore complete!');

            return backupRecord;
        } catch (error) {
            console.error('   ✗ Restore failed:', error.message);
            throw error;
        }
    }

    /**
     * Restore database from backup
     */
    async restoreDatabase(backupDir, dbBackup) {
        const dbSourcePath = path.join(backupDir, dbBackup.path);
        const dbDestPath = BACKUP_CONFIG.dbPath;

        // Verify hash
        const currentHash = await this.calculateHash(dbSourcePath);
        if (currentHash !== dbBackup.hash) {
            console.warn('   ! Database hash mismatch - data may be corrupted');
        }

        await fs.copyFile(dbSourcePath, dbDestPath);
    }

    /**
     * Restore repositories from backup
     */
    async restoreRepositories(backupDir, reposBackup) {
        const sourceDir = path.join(backupDir, reposBackup.path);
        const destDir = BACKUP_CONFIG.repoPath;

        // Remove existing directory
        if (await this.directoryExists(destDir)) {
            await this.removeDirectory(destDir);
        }

        await this.copyDirectory(sourceDir, destDir);
    }

    /**
     * Decompress backup
     */
    async decompressBackup(compressedPath) {
        return new Promise((resolve, reject) => {
            const extract = require('extract-zip');

            const outputDir = compressedPath.replace('.tar.gz', '');
            extract(compressedPath, { dir: outputDir }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(outputDir);
                }
            });
        });
    }

    /**
     * Decrypt backup file
     */
    async decryptBackup(encryptedPath) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }

        const content = await fs.readFile(encryptedPath);

        // Extract IV (first 16 bytes)
        const iv = content.slice(0, 16);
        // Extract auth tag (next 16 bytes)
        const authTag = content.slice(16, 32);
        // Extract encrypted data
        const encrypted = content.slice(32);

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            this.encryptionKey,
            iv
        );
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const outputPath = encryptedPath.replace('.enc', '');
        await fs.writeFile(outputPath, decrypted);

        return outputPath;
    }

    /**
     * Verify restore integrity
     */
    async verifyRestore(backupRecord) {
        // Check database file exists and is valid
        if (await this.fileExists(BACKUP_CONFIG.dbPath)) {
            const stats = await fs.stat(BACKUP_CONFIG.dbPath);
            if (stats.size < 1000) {
                console.warn('   ! Database file seems too small');
            }
        } else {
            console.warn('   ! Database file not found after restore');
        }

        // Check repositories directory
        if (await this.directoryExists(BACKUP_CONFIG.repoPath)) {
            const dbBackup = backupRecord.metadata.components.repositories;
            const currentFileCount = await this.countFiles(BACKUP_CONFIG.repoPath);

            if (dbBackup && Math.abs(currentFileCount - dbBackup.fileCount) > 100) {
                console.warn(`   ! File count mismatch: expected ${dbBackup.fileCount}, got ${currentFileCount}`);
            }
        }
    }

    /**
     * Load backup history
     */
    async loadBackupHistory() {
        const historyPath = path.join(BACKUP_CONFIG.dir, 'history.json');

        try {
            const content = await fs.readFile(historyPath, 'utf8');
            this.backupHistory = JSON.parse(content);
        } catch {
            this.backupHistory = [];
        }
    }

    /**
     * Save backup history
     */
    async saveBackupHistory() {
        const historyPath = path.join(BACKUP_CONFIG.dir, 'history.json');
        await fs.writeFile(historyPath, JSON.stringify(this.backupHistory, null, 2));
    }

    /**
     * Get backup status
     */
    getStatus() {
        const completeBackups = this.backupHistory.filter(b => b.status === 'complete');
        const failedBackups = this.backupHistory.filter(b => b.status === 'failed');
        const lastBackup = completeBackups[completeBackups.length - 1];

        return {
            running: this.isRunning,
            totalBackups: this.backupHistory.length,
            completeBackups: completeBackups.length,
            failedBackups: failedBackups.length,
            lastBackup,
            lastBackupAge: lastBackup ? Date.now() - lastBackup.timestamp : null,
            config: BACKUP_CONFIG
        };
    }

    /**
     * Get backup list
     */
    getBackupList(options = {}) {
        let backups = [...this.backupHistory];

        // Filter by status
        if (options.status) {
            backups = backups.filter(b => b.status === options.status);
        }

        // Filter by trigger
        if (options.trigger) {
            backups = backups.filter(b => b.trigger === options.trigger);
        }

        // Sort by timestamp (newest first)
        backups.sort((a, b) => b.timestamp - a.timestamp);

        // Pagination
        if (options.limit) {
            backups = backups.slice(0, options.limit);
        }

        // Add size info
        return Promise.all(backups.map(async b => {
            if (b.status === 'complete') {
                const backupPath = path.join(BACKUP_CONFIG.dir, b.id);
                b.size = await this.getBackupSize(backupPath);
            }
            return b;
        }));
    }

    // ============================================
    // Utility Methods
    // ============================================

    async directoryExists(dirPath) {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async calculateHash(filePath) {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async getBackupSize(backupPath) {
        try {
            const stats = await fs.stat(backupPath);
            return stats.size;
        } catch {
            return 0;
        }
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
            // Return 0 if directory doesn't exist
        }

        return totalSize;
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
            // Return 0 if directory doesn't exist
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
}

// ============================================
// Express Middleware
// ============================================

function createBackupMiddleware(backupService) {
    return async (req, res, next) => {
        const { action, backupId } = req.query;

        // Add backup routes
        if (req.path === '/api/backups') {
            if (req.method === 'POST') {
                try {
                    const backup = await backupService.createBackup(req.body.trigger || 'manual');
                    res.json({ success: true, backup });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
                return;
            }
        }

        // Restore routes
        if (req.path.startsWith('/api/backups/') && req.method === 'POST') {
            const id = req.params.id || backupId;
            try {
                const backup = await backupService.restoreBackup(id);
                res.json({ success: true, backup });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
            return;
        }

        next();
    };
}

// ============================================
// Express Routes
// ============================================

function createBackupRoutes(backupService) {
    const express = require('express');
    const router = express.Router();

    // Get backup status
    router.get('/status', (req, res) => {
        const status = backupService.getStatus();
        res.json(status);
    });

    // List backups
    router.get('/', async (req, res) => {
        const options = {
            status: req.query.status,
            trigger: req.query.trigger,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined
        };

        const backups = await backupService.getBackupList(options);
        res.json({ backups });
    });

    // Get specific backup
    router.get('/:id', async (req, res) => {
        const backupId = req.params.id;
        const backup = backupService.backupHistory.find(b => b.id === backupId);

        if (!backup) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        res.json({ backup });
    });

    // Download backup file
    router.get('/:id/download', async (req, res) => {
        const backupId = req.params.id;
        const backupRecord = backupService.backupHistory.find(b => b.id === backupId);

        if (!backupRecord || backupRecord.status !== 'complete') {
            return res.status(404).json({ error: 'Backup not found or incomplete' });
        }

        const backupPath = path.join(BACKUP_CONFIG.dir, backupId);
        res.download(backupPath, `${backupId}.tar.gz`);
    });

    // Restore backup
    router.post('/:id/restore', async (req, res) => {
        try {
            const backupId = req.params.id;
            const backup = await backupService.restoreBackup(backupId);
            res.json({ success: true, backup });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete backup
    router.delete('/:id', async (req, res) => {
        try {
            const backupId = req.params.id;
            const backupPath = path.join(BACKUP_CONFIG.dir, backupId);

            await backupService.removeBackup(backupPath);

            // Remove from history
            backupService.backupHistory = backupService.backupHistory.filter(b => b.id !== backupId);
            await backupService.saveBackupHistory();

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

// ============================================
// Exports
// ============================================

module.exports = {
    BackupService,
    createBackupMiddleware,
    createBackupRoutes,
    BACKUP_CONFIG
};

// Start if called directly
if (require.main === module) {
    const backupService = new BackupService();

    const command = process.argv[2] || 'start';

    if (command === 'start') {
        backupService.start().catch(console.error);

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\nStopping backup service...');
            await backupService.stop();
            process.exit(0);
        });
    } else if (command === 'backup') {
        backupService.createBackup('manual').catch(console.error);
    } else if (command === 'restore') {
        const backupId = process.argv[3];
        if (!backupId) {
            console.log('Usage: node backup-service.js restore <backup_id>');
            process.exit(1);
        }
        backupService.restoreBackup(backupId).catch(console.error);
    } else if (command === 'list') {
        const list = await backupService.getBackupList({ limit: 20 });
        console.log('\nRecent backups:');
        console.log(list.map(b => {
            const date = new Date(b.timestamp).toISOString();
            return `  ${b.id} - ${date} - ${b.status} - ${b.trigger}`;
        }).join('\n'));
    } else if (command === 'status') {
        const status = backupService.getStatus();
        console.log('\nBackup Service Status:');
        console.log(`  Running: ${status.running}`);
        console.log(`  Total backups: ${status.totalBackups}`);
        console.log(`  Complete: ${status.completeBackups}`);
        console.log(`  Failed: ${status.failedBackups}`);
        if (status.lastBackup) {
            console.log(`  Last backup: ${new Date(status.lastBackup.timestamp).toISOString()}`);
            console.log(`  Last backup age: ${status.lastBackupAge}ms`);
        }
    } else {
        console.log('Usage: node backup-service.js [start|backup|restore|list|status]');
        process.exit(1);
    }
}
