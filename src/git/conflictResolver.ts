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

  constructor(gitClient: GitClient, aiService?: AIService) {
    this.gitClient = gitClient;
    this.aiService = aiService || new AIService();
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

      // Fetch the target branch and attempt merge to detect conflicts
      await this.gitClient.fetch({ branch: targetBranch });
      
      try {
        // Attempt to merge the target branch to simulate PR merge
        await this.gitClient.merge(`origin/${targetBranch}`, { noFf: true });
        
        // If we reach here, no conflicts occurred
        steps.push('✅ PR has no conflicts with base branch');
        return {
          steps,
          hasConflicts: false,
          resolved: true
        };
      } catch (mergeError: any) {
        // Check if this is a merge conflict error
        if (mergeError.message && mergeError.message.toLowerCase().includes('conflict')) {
          const conflicts = await this.gitClient.getConflictedFiles();
          
          if (conflicts && conflicts.length > 0) {
            steps.push(`⚠️ PR has conflicts with ${targetBranch} (${conflicts.length} files)`);
            
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

              // Push the resolution to update the PR with error handling
              try {
                await this.gitClient.push({ branch: currentBranch });
                steps.push('✅ Updated PR with resolved conflicts');
              } catch (pushError: any) {
                const pushErrorMessage = pushError instanceof Error ? pushError.message : 'Unknown push error';
                steps.push(`⚠️ Failed to push resolved conflicts: ${pushErrorMessage}`);
                steps.push('💡 Manual push required: git push origin ' + currentBranch);
                return {
                  steps,
                  hasConflicts: true,
                  resolved: false,
                  error: `Conflicts resolved but push failed: ${pushErrorMessage}`
                };
              }

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
          } else {
            // No conflicts found, but merge failed for other reasons
            const abortResult = await this.safeAbortMerge(verbose);
            if (abortResult.error) {
              steps.push(`⚠️ Failed to abort merge: ${abortResult.error}`);
            }
            return {
              steps,
              hasConflicts: false,
              resolved: false,
              error: 'Merge failed for reasons other than conflicts'
            };
          }
        } else {
          // Not a merge conflict, re-throw the error
          throw mergeError;
        }
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
      // Check if we're actually in a merge state before attempting abort
      const isMergeInProgress = await this.gitClient.isMergeInProgress();
      
      if (!isMergeInProgress) {
        if (verbose) {
          console.warn('No merge in progress, skipping abort');
        }
        return { 
          success: true  // Not an error if no merge to abort
        };
      }
      
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