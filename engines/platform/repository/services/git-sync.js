const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GitSyncService {
    constructor(reposDir) {
        this.reposDir = reposDir;
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    getRepoPath(repoId) {
        return path.join(this.reposDir, repoId);
    }

    async cloneRepository(repo) {
        const repoPath = this.getRepoPath(repo.id);

        try {
            await fs.mkdir(path.dirname(repoPath), { recursive: true });

            const git = simpleGit();
            const branch = repo.branch || 'main';

            await git.clone(repo.url, repoPath, [
                '--branch', branch,
                '--depth', '1',
                '--single-branch'
            ]);

            return { success: true, path: repoPath };
        } catch (error) {
            throw new Error(`Clone failed: ${error.message}`);
        }
    }

    async pullRepository(repo) {
        const repoPath = this.getRepoPath(repo.id);

        try {
            const git = simpleGit(repoPath);
            const branch = repo.branch || 'main';

            await git.fetch('origin', branch);
            await git.reset(['--hard', `origin/${branch}`]);

            return { success: true };
        } catch (error) {
            throw new Error(`Pull failed: ${error.message}`);
        }
    }

    async getCurrentCommit(repoId) {
        const repoPath = this.getRepoPath(repoId);
        const git = simpleGit(repoPath);
        const log = await git.log({ maxCount: 1 });
        return log.latest ? log.latest.hash : null;
    }

    async deleteRepository(repoId) {
        const repoPath = this.getRepoPath(repoId);

        try {
            await fs.rm(repoPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

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
