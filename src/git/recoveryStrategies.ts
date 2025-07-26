import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  CorruptionType, 
  CorruptionIssue, 
  RecoveryStrategy, 
  RecoveryAction, 
  RecoveryResult,
  RecoveryOptions 
} from '../types';

const execAsync = promisify(exec);

/**
 * Base class for all recovery strategies
 */
abstract class BaseRecoveryStrategy {
  protected repoPath: string;
  protected gitDir: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.gitDir = path.join(repoPath, '.git');
  }

  abstract canHandle(issue: CorruptionIssue): boolean;
  abstract generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]>;
  abstract executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>>;

  /**
   * Execute a git command safely
   */
  protected async executeGitCommand(command: string, timeoutMs: number = 30000): Promise<string> {
    try {
      const { stdout } = await execAsync(command, {
        cwd: this.repoPath,
        timeout: timeoutMs
      });
      return stdout;
    } catch (error: any) {
      throw new Error(`Git command failed: ${command}\nError: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Backup a file before modifying it
   */
  protected async backupFile(filePath: string): Promise<string> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    try {
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to backup file ${filePath}: ${error}`);
    }
  }
}

/**
 * Strategy for handling lock file issues
 */
export class LockFileRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.StaleLockFile,
      CorruptionType.IndexLock,
      CorruptionType.RefLock
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    for (const file of issue.affectedFiles) {
      actions.push({
        strategy: RecoveryStrategy.AutoRepair,
        description: `Remove stale lock file: ${file}`,
        commands: [`rm "${file}"`],
        dataLossRisk: 'none',
        successProbability: 95,
        estimatedTime: 1,
        requiresBackup: false,
        requiresUserConfirmation: false
      });
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          if (command.startsWith('rm ')) {
            const filePath = command.replace(/^rm "(.+)"$/, '$1');
            if (await this.fileExists(filePath)) {
              await fs.unlink(filePath);
              userMessages.push(`Removed stale lock file: ${path.basename(filePath)}`);
              
              if (filePath.includes('index.lock')) {
                resolvedIssues.push(CorruptionType.IndexLock);
              } else if (filePath.includes('refs/')) {
                resolvedIssues.push(CorruptionType.RefLock);
              } else {
                resolvedIssues.push(CorruptionType.StaleLockFile);
              }
            }
          }
        }
      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages
    };
  }
}

/**
 * Strategy for handling index corruption
 */
export class IndexRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.CorruptIndex,
      CorruptionType.InvalidIndex
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];
    const indexPath = path.join(this.gitDir, 'index');

    if (issue.type === CorruptionType.InvalidIndex) {
      // Missing index - can be rebuilt safely
      actions.push({
        strategy: RecoveryStrategy.AutoRepair,
        description: 'Rebuild missing index file',
        commands: ['git reset'],
        dataLossRisk: 'none',
        successProbability: 98,
        estimatedTime: 1,
        requiresBackup: false,
        requiresUserConfirmation: false
      });
    } else {
      // Corrupted index - more risky
      const dataLossRisk: 'none' | 'minimal' | 'moderate' | 'high' = options.preserveUncommitted ? 'moderate' : 'minimal';
      const requiresConfirmation = options.requireConfirmation;

      actions.push({
        strategy: RecoveryStrategy.SafeRepair,
        description: 'Remove corrupted index and rebuild',
        commands: [
          `rm "${indexPath}"`,
          'git reset --mixed HEAD'
        ],
        dataLossRisk,
        successProbability: 90,
        estimatedTime: 2,
        requiresBackup: options.createBackup,
        requiresUserConfirmation: requiresConfirmation
      });

      if (options.preserveUncommitted) {
        actions.unshift({
          strategy: RecoveryStrategy.SafeRepair,
          description: 'Stash uncommitted changes before index recovery',
          commands: ['git stash push -m "Pre-index-recovery backup"'],
          dataLossRisk: 'none',
          successProbability: 95,
          estimatedTime: 1,
          requiresBackup: false,
          requiresUserConfirmation: false
        });
      }
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];
    let stashCreated = false;

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          if (command.startsWith('rm ')) {
            const filePath = command.replace(/^rm "(.+)"$/, '$1');
            if (await this.fileExists(filePath)) {
              await fs.unlink(filePath);
              userMessages.push(`Removed corrupted index file`);
            }
          } else if (command.includes('stash')) {
            await this.executeGitCommand(command);
            stashCreated = true;
            userMessages.push('Stashed uncommitted changes for safety');
          } else {
            await this.executeGitCommand(command);
            userMessages.push(`Executed: ${command}`);
          }
        }

        if (action.description.includes('Rebuild')) {
          resolvedIssues.push(CorruptionType.InvalidIndex);
        } else if (action.description.includes('Remove corrupted')) {
          resolvedIssues.push(CorruptionType.CorruptIndex);
        }

      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    const nextSteps: string[] = [];
    if (stashCreated) {
      nextSteps.push('Review stashed changes with: git stash show');
      nextSteps.push('Restore stashed changes with: git stash pop');
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages,
      nextSteps
    };
  }
}

/**
 * Strategy for handling reference corruption
 */
export class ReferenceRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.CorruptRef,
      CorruptionType.DanglingRef,
      CorruptionType.InvalidRefFormat
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    if (issue.type === CorruptionType.DanglingRef) {
      actions.push({
        strategy: RecoveryStrategy.AutoRepair,
        description: 'Prune dangling references',
        commands: ['git remote prune origin', 'git gc --prune=now'],
        dataLossRisk: 'none',
        successProbability: 95,
        estimatedTime: 2,
        requiresBackup: false,
        requiresUserConfirmation: false
      });
    } else if (issue.type === CorruptionType.InvalidRefFormat) {
      for (const file of issue.affectedFiles) {
        actions.push({
          strategy: RecoveryStrategy.SafeRepair,
          description: `Fix invalid ref format in ${path.basename(file)}`,
          commands: [`rm "${file}"`],
          dataLossRisk: 'minimal',
          successProbability: 90,
          estimatedTime: 1,
          requiresBackup: options.createBackup,
          requiresUserConfirmation: options.requireConfirmation
        });
      }
    } else {
      // Corrupt ref - more serious
      actions.push({
        strategy: RecoveryStrategy.ManualIntervention,
        description: 'Manual inspection of corrupted references required',
        commands: ['git fsck --full'],
        dataLossRisk: 'moderate',
        successProbability: 70,
        estimatedTime: 10,
        requiresBackup: true,
        requiresUserConfirmation: true
      });
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          if (command.startsWith('rm ')) {
            const filePath = command.replace(/^rm "(.+)"$/, '$1');
            if (await this.fileExists(filePath)) {
              await fs.unlink(filePath);
              userMessages.push(`Removed invalid ref file: ${path.basename(filePath)}`);
              resolvedIssues.push(CorruptionType.InvalidRefFormat);
            }
          } else {
            await this.executeGitCommand(command);
            userMessages.push(`Executed: ${command}`);
            
            if (command.includes('prune')) {
              resolvedIssues.push(CorruptionType.DanglingRef);
            }
          }
        }
      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages
    };
  }
}

/**
 * Strategy for handling incomplete operations
 */
export class IncompleteOperationRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.IncompleteRebase,
      CorruptionType.IncompleteMerge,
      CorruptionType.IncompleteCherryPick,
      CorruptionType.IncompleteApply
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    switch (issue.type) {
      case CorruptionType.IncompleteRebase:
        actions.push({
          strategy: RecoveryStrategy.SafeRepair,
          description: 'Abort incomplete rebase operation',
          commands: ['git rebase --abort'],
          dataLossRisk: 'minimal',
          successProbability: 95,
          estimatedTime: 1,
          requiresBackup: false,
          requiresUserConfirmation: options.requireConfirmation
        });
        break;

      case CorruptionType.IncompleteMerge:
        actions.push({
          strategy: RecoveryStrategy.SafeRepair,
          description: 'Abort incomplete merge operation',
          commands: ['git merge --abort'],
          dataLossRisk: 'minimal',
          successProbability: 95,
          estimatedTime: 1,
          requiresBackup: false,
          requiresUserConfirmation: options.requireConfirmation
        });
        break;

      case CorruptionType.IncompleteCherryPick:
        actions.push({
          strategy: RecoveryStrategy.SafeRepair,
          description: 'Abort incomplete cherry-pick operation',
          commands: ['git cherry-pick --abort'],
          dataLossRisk: 'minimal',
          successProbability: 95,
          estimatedTime: 1,
          requiresBackup: false,
          requiresUserConfirmation: options.requireConfirmation
        });
        break;

      case CorruptionType.IncompleteApply:
        actions.push({
          strategy: RecoveryStrategy.SafeRepair,
          description: 'Clean up incomplete apply operation',
          commands: [
            'git am --abort',
            'rm -rf .git/rebase-apply'
          ],
          dataLossRisk: 'minimal',
          successProbability: 90,
          estimatedTime: 1,
          requiresBackup: false,
          requiresUserConfirmation: options.requireConfirmation
        });
        break;
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          if (command.startsWith('rm -rf ')) {
            const dirPath = command.replace(/^rm -rf (.+)$/, '$1');
            const fullPath = path.resolve(this.repoPath, dirPath);
            try {
              await fs.rm(fullPath, { recursive: true, force: true });
              userMessages.push(`Cleaned up: ${dirPath}`);
            } catch {
              // Directory might not exist, which is fine
            }
          } else {
            await this.executeGitCommand(command);
            userMessages.push(`Executed: ${command}`);
          }
        }

        // Determine which issue was resolved based on the action
        if (action.description.includes('rebase')) {
          resolvedIssues.push(CorruptionType.IncompleteRebase);
        } else if (action.description.includes('merge')) {
          resolvedIssues.push(CorruptionType.IncompleteMerge);
        } else if (action.description.includes('cherry-pick')) {
          resolvedIssues.push(CorruptionType.IncompleteCherryPick);
        } else if (action.description.includes('apply')) {
          resolvedIssues.push(CorruptionType.IncompleteApply);
        }

      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages
    };
  }
}

/**
 * Strategy for handling configuration issues
 */
export class ConfigurationRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.CorruptConfig,
      CorruptionType.InvalidRemote
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    if (issue.type === CorruptionType.InvalidRemote) {
      actions.push({
        strategy: RecoveryStrategy.SafeRepair,
        description: 'Remove invalid remote configuration',
        commands: ['git remote prune origin'],
        dataLossRisk: 'none',
        successProbability: 90,
        estimatedTime: 1,
        requiresBackup: false,
        requiresUserConfirmation: false
      });
    } else {
      actions.push({
        strategy: RecoveryStrategy.ManualIntervention,
        description: 'Manual configuration repair required',
        commands: ['git config --list'],
        dataLossRisk: 'minimal',
        successProbability: 80,
        estimatedTime: 5,
        requiresBackup: true,
        requiresUserConfirmation: true
      });
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          await this.executeGitCommand(command);
          userMessages.push(`Executed: ${command}`);
        }

        if (action.description.includes('invalid remote')) {
          resolvedIssues.push(CorruptionType.InvalidRemote);
        }
      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages
    };
  }
}

/**
 * Strategy for handling object database corruption
 */
export class ObjectDatabaseRecoveryStrategy extends BaseRecoveryStrategy {
  canHandle(issue: CorruptionIssue): boolean {
    return [
      CorruptionType.CorruptObject,
      CorruptionType.MissingObject,
      CorruptionType.CorruptPackfile
    ].includes(issue.type);
  }

  async generateActions(issue: CorruptionIssue, options: RecoveryOptions): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    // Object corruption is serious - always require backup and confirmation
    if (issue.type === CorruptionType.CorruptPackfile) {
      actions.push({
        strategy: RecoveryStrategy.DataReconstruction,
        description: 'Repack repository to fix corrupted packfile',
        commands: [
          'git repack -ad',
          'git gc --aggressive --prune=now'
        ],
        dataLossRisk: 'moderate',
        successProbability: 75,
        estimatedTime: 10,
        requiresBackup: true,
        requiresUserConfirmation: true
      });
    } else {
      actions.push({
        strategy: RecoveryStrategy.BackupRestore,
        description: 'Object database corruption requires backup restoration',
        commands: ['git fsck --full'],
        dataLossRisk: 'high',
        successProbability: 50,
        estimatedTime: 30,
        requiresBackup: true,
        requiresUserConfirmation: true
      });
    }

    return actions;
  }

  async executeActions(actions: RecoveryAction[], options: RecoveryOptions): Promise<Partial<RecoveryResult>> {
    const resolvedIssues: CorruptionType[] = [];
    const userMessages: string[] = [];

    for (const action of actions) {
      try {
        for (const command of action.commands) {
          await this.executeGitCommand(command, 120000); // Longer timeout for heavy operations
          userMessages.push(`Executed: ${command}`);
        }

        if (action.description.includes('Repack')) {
          resolvedIssues.push(CorruptionType.CorruptPackfile);
          userMessages.push('Repository repacked successfully');
        }
      } catch (error) {
        userMessages.push(`Failed to execute action: ${action.description} - ${error}`);
      }
    }

    return {
      success: resolvedIssues.length > 0,
      resolvedIssues,
      userMessages
    };
  }
}

/**
 * Recovery strategy registry
 */
export class RecoveryStrategyRegistry {
  private strategies: BaseRecoveryStrategy[] = [];

  constructor(repoPath: string) {
    this.strategies = [
      new LockFileRecoveryStrategy(repoPath),
      new IndexRecoveryStrategy(repoPath),
      new ReferenceRecoveryStrategy(repoPath),
      new IncompleteOperationRecoveryStrategy(repoPath),
      new ConfigurationRecoveryStrategy(repoPath),
      new ObjectDatabaseRecoveryStrategy(repoPath)
    ];
  }

  /**
   * Find the appropriate strategy for handling an issue
   */
  findStrategy(issue: CorruptionIssue): BaseRecoveryStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(issue)) || null;
  }

  /**
   * Get all available strategies
   */
  getAllStrategies(): BaseRecoveryStrategy[] {
    return [...this.strategies];
  }
}