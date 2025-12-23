// Git Sync Service for Finallica Multi-Repository Platform
// Handles cloning, pulling, and indexing Git repositories

const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GitSyncService {
    constructor(db) {
        this.db = db;
        this.reposDir = db.getReposPath();
    }

    /**
     * Generate a unique ID
     */
    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Hash content for change detection
     */
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Get the local path for a repository
     */
    getRepoPath(repoId) {
        return path.join(this.reposDir, repoId);
    }

    /**
     * Get authenticated clone URL
     */
    getAuthenticatedUrl(repo, authToken) {
        if (!repo.is_private || !authToken) {
            return repo.url;
        }

        try {
            const url = new URL(repo.url);

            switch (repo.source_type) {
                case 'github':
                    url.username = authToken.token_value_encrypted; // Will be decrypted by auth service
                    url.password = 'x-oauth-basic';
                    break;
                case 'gitlab':
                    url.username = 'oauth2';
                    url.password = authToken.token_value_encrypted;
                    break;
                case 'bitbucket':
                    url.username = authToken.token_value_encrypted;
                    url.password = 'x-token-auth';
                    break;
                default:
                    // For custom git URLs with token
                    url.username = authToken.token_value_encrypted;
                    url.password = 'x-oauth-basic';
            }

            return url.toString();
        } catch (e) {
            // If URL parsing fails, return original
            return repo.url;
        }
    }

    /**
     * Clone a repository
     */
    async cloneRepository(repo, authToken = null) {
        const repoPath = this.getRepoPath(repo.id);
        const cloneUrl = this.getAuthenticatedUrl(repo, authToken);

        try {
            // Create parent directory
            await fs.mkdir(path.dirname(repoPath), { recursive: true });

            const branch = repo.branch || 'main';
            const git = simpleGit();

            await git.clone(cloneUrl, repoPath, [
                '--branch',
                branch,
                '--depth',
                '1',
                '--single-branch'
            ]);

            return { success: true, path: repoPath };
        } catch (error) {
            throw new Error(`Clone failed: ${error.message}`);
        }
    }

    /**
     * Pull latest changes from a repository
     */
    async pullRepository(repo, authToken = null) {
        const repoPath = this.getRepoPath(repo.id);

        try {
            const git = simpleGit(repoPath);

            // Fetch and reset to origin branch
            const branch = repo.branch || 'main';
            await git.fetch('origin', branch);
            await git.reset(['--hard', `origin/${branch}`]);

            return { success: true };
        } catch (error) {
            throw new Error(`Pull failed: ${error.message}`);
        }
    }

    /**
     * Get current commit hash
     */
    async getCurrentCommit(repoId) {
        const repoPath = this.getRepoPath(repoId);
        const git = simpleGit(repoPath);
        const log = await git.log({ maxCount: 1 });
        return log.latest ? log.latest.hash : null;
    }

    /**
     * Analyze changes since last sync
     */
    async analyzeChanges(repoId, lastCommitHash) {
        const repoPath = this.getRepoPath(repoId);
        const git = simpleGit(repoPath);

        const changes = {
            added: [],
            modified: [],
            removed: [],
            all: []
        };

        try {
            // Get diff with last commit
            const diff = await git.diff([lastCommitHash, 'HEAD']);

            // Parse diff to find changed files
            const lines = diff.split('\n');
            let currentFile = null;
            let changeType = null;

            for (const line of lines) {
                if (line.startsWith('diff --git')) {
                    // Extract filename
                    const match = line.match(/b\/(.+)$/);
                    if (match) {
                        currentFile = match[1];
                    }
                } else if (line.startsWith('new file')) {
                    changeType = 'added';
                } else if (line.startsWith('deleted file')) {
                    changeType = 'removed';
                } else if (line.startsWith('index')) {
                    if (changeType !== 'removed') {
                        changeType = 'modified';
                    }

                    if (currentFile && changeType) {
                        // Only track markdown and documentation files
                        if (this.isDocumentationFile(currentFile)) {
                            changes[changeType].push(currentFile);
                            changes.all.push({ path: currentFile, type: changeType });
                        }
                    }
                    currentFile = null;
                    changeType = null;
                }
            }
        } catch (error) {
            // If no previous commit, scan all files
            await this.scanAllFiles(repoId, changes);
        }

        return changes;
    }

    /**
     * Scan all files in repository (for initial clone)
     */
    async scanAllFiles(repoId, changes) {
        const repoPath = this.getRepoPath(repoId);

        async function walkDir(dir, baseDir = dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // Skip common directories
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', '__pycache__'].includes(entry.name)) {
                        continue;
                    }
                    await walkDir(fullPath, baseDir);
                } else if (entry.isFile()) {
                    const relativePath = path.relative(baseDir, fullPath);
                    if (this.isDocumentationFile(relativePath)) {
                        changes.added.push(relativePath);
                        changes.all.push({ path: relativePath, type: 'added' });
                    }
                }
            }
        }

        await walkDir.call(this, repoPath, repoPath);
    }

    /**
     * Check if file is a documentation file
     */
    isDocumentationFile(filePath) {
        const docExtensions = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'];
        const docDirs = ['docs', 'doc', 'documentation', 'guide', 'guides', 'readme'];

        const ext = path.extname(filePath).toLowerCase();
        const dirname = path.dirname(filePath).toLowerCase();

        return docExtensions.includes(ext) ||
               docDirs.some(d => dirname.includes(d)) ||
               path.basename(filePath).toLowerCase().startsWith('readme');
    }

    /**
     * Extract title from markdown content
     */
    extractTitle(content, filename) {
        // Try to find first heading
        const headingMatch = content.match(/^#\s+(.+)$/m);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        // Try to extract from frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
        if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const titleMatch = yaml.match(/title:\s*["']?([^"'\n]+)["']?/);
            if (titleMatch) {
                return titleMatch[1].trim();
            }
        }

        // Use filename as fallback
        return path.basename(filename, path.extname(filename));
    }

    /**
     * Index files from repository
     */
    async indexFiles(repoId, changes) {
        const repoPath = this.getRepoPath(repoId);
        const indexedFiles = [];

        // Clear old file records for this repo
        this.db.db.prepare('DELETE FROM repository_files WHERE repository_id = ?').run(repoId);

        for (const file of changes.all) {
            const filePath = path.join(repoPath, file.path);

            try {
                const content = await fs.readFile(filePath, 'utf8');
                const stats = await fs.stat(filePath);

                const indexedFile = {
                    id: this.generateId(),
                    repository_id: repoId,
                    path: file.path,
                    filename: path.basename(file.path),
                    extension: path.extname(file.path),
                    content_hash: this.hashContent(content),
                    size: stats.size,
                    title: this.extractTitle(content, file.path),
                    is_document: 1,
                    indexed_at: Math.floor(Date.now() / 1000)
                };

                this.db.db.prepare(`
                    INSERT INTO repository_files (
                        id, repository_id, path, filename, extension,
                        content_hash, size, title, is_document, indexed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    indexedFile.id,
                    indexedFile.repository_id,
                    indexedFile.path,
                    indexedFile.filename,
                    indexedFile.extension,
                    indexedFile.content_hash,
                    indexedFile.size,
                    indexedFile.title,
                    indexedFile.is_document,
                    indexedFile.indexed_at
                );

                indexedFiles.push(indexedFile);
            } catch (error) {
                console.error(`Failed to index file ${file.path}:`, error.message);
            }
        }

        return indexedFiles;
    }

    /**
     * Get repository statistics
     */
    async getStats(repoId) {
        const repoPath = this.getRepoPath(repoId);

        let fileCount = 0;
        let markdownCount = 0;
        let totalSize = 0;

        try {
            async function walkDir(dir, baseDir = dir) {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        if (['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', '__pycache__', '.next'].includes(entry.name)) {
                            continue;
                        }
                        await walkDir(fullPath, baseDir);
                    } else if (entry.isFile()) {
                        const stats = await fs.stat(fullPath);
                        fileCount++;
                        totalSize += stats.size;

                        if (entry.name.toLowerCase().endsWith('.md') ||
                            entry.name.toLowerCase().endsWith('.markdown')) {
                            markdownCount++;
                        }
                    }
                }
            }

            await walkDir(repoPath, repoPath);
        } catch (error) {
            console.error('Failed to get stats:', error.message);
        }

        return {
            fileCount,
            markdownCount,
            totalSize
        };
    }

    /**
     * Main sync function - clones or pulls and indexes
     */
    async syncRepository(repo, authToken = null) {
        const startTime = Date.now();
        const result = {
            success: false,
            filesAdded: 0,
            filesModified: 0,
            filesDeleted: 0,
            commitHash: null,
            stats: null,
            error: null
        };

        try {
            const repoPath = this.getRepoPath(repo.id);
            const exists = await this.pathExists(repoPath);

            let previousCommit = repo.last_commit_hash;

            if (exists) {
                // Pull latest changes
                await this.pullRepository(repo, authToken);
            } else {
                // Clone repository
                await this.cloneRepository(repo, authToken);
            }

            // Get current commit
            const currentCommit = await this.getCurrentCommit(repo.id);
            result.commitHash = currentCommit;

            // Analyze changes
            const changes = await this.analyzeChanges(repo.id, previousCommit);
            result.filesAdded = changes.added.length;
            result.filesModified = changes.modified.length;
            result.filesDeleted = changes.removed.length;

            // Index files
            await this.indexFiles(repo.id, changes);

            // Get stats
            result.stats = await this.getStats(repo.id);

            result.success = true;
        } catch (error) {
            result.error = error.message;
        }

        result.duration = Date.now() - startTime;
        return result;
    }

    /**
     * Check if path exists
     */
    async pathExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Delete a cloned repository
     */
    async deleteRepository(repoId) {
        const repoPath = this.getRepoPath(repoId);

        try {
            await fs.rm(repoPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get file content from repository
     */
    async getFileContent(repoId, filePath) {
        const repoPath = this.getRepoPath(repoId);
        const fullPath = path.join(repoPath, filePath);

        try {
            const content = await fs.readFile(fullPath, 'utf8');
            return { success: true, content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * List all files in a repository
     */
    async listFiles(repoId, dirPath = '') {
        const repoPath = this.getRepoPath(repoId);
        const scanPath = dirPath ? path.join(repoPath, dirPath) : repoPath;

        const files = [];

        try {
            const entries = await fs.readdir(scanPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name === '.git') continue;

                const relativePath = dirPath ? path.join(dirPath, entry.name) : entry.name;

                if (entry.isDirectory()) {
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        type: 'directory'
                    });
                } else {
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        type: 'file',
                        extension: path.extname(entry.name)
                    });
                }
            }
        } catch (error) {
            return { success: false, error: error.message };
        }

        return { success: true, files };
    }
}

module.exports = GitSyncService;
