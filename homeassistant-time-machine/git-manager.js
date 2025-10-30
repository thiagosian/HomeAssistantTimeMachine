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
}

module.exports = GitManager;
