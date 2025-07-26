import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  CorruptionType, 
  CorruptionSeverity, 
  CorruptionIssue, 
  CorruptionDetectionResult 
} from '../types';

const execAsync = promisify(exec);

/**
 * CorruptionDetector class for identifying various types of git repository corruption
 * 
 * This class performs comprehensive integrity checks on git repositories to identify
 * corruption issues that could affect repository operations. It checks:
 * - Object database integrity
 * - Index file validity  
 * - Reference consistency
 * - Lock file issues
 * - Incomplete operations
 * - Configuration problems
 * - Working directory issues
 */
export class CorruptionDetector {
  private readonly repoPath: string;
  private readonly gitDir: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.gitDir = path.join(repoPath, '.git');
  }

  /**
   * Perform comprehensive corruption detection on the repository
   */
  async detectCorruption(): Promise<CorruptionDetectionResult> {
    const startTime = Date.now();
    const issues: CorruptionIssue[] = [];

    try {
      // Run all detection checks in parallel for efficiency
      const [
        objectIssues,
        indexIssues,
        refIssues,
        lockIssues,
        operationIssues,
        configIssues,
        permissionIssues
      ] = await Promise.all([
        this.checkObjectDatabase(),
        this.checkIndexFile(),
        this.checkReferences(),
        this.checkLockFiles(),
        this.checkIncompleteOperations(),
        this.checkConfiguration(),
        this.checkPermissions()
      ]);

      issues.push(
        ...objectIssues,
        ...indexIssues,
        ...refIssues,
        ...lockIssues,
        ...operationIssues,
        ...configIssues,
        ...permissionIssues
      );

      const integrityScore = this.calculateIntegrityScore(issues);
      const checkDuration = Date.now() - startTime;

      return {
        isCorrupted: issues.length > 0,
        issues,
        integrityScore,
        lastCheck: new Date(),
        checkDuration
      };

    } catch (error) {
      // If detection itself fails, report as critical corruption
      const criticalIssue: CorruptionIssue = {
        type: CorruptionType.FilesystemError,
        severity: CorruptionSeverity.Critical,
        description: `Corruption detection failed: ${error}`,
        affectedFiles: [this.gitDir],
        detectedAt: new Date(),
        autoRecoverable: false,
        recommendedActions: ['Manual inspection required', 'Check filesystem integrity'],
        potentialDataLoss: true,
        backupRequired: true
      };

      return {
        isCorrupted: true,
        issues: [criticalIssue],
        integrityScore: 0,
        lastCheck: new Date(),
        checkDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Check object database integrity
   */
  private async checkObjectDatabase(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];

    try {
      // Check for corrupt objects using git fsck
      const { stdout: fsckOutput } = await execAsync('git fsck --full --strict', {
        cwd: this.repoPath,
        timeout: 30000
      });

      // Parse fsck output for corruption indicators
      const lines = fsckOutput.split('\n').filter(line => line.trim());
      for (const line of lines) {
        if (line.includes('error') || line.includes('corrupt') || line.includes('missing')) {
          const issue = this.parseFsckError(line);
          if (issue) issues.push(issue);
        }
      }

      // Check packfile integrity
      await this.checkPackfiles(issues);

    } catch (error: any) {
      if (error.stderr && error.stderr.includes('corrupt')) {
        issues.push({
          type: CorruptionType.CorruptObject,
          severity: CorruptionSeverity.High,
          description: `Object database corruption detected: ${error.stderr}`,
          affectedFiles: [path.join(this.gitDir, 'objects')],
          detectedAt: new Date(),
          autoRecoverable: false,
          recommendedActions: ['Run git fsck --full', 'Consider object recovery'],
          potentialDataLoss: true,
          backupRequired: true
        });
      }
    }

    return issues;
  }

  /**
   * Check index file integrity
   */
  private async checkIndexFile(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];
    const indexPath = path.join(this.gitDir, 'index');

    try {
      // Check if index file exists and is readable
      await fs.access(indexPath, fs.constants.R_OK | fs.constants.W_OK);

      // Try to read the index
      await execAsync('git ls-files --stage', {
        cwd: this.repoPath,
        timeout: 10000
      });

    } catch (error: any) {
      let severity = CorruptionSeverity.Medium;
      let autoRecoverable = true;

      if (error.code === 'ENOENT') {
        // Index file missing
        issues.push({
          type: CorruptionType.InvalidIndex,
          severity: CorruptionSeverity.Low,
          description: 'Index file is missing',
          affectedFiles: [indexPath],
          detectedAt: new Date(),
          autoRecoverable: true,
          recommendedActions: ['Rebuild index with git reset'],
          potentialDataLoss: false,
          backupRequired: false
        });
      } else if (error.stderr && error.stderr.includes('corrupt')) {
        // Index file corrupted
        severity = CorruptionSeverity.High;
        autoRecoverable = false;
        
        issues.push({
          type: CorruptionType.CorruptIndex,
          severity,
          description: `Index file corruption: ${error.stderr}`,
          affectedFiles: [indexPath],
          detectedAt: new Date(),
          autoRecoverable,
          recommendedActions: ['Remove and rebuild index', 'Check for filesystem issues'],
          potentialDataLoss: true,
          backupRequired: true
        });
      }
    }

    return issues;
  }

  /**
   * Check reference integrity
   */
  private async checkReferences(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];

    try {
      // Check all refs
      const { stdout } = await execAsync('git for-each-ref --format="%(refname) %(objectname)"', {
        cwd: this.repoPath,
        timeout: 10000
      });

      const refs = stdout.split('\n').filter(line => line.trim());
      
      for (const ref of refs) {
        const [refName, objectName] = ref.split(' ');
        if (!refName || !objectName) continue;

        try {
          // Verify each ref points to a valid object
          await execAsync(`git cat-file -e ${objectName}`, {
            cwd: this.repoPath,
            timeout: 5000
          });
        } catch {
          issues.push({
            type: CorruptionType.DanglingRef,
            severity: CorruptionSeverity.Medium,
            description: `Reference ${refName} points to missing object ${objectName}`,
            affectedFiles: [refName.replace('refs/', path.join(this.gitDir, 'refs/'))],
            detectedAt: new Date(),
            autoRecoverable: true,
            recommendedActions: ['Prune dangling references', 'Update ref to valid commit'],
            potentialDataLoss: false,
            backupRequired: false
          });
        }
      }

      // Check for malformed ref files
      await this.checkRefFiles(issues);

    } catch (error: any) {
      issues.push({
        type: CorruptionType.CorruptRef,
        severity: CorruptionSeverity.High,
        description: `Reference system error: ${error.message}`,
        affectedFiles: [path.join(this.gitDir, 'refs')],
        detectedAt: new Date(),
        autoRecoverable: false,
        recommendedActions: ['Manual ref inspection', 'Restore from backup'],
        potentialDataLoss: true,
        backupRequired: true
      });
    }

    return issues;
  }

  /**
   * Check for stale lock files
   */
  private async checkLockFiles(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];

    const lockPatterns = [
      path.join(this.gitDir, 'index.lock'),
      path.join(this.gitDir, 'HEAD.lock'),
      path.join(this.gitDir, 'config.lock'),
      path.join(this.gitDir, 'refs/**/*.lock')
    ];

    for (const pattern of lockPatterns) {
      try {
        if (pattern.includes('**')) {
          // Handle glob patterns for ref locks
          const refsDir = path.join(this.gitDir, 'refs');
          const lockFiles = await this.findLockFiles(refsDir);
          
          for (const lockFile of lockFiles) {
            const age = await this.getLockFileAge(lockFile);
            if (age > 300000) { // 5 minutes
              issues.push(this.createLockFileIssue(lockFile, age));
            }
          }
        } else {
          try {
            await fs.access(pattern);
            const age = await this.getLockFileAge(pattern);
            if (age > 60000) { // 1 minute for main lock files
              issues.push(this.createLockFileIssue(pattern, age));
            }
          } catch {
            // Lock file doesn't exist, which is good
          }
        }
      } catch (error) {
        // Error checking for locks - may indicate filesystem issues
      }
    }

    return issues;
  }

  /**
   * Check for incomplete git operations
   */
  private async checkIncompleteOperations(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];

    const operationChecks = [
      { file: 'MERGE_HEAD', type: CorruptionType.IncompleteMerge },
      { file: 'REBASE_HEAD', type: CorruptionType.IncompleteRebase },
      { file: 'CHERRY_PICK_HEAD', type: CorruptionType.IncompleteCherryPick },
      { file: 'rebase-apply', type: CorruptionType.IncompleteApply }
    ];

    for (const check of operationChecks) {
      const filePath = path.join(this.gitDir, check.file);
      try {
        await fs.access(filePath);
        
        issues.push({
          type: check.type,
          severity: CorruptionSeverity.Medium,
          description: `Incomplete ${check.type.replace('incomplete_', '')} operation detected`,
          affectedFiles: [filePath],
          detectedAt: new Date(),
          autoRecoverable: true,
          recommendedActions: [`Complete or abort the ${check.type.replace('incomplete_', '')} operation`],
          potentialDataLoss: false,
          backupRequired: false
        });
      } catch {
        // File doesn't exist, operation is complete
      }
    }

    return issues;
  }

  /**
   * Check git configuration integrity
   */
  private async checkConfiguration(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];
    const configPath = path.join(this.gitDir, 'config');

    try {
      // Try to read git config
      await execAsync('git config --list', {
        cwd: this.repoPath,
        timeout: 5000
      });

      // Check for valid remote URLs
      try {
        const { stdout } = await execAsync('git remote -v', {
          cwd: this.repoPath,
          timeout: 5000
        });

        const remotes = stdout.split('\n').filter(line => line.trim());
        for (const remote of remotes) {
          const urlMatch = remote.match(/\t(.+)\s+\((fetch|push)\)$/);
          if (urlMatch) {
            const url = urlMatch[1];
            if (!this.isValidGitURL(url)) {
              issues.push({
                type: CorruptionType.InvalidRemote,
                severity: CorruptionSeverity.Low,
                description: `Invalid remote URL: ${url}`,
                affectedFiles: [configPath],
                detectedAt: new Date(),
                autoRecoverable: true,
                recommendedActions: ['Update remote URL', 'Remove invalid remote'],
                potentialDataLoss: false,
                backupRequired: false
              });
            }
          }
        }
      } catch {
        // No remotes configured, which is fine
      }

    } catch (error: any) {
      issues.push({
        type: CorruptionType.CorruptConfig,
        severity: CorruptionSeverity.Medium,
        description: `Git configuration error: ${error.message}`,
        affectedFiles: [configPath],
        detectedAt: new Date(),
        autoRecoverable: true,
        recommendedActions: ['Check config file syntax', 'Restore config from backup'],
        potentialDataLoss: false,
        backupRequired: false
      });
    }

    return issues;
  }

  /**
   * Check filesystem permissions and disk space
   */
  private async checkPermissions(): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];

    try {
      // Check .git directory permissions
      await fs.access(this.gitDir, fs.constants.R_OK | fs.constants.W_OK);

      // Check disk space (warning if less than 100MB)
      const stats = await fs.stat(this.gitDir);
      // Note: This is a simplified check - real implementation would check available space
      
    } catch (error: any) {
      if (error.code === 'EACCES') {
        issues.push({
          type: CorruptionType.PermissionDenied,
          severity: CorruptionSeverity.High,
          description: 'Insufficient permissions to access .git directory',
          affectedFiles: [this.gitDir],
          detectedAt: new Date(),
          autoRecoverable: false,
          recommendedActions: ['Check file permissions', 'Run as appropriate user'],
          potentialDataLoss: false,
          backupRequired: false
        });
      } else if (error.code === 'ENOSPC') {
        issues.push({
          type: CorruptionType.DiskFull,
          severity: CorruptionSeverity.Critical,
          description: 'Insufficient disk space',
          affectedFiles: [this.repoPath],
          detectedAt: new Date(),
          autoRecoverable: false,
          recommendedActions: ['Free up disk space', 'Move repository to larger disk'],
          potentialDataLoss: true,
          backupRequired: true
        });
      }
    }

    return issues;
  }

  /**
   * Parse git fsck error messages
   */
  private parseFsckError(line: string): CorruptionIssue | null {
    if (line.includes('missing')) {
      return {
        type: CorruptionType.MissingObject,
        severity: CorruptionSeverity.High,
        description: line,
        affectedFiles: [path.join(this.gitDir, 'objects')],
        detectedAt: new Date(),
        autoRecoverable: false,
        recommendedActions: ['Restore from backup', 'Attempt object recovery'],
        potentialDataLoss: true,
        backupRequired: true
      };
    } else if (line.includes('corrupt')) {
      return {
        type: CorruptionType.CorruptObject,
        severity: CorruptionSeverity.Critical,
        description: line,
        affectedFiles: [path.join(this.gitDir, 'objects')],
        detectedAt: new Date(),
        autoRecoverable: false,
        recommendedActions: ['Restore from backup', 'Reconstruct repository'],
        potentialDataLoss: true,
        backupRequired: true
      };
    }
    return null;
  }

  /**
   * Check packfile integrity
   */
  private async checkPackfiles(issues: CorruptionIssue[]): Promise<void> {
    const packsDir = path.join(this.gitDir, 'objects', 'pack');
    
    try {
      const files = await fs.readdir(packsDir);
      const packFiles = files.filter(f => f.endsWith('.pack'));
      
      for (const packFile of packFiles) {
        try {
          await execAsync(`git verify-pack -v ${path.join(packsDir, packFile)}`, {
            cwd: this.repoPath,
            timeout: 30000
          });
        } catch (error: any) {
          issues.push({
            type: CorruptionType.CorruptPackfile,
            severity: CorruptionSeverity.High,
            description: `Packfile corruption in ${packFile}: ${error.message}`,
            affectedFiles: [path.join(packsDir, packFile)],
            detectedAt: new Date(),
            autoRecoverable: false,
            recommendedActions: ['Repack repository', 'Restore from backup'],
            potentialDataLoss: true,
            backupRequired: true
          });
        }
      }
    } catch {
      // No pack files or can't read directory
    }
  }

  /**
   * Check individual ref files for malformation
   */
  private async checkRefFiles(issues: CorruptionIssue[]): Promise<void> {
    const refsDir = path.join(this.gitDir, 'refs');
    
    try {
      const refFiles = await this.findAllRefFiles(refsDir);
      
      for (const refFile of refFiles) {
        try {
          const content = await fs.readFile(refFile, 'utf8');
          const hash = content.trim();
          
          // Check if it's a valid SHA-1 hash
          if (!/^[a-f0-9]{40}$/i.test(hash)) {
            issues.push({
              type: CorruptionType.InvalidRefFormat,
              severity: CorruptionSeverity.Medium,
              description: `Invalid ref format in ${refFile}`,
              affectedFiles: [refFile],
              detectedAt: new Date(),
              autoRecoverable: true,
              recommendedActions: ['Update ref to valid commit hash'],
              potentialDataLoss: false,
              backupRequired: false
            });
          }
        } catch (error) {
          issues.push({
            type: CorruptionType.CorruptRef,
            severity: CorruptionSeverity.Medium,
            description: `Cannot read ref file ${refFile}: ${error}`,
            affectedFiles: [refFile],
            detectedAt: new Date(),
            autoRecoverable: true,
            recommendedActions: ['Remove corrupted ref file'],
            potentialDataLoss: false,
            backupRequired: false
          });
        }
      }
    } catch {
      // Cannot read refs directory
    }
  }

  /**
   * Find all lock files recursively
   */
  private async findLockFiles(dir: string): Promise<string[]> {
    const lockFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          lockFiles.push(...await this.findLockFiles(fullPath));
        } else if (entry.name.endsWith('.lock')) {
          lockFiles.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
    
    return lockFiles;
  }

  /**
   * Find all ref files recursively
   */
  private async findAllRefFiles(dir: string): Promise<string[]> {
    const refFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          refFiles.push(...await this.findAllRefFiles(fullPath));
        } else if (entry.isFile()) {
          refFiles.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
    
    return refFiles;
  }

  /**
   * Get lock file age in milliseconds
   */
  private async getLockFileAge(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return Date.now() - stats.mtime.getTime();
    } catch {
      return 0;
    }
  }

  /**
   * Create a lock file issue
   */
  private createLockFileIssue(lockFile: string, age: number): CorruptionIssue {
    const lockType = lockFile.includes('index.lock') ? CorruptionType.IndexLock :
                    lockFile.includes('refs/') ? CorruptionType.RefLock :
                    CorruptionType.StaleLockFile;

    return {
      type: lockType,
      severity: CorruptionSeverity.Medium,
      description: `Stale lock file detected: ${lockFile} (age: ${Math.round(age / 1000)}s)`,
      affectedFiles: [lockFile],
      detectedAt: new Date(),
      autoRecoverable: true,
      recommendedActions: ['Remove stale lock file'],
      potentialDataLoss: false,
      backupRequired: false
    };
  }

  /**
   * Validate if a URL is a valid git remote URL
   */
  private isValidGitURL(url: string): boolean {
    const patterns = [
      /^https?:\/\//, // HTTP/HTTPS
      /^git@/, // SSH
      /^ssh:\/\//, // SSH protocol
      /^file:\/\//, // Local file
      /^[./]/ // Relative/absolute local path
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Calculate repository integrity score based on detected issues
   */
  private calculateIntegrityScore(issues: CorruptionIssue[]): number {
    if (issues.length === 0) return 100;

    let score = 100;
    
    for (const issue of issues) {
      switch (issue.severity) {
        case CorruptionSeverity.Low:
          score -= 5;
          break;
        case CorruptionSeverity.Medium:
          score -= 15;
          break;
        case CorruptionSeverity.High:
          score -= 30;
          break;
        case CorruptionSeverity.Critical:
          score -= 50;
          break;
      }
    }

    return Math.max(0, score);
  }
}