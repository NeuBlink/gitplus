import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { BackupInfo } from '../types';

const execAsync = promisify(exec);

export interface BackupOptions {
  reason: string;
  includeWorkingDirectory?: boolean;
  compress?: boolean;
  maxBackups?: number;
  customPath?: string;
}

export interface RestoreOptions {
  preserveCurrentChanges?: boolean;
  targetBranch?: string;
  partial?: boolean;
  files?: string[];
}

/**
 * BackupManager handles creation and restoration of repository backups
 * 
 * This class provides safe backup and restore functionality for git repositories,
 * enabling point-in-time recovery and safe operations during corruption recovery.
 * Backups include repository state, staged/unstaged changes, and metadata.
 */
export class BackupManager {
  private readonly repoPath: string;
  private readonly backupDir: string;
  private readonly gitDir: string;

  constructor(repoPath: string, backupDir?: string) {
    this.repoPath = repoPath;
    this.gitDir = path.join(repoPath, '.git');
    this.backupDir = backupDir || path.join(os.tmpdir(), 'gitplus-backups');
  }

  /**
   * Create a comprehensive backup of the repository
   */
  async createBackup(options: BackupOptions): Promise<BackupInfo> {
    const backupId = this.generateBackupId();
    const backupPath = path.join(this.backupDir, backupId);

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      await fs.mkdir(backupPath, { recursive: true });

      // Capture current repository state
      const branchState = await this.captureBranchState();

      // Create git bundle for repository history
      const bundlePath = path.join(backupPath, 'repository.bundle');
      await this.createGitBundle(bundlePath);

      // Backup working directory changes if requested
      if (options.includeWorkingDirectory) {
        await this.backupWorkingDirectory(backupPath);
      }

      // Backup git configuration and refs
      await this.backupGitMetadata(backupPath);

      // Create backup metadata
      const backupInfo: BackupInfo = {
        id: backupId,
        path: backupPath,
        createdAt: new Date(),
        reason: options.reason,
        branchState,
        size: await this.calculateBackupSize(backupPath),
        compressed: options.compress || false
      };

      // Save backup metadata
      await this.saveBackupMetadata(backupPath, backupInfo);

      // Compress backup if requested
      if (options.compress) {
        await this.compressBackup(backupPath);
      }

      // Clean up old backups if limit exceeded
      if (options.maxBackups) {
        await this.cleanupOldBackups(options.maxBackups);
      }

      return backupInfo;

    } catch (error) {
      // Clean up partial backup on failure
      try {
        await fs.rm(backupPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Backup creation failed: ${error}`);
    }
  }

  /**
   * Restore repository from a backup
   */
  async restoreFromBackup(backupId: string, options: RestoreOptions = {}): Promise<{
    success: boolean;
    restoredFiles: string[];
    warnings: string[];
  }> {
    const backupPath = path.join(this.backupDir, backupId);
    const restoredFiles: string[] = [];
    const warnings: string[] = [];

    try {
      // Verify backup exists and is valid
      const backupInfo = await this.loadBackupMetadata(backupPath);
      if (!backupInfo) {
        throw new Error(`Backup ${backupId} not found or invalid`);
      }

      // Preserve current changes if requested
      if (options.preserveCurrentChanges) {
        try {
          await this.executeGitCommand('git stash push -m "Pre-restore backup"');
          warnings.push('Current changes stashed before restore');
        } catch (error) {
          warnings.push(`Could not stash changes: ${error}`);
        }
      }

      // Restore git repository from bundle
      const bundlePath = path.join(backupPath, 'repository.bundle');
      if (await this.fileExists(bundlePath)) {
        await this.restoreFromBundle(bundlePath, options);
        restoredFiles.push('Repository history');
      }

      // Restore working directory if backup included it
      const workingDirBackup = path.join(backupPath, 'working-directory');
      if (await this.fileExists(workingDirBackup)) {
        await this.restoreWorkingDirectory(workingDirBackup, options);
        restoredFiles.push('Working directory files');
      }

      // Restore git metadata
      const metadataBackup = path.join(backupPath, 'git-metadata');
      if (await this.fileExists(metadataBackup)) {
        await this.restoreGitMetadata(metadataBackup);
        restoredFiles.push('Git configuration and references');
      }

      // Restore specific branch if requested
      if (options.targetBranch && options.targetBranch !== backupInfo.branchState.branch) {
        try {
          await this.executeGitCommand(`git checkout ${options.targetBranch}`);
          restoredFiles.push(`Switched to branch: ${options.targetBranch}`);
        } catch (error) {
          warnings.push(`Could not switch to branch ${options.targetBranch}: ${error}`);
        }
      }

      return {
        success: true,
        restoredFiles,
        warnings
      };

    } catch (error) {
      return {
        success: false,
        restoredFiles,
        warnings: [...warnings, `Restore failed: ${error}`]
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const backups: BackupInfo[] = [];
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const backupInfo = await this.loadBackupMetadata(path.join(this.backupDir, entry.name));
            if (backupInfo) {
              backups.push(backupInfo);
            }
          } catch {
            // Skip invalid backup directories
          }
        }
      }

      // Sort by creation date (newest first)
      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // No backup directory exists yet
      }
      throw error;
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      await fs.rm(backupPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get backup information
   */
  async getBackupInfo(backupId: string): Promise<BackupInfo | null> {
    const backupPath = path.join(this.backupDir, backupId);
    return this.loadBackupMetadata(backupPath);
  }

  /**
   * Clean up old backups beyond the specified limit
   */
  async cleanupOldBackups(maxBackups: number): Promise<number> {
    const backups = await this.listBackups();
    const toDelete = backups.slice(maxBackups);
    let deletedCount = 0;

    for (const backup of toDelete) {
      if (await this.deleteBackup(backup.id)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Calculate total size of all backups
   */
  async getBackupStorageUsage(): Promise<{
    totalSize: number;
    backupCount: number;
    oldestBackup?: Date;
    newestBackup?: Date;
  }> {
    const backups = await this.listBackups();
    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
    
    return {
      totalSize,
      backupCount: backups.length,
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : undefined,
      newestBackup: backups.length > 0 ? backups[0].createdAt : undefined
    };
  }

  // Private helper methods

  private generateBackupId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `backup-${timestamp}-${randomSuffix}`;
  }

  private async captureBranchState(): Promise<BackupInfo['branchState']> {
    try {
      const [branch, commit, statusOutput] = await Promise.all([
        this.executeGitCommand('git branch --show-current'),
        this.executeGitCommand('git rev-parse HEAD'),
        this.executeGitCommand('git status --porcelain')
      ]);

      const { staged, unstaged, untracked } = this.parseStatusOutput(statusOutput);

      return {
        branch: branch.trim() || 'HEAD',
        commit: commit.trim(),
        staged,
        unstaged,
        untracked
      };
    } catch (error) {
      throw new Error(`Failed to capture branch state: ${error}`);
    }
  }

  private parseStatusOutput(output: string): {
    staged: string[];
    unstaged: string[];
    untracked: string[];
  } {
    const lines = output.split('\n').filter(line => line.trim());
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;
      
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);
      
      const stagedStatus = statusCode[0];
      const unstagedStatus = statusCode[1];
      
      if (stagedStatus === '?') {
        untracked.push(filePath);
      } else {
        if (stagedStatus !== ' ') {
          staged.push(filePath);
        }
        if (unstagedStatus !== ' ') {
          unstaged.push(filePath);
        }
      }
    }

    return { staged, unstaged, untracked };
  }

  private async createGitBundle(bundlePath: string): Promise<void> {
    try {
      // Create bundle with all refs and commits
      await this.executeGitCommand(`git bundle create "${bundlePath}" --all`);
    } catch (error) {
      throw new Error(`Failed to create git bundle: ${error}`);
    }
  }

  private async backupWorkingDirectory(backupPath: string): Promise<void> {
    const workingDirBackup = path.join(backupPath, 'working-directory');
    await fs.mkdir(workingDirBackup, { recursive: true });

    try {
      // Get list of all tracked and untracked files
      const [trackedFiles, untrackedFiles] = await Promise.all([
        this.executeGitCommand('git ls-files'),
        this.executeGitCommand('git ls-files --others --exclude-standard')
      ]);

      const allFiles = [
        ...trackedFiles.split('\n').filter(f => f.trim()),
        ...untrackedFiles.split('\n').filter(f => f.trim())
      ];

      // Copy files preserving directory structure
      for (const file of allFiles) {
        const sourcePath = path.join(this.repoPath, file);
        const targetPath = path.join(workingDirBackup, file);
        
        try {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.copyFile(sourcePath, targetPath);
        } catch (error) {
          // Skip files that can't be copied (e.g., symlinks, binary files)
          console.warn(`Could not backup file ${file}: ${error}`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to backup working directory: ${error}`);
    }
  }

  private async backupGitMetadata(backupPath: string): Promise<void> {
    const metadataBackup = path.join(backupPath, 'git-metadata');
    await fs.mkdir(metadataBackup, { recursive: true });

    try {
      // Backup important git metadata files
      const filesToBackup = [
        'config',
        'HEAD',
        'refs',
        'logs',
        'hooks',
        'info',
        'packed-refs'
      ];

      for (const item of filesToBackup) {
        const sourcePath = path.join(this.gitDir, item);
        const targetPath = path.join(metadataBackup, item);

        try {
          const stats = await fs.stat(sourcePath);
          if (stats.isDirectory()) {
            await this.copyDirectory(sourcePath, targetPath);
          } else {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.copyFile(sourcePath, targetPath);
          }
        } catch (error) {
          // Skip files that don't exist
          if ((error as any).code !== 'ENOENT') {
            console.warn(`Could not backup ${item}: ${error}`);
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to backup git metadata: ${error}`);
    }
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  private async restoreFromBundle(bundlePath: string, options: RestoreOptions): Promise<void> {
    try {
      // Verify bundle
      await this.executeGitCommand(`git bundle verify "${bundlePath}"`);

      // Clone from bundle to temporary directory for selective restore
      if (options.partial && options.files) {
        // Partial restore not implemented in this version
        throw new Error('Partial restore from bundle not yet implemented');
      } else {
        // Full restore
        await this.executeGitCommand(`git bundle unbundle "${bundlePath}"`);
      }
    } catch (error) {
      throw new Error(`Failed to restore from bundle: ${error}`);
    }
  }

  private async restoreWorkingDirectory(workingDirBackup: string, options: RestoreOptions): Promise<void> {
    try {
      if (options.partial && options.files) {
        // Restore only specified files
        for (const file of options.files) {
          const sourcePath = path.join(workingDirBackup, file);
          const targetPath = path.join(this.repoPath, file);

          if (await this.fileExists(sourcePath)) {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.copyFile(sourcePath, targetPath);
          }
        }
      } else {
        // Restore all files
        await this.copyDirectory(workingDirBackup, this.repoPath);
      }
    } catch (error) {
      throw new Error(`Failed to restore working directory: ${error}`);
    }
  }

  private async restoreGitMetadata(metadataBackup: string): Promise<void> {
    try {
      // Restore metadata files (be careful not to overwrite current repository state)
      const filesToRestore = [
        'config',
        'hooks',
        'info'
      ];

      for (const item of filesToRestore) {
        const sourcePath = path.join(metadataBackup, item);
        const targetPath = path.join(this.gitDir, item);

        try {
          if (await this.fileExists(sourcePath)) {
            const stats = await fs.stat(sourcePath);
            if (stats.isDirectory()) {
              await this.copyDirectory(sourcePath, targetPath);
            } else {
              await fs.copyFile(sourcePath, targetPath);
            }
          }
        } catch (error) {
          console.warn(`Could not restore ${item}: ${error}`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to restore git metadata: ${error}`);
    }
  }

  private async saveBackupMetadata(backupPath: string, backupInfo: BackupInfo): Promise<void> {
    const metadataPath = path.join(backupPath, 'backup-info.json');
    await fs.writeFile(metadataPath, JSON.stringify(backupInfo, null, 2), 'utf8');
  }

  private async loadBackupMetadata(backupPath: string): Promise<BackupInfo | null> {
    try {
      const metadataPath = path.join(backupPath, 'backup-info.json');
      const content = await fs.readFile(metadataPath, 'utf8');
      const backupInfo = JSON.parse(content) as BackupInfo;
      
      // Convert date string back to Date object
      backupInfo.createdAt = new Date(backupInfo.createdAt);
      
      return backupInfo;
    } catch {
      return null;
    }
  }

  private async calculateBackupSize(backupPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sb "${backupPath}"`);
      const sizeMatch = stdout.match(/^(\d+)/);
      return sizeMatch ? parseInt(sizeMatch[1]) : 0;
    } catch {
      return 0;
    }
  }

  private async compressBackup(backupPath: string): Promise<void> {
    try {
      const compressedPath = `${backupPath}.tar.gz`;
      await execAsync(`tar -czf "${compressedPath}" -C "${path.dirname(backupPath)}" "${path.basename(backupPath)}"`);
      
      // Remove uncompressed backup
      await fs.rm(backupPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to compress backup: ${error}`);
    }
  }

  private async executeGitCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(command, {
        cwd: this.repoPath,
        timeout: 30000
      });
      return stdout;
    } catch (error: any) {
      throw new Error(`Git command failed: ${command}\nError: ${error.message}`);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}