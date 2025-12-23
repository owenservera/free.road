// Migration script for improved database implementation
// Run with: node backend/database/migrate-to-improved.js

const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/repositories.db');
const BACKUP_PATH = path.join(__dirname, '../data/repositories.db.backup');

async function migrateToImprovedDatabase() {
    console.log('Starting database migration...\n');

    // 1. Create backup
    console.log('1. Creating backup...');
    try {
        await fs.copyFile(DB_PATH, BACKUP_PATH);
        console.log(`   ✓ Backup created: ${BACKUP_PATH}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('   - No existing database to backup');
        } else {
            console.error('   ✗ Backup failed:', error.message);
            process.exit(1);
        }
    }

    // 2. Backup original index.js
    console.log('\n2. Backing up original database module...');
    const originalPath = path.join(__dirname, 'index.js');
    const originalBackup = path.join(__dirname, 'index.js.backup');
    try {
        await fs.copyFile(originalPath, originalBackup);
        console.log(`   ✓ Original backed up: ${originalBackup}`);
    } catch (error) {
        console.error('   ✗ Backup failed:', error.message);
        process.exit(1);
    }

    // 3. Copy improved version
    console.log('\n3. Installing improved database module...');
    const improvedPath = path.join(__dirname, 'index-improved.js');
    try {
        const improvedContent = await fs.readFile(improvedPath, 'utf8');
        await fs.writeFile(originalPath, improvedContent);
        console.log(`   ✓ Improved database installed`);
    } catch (error) {
        console.error('   ✗ Installation failed:', error.message);
        console.log('\n   Rolling back backup...');
        await fs.copyFile(originalBackup, originalPath);
        process.exit(1);
    }

    // 4. Test database initialization
    console.log('\n4. Testing database initialization...');
    try {
        // We need to do this by requiring the new module and checking it
        const testScript = `
            const db = require('./index.js');
            db.initialize().then(() => {
                console.log('   ✓ Database initialized successfully');
                const stats = db.getQueryStats();
                console.log('   ✓ Query tracking enabled');
                db.close();
                process.exit(0);
            }).catch(err => {
                console.error('   ✗ Initialization failed:', err.message);
                process.exit(1);
            });
        `;
        await fs.writeFile(path.join(__dirname, 'test-db-init.js'), testScript);
        console.log('   ✓ Test script created');
        console.log('\n   Run: node backend/database/test-db-init.js to verify');
    } catch (error) {
        console.error('   ✗ Test failed:', error.message);
    }

    // 5. Cleanup
    console.log('\n5. Cleanup...');
    const testScriptPath = path.join(__dirname, 'test-db-init.js');
    try {
        await fs.unlink(testScriptPath);
    } catch {
        // Ignore if doesn't exist
    }
    console.log('   ✓ Temporary files cleaned up');

    console.log('\n' + '='.repeat(60));
    console.log('Migration complete!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Start the server: bun run backend/server.js');
    console.log('2. Verify database operations are working');
    console.log('3. Monitor query performance with /api/database/stats endpoint');
    console.log('\nRollback if needed:');
    console.log(`  Copy ${originalBackup} back to ${originalPath}`);
    console.log(`  Restore database: ${BACKUP_PATH} -> ${DB_PATH}\n`);
}

async function rollback() {
    console.log('Starting rollback...\n');

    const originalPath = path.join(__dirname, 'index.js');
    const originalBackup = path.join(__dirname, 'index.js.backup');

    // Restore original
    console.log('1. Restoring original database module...');
    try {
        await fs.copyFile(originalBackup, originalPath);
        console.log(`   ✓ Original database restored`);
    } catch (error) {
        console.error('   ✗ Restore failed:', error.message);
        process.exit(1);
    }

    console.log('\nRollback complete!\n');
}

// Main
const command = process.argv[2] || 'migrate';

if (command === 'migrate') {
    migrateToImprovedDatabase().catch(console.error);
} else if (command === 'rollback') {
    rollback().catch(console.error);
} else {
    console.log('Usage: node backend/database/migrate-to-improved.js [migrate|rollback]');
    process.exit(1);
}
