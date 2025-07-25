import { GitClient } from '../git/client';
import { ConflictResolver } from '../git/conflictResolver';

/**
 * Handles PR conflict resolution workflow with common logic
 */
export async function handlePRConflictResolution(
  gitClient: GitClient,
  currentBranch: string,
  targetBranch: string,
  prUrl: string,
  options: {
    verbose?: boolean;
    force?: boolean;
  } = {}
): Promise<{
  steps: string[];
  success: boolean;
  requiresManualResolution: boolean;
}> {
  const { verbose = false, force = false } = options;
  const steps: string[] = [];
  
  // Skip conflict resolution if force is enabled
  if (force) {
    return {
      steps,
      success: true,
      requiresManualResolution: false
    };
  }
  
  try {
    const conflictResolver = new ConflictResolver(gitClient);
    const conflictResult = await conflictResolver.resolvePRConflicts(
      currentBranch,
      targetBranch,
      { verbose }
    );
    
    steps.push(...conflictResult.steps);
    
    if (conflictResult.hasConflicts && !conflictResult.resolved) {
      steps.push(`📝 Manual resolution required - PR: ${prUrl}`);
      steps.push('💡 Tip: Pull the base branch locally, resolve conflicts, and push to update the PR');
      
      return {
        steps,
        success: false,
        requiresManualResolution: true
      };
    }
    
    return {
      steps,
      success: true,
      requiresManualResolution: false
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    steps.push(`⚠️ Error during conflict resolution: ${errorMessage}`);
    
    return {
      steps,
      success: false,
      requiresManualResolution: true
    };
  }
}