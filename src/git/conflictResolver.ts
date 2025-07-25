import { GitClient } from './client';
import { AIService } from '../ai/service';

export interface ConflictResolutionResult {
  success: boolean;
  resolvedFiles: string[];
  confidence?: number;
  reasoning?: string;
  warnings?: string[];
  error?: string;
}

export interface ConflictResolutionOptions {
  strategy?: 'ai-safe' | 'ai-smart' | 'ai-review';
  verbose?: boolean;
  baseBranch?: string;
}

/**
 * Handles PR conflict detection and resolution
 */
export class ConflictResolver {
  private gitClient: GitClient;
  private aiService: AIService;

  constructor(gitClient: GitClient) {
    this.gitClient = gitClient;
    this.aiService = new AIService();
  }

  /**
   * Check for PR conflicts and attempt resolution
   */
  async resolvePRConflicts(
    currentBranch: string,
    targetBranch: string,
    options: ConflictResolutionOptions = {}
  ): Promise<{
    steps: string[];
    hasConflicts: boolean;
    resolved: boolean;
    error?: string;
  }> {
    const steps: string[] = [];
    const { strategy = 'ai-safe', verbose = false } = options;

    try {
      steps.push('🔍 Checking for PR merge conflicts...');

      // Pull the base branch to detect and resolve conflicts
      const pullResult = await this.gitClient.pull({
        branch: targetBranch,
        strategy: 'merge'
      });

      if (!pullResult.success && pullResult.conflicts && pullResult.conflicts.length > 0) {
        steps.push(`⚠️ PR has conflicts with ${targetBranch} (${pullResult.conflicts.length} files)`);
        
        // Check if AI resolution is available
        const hasAICapabilities = await this.validateAICapabilities();
        if (!hasAICapabilities) {
          steps.push('⚠️ AI resolution not available - Claude CLI not found');
          return {
            steps,
            hasConflicts: true,
            resolved: false,
            error: 'AI resolution unavailable'
          };
        }

        steps.push('🤖 Attempting AI-powered conflict resolution...');

        // Use specified strategy for PR conflicts
        const resolveResult = await this.gitClient.resolveConflicts(strategy);

        if (resolveResult.success) {
          // Continue the merge
          await this.gitClient.continueMerge();
          steps.push(`✅ AI resolved ${resolveResult.resolvedFiles.length} conflicts (${resolveResult.confidence}% confidence)`);

          if (resolveResult.warnings && resolveResult.warnings.length > 0) {
            steps.push(`⚠️ AI warnings: ${resolveResult.warnings.join(', ')}`);
          }

          // Push the resolution to update the PR
          await this.gitClient.push({ branch: currentBranch });
          steps.push('✅ Updated PR with resolved conflicts');

          return {
            steps,
            hasConflicts: true,
            resolved: true
          };
        } else {
          // Abort the merge since we couldn't resolve
          const abortResult = await this.safeAbortMerge(verbose);
          if (abortResult.error) {
            steps.push(`⚠️ Failed to abort merge: ${abortResult.error}`);
            steps.push('💡 Manual cleanup required: git merge --abort');
          }

          steps.push(`⚠️ AI couldn't resolve conflicts automatically: ${resolveResult.reasoning}`);
          return {
            steps,
            hasConflicts: true,
            resolved: false,
            error: resolveResult.reasoning
          };
        }
      } else if (pullResult.success) {
        // Successfully merged without conflicts
        steps.push('✅ PR has no conflicts with base branch');
        return {
          steps,
          hasConflicts: false,
          resolved: true
        };
      } else {
        // Pull failed for other reasons
        return {
          steps,
          hasConflicts: false,
          resolved: false,
          error: pullResult.output || 'Pull operation failed'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (verbose) {
        steps.push(`⚠️ Could not check for PR conflicts: ${errorMessage}`);
      }
      return {
        steps,
        hasConflicts: false,
        resolved: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate that AI resolution capabilities are available
   */
  private async validateAICapabilities(): Promise<boolean> {
    try {
      // Check if Claude CLI is available
      return await this.aiService.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Safely abort a merge with proper error handling
   */
  private async safeAbortMerge(verbose: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      await this.gitClient.abortMerge();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (verbose) {
        console.warn(`Failed to abort merge: ${errorMessage}`);
      }
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }
}