/**
 * Git Manager Module
 * Handles all Git-based backup operations for Home Assistant Time Machine
 */

const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

class GitManager {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Initialize Git repository if it doesn't exist
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async initGitRepo() {
    try {
      // Check if .git directory exists
      const gitDir = path.join(this.repoPath, '.git');

      try {
        await fs.access(gitDir);
        console.log('[GitManager] Repository already initialized');
        return { success: true, message: 'Repository already initialized' };
      } catch {
        // .git doesn't exist, need to initialize
        console.log('[GitManager] Initializing new Git repository');

        // Ensure repo directory exists
        await fs.mkdir(this.repoPath, { recursive: true });

        // Initialize Git repo
        await this.git.init();

        // Configure Git user
        await this.git.addConfig('user.name', 'HA Time Machine');
        await this.git.addConfig('user.email', 'addon@homeassistant.local');

        // Create .gitignore
        const gitignore = [
          '# Home Assistant logs and databases',
          'home-assistant.log',
          '*.log',
          '*.db',
          '*.db-journal',
          '*.db-shm',
          '*.db-wal',
          '__pycache__/',
          '*.pyc',
          '*.pyo',
          '',
          '# Temporary files',
          '.DS_Store',
          'Thumbs.db',
          '',
          '# Secrets (additional protection)',
          'secrets.yaml',
          '.HA_VERSION',
          '.uuid',
          '.cloud',
          '.storage/auth*',
          '',
          '# Old folder-mode backups (timestamp directories)',
          '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*/',
          '*[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*/',
          'backup-*/',
          ''
        ].join('\n');

        await fs.writeFile(path.join(this.repoPath, '.gitignore'), gitignore);

        // Add .gitignore and create initial commit
        await this.git.add('.gitignore');
        await this.git.commit('Initial commit: Git-based backup initialized');

        console.log('[GitManager] Repository initialized successfully');
        return { success: true, message: 'Repository initialized successfully' };
      }
    } catch (error) {
      console.error('[GitManager] Error initializing repository:', error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Remove old folder-mode backup directories from Git tracking
   * This cleans up backup folders that were committed before switching to Git mode
   * @returns {Promise<{success: boolean, removed: number, message: string}>}
   */
  async removeOldBackupFolders() {
    try {
      console.log('[GitManager] Scanning for old backup folders');

      // Get all tracked files
      const result = await this.git.raw(['ls-tree', '-r', '-d', '--name-only', 'HEAD']);
      const folders = result.split('\n').filter(Boolean);

      // Pattern to match timestamp folders (YYYY-MM-DD format and variants)
      const backupFolderPatterns = [
        /^\d{4}-\d{2}-\d{2}/,  // 2024-01-01...
        /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/,  // ...with timestamp
        /^backup-\d+/,  // backup-123456789
        /^\d{10,}/  // Unix timestamp folders
      ];

      const foldersToRemove = folders.filter(folder => {
        const baseName = folder.split('/')[0];  // Get top-level folder
        return backupFolderPatterns.some(pattern => pattern.test(baseName));
      });

      if (foldersToRemove.length === 0) {
        console.log('[GitManager] No old backup folders found');
        return { success: true, removed: 0, message: 'No old backup folders found' };
      }

      console.log(`[GitManager] Found ${foldersToRemove.length} backup folders to remove`);

      // Remove from Git index (but keep files on disk)
      for (const folder of foldersToRemove) {
        await this.git.raw(['rm', '-r', '--cached', folder]);
      }

      // Commit the removal
      await this.git.commit(`Clean up: Remove ${foldersToRemove.length} old folder-mode backup directories from Git tracking`);

      console.log(`[GitManager] Removed ${foldersToRemove.length} backup folders from Git`);
      return {
        success: true,
        removed: foldersToRemove.length,
        message: `Removed ${foldersToRemove.length} old backup folders`
      };
    } catch (error) {
      console.error('[GitManager] Error removing old backup folders:', error);
      return { success: false, removed: 0, message: `Error: ${error.message}` };
    }
  }

  /**
   * Perform a Git-based backup
   * @param {string} sourceType - Type of backup: 'scheduled' or 'autosave'
   * @param {string|null} changedFile - Specific file that triggered autosave (null for scheduled)
   * @returns {Promise<{success: boolean, message: string, commitHash?: string}>}
   */
  async performGitBackup(sourceType = 'scheduled', changedFile = null) {
    try {
      // Check if there are any changes
      const status = await this.git.status();

      if (status.isClean()) {
        console.log('[GitManager] No changes detected, skipping backup');
        return { success: true, message: 'No changes to backup' };
      }

      // Add all changes (new, modified, deleted)
      await this.git.add('.');

      // Create commit message
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      let commitMessage;

      if (sourceType === 'scheduled') {
        commitMessage = `Scheduled Backup: ${timestamp}`;
      } else if (sourceType === 'autosave' && changedFile) {
        const fileName = path.basename(changedFile);
        commitMessage = `Auto-save: ${fileName} modified at ${timestamp}`;
      } else {
        commitMessage = `Backup: ${timestamp}`;
      }

      // Create commit
      const commitResult = await this.git.commit(commitMessage);
      const commitHash = commitResult.commit;

      // Create tag for easy identification
      const tagTimestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '');
      const tagName = sourceType === 'scheduled'
        ? `backup-scheduled-${tagTimestamp}`
        : `autosave-${tagTimestamp}`;

      await this.git.addTag(tagName);

      console.log(`[GitManager] Backup created: ${commitHash} (${tagName})`);
      return {
        success: true,
        message: `Backup created successfully`,
        commitHash,
        tag: tagName
      };
    } catch (error) {
      console.error('[GitManager] Error performing backup:', error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * List all Git commits (backups)
   * @param {number} limit - Maximum number of commits to return (0 = all)
   * @returns {Promise<Array>}
   */
  async listGitCommits(limit = 0) {
    try {
      const logOptions = {
        format: {
          hash: '%H',
          date: '%ci',
          message: '%s',
          tags: '%d'
        }
      };

      if (limit > 0) {
        logOptions.maxCount = limit;
      }

      const log = await this.git.log(logOptions);

      // Parse commits and extract metadata
      const commits = log.all.map(commit => {
        // Determine backup type from tag or message
        let backupType = 'unknown';
        if (commit.tags && commit.tags.includes('backup-scheduled-')) {
          backupType = 'scheduled';
        } else if (commit.tags && commit.tags.includes('autosave-')) {
          backupType = 'autosave';
        } else if (commit.message.startsWith('Scheduled Backup:')) {
          backupType = 'scheduled';
        } else if (commit.message.startsWith('Auto-save:')) {
          backupType = 'autosave';
        }

        return {
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          type: backupType,
          tags: commit.tags
        };
      });

      return commits;
    } catch (error) {
      console.error('[GitManager] Error listing commits:', error);
      return [];
    }
  }

  /**
   * Get diff between a commit and its parent
   * @param {string} commitHash - The commit hash to diff
   * @param {string|null} filePath - Specific file to diff (null for all files)
   * @returns {Promise<{success: boolean, diff?: string, message?: string}>}
   */
  async getGitDiff(commitHash, filePath = null) {
    try {
      const diffOptions = [`${commitHash}^`, commitHash];

      if (filePath) {
        diffOptions.push('--', filePath);
      }

      const diff = await this.git.diff(diffOptions);

      return { success: true, diff };
    } catch (error) {
      console.error('[GitManager] Error getting diff:', error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Restore a file from a specific commit
   * @param {string} commitHash - The commit hash to restore from
   * @param {string} filePath - Path to the file to restore (relative to repo)
   * @param {string} destinationPath - Where to restore the file
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async restoreFromGit(commitHash, filePath, destinationPath) {
    try {
      // Get file content from commit
      const fileContent = await this.git.show([`${commitHash}:${filePath}`]);

      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      await fs.mkdir(destDir, { recursive: true });

      // Write file to destination
      await fs.writeFile(destinationPath, fileContent);

      console.log(`[GitManager] Restored ${filePath} from ${commitHash} to ${destinationPath}`);
      return { success: true, message: 'File restored successfully' };
    } catch (error) {
      console.error('[GitManager] Error restoring file:', error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Clean up old backup tags
   * @param {number} maxBackups - Maximum number of backups to keep
   * @returns {Promise<{success: boolean, message: string, deletedCount?: number}>}
   */
  async cleanupGitBackups(maxBackups) {
    try {
      // Get all tags
      const tags = await this.git.tags();
      const backupTags = tags.all.filter(tag =>
        tag.startsWith('backup-scheduled-') || tag.startsWith('autosave-')
      );

      // Sort tags (newest first)
      backupTags.sort().reverse();

      // Determine which tags to delete
      const tagsToDelete = backupTags.slice(maxBackups);

      if (tagsToDelete.length === 0) {
        console.log('[GitManager] No tags to clean up');
        return { success: true, message: 'No cleanup needed', deletedCount: 0 };
      }

      // Delete old tags
      for (const tag of tagsToDelete) {
        await this.git.tag(['-d', tag]);
      }

      // Run garbage collection to free up space
      await this.git.raw(['gc', '--auto']);

      console.log(`[GitManager] Cleaned up ${tagsToDelete.length} old backup tags`);
      return {
        success: true,
        message: `Deleted ${tagsToDelete.length} old backups`,
        deletedCount: tagsToDelete.length
      };
    } catch (error) {
      console.error('[GitManager] Error cleaning up backups:', error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Get list of files in a specific commit
   * @param {string} commitHash - The commit hash
   * @returns {Promise<Array<string>>}
   */
  async getFilesInCommit(commitHash) {
    try {
      const result = await this.git.raw(['ls-tree', '-r', '--name-only', commitHash]);
      return result.split('\n').filter(Boolean);
    } catch (error) {
      console.error('[GitManager] Error listing files in commit:', error);
      return [];
    }
  }

  /**
   * Check repository health and statistics
   * @returns {Promise<Object>}
   */
  async getRepoStats() {
    try {
      const commits = await this.listGitCommits();
      const tags = await this.git.tags();
      const status = await this.git.status();

      return {
        totalCommits: commits.length,
        totalTags: tags.all.length,
        scheduledBackups: commits.filter(c => c.type === 'scheduled').length,
        autosaveBackups: commits.filter(c => c.type === 'autosave').length,
        uncommittedChanges: !status.isClean(),
        modifiedFiles: status.modified.length,
        untrackedFiles: status.not_added.length
      };
    } catch (error) {
      console.error('[GitManager] Error getting repo stats:', error);
      return {};
    }
  }

  /**
   * Get commit history for a specific file
   * Tracks file across renames using --follow
   * @param {string} filePath - Path to file relative to repo root
   * @param {number} limit - Maximum commits to return (0 = all)
   * @returns {Promise<Array<{hash: string, date: string, message: string, author: string}>>}
   */
  async getFileHistory(filePath, limit = 100) {
    try {
      const logOptions = {
        file: filePath,
        format: {
          hash: '%H',
          date: '%ci',
          message: '%s',
          author: '%an'
        },
        '--follow': null // Track file through renames
      };

      if (limit > 0) {
        logOptions.maxCount = limit;
      }

      console.log(`[GitManager] Getting file history for ${filePath} (limit: ${limit || 'all'})`);
      const log = await this.git.log(logOptions);

      return log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author
      }));
    } catch (error) {
      console.error(`[GitManager] Error getting file history for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get all files tracked in the repository (at HEAD)
   * @returns {Promise<Array<string>>}
   */
  async getAllTrackedFiles() {
    try {
      console.log('[GitManager] Getting all tracked files');
      const result = await this.git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
      const files = result.split('\n').filter(Boolean);
      console.log(`[GitManager] Found ${files.length} tracked files`);
      return files;
    } catch (error) {
      console.error('[GitManager] Error getting tracked files:', error);
      return [];
    }
  }

  /**
   * Build hierarchical file tree from flat file list
   * Organizes files into folder structure with sorting (folders first, then alphabetically)
   * @returns {Promise<{name: string, type: string, path: string, children: Array}>}
   */
  async getFileTree() {
    try {
      console.log('[GitManager] Building file tree');
      const files = await this.getAllTrackedFiles();

      const tree = {
        name: 'root',
        type: 'folder',
        path: '',
        children: []
      };

      // Build tree structure
      files.forEach(filePath => {
        const parts = filePath.split('/');
        let current = tree;

        parts.forEach((part, index) => {
          const isFile = index === parts.length - 1;
          const currentPath = parts.slice(0, index + 1).join('/');

          let child = current.children.find(c => c.name === part);

          if (!child) {
            child = {
              name: part,
              type: isFile ? 'file' : 'folder',
              path: currentPath,
              children: isFile ? undefined : []
            };
            current.children.push(child);
          }

          if (!isFile) {
            current = child;
          }
        });
      });

      // Sort tree: folders first, then files, alphabetically
      function sortTree(node) {
        if (node.children) {
          node.children.sort((a, b) => {
            // Folders before files
            if (a.type !== b.type) {
              return a.type === 'folder' ? -1 : 1;
            }
            // Alphabetically within same type
            return a.name.localeCompare(b.name);
          });
          // Recursively sort child folders
          node.children.forEach(sortTree);
        }
      }
      sortTree(tree);

      console.log(`[GitManager] File tree built successfully`);
      return tree;
    } catch (error) {
      console.error('[GitManager] Error building file tree:', error);
      return { name: 'root', type: 'folder', path: '', children: [] };
    }
  }

  /**
   * Get file content at a specific commit
   * @param {string} commitHash - Commit hash
   * @param {string} filePath - Path to file relative to repo root
   * @returns {Promise<{success: boolean, content?: string, message?: string}>}
   */
  async getFileContentAtCommit(commitHash, filePath) {
    try {
      console.log(`[GitManager] Getting ${filePath} at commit ${commitHash}`);
      const content = await this.git.show([`${commitHash}:${filePath}`]);
      return { success: true, content };
    } catch (error) {
      console.error(`[GitManager] Error getting file content:`, error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = GitManager;
