import { 
  CorruptionIssue, 
  CorruptionDetectionResult, 
  RecoveryOptions, 
  RecoveryResult, 
  RecoveryAction,
  CorruptionType,
  CorruptionSeverity,
  BackupInfo
} from '../types';
import { CorruptionDetector } from './corruptionDetector';
import { RecoveryStrategyRegistry } from './recoveryStrategies';
import { BackupManager, BackupOptions } from './backupManager';

export interface RecoverySession {
  id: string;
  startTime: Date;
  detectionResult: CorruptionDetectionResult;
  plannedActions: RecoveryAction[];
  executedActions: RecoveryAction[];
  backupCreated?: BackupInfo;
  result?: RecoveryResult;
  options: RecoveryOptions;
}

export interface RecoveryPlan {
  issues: CorruptionIssue[];
  actions: RecoveryAction[];
  estimatedTime: number; // minutes
  dataLossRisk: 'none' | 'minimal' | 'moderate' | 'high';
  requiresBackup: boolean;
  requiresConfirmation: boolean;
  canAutoExecute: boolean;
}

/**
 * CorruptionRecoveryCoordinator orchestrates the complete corruption recovery process
 * 
 * This is the main entry point for repository corruption recovery. It coordinates
 * detection, planning, backup creation, and execution of recovery actions while
 * providing comprehensive logging and user guidance throughout the process.
 */
export class CorruptionRecoveryCoordinator {
  private readonly repoPath: string;
  private readonly detector: CorruptionDetector;
  private readonly strategyRegistry: RecoveryStrategyRegistry;
  private readonly backupManager: BackupManager;
  private readonly sessions: Map<string, RecoverySession> = new Map();

  constructor(repoPath: string, backupDir?: string) {
    this.repoPath = repoPath;
    this.detector = new CorruptionDetector(repoPath);
    this.strategyRegistry = new RecoveryStrategyRegistry(repoPath);
    this.backupManager = new BackupManager(repoPath, backupDir);
  }

  /**
   * Perform comprehensive corruption detection and return results
   */
  async detectCorruption(): Promise<CorruptionDetectionResult> {
    return this.detector.detectCorruption();
  }

  /**
   * Create a recovery plan for detected corruption issues
   */
  async createRecoveryPlan(
    detectionResult: CorruptionDetectionResult, 
    options: RecoveryOptions
  ): Promise<RecoveryPlan> {
    const actions: RecoveryAction[] = [];
    let estimatedTime = 0;
    let highestDataLossRisk: 'none' | 'minimal' | 'moderate' | 'high' = 'none';
    let requiresBackup = false;
    let requiresConfirmation = false;

    // Process each issue and generate recovery actions
    for (const issue of detectionResult.issues) {
      const strategy = this.strategyRegistry.findStrategy(issue);
      
      if (strategy) {
        try {
          const issueActions = await strategy.generateActions(issue, options);
          actions.push(...issueActions);

          // Aggregate plan metadata
          for (const action of issueActions) {
            estimatedTime += action.estimatedTime;
            
            if (action.requiresBackup) requiresBackup = true;
            if (action.requiresUserConfirmation) requiresConfirmation = true;
            
            // Determine highest data loss risk
            const riskLevels = ['none', 'minimal', 'moderate', 'high'] as const;
            const currentRiskIndex = riskLevels.indexOf(action.dataLossRisk);
            const highestRiskIndex = riskLevels.indexOf(highestDataLossRisk);
            
            if (currentRiskIndex > highestRiskIndex) {
              highestDataLossRisk = action.dataLossRisk;
            }
          }
        } catch (error) {
          // If we can't generate actions for an issue, mark it as requiring manual intervention
          actions.push({
            strategy: options.autoRepair ? 'auto_repair' : 'manual_intervention',
            description: `Manual intervention required for ${issue.type}: ${error}`,
            commands: [],
            dataLossRisk: 'moderate',
            successProbability: 50,
            estimatedTime: 15,
            requiresBackup: true,
            requiresUserConfirmation: true
          });
          
          estimatedTime += 15;
          highestDataLossRisk = 'moderate';
          requiresBackup = true;
          requiresConfirmation = true;
        }
      }
    }

    // Determine if plan can be auto-executed
    const canAutoExecute = options.autoRepair && 
                          !requiresConfirmation && 
                          this.isWithinDataLossThreshold(highestDataLossRisk, options.maxDataLoss);

    return {
      issues: detectionResult.issues,
      actions,
      estimatedTime,
      dataLossRisk: highestDataLossRisk,
      requiresBackup: requiresBackup || options.createBackup,
      requiresConfirmation: requiresConfirmation || options.requireConfirmation,
      canAutoExecute
    };
  }

  /**
   * Execute a recovery plan
   */
  async executeRecoveryPlan(
    plan: RecoveryPlan, 
    options: RecoveryOptions,
    onProgress?: (progress: { step: string; completed: number; total: number }) => void
  ): Promise<RecoveryResult> {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();

    // Create recovery session
    const session: RecoverySession = {
      id: sessionId,
      startTime: new Date(),
      detectionResult: { 
        isCorrupted: true, 
        issues: plan.issues, 
        integrityScore: 0, 
        lastCheck: new Date(), 
        checkDuration: 0 
      },
      plannedActions: plan.actions,
      executedActions: [],
      options
    };

    this.sessions.set(sessionId, session);

    try {
      const result: RecoveryResult = {
        success: false,
        appliedActions: [],
        resolvedIssues: [],
        remainingIssues: [...plan.issues],
        dataLoss: false,
        recoveryTime: 0,
        userMessages: [],
        nextSteps: []
      };

      // Step 1: Create backup if required
      if (plan.requiresBackup) {
        onProgress?.({ step: 'Creating backup', completed: 0, total: plan.actions.length + 1 });
        
        try {
          const backupOptions: BackupOptions = {
            reason: `Pre-recovery backup for session ${sessionId}`,
            includeWorkingDirectory: options.preserveUncommitted,
            compress: true,
            maxBackups: 10
          };

          session.backupCreated = await this.backupManager.createBackup(backupOptions);
          result.backupCreated = session.backupCreated.id;
          result.userMessages.push(`Backup created: ${session.backupCreated.id}`);
        } catch (error) {
          result.userMessages.push(`Backup creation failed: ${error}`);
          
          if (options.requireConfirmation) {
            throw new Error(`Recovery aborted: Could not create required backup`);
          }
        }
      }

      // Step 2: Execute recovery actions
      let actionIndex = 0;
      const totalSteps = plan.actions.length + (plan.requiresBackup ? 1 : 0);

      for (const action of plan.actions) {
        actionIndex++;
        const stepNumber = actionIndex + (plan.requiresBackup ? 1 : 0);
        
        onProgress?.({ 
          step: `Executing: ${action.description}`, 
          completed: stepNumber - 1, 
          total: totalSteps 
        });

        try {
          const strategy = this.strategyRegistry.getAllStrategies()
            .find(s => plan.issues.some(issue => s.canHandle(issue)));

          if (strategy) {
            const actionResult = await strategy.executeActions([action], options);
            
            session.executedActions.push(action);
            result.appliedActions.push(action);
            
            if (actionResult.success) {
              // Remove resolved issues from remaining issues
              if (actionResult.resolvedIssues) {
                result.resolvedIssues.push(...actionResult.resolvedIssues);
                result.remainingIssues = result.remainingIssues.filter(
                  issue => !actionResult.resolvedIssues!.includes(issue.type)
                );
              }
            }

            if (actionResult.userMessages) {
              result.userMessages.push(...actionResult.userMessages);
            }

            if (actionResult.nextSteps) {
              result.nextSteps?.push(...actionResult.nextSteps);
            }
          }
        } catch (error) {
          result.userMessages.push(`Action failed: ${action.description} - ${error}`);
          
          // Continue with other actions unless it's a critical failure
          if (action.dataLossRisk === 'high') {
            result.userMessages.push('Critical action failed, aborting recovery');
            break;
          }
        }
      }

      // Step 3: Final validation
      onProgress?.({ step: 'Validating recovery', completed: totalSteps, total: totalSteps });
      
      const postRecoveryDetection = await this.detector.detectCorruption();
      
      result.success = postRecoveryDetection.integrityScore > 80 || result.remainingIssues.length === 0;
      result.recoveryTime = Date.now() - startTime;

      // Update remaining issues with post-recovery detection
      result.remainingIssues = postRecoveryDetection.issues;

      // Add final guidance
      if (result.success) {
        result.userMessages.push('Repository corruption recovery completed successfully');
        
        if (session.backupCreated) {
          result.nextSteps?.push(`Backup available for rollback: ${session.backupCreated.id}`);
        }
      } else {
        result.userMessages.push('Recovery incomplete - manual intervention may be required');
        
        if (result.remainingIssues.length > 0) {
          const criticalIssues = result.remainingIssues.filter(
            issue => issue.severity === CorruptionSeverity.Critical
          );
          
          if (criticalIssues.length > 0) {
            result.nextSteps?.push('Consider restoring from backup or contacting support');
          } else {
            result.nextSteps?.push('Re-run recovery with more aggressive options');
          }
        }
      }

      session.result = result;
      return result;

    } catch (error) {
      const errorResult: RecoveryResult = {
        success: false,
        appliedActions: session.executedActions,
        resolvedIssues: [],
        remainingIssues: plan.issues,
        dataLoss: false,
        recoveryTime: Date.now() - startTime,
        userMessages: [`Recovery failed: ${error}`],
        nextSteps: ['Consider manual recovery or restore from backup']
      };

      session.result = errorResult;
      return errorResult;
    }
  }

  /**
   * Get recovery session information
   */
  getRecoverySession(sessionId: string): RecoverySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all recovery sessions
   */
  getAllRecoverySessions(): RecoverySession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get backup manager for direct backup operations
   */
  getBackupManager(): BackupManager {
    return this.backupManager;
  }

  /**
   * Perform quick corruption check
   */
  async quickCorruptionCheck(): Promise<{
    isCorrupted: boolean;
    criticalIssues: CorruptionIssue[];
    canContinue: boolean;
  }> {
    try {
      const result = await this.detector.detectCorruption();
      const criticalIssues = result.issues.filter(
        issue => issue.severity === CorruptionSeverity.Critical || 
                issue.severity === CorruptionSeverity.High
      );

      return {
        isCorrupted: result.isCorrupted,
        criticalIssues,
        canContinue: criticalIssues.length === 0
      };
    } catch (error) {
      return {
        isCorrupted: true,
        criticalIssues: [{
          type: CorruptionType.FilesystemError,
          severity: CorruptionSeverity.Critical,
          description: `Corruption check failed: ${error}`,
          affectedFiles: [this.repoPath],
          detectedAt: new Date(),
          autoRecoverable: false,
          recommendedActions: ['Manual inspection required'],
          potentialDataLoss: true,
          backupRequired: true
        }],
        canContinue: false
      };
    }
  }

  /**
   * Get recovery recommendations based on corruption severity
   */
  async getRecoveryRecommendations(detectionResult: CorruptionDetectionResult): Promise<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    recommendedOptions: RecoveryOptions;
    warningMessage?: string;
    canProceed: boolean;
  }> {
    const criticalIssues = detectionResult.issues.filter(i => i.severity === CorruptionSeverity.Critical);
    const highIssues = detectionResult.issues.filter(i => i.severity === CorruptionSeverity.High);
    const mediumIssues = detectionResult.issues.filter(i => i.severity === CorruptionSeverity.Medium);

    if (criticalIssues.length > 0) {
      return {
        priority: 'critical',
        recommendedOptions: {
          maxDataLoss: 'acceptable',
          autoRepair: false,
          createBackup: true,
          preserveUncommitted: true,
          aggressive: false,
          timeoutMinutes: 60,
          requireConfirmation: true
        },
        warningMessage: 'Critical corruption detected. Backup and manual intervention strongly recommended.',
        canProceed: false
      };
    } else if (highIssues.length > 0) {
      return {
        priority: 'high',
        recommendedOptions: {
          maxDataLoss: 'moderate',
          autoRepair: false,
          createBackup: true,
          preserveUncommitted: true,
          aggressive: false,
          timeoutMinutes: 30,
          requireConfirmation: true
        },
        warningMessage: 'High-severity corruption detected. Proceed with caution.',
        canProceed: true
      };
    } else if (mediumIssues.length > 0) {
      return {
        priority: 'medium',
        recommendedOptions: {
          maxDataLoss: 'minimal',
          autoRepair: true,
          createBackup: true,
          preserveUncommitted: true,
          aggressive: false,
          timeoutMinutes: 15,
          requireConfirmation: false
        },
        canProceed: true
      };
    } else {
      return {
        priority: 'low',
        recommendedOptions: {
          maxDataLoss: 'none',
          autoRepair: true,
          createBackup: false,
          preserveUncommitted: false,
          aggressive: false,
          timeoutMinutes: 10,
          requireConfirmation: false
        },
        canProceed: true
      };
    }
  }

  // Private helper methods

  private generateSessionId(): string {
    return `recovery-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private isWithinDataLossThreshold(
    riskLevel: 'none' | 'minimal' | 'moderate' | 'high',
    maxAllowed: 'none' | 'minimal' | 'moderate' | 'acceptable'
  ): boolean {
    const riskLevels = ['none', 'minimal', 'moderate', 'high'];
    const allowedLevels = ['none', 'minimal', 'moderate', 'acceptable'];
    
    const riskIndex = riskLevels.indexOf(riskLevel);
    const allowedIndex = allowedLevels.indexOf(maxAllowed);
    
    return riskIndex <= allowedIndex;
  }
}