#!/usr/bin/env node

import { Command } from 'commander';
import prompts from 'prompts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GitClient } from './git/client';
import { ChangeAnalyzer } from './git/analyzer';
import { PlatformManager } from './git/platform';
import { Platform } from './types';

// Get package version
function getPackageVersion(): string {
  try {
    const packageJsonPath = join(dirname(__dirname), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    return '1.0.0'; // fallback version
  }
}

const program = new Command();

// Helper to format output
function output(message: string) {
  console.log(message);
}

// Helper to handle errors
function handleError(error: any) {
  console.error(`❌ Error: ${error.message || error}`);
  process.exit(1);
}

// Helper to ensure git repository
async function ensureGitRepository(gitClient: GitClient): Promise<boolean> {
  const isRepo = await gitClient.isGitRepository();
  if (!isRepo) {
    const response = await prompts({
      type: 'confirm',
      name: 'init',
      message: 'Not a git repository. Initialize one?',
      initial: true
    });

    if (response.init) {
      try {
        await gitClient.init();
        output('✅ Initialized git repository');
        return true;
      } catch (error) {
        handleError(new Error('Failed to initialize git repository'));
        return false;
      }
    } else {
      output('❌ Git repository required. Exiting.');
      process.exit(1);
    }
  }
  return true;
}

program
  .name('gitplus')
  .alias('gp')
  .description('AI-powered Git automation CLI')
  .version(getPackageVersion());

// Commit command
program
  .command('commit')
  .alias('cm')
  .description('Create AI-powered commit with staged changes')
  .option('-m, --message <message>', 'Custom commit message')
  .option('-t, --type <type>', 'Conventional commit type (feat, fix, docs, etc.)')
  .option('-s, --scope <scope>', 'Conventional commit scope')
  .option('-b, --breaking', 'Mark as breaking change')
  .option('-a, --all', 'Stage all changes before committing')
  .option('-d, --dry-run', 'Preview without executing')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      
      // Ensure we're in a git repository
      await ensureGitRepository(gitClient);
      
      const analyzer = new ChangeAnalyzer(gitClient);

      const status = await gitClient.getStatus();
      
      if (status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
        output('ℹ️  No changes to commit');
        return;
      }

      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      // Generate commit message
      let commitMessage: string;
      if (options.message) {
        commitMessage = options.message;
      } else {
        const commitType = options.type || analysis.conventionalType;
        const prefix = options.scope ? `${commitType}(${options.scope})` : commitType;
        const breakingFlag = options.breaking ? '!' : '';
        const subject = analysis.title.toLowerCase().replace(/^(add|fix|update|refactor)\s+/i, '');
        commitMessage = `${prefix}${breakingFlag}: ${subject}`;
      }

      if (options.dryRun) {
        output('💻 **Commit Preview**\n');
        output(`📝 **Commit Message:**\n  \`${commitMessage}\`\n`);
        output('📁 **Files to Commit:**');
        if (status.staged.length > 0) {
          status.staged.forEach(f => output(`  • ${f}`));
        } else {
          output('  • All changed files');
        }
        output(`\n📊 **Changes:**\n  • Type: ${analysis.changeType}\n  • Impact: +${analysis.additions}/-${analysis.deletions} lines`);
        return;
      }

      // Stage files if needed
      if (options.all || status.staged.length === 0) {
        await gitClient.add('all');
      }

      // Create commit
      await gitClient.commit(commitMessage);
      output(`✅ Commit created: ${commitMessage}`);

    } catch (error) {
      handleError(error);
    }
  });

// Ship command
program
  .command('ship')
  .description('Complete workflow: commit, push, and create PR')
  .option('-m, --message <message>', 'Custom commit message')
  .option('-b, --branch <branch>', 'Target branch name')
  .option('--base-branch <branch>', 'Base branch for PR')
  .option('--draft', 'Create PR as draft')
  .option('--no-pr', 'Skip PR creation')
  .option('--no-push', 'Skip push')
  .option('-d, --dry-run', 'Preview without executing')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      
      // Ensure we're in a git repository
      await ensureGitRepository(gitClient);
      
      const analyzer = new ChangeAnalyzer(gitClient);

      const status = await gitClient.getStatus();
      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      if (options.dryRun) {
        output('🚀 Ship Dry Run\n');
        const commitMsg = options.message || analysis.commitMessage;
        const branchName = options.branch || analysis.branchName;
        const prTitle = analysis.title;
        const prDescription = analysis.description;
        
        output(`🚀 **Ship Preview**\n`);
        output(`📝 **Commit Message:**\n  \`${commitMsg}\`\n`);
        output(`🌿 **Branch Name:**\n  \`${branchName}\`\n`);
        output(`📋 **PR Title:**\n  ${prTitle}\n`);
        output(`📄 **PR Description:**\n  ${prDescription.length > 150 ? prDescription.substring(0, 150) + '...' : prDescription}\n`);
        output(`⚡ **Actions:**`);
        output(`  • ${status.staged.length === 0 ? 'Stage all changes' : 'Use staged changes'}`);
        output(`  • Commit with AI-generated message`);
        output(`  • ${options.noPush ? 'Skip push' : 'Push to remote'}`);
        output(`  • ${options.noPr ? 'Skip PR creation' : `Create ${options.draft ? 'draft ' : ''}PR`}`);
        return;
      }

      const steps: string[] = [];
      let stashedChanges = false;

      // Phase 1: Pre-ship validation and repository health check
      steps.push('🔍 Performing pre-ship validation...');
      
      // Check for ongoing operations
      const mergeInProgress = await gitClient.isMergeInProgress();
      const rebaseInProgress = await gitClient.isRebaseInProgress();
      
      if (mergeInProgress || rebaseInProgress) {
        output(`⚠️ Cannot Ship: ${mergeInProgress ? 'Merge' : 'Rebase'} operation is currently in progress.`);
        output(`\nTo resolve:`);
        output(`1. Complete the operation: git ${mergeInProgress ? 'merge --continue' : 'rebase --continue'}`);
        output(`2. Or abort: git ${mergeInProgress ? 'merge --abort' : 'rebase --abort'}`);
        return;
      }

      // Handle uncommitted changes intelligently
      if (status.unstaged.length > 0 || status.untracked.length > 0) {
        if (status.staged.length > 0) {
          // Mixed state - stash unstaged changes to avoid confusion
          steps.push('📦 Stashing uncommitted changes to avoid mixed commits...');
          await gitClient.stash({ 
            message: `Auto-stash before ship: ${new Date().toISOString()}`,
            includeUntracked: true 
          });
          stashedChanges = true;
        } else {
          // No staged changes - stage everything
          await gitClient.add('all');
          steps.push(`✅ Staged ${status.unstaged.length + status.untracked.length} files`);
        }
      }

      // Phase 2: Smart branch handling with conflict detection
      let targetBranch = options.branch;
      const originalBranch = status.branch;
      
      if (status.branch === 'main' || status.branch === 'master') {
        if (!targetBranch) {
          targetBranch = analysis.branchName;
        }
        
        // Check if target branch already exists by trying to create it
        try {
          await gitClient.createBranch(targetBranch, true);
          steps.push(`✅ Created and switched to branch: ${targetBranch}`);
        } catch (branchError) {
          if (branchError instanceof Error && branchError.message.includes('already exists')) {
            output(`⚠️ Branch "${targetBranch}" already exists locally.`);
            output(`Suggested alternative: ${targetBranch}-${Date.now().toString().slice(-4)}`);
            return;
          } else {
            throw branchError;
          }
        }
      } else {
        targetBranch = status.branch;
      }

      // Phase 3: Create commit
      const commitMessage = options.message || analysis.commitMessage;
      await gitClient.commit(commitMessage);
      steps.push(`✅ Created commit: ${commitMessage}`);

      // Phase 4: Enhanced push logic (if not --no-push)
      let prInfo = '';
      const currentBranch = await gitClient.getCurrentBranch();

      if (!options.noPush) {
        try {
          await gitClient.push({ 
            branch: currentBranch, 
            setUpstream: true 
          });
          steps.push(`✅ Pushed to remote: ${currentBranch}`);

          // Phase 5: PR creation (if not --no-pr)
          if (!options.noPr) {
            const platformManager = new PlatformManager(status.platform, status.remoteURL, gitClient.getWorkingDirectory());
            const capabilities = await platformManager.getCapabilities();

            if (capabilities.canCreatePR) {
              try {
                const prRequest = {
                  title: analysis.title,
                  body: analysis.description,
                  branch: currentBranch,
                  baseBranch: options.baseBranch || status.baseBranch,
                  draft: options.draft,
                  reviewers: [],
                  labels: [],
                  autoMerge: false,
                };

                const prResponse = await platformManager.createPR(prRequest);
                if (prResponse.status === 'created') {
                  steps.push(`✅ Created PR: ${prResponse.url}`);
                  prInfo = `\n\n🔗 Pull Request: ${prResponse.url}`;
                  
                  // Check for PR conflicts and attempt resolution
                  try {
                    steps.push('🔍 Checking for PR merge conflicts...');
                    
                    // Pull the base branch to detect and resolve conflicts
                    const targetBranch = options.baseBranch || status.baseBranch;
                    const pullResult = await gitClient.pull({ 
                      branch: targetBranch,
                      strategy: 'merge'
                    });
                    
                    if (!pullResult.success && pullResult.conflicts && pullResult.conflicts.length > 0) {
                      steps.push(`⚠️ PR has conflicts with ${targetBranch} (${pullResult.conflicts.length} files)`);
                      steps.push('🤖 Attempting AI-powered conflict resolution...');
                      
                      // Use ai-safe strategy for PR conflicts (high confidence required)
                      const resolveResult = await gitClient.resolveConflicts('ai-safe');
                      
                      if (resolveResult.success) {
                        // Continue the merge
                        await gitClient.continueMerge();
                        steps.push(`✅ AI resolved ${resolveResult.resolvedFiles.length} conflicts (${resolveResult.confidence}% confidence)`);
                        
                        if (resolveResult.warnings && resolveResult.warnings.length > 0) {
                          steps.push(`⚠️ AI warnings: ${resolveResult.warnings.join(', ')}`);
                        }
                        
                        // Push the resolution to update the PR
                        await gitClient.push({ branch: currentBranch });
                        steps.push('✅ Updated PR with resolved conflicts');
                      } else {
                        // Abort the merge since we couldn't resolve
                        try {
                          await gitClient.abortMerge();
                        } catch {
                          // Ignore abort errors
                        }
                        steps.push(`⚠️ AI couldn't resolve conflicts automatically: ${resolveResult.reasoning}`);
                        steps.push(`📝 Manual resolution required - PR: ${prResponse.url}`);
                        steps.push('💡 Tip: Pull the base branch locally, resolve conflicts, and push to update the PR');
                      }
                    } else if (pullResult.success) {
                      // Successfully merged without conflicts
                      steps.push('✅ PR has no conflicts with base branch');
                    }
                  } catch (conflictCheckError) {
                    // Non-critical error - PR was created successfully
                    if (options.verbose) {
                      steps.push(`⚠️ Could not check for PR conflicts: ${conflictCheckError}`);
                    }
                  }
                } else {
                  steps.push(`⚠️ PR creation failed: ${prResponse.message}`);
                }
              } catch (prError) {
                steps.push(`⚠️ PR creation error - may need manual creation`);
              }
            } else {
              const terminology = platformManager.getPRTerminology();
              steps.push(`ℹ️ ${terminology.singular} creation not available: Platform CLI not installed or authenticated`);
            }
          }
        } catch (pushError) {
          steps.push(`⚠️ Push failed: ${pushError instanceof Error ? pushError.message : 'Unknown error'}`);
        }
      }

      // Phase 6: Restore stashed changes if any
      if (stashedChanges) {
        try {
          await gitClient.stash({ pop: true });
          steps.push('✅ Restored previously stashed changes');
        } catch (stashError) {
          steps.push('⚠️ Could not restore stashed changes - check stash list');
        }
      }

      // Final success message
      output('🚀 Ship Complete!\n');
      steps.forEach(step => output(step));
      output(`\n📊 Summary:`);
      output(`• ${analysis.additions} additions, ${analysis.deletions} deletions`);
      output(`• ${analysis.filesChanged.length} files changed`);
      output(`• Change type: ${analysis.changeType}`);
      output(`• Branch: ${currentBranch}${prInfo}`);

    } catch (error) {
      handleError(error);
    }
  });

// Status command
program
  .command('status')
  .alias('st')
  .description('Show repository status')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      
      const isRepo = await gitClient.isGitRepository();
      if (!isRepo) {
        output('❌ Not a git repository');
        return;
      }

      const status = await gitClient.getStatus();
      
      output('📊 Git Repository Status\n');
      output(`Branch: ${status.branch}`);
      if (status.ahead > 0 || status.behind > 0) {
        output(`  (${status.ahead} ahead, ${status.behind} behind)`);
      }
      output(`Base Branch: ${status.baseBranch}`);
      output(`Platform: ${status.platform}`);
      
      output('\nChanges:');
      output(`  - Staged: ${status.staged.length} files`);
      output(`  - Unstaged: ${status.unstaged.length} files`);
      output(`  - Untracked: ${status.untracked.length} files`);
      output(`  - Clean: ${status.isDirty ? 'No' : 'Yes'}`);

      if (options.verbose) {
        if (status.staged.length > 0) {
          output('\nStaged Files:');
          status.staged.forEach(f => output(`  - ${f}`));
        }
        if (status.unstaged.length > 0) {
          output('\nUnstaged Files:');
          status.unstaged.forEach(f => output(`  - ${f}`));
        }
        if (status.untracked.length > 0) {
          output('\nUntracked Files:');
          status.untracked.forEach(f => output(`  - ${f}`));
        }
      }

    } catch (error) {
      handleError(error);
    }
  });

// Analyze command
program
  .command('analyze')
  .alias('an')
  .description('Analyze repository changes')
  .option('-d, --diff', 'Include diff in analysis')
  .option('-r, --range <range>', 'Commit range to analyze')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      
      // Ensure we're in a git repository
      await ensureGitRepository(gitClient);
      
      const analyzer = new ChangeAnalyzer(gitClient);

      const status = await gitClient.getStatus();
      const analysis = await analyzer.analyzeChanges({
        commitRange: options.range,
        includeDiff: options.diff
      });

      output('🔍 Repository Analysis\n');
      output(`Current Status:`);
      output(`  - Branch: ${status.branch}`);
      output(`  - Platform: ${status.platform}`);
      output(`  - Changes: ${analysis.filesChanged.length} files`);
      
      output(`\nChange Analysis:`);
      output(`  - Type: ${analysis.changeType}`);
      output(`  - Conventional type: ${analysis.conventionalType}`);
      output(`  - Impact: +${analysis.additions}/-${analysis.deletions}`);
      
      output(`\nSuggested Actions:`);
      output(`  - Branch name: ${analysis.branchName}`);
      output(`  - Commit message: ${analysis.commitMessage}`);
      output(`  - PR title: ${analysis.title}`);

    } catch (error) {
      handleError(error);
    }
  });

// Suggest command
program
  .command('suggest <for>')
  .alias('sg')
  .description('Get AI suggestions (branch, commit, pr_title, pr_description)')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (forWhat, options) => {
    try {
      const gitClient = new GitClient();
      
      // Ensure we're in a git repository
      await ensureGitRepository(gitClient);
      
      const analyzer = new ChangeAnalyzer(gitClient);

      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      output(`💡 AI Suggestion for ${forWhat}\n`);

      switch (forWhat) {
        case 'branch':
          output(`Suggestion: ${analysis.branchName}`);
          break;
        case 'commit':
          output(`Suggestion: ${analysis.commitMessage}`);
          break;
        case 'pr_title':
          output(`Suggestion: ${analysis.title}`);
          break;
        case 'pr_description':
          output('Suggestion:\n');
          output(analysis.description);
          break;
        default:
          throw new Error(`Unknown suggestion type: ${forWhat}`);
      }

    } catch (error) {
      handleError(error);
    }
  });

// Sync command
program
  .command('sync')
  .alias('sy')
  .description('Synchronize with remote repository')
  .option('-s, --strategy <strategy>', 'Sync strategy (merge, rebase, fetch-only)', 'merge')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch to sync')
  .option('--auto-resolve <strategy>', 'Auto conflict resolution (ours, theirs, manual)')
  .option('-f, --force', 'Force synchronization')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      const analyzer = new ChangeAnalyzer(gitClient);
      const status = await gitClient.getStatus();
      
      output('🔄 Repository Synchronization\n');
      
      // Get sync status
      const syncStatus = await gitClient.getSyncStatus(options.branch);
      
      if (!syncStatus.hasUpstream) {
        output(`⚠️ No upstream branch for "${syncStatus.localBranch}"`);
        output(`Set upstream: git push -u ${options.remote} ${syncStatus.localBranch}`);
        return;
      }
      
      if (syncStatus.upToDate) {
        output(`✅ Already up to date with remote`);
        return;
      }
      
      output(`📊 Sync Status:`);
      output(`- Local: ${syncStatus.localBranch}`);
      output(`- Remote: ${syncStatus.remoteBranch}`); 
      output(`- Ahead: ${syncStatus.ahead} commits`);
      output(`- Behind: ${syncStatus.behind} commits`);
      
      if (options.strategy === 'fetch-only') {
        await gitClient.fetch({ remote: options.remote, prune: true });
        output('\n✅ Fetch complete');
        return;
      }
      
      // Perform sync
      const pullResult = await gitClient.pull({
        remote: options.remote,
        branch: options.branch,
        strategy: options.strategy
      });
      
      if (pullResult.success) {
        output('\n✅ Sync complete');
      } else if (pullResult.conflicts) {
        output(`\n⚠️ Conflicts in ${pullResult.conflicts.length} files:`);
        pullResult.conflicts.forEach(f => output(`  - ${f}`));
        output('\nResolve conflicts manually and continue.');
      }
      
    } catch (error) {
      handleError(error);
    }
  });

// Stash command
program
  .command('stash <action>')
  .alias('sh') 
  .description('Manage git stash (push, pop, apply, drop, list)')
  .option('-m, --message <message>', 'Stash message')
  .option('-u, --include-untracked', 'Include untracked files')
  .option('-i, --index <index>', 'Stash index for pop/apply/drop')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (action, options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      output(`📦 Git Stash - ${action}\n`);
      
      let result: string;
      
      switch (action) {
        case 'list':
          result = await gitClient.stash({ list: true });
          const stashes = result.split('\n').filter(line => line.trim());
          if (stashes.length > 0) {
            output('Stash list:');
            stashes.forEach((stash, i) => output(`  ${i}: ${stash}`));
          } else {
            output('No stashes found.');
          }
          break;
          
        case 'push':
          await gitClient.stash({ 
            message: options.message,
            includeUntracked: options.includeUntracked 
          });
          output(`✅ Stash created${options.message ? `: ${options.message}` : ''}`);
          break;
          
        case 'pop':
          await gitClient.stash({ 
            pop: true,
            stashIndex: options.index 
          });
          output(`✅ Stash applied and removed${options.index !== undefined ? ` (stash@{${options.index}})` : ''}`);
          break;
          
        case 'apply':
          await gitClient.stash({ 
            apply: true,
            stashIndex: options.index 
          });
          output(`✅ Stash applied${options.index !== undefined ? ` (stash@{${options.index}})` : ''}`);
          break;
          
        case 'drop':
          await gitClient.stash({ 
            drop: true,
            stashIndex: options.index 
          });
          output(`✅ Stash dropped${options.index !== undefined ? ` (stash@{${options.index}})` : ''}`);
          break;
          
        default:
          throw new Error(`Unknown stash action: ${action}`);
      }
      
    } catch (error) {
      handleError(error);
    }
  });

// Reset command
program
  .command('reset <mode>')
  .alias('rs')
  .description('Reset repository state (soft, mixed, hard)')
  .option('-t, --target <target>', 'Target commit/branch', 'HEAD')
  .option('-f, --files <files...>', 'Specific files to reset')
  .option('-c, --confirm', 'Confirm destructive operations')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (mode, options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      if (mode === 'hard' && !options.confirm) {
        output('⚠️ Hard reset will permanently discard all changes.');
        output('Add --confirm flag to proceed.');
        return;
      }
      
      output(`🔄 Git Reset - ${mode}\n`);
      
      await gitClient.reset({ 
        mode: mode as 'soft' | 'mixed' | 'hard',
        target: options.target,
        files: options.files 
      });
      
      const descriptions = {
        soft: 'Reset HEAD, keeping changes staged',
        mixed: 'Reset HEAD and index, keeping changes in working directory',
        hard: 'Reset HEAD, index, and working directory (all changes discarded)'
      };
      
      output(`✅ Reset complete`);
      output(`Mode: ${mode}`);
      output(`Target: ${options.target}`);
      output(`Action: ${descriptions[mode as keyof typeof descriptions]}`);
      
      if (options.files && options.files.length > 0) {
        output(`Files: ${options.files.join(', ')}`);
      }
      
    } catch (error) {
      handleError(error);
    }
  });

// Rebase command
program
  .command('rebase [onto]')
  .alias('rb')
  .description('Rebase current branch onto another branch')
  .option('-i, --interactive', 'Start interactive rebase')
  .option('-a, --action <action>', 'Rebase action (start, continue, abort, skip)', 'start')
  .option('--auto-resolve <strategy>', 'Auto conflict resolution (ours, theirs, manual)')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (onto, options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      output(`🔄 Git Rebase - ${options.action}\n`);
      
      let result: { success: boolean; output: string; conflicts?: string[] };
      
      switch (options.action) {
        case 'start':
          if (!onto) {
            throw new Error('Target branch (onto) is required for rebase');
          }
          result = await gitClient.rebase({ onto, interactive: options.interactive });
          break;
          
        case 'continue':
          result = await gitClient.rebase({ onto: '', continue: true });
          break;
          
        case 'abort':
          result = await gitClient.rebase({ onto: '', abort: true });
          break;
          
        case 'skip':
          result = await gitClient.rebase({ onto: '', skip: true });
          break;
          
        default:
          throw new Error(`Unknown rebase action: ${options.action}`);
      }
      
      if (result.success) {
        output(`✅ Rebase ${options.action} successful`);
      } else if (result.conflicts) {
        output(`⚠️ Conflicts in: ${result.conflicts.join(', ')}`);
        output('\nResolve conflicts and use: gitplus rebase --action continue');
      }
      
    } catch (error) {
      handleError(error);
    }
  });

// Recover command
program
  .command('recover <action>')
  .alias('rc')
  .description('Recover lost commits (show-reflog, recover-commit, show-lost)')
  .option('-c, --commit <hash>', 'Commit hash to recover')
  .option('-l, --limit <limit>', 'Number of reflog entries', '20')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (action, options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      output(`🔍 Git Recovery - ${action}\n`);
      
      switch (action) {
        case 'show-reflog':
          const reflogEntries = await gitClient.getReflog(parseInt(options.limit));
          if (reflogEntries.length === 0) {
            output('No reflog entries found.');
          } else {
            output(`Reflog (last ${options.limit} entries):`);
            reflogEntries.forEach((entry, i) => {
              output(`  ${i}: ${entry.shortHash} ${entry.action}: ${entry.message}`);
            });
          }
          break;
          
        case 'recover-commit':
          if (!options.commit) {
            throw new Error('Commit hash is required for recovery');
          }
          const recoveryBranch = `recovery-${options.commit.substring(0, 8)}-${Date.now()}`;
          await gitClient.createBranch(recoveryBranch, false);
          await gitClient.reset({ mode: 'hard', target: options.commit });
          output(`✅ Recovered commit ${options.commit} to branch: ${recoveryBranch}`);
          break;
          
        case 'show-lost':
          const reflog = await gitClient.getReflog(50);
          const lostCommits = reflog.filter(entry => 
            entry.action.includes('commit') || entry.action.includes('reset')
          ).slice(0, 10);
          
          if (lostCommits.length === 0) {
            output('No potentially lost commits found.');
          } else {
            output('Potentially lost commits:');
            lostCommits.forEach((entry, i) => {
              output(`  ${i + 1}. ${entry.shortHash} - ${entry.message}`);
            });
          }
          break;
          
        default:
          throw new Error(`Unknown recovery action: ${action}`);
      }
      
    } catch (error) {
      handleError(error);
    }
  });

// Validate command
program
  .command('validate')
  .alias('vl')
  .description('Validate repository health and integrity')
  .option('-d, --deep', 'Perform deep validation including remote connectivity')
  .option('-f, --fix', 'Attempt to fix issues automatically')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);
      
      output('🔍 Repository Validation\n');
      
      const validation = await gitClient.validateRepository();
      const stats = await gitClient.getRepositoryStats();
      
      if (validation.isValid) {
        output('✅ Repository is healthy\n');
      } else {
        output('❌ Repository has issues\n');
      }
      
      // Show issues
      if (validation.issues.length > 0) {
        output('Issues Found:');
        validation.issues.forEach(issue => output(`  ❌ ${issue}`));
        output('');
      }
      
      // Show warnings  
      if (validation.warnings.length > 0) {
        output('Warnings:');
        validation.warnings.forEach(warning => output(`  ⚠️ ${warning}`));
        output('');
      }
      
      // Show repository statistics
      output('📊 Repository Statistics:');
      output(`- Total commits: ${stats.totalCommits}`);
      output(`- Total branches: ${stats.totalBranches}`);
      output(`- Total tags: ${stats.totalTags}`);
      output(`- Repository size: ${stats.repositorySize}`);
      if (stats.lastCommitDate) {
        output(`- Last commit: ${stats.lastCommitDate.toISOString().split('T')[0]}`);
      }
      
      // Deep validation
      if (options.deep) {
        try {
          const syncStatus = await gitClient.getSyncStatus();
          output('\n🔄 Sync Status:');
          output(`- Current branch: ${syncStatus.localBranch}`);
          output(`- Has upstream: ${syncStatus.hasUpstream ? 'Yes' : 'No'}`);
          if (syncStatus.hasUpstream) {
            output(`- Up to date: ${syncStatus.upToDate ? 'Yes' : 'No'}`);
            output(`- Ahead: ${syncStatus.ahead} commits`);
            output(`- Behind: ${syncStatus.behind} commits`);
          }
        } catch (error) {
          output(`\n⚠️ Could not check sync status: ${error}`);
        }
      }
      
    } catch (error) {
      handleError(error);
    }
  });

program.parse();