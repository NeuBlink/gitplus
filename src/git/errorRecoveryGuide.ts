import { CorruptionType, CorruptionSeverity, RecoveryOptions } from '../types';

export interface ErrorRecoveryInstruction {
  symptom: string;
  likelyCause: string;
  immediateActions: string[];
  recoverySteps: string[];
  preventionTips: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoRecoverable: boolean;
  dataLossRisk: boolean;
}

export interface ErrorPattern {
  pattern: RegExp;
  corruptionType?: CorruptionType;
  instruction: ErrorRecoveryInstruction;
}

/**
 * ErrorRecoveryGuide provides user-friendly guidance for git errors and corruption recovery
 * 
 * This class maintains a comprehensive database of error patterns, their causes,
 * and step-by-step recovery instructions to help users resolve issues safely.
 */
export class ErrorRecoveryGuide {
  private readonly errorPatterns: ErrorPattern[] = [
    // Index corruption patterns
    {
      pattern: /index file corrupt|invalid index/i,
      corruptionType: CorruptionType.CorruptIndex,
      instruction: {
        symptom: 'Git index file is corrupted or invalid',
        likelyCause: 'Interrupted git operation, disk errors, or system crash during index update',
        immediateActions: [
          'Stop any ongoing git operations',
          'Check disk space and filesystem health',
          'Create a backup of your current work'
        ],
        recoverySteps: [
          '1. Stash uncommitted changes: git stash push -m "Pre-recovery backup"',
          '2. Remove corrupted index: rm .git/index',
          '3. Reset index: git reset --mixed HEAD',
          '4. Restore changes: git stash pop',
          '5. Review and re-stage your changes'
        ],
        preventionTips: [
          'Ensure sufficient disk space before git operations',
          'Use UPS to prevent sudden shutdowns during git operations',
          'Regularly backup your repository'
        ],
        severity: 'medium',
        autoRecoverable: true,
        dataLossRisk: false
      }
    },

    // Object corruption patterns
    {
      pattern: /bad object|corrupt object|missing blob|loose object/i,
      corruptionType: CorruptionType.CorruptObject,
      instruction: {
        symptom: 'Git object database contains corrupt or missing objects',
        likelyCause: 'Disk corruption, incomplete clone/fetch, or filesystem errors',
        immediateActions: [
          'STOP - Do not commit or push changes',
          'Create full repository backup immediately',
          'Document the exact error message'
        ],
        recoverySteps: [
          '1. Run: git fsck --full --strict to identify all issues',
          '2. Try: git gc --aggressive --prune=now',
          '3. If issues persist: git clone from remote to fresh directory',
          '4. Copy uncommitted work to new clone',
          '5. Verify integrity: git fsck --full'
        ],
        preventionTips: [
          'Regularly run git fsck to detect early corruption',
          'Use reliable storage and avoid hard shutdowns',
          'Keep backups of important repositories'
        ],
        severity: 'high',
        autoRecoverable: false,
        dataLossRisk: true
      }
    },

    // Lock file patterns
    {
      pattern: /another git process|index\.lock|unable to create.*lock/i,
      corruptionType: CorruptionType.StaleLockFile,
      instruction: {
        symptom: 'Git operation blocked by stale lock files',
        likelyCause: 'Previous git process was interrupted or crashed',
        immediateActions: [
          'Check if any git processes are still running',
          'Wait a moment for processes to complete naturally'
        ],
        recoverySteps: [
          '1. Check running processes: ps aux | grep git',
          '2. If no git processes running, remove lock files:',
          '   - rm .git/index.lock (if exists)',
          '   - rm .git/HEAD.lock (if exists)',
          '   - rm .git/refs/heads/*.lock (if exists)',
          '3. Retry your git operation'
        ],
        preventionTips: [
          'Allow git operations to complete fully',
          'Avoid force-killing git processes',
          'Use git commands one at a time'
        ],
        severity: 'low',
        autoRecoverable: true,
        dataLossRisk: false
      }
    },

    // Merge conflicts
    {
      pattern: /merge conflict|automatic merge failed/i,
      instruction: {
        symptom: 'Git cannot automatically merge changes',
        likelyCause: 'Overlapping changes in same file sections between branches',
        immediateActions: [
          'Review conflicted files shown in git status',
          'Understand the nature of conflicts before resolving'
        ],
        recoverySteps: [
          '1. View conflicts: git status',
          '2. Open conflicted files and look for conflict markers (<<<<, ====, >>>>)',
          '3. Edit files to resolve conflicts manually',
          '4. Stage resolved files: git add <file>',
          '5. Complete merge: git commit',
          'OR abort merge: git merge --abort'
        ],
        preventionTips: [
          'Communicate with team about overlapping work',
          'Keep commits small and focused',
          'Regularly sync with remote branches'
        ],
        severity: 'medium',
        autoRecoverable: false,
        dataLossRisk: false
      }
    },

    // Rebase conflicts
    {
      pattern: /rebase.*conflict|cannot continue rebase/i,
      corruptionType: CorruptionType.IncompleteRebase,
      instruction: {
        symptom: 'Git rebase stopped due to conflicts',
        likelyCause: 'Conflicting changes between rebased commits and target branch',
        immediateActions: [
          'Do not switch branches until rebase is resolved',
          'Review the current rebase status'
        ],
        recoverySteps: [
          '1. Check status: git status',
          '2. Resolve conflicts in marked files',
          '3. Stage resolved files: git add <file>',
          '4. Continue: git rebase --continue',
          'OR skip problematic commit: git rebase --skip',
          'OR abort entire rebase: git rebase --abort'
        ],
        preventionTips: [
          'Rebase small sets of commits at a time',
          'Test changes before rebasing',
          'Understand commit history before rebasing'
        ],
        severity: 'medium',
        autoRecoverable: true,
        dataLossRisk: false
      }
    },

    // Reference corruption
    {
      pattern: /invalid ref|bad ref|corrupt ref/i,
      corruptionType: CorruptionType.CorruptRef,
      instruction: {
        symptom: 'Git references are corrupted or invalid',
        likelyCause: 'File corruption in .git/refs directory or interrupted ref updates',
        immediateActions: [
          'Create backup of .git/refs directory',
          'Note which specific refs are affected'
        ],
        recoverySteps: [
          '1. Backup refs: cp -r .git/refs .git/refs.backup',
          '2. Check packed refs: cat .git/packed-refs',
          '3. Remove corrupt ref files from .git/refs/',
          '4. Recreate refs: git branch <branch-name> <commit-hash>',
          '5. Verify: git for-each-ref'
        ],
        preventionTips: [
          'Avoid manual editing of .git/refs files',
          'Use git commands for ref operations',
          'Regular filesystem integrity checks'
        ],
        severity: 'high',
        autoRecoverable: false,
        dataLossRisk: true
      }
    },

    // Packfile corruption
    {
      pattern: /pack.*corrupt|bad pack|pack-objects failed/i,
      corruptionType: CorruptionType.CorruptPackfile,
      instruction: {
        symptom: 'Git packfiles are corrupted',
        likelyCause: 'Disk errors, incomplete fetch/push, or storage corruption',
        immediateActions: [
          'Create full backup before attempting recovery',
          'Identify specific corrupted packfiles'
        ],
        recoverySteps: [
          '1. Verify corruption: git verify-pack -v .git/objects/pack/*.pack',
          '2. Remove corrupt packs: rm .git/objects/pack/pack-<hash>.*',
          '3. Repack repository: git repack -ad',
          '4. Garbage collect: git gc --aggressive',
          '5. Verify integrity: git fsck --full'
        ],
        preventionTips: [
          'Regularly verify pack integrity',
          'Use reliable storage systems',
          'Monitor disk health'
        ],
        severity: 'high',
        autoRecoverable: false,
        dataLossRisk: true
      }
    },

    // Permission errors
    {
      pattern: /permission denied|access denied|operation not permitted/i,
      corruptionType: CorruptionType.PermissionDenied,
      instruction: {
        symptom: 'Git operations blocked by file permissions',
        likelyCause: 'Incorrect file permissions or ownership in .git directory',
        immediateActions: [
          'Check current user and file ownership',
          'Verify you have necessary permissions'
        ],
        recoverySteps: [
          '1. Check ownership: ls -la .git',
          '2. Fix ownership: sudo chown -R $USER:$USER .git',
          '3. Fix permissions: chmod -R u+rwX .git',
          '4. Retry git operation'
        ],
        preventionTips: [
          'Avoid using sudo with git commands',
          'Ensure consistent user ownership',
          'Use proper user accounts for development'
        ],
        severity: 'medium',
        autoRecoverable: true,
        dataLossRisk: false
      }
    },

    // Disk space errors
    {
      pattern: /no space left|disk full|quota exceeded/i,
      corruptionType: CorruptionType.DiskFull,
      instruction: {
        symptom: 'Git operations failing due to insufficient disk space',
        likelyCause: 'Disk full or quota exceeded',
        immediateActions: [
          'Check available disk space: df -h',
          'Identify large files consuming space'
        ],
        recoverySteps: [
          '1. Free up disk space by removing unnecessary files',
          '2. Clean git repository: git gc --aggressive --prune=now',
          '3. Remove large files from history if needed',
          '4. Consider moving repository to larger disk',
          '5. Retry git operation'
        ],
        preventionTips: [
          'Monitor disk usage regularly',
          'Set up disk space alerts',
          'Use git gc periodically to clean repository'
        ],
        severity: 'critical',
        autoRecoverable: false,
        dataLossRisk: false
      }
    },

    // Network/remote errors
    {
      pattern: /remote.*rejected|failed to push|authentication failed|connection.*refused/i,
      instruction: {
        symptom: 'Git remote operations failing',
        likelyCause: 'Network issues, authentication problems, or remote repository issues',
        immediateActions: [
          'Check network connectivity',
          'Verify authentication credentials',
          'Check remote repository status'
        ],
        recoverySteps: [
          '1. Test connectivity: ping remote-host',
          '2. Verify remote URL: git remote -v',
          '3. Check authentication: git ls-remote origin',
          '4. Update credentials if needed',
          '5. Retry with verbose output: git push -v'
        ],
        preventionTips: [
          'Keep authentication tokens updated',
          'Use SSH keys for stable authentication',
          'Monitor remote repository availability'
        ],
        severity: 'low',
        autoRecoverable: true,
        dataLossRisk: false
      }
    }
  ];

  /**
   * Analyze an error message and provide recovery guidance
   */
  analyzeError(errorMessage: string): {
    matchedPattern?: ErrorPattern;
    guidance: ErrorRecoveryInstruction;
    recoveryOptions?: RecoveryOptions;
  } {
    // Find matching error pattern
    const matchedPattern = this.errorPatterns.find(pattern => 
      pattern.pattern.test(errorMessage)
    );

    if (matchedPattern) {
      const recoveryOptions = this.generateRecoveryOptions(matchedPattern);
      return {
        matchedPattern,
        guidance: matchedPattern.instruction,
        recoveryOptions
      };
    }

    // Generic guidance for unrecognized errors
    const genericGuidance: ErrorRecoveryInstruction = {
      symptom: 'Unrecognized git error',
      likelyCause: 'Various possible causes - needs investigation',
      immediateActions: [
        'Document the exact error message',
        'Note what operation you were performing',
        'Check repository status: git status'
      ],
      recoverySteps: [
        '1. Try the operation again with verbose output',
        '2. Check repository integrity: git fsck',
        '3. Verify remote connectivity if applicable',
        '4. Search documentation for specific error',
        '5. Consider corruption detection if error persists'
      ],
      preventionTips: [
        'Keep git and system updated',
        'Regular repository maintenance',
        'Monitor system health'
      ],
      severity: 'medium',
      autoRecoverable: false,
      dataLossRisk: false
    };

    return { guidance: genericGuidance };
  }

  /**
   * Get specific guidance for a corruption type
   */
  getCorruptionGuidance(corruptionType: CorruptionType): ErrorRecoveryInstruction | null {
    const pattern = this.errorPatterns.find(p => p.corruptionType === corruptionType);
    return pattern ? pattern.instruction : null;
  }

  /**
   * Generate user-friendly error message with recovery steps
   */
  generateUserFriendlyErrorMessage(
    originalError: string,
    guidance: ErrorRecoveryInstruction
  ): string {
    const severity = guidance.severity.toUpperCase();
    const riskWarning = guidance.dataLossRisk ? 
      '\n⚠️  WARNING: This issue may result in data loss. Create a backup before proceeding.' : '';

    return `
🔧 Git Error Recovery Guide [${severity} SEVERITY]
${riskWarning}

📋 What happened:
${guidance.symptom}

🔍 Likely cause:
${guidance.likelyCause}

⚡ Immediate actions:
${guidance.immediateActions.map(action => `   • ${action}`).join('\n')}

🛠️  Recovery steps:
${guidance.recoverySteps.map(step => `   ${step}`).join('\n')}

💡 Prevention tips:
${guidance.preventionTips.map(tip => `   • ${tip}`).join('\n')}

Original error: ${originalError}
`.trim();
  }

  /**
   * Get quick recovery suggestions for common issues
   */
  getQuickFixes(errorMessage: string): string[] {
    const analysis = this.analyzeError(errorMessage);
    
    if (analysis.matchedPattern?.corruptionType) {
      switch (analysis.matchedPattern.corruptionType) {
        case CorruptionType.StaleLockFile:
        case CorruptionType.IndexLock:
        case CorruptionType.RefLock:
          return [
            'Remove lock files: rm .git/*.lock',
            'Check for running git processes: ps aux | grep git'
          ];
          
        case CorruptionType.CorruptIndex:
        case CorruptionType.InvalidIndex:
          return [
            'Reset index: git reset --mixed HEAD',
            'Remove corrupt index: rm .git/index'
          ];
          
        case CorruptionType.IncompleteRebase:
          return [
            'Continue rebase: git rebase --continue',
            'Abort rebase: git rebase --abort'
          ];
          
        case CorruptionType.IncompleteMerge:
          return [
            'Complete merge: git commit (after resolving conflicts)',
            'Abort merge: git merge --abort'
          ];
          
        default:
          return analysis.guidance.immediateActions;
      }
    }

    return analysis.guidance.immediateActions;
  }

  /**
   * Check if an error indicates potential corruption
   */
  isCorruptionIndicator(errorMessage: string): {
    isCorruption: boolean;
    corruptionType?: CorruptionType;
    severity: 'low' | 'medium' | 'high' | 'critical';
  } {
    const pattern = this.errorPatterns.find(p => 
      p.pattern.test(errorMessage) && p.corruptionType
    );

    if (pattern) {
      return {
        isCorruption: true,
        corruptionType: pattern.corruptionType,
        severity: pattern.instruction.severity
      };
    }

    // Check for generic corruption indicators
    const corruptionKeywords = [
      'corrupt', 'corrupted', 'bad object', 'missing blob', 
      'invalid', 'broken', 'damaged', 'unable to read'
    ];

    const hasCorruptionKeyword = corruptionKeywords.some(keyword =>
      errorMessage.toLowerCase().includes(keyword)
    );

    return {
      isCorruption: hasCorruptionKeyword,
      severity: hasCorruptionKeyword ? 'medium' : 'low'
    };
  }

  private generateRecoveryOptions(pattern: ErrorPattern): RecoveryOptions {
    const instruction = pattern.instruction;
    
    return {
      maxDataLoss: instruction.dataLossRisk ? 'moderate' : 'minimal',
      autoRepair: instruction.autoRecoverable,
      createBackup: instruction.dataLossRisk || instruction.severity === 'high',
      preserveUncommitted: true,
      aggressive: instruction.severity === 'critical',
      timeoutMinutes: instruction.severity === 'critical' ? 60 : 30,
      requireConfirmation: instruction.dataLossRisk || instruction.severity === 'high'
    };
  }
}