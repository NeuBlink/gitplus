import { ToolName } from './toolDefinitions';
import { GitClient } from '../git/client';
import { PlatformManager } from '../git/platform';
import { ChangeAnalyzer } from '../git/analyzer';
import { handlePRConflictResolution } from '../utils/conflictUtils';
import { Platform } from '../types';

// MCP Tool result type (matches the SDK's expected format with index signature)
interface ToolResult {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export class ToolHandler {
  constructor() {
    // Tool handler no longer maintains a single GitClient instance
    // Each tool call will create its own GitClient with the provided repoPath
  }

  async handleToolCall(name: ToolName, args: Record<string, any>): Promise<ToolResult> {
    try {
      // Validate repoPath (optional for info tool)
      const { repoPath } = args;
      if (!repoPath && name !== 'info') {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error: Repository path is required.\n\nPlease provide a full absolute path to the git repository.`,
            },
          ],
          isError: true,
        };
      }

      // Check if path exists (skip for info tool without repoPath)
      if (repoPath) {
        const fs = await import('fs').then(m => m.promises);
        const path = await import('path');
        
        try {
          const stat = await fs.stat(repoPath);
          if (!stat.isDirectory()) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Error: Path is not a directory: ${repoPath}`,
              },
            ],
            isError: true,
          };
        }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error: Directory not found: ${repoPath}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Create GitClient for this specific repository (skip for info tool without repoPath)
      let gitClient: GitClient | undefined;
      if (repoPath) {
        const path = await import('path');
        gitClient = new GitClient(repoPath);
        
        // Check if we're in a git repository, initialize if needed for MCP
        const isRepo = await gitClient.isGitRepository();
        if (!isRepo && name !== 'status' && name !== 'info') {
          // For MCP, automatically initialize git repository
          try {
            await gitClient.init();
            const repoName = path.basename(repoPath);
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Initialized git repository in ${repoPath}\n\nNow proceeding with ${name} command...`,
                },
              ],
            };
          } catch (initError) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Error: Not a git repository and failed to initialize.\n\nError: ${initError instanceof Error ? initError.message : 'Unknown error'}`,
                },
              ],
              isError: true,
            };
          }
        }
      }

      switch (name) {
        case 'ship':
          return await this.handleShip(args, gitClient!);
        case 'status':
          return await this.handleStatus(args, gitClient!);
        case 'info':
          return await this.handleInfo(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error in ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleShip(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { 
      branch, 
      baseBranch, 
      draft = false, 
      noPR = false, 
      noPush = false,
      reviewers = [],
      labels = [],
      autoMerge = false,
      force = false,
      dryRun = false,
      verbose = false,
      repoPath
    } = args;

    const steps: string[] = [];
    let stashedChanges = false;

    try {

      // Phase 1: Pre-ship validation and repository health check
      steps.push('🔍 Performing pre-ship validation...');
      
      const validation = await gitClient.validateRepository();
      if (!validation.isValid) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Repository Validation Failed**\n\n**Issues:**\n${validation.issues.map(i => `• ${i}`).join('\n')}\n\n**Fix these issues before shipping.**`,
            },
          ],
          isError: true,
        };
      }

      // Check for ongoing operations
      const mergeInProgress = await gitClient.isMergeInProgress();
      const rebaseInProgress = await gitClient.isRebaseInProgress();
      
      if (mergeInProgress || rebaseInProgress) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ **Cannot Ship: Git Operation in Progress**\n\n${mergeInProgress ? 'Merge' : 'Rebase'} operation is currently in progress.\n\n**To resolve:**\n1. Complete the operation: \`git ${mergeInProgress ? 'merge --continue' : 'rebase --continue'}\`\n2. Or abort: \`git ${mergeInProgress ? 'merge --abort' : 'rebase --abort'}\`\n\nThen try shipping again.`,
            },
          ],
          isError: true,
        };
      }

      const status = await gitClient.getStatus();
      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

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

      if (dryRun) {
        const commitMsg = analysis.commitMessage;
        const branchName = branch || analysis.branchName;
        const prTitle = analysis.title;
        const prDescription = analysis.description;
        
        // Enhanced dry run with validation results
        let dryRunText = `🚀 **Ship Preview**\n\n`;
        dryRunText += `**🔍 Validation:** ${validation.isValid ? '✅ Passed' : '❌ Failed'}\n`;
        if (validation.warnings.length > 0) {
          dryRunText += `**⚠️ Warnings:** ${validation.warnings.length}\n`;
        }
        dryRunText += `**📝 Commit Message:**\n\`${commitMsg}\`\n\n`;
        dryRunText += `**🌿 Branch Name:**\n\`${branchName}\`\n\n`;
        dryRunText += `**📋 PR Title:**\n${prTitle}\n\n`;
        dryRunText += `**📄 PR Description:**\n${prDescription.length > 200 ? prDescription.substring(0, 200) + '...' : prDescription}\n\n`;
        dryRunText += `**⚡ Planned Actions:**\n${steps.join('\n')}\n`;
        dryRunText += `• Commit with AI-generated message\n`;
        dryRunText += `${noPush ? '• Skip push' : '• Sync and push to remote'}\n`;
        dryRunText += `${noPR ? '• Skip PR creation' : `• Create ${draft ? 'draft ' : ''}PR`}`;
        
        return {
          content: [
            {
              type: 'text',
              text: dryRunText,
            },
          ],
        };
      }

      // Phase 2: Smart branch handling with conflict detection
      let targetBranch = branch;
      const originalBranch = status.branch;
      
      if (status.branch === 'main' || status.branch === 'master') {
        if (!targetBranch) {
          targetBranch = analysis.branchName;
        }
        
        // Check if target branch already exists by trying to create it
        try {
          await gitClient.createBranch(targetBranch, true);
          steps.push(`✅ Created and switched to branch: ${targetBranch}`);
        } catch (branchError: any) {
          if (branchError.message && branchError.message.includes('already exists')) {
            // Branch exists - offer alternatives
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ **Branch Already Exists**\n\nBranch "${targetBranch}" already exists locally.\n\n**Options:**\n1. Use a different name: Provide \`branch\` parameter\n2. Switch to existing branch: Use \`checkout\` command first\n3. Delete existing branch: Use \`reset\` tool with confirm=true\n\n**Suggested alternative:** \`${targetBranch}-${Date.now().toString().slice(-4)}\``,
                },
              ],
              isError: true,
            };
          } else {
            throw branchError; // Re-throw if it's a different error
          }
        }
      } else {
        targetBranch = status.branch;
      }

      // Phase 3: Pre-commit sync validation (if pushing)
      if (!noPush) {
        steps.push('🔄 Checking sync status with remote...');
        
        try {
          await gitClient.fetch({ prune: true });
          const syncStatus = await gitClient.getSyncStatus(targetBranch);
          
          if (syncStatus.hasUpstream && (syncStatus.behind > 0 || syncStatus.diverged)) {
            steps.push(`⚠️ Branch is ${syncStatus.behind} commits behind remote`);
            
            if (!force) {
              // Attempt automatic sync
              steps.push('🔄 Attempting to sync with remote...');
              const pullResult = await gitClient.pull({
                strategy: 'merge',
                remote: 'origin',
                branch: targetBranch
              });
              
              if (!pullResult.success && pullResult.conflicts) {
                // AI-powered conflict resolution for PR creation
                steps.push(`⚠️ Conflicts detected in ${pullResult.conflicts.length} files`);
                steps.push('🤖 Analyzing conflicts with AI...');
                
                // Use AI-safe strategy for PR conflicts (high confidence required)
                const resolveResult = await gitClient.resolveConflicts('ai-safe');
                
                if (resolveResult.success) {
                  await gitClient.continueMerge();
                  steps.push(`✅ AI resolved conflicts with ${resolveResult.confidence}% confidence`);
                  if (resolveResult.reasoning) {
                    steps.push(`💡 AI reasoning: ${resolveResult.reasoning}`);
                  }
                  if (resolveResult.warnings && resolveResult.warnings.length > 0) {
                    steps.push(`⚠️ AI warnings: ${resolveResult.warnings.join(', ')}`);
                  }
                } else {
                  // AI couldn't resolve or confidence too low
                  const fallbackMsg = resolveResult.reasoning || 'AI unable to resolve conflicts safely';
                  
                  return {
                    content: [
                      {
                        type: 'text',
                        text: `⚠️ **AI Conflict Resolution Failed**\n\n${steps.join('\n')}\n\n**AI Analysis:**\n${fallbackMsg}\n${resolveResult.confidence ? `Confidence: ${resolveResult.confidence}%` : ''}\n\n**Conflicted Files:**\n${pullResult.conflicts.map(f => `• ${f}`).join('\n')}\n\n**Manual Resolution Required:**\n1. Edit the conflicted files\n2. Stage resolved files: \`git add <files>\`\n3. Continue merge: \`git merge --continue\`\n4. Run ship again\n\n**Or use force=true to override (⚠️ may lose remote changes)**\n\n💡 **AI Suggestions:**\n${resolveResult.warnings?.join('\n') || 'Use git tools or IDE merge features for complex conflicts'}`,
                      },
                    ],
                    isError: true,
                  };
                }
              } else if (pullResult.success) {
                steps.push('✅ Successfully synced with remote');
              }
            } else {
              steps.push('⚠️ Force push enabled - skipping sync check');
            }
          } else if (syncStatus.hasUpstream) {
            steps.push('✅ Branch is up-to-date with remote');
          } else {
            steps.push('ℹ️ New branch - will set upstream on push');
          }
        } catch (syncError) {
          if (!force) {
            steps.push('⚠️ Unable to check remote status - proceeding with caution');
          }
        }
      }

      // Phase 4: Create commit
      const commitMessage = analysis.commitMessage;
      await gitClient.commit(commitMessage);
      steps.push(`✅ Created commit: ${commitMessage}`);

      // Phase 5: Enhanced push logic with comprehensive error handling
      let prInfo = '';
      const currentBranch = await gitClient.getCurrentBranch();
      const updatedStatus = await gitClient.getStatus();

      if (!noPush) {
        let pushSuccess = false;
        let pushAttempts = 0;
        const maxPushAttempts = 3;

        while (!pushSuccess && pushAttempts < maxPushAttempts) {
          pushAttempts++;
          
          try {
            await gitClient.push({ 
              branch: currentBranch, 
              force: force && pushAttempts > 1, 
              setUpstream: true 
            });
            pushSuccess = true;
            steps.push(`✅ Pushed to remote: ${currentBranch}`);

          } catch (pushError: any) {
            steps.push(`⚠️ Push attempt ${pushAttempts} failed`);
            
            if (pushError.message && pushError.message.includes('non-fast-forward')) {
              if (pushAttempts < maxPushAttempts && !force) {
                steps.push('🔄 Retrying with sync...');
                try {
                  const pullResult = await gitClient.pull({ strategy: 'rebase' });
                  if (!pullResult.success && pullResult.conflicts) {
                    steps.push('🤖 AI analyzing rebase conflicts...');
                    
                    // Use AI-smart strategy for push retry conflicts (medium confidence)
                    const resolveResult = await gitClient.resolveConflicts('ai-smart');
                    if (resolveResult.success) {
                      await gitClient.rebase({ onto: '', continue: true });
                      steps.push(`✅ AI resolved rebase conflicts (${resolveResult.confidence}% confidence)`);
                    } else {
                      steps.push(`⚠️ AI couldn't resolve conflicts: ${resolveResult.reasoning}`);
                      break; // Exit retry loop for manual resolution
                    }
                  }
                  continue; // Retry push
                } catch {
                  break; // Exit retry loop
                }
              }
            } else if (pushError.message && pushError.message.includes('remote: ')) {
              // Remote rejected push (protected branch, etc.)
              return {
                content: [
                  {
                    type: 'text',
                    text: `❌ **Push Rejected by Remote**\n\n${steps.join('\n')}\n\n**Error:** ${pushError.message}\n\n**This usually means:**\n• Branch is protected\n• Insufficient permissions\n• Remote repository policies\n\n**Solutions:**\n1. Use a different branch name\n2. Contact repository administrator\n3. Use fork workflow if available`,
                  },
                ],
                isError: true,
              };
            } else if (pushAttempts >= maxPushAttempts) {
              // No remote or other push failure after retries
              if (updatedStatus.remoteURL) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `❌ **Push Failed After ${maxPushAttempts} Attempts**\n\n${steps.join('\n')}\n\n**Final Error:** ${pushError.message}\n\n**Options:**\n1. Check network connection\n2. Verify remote repository access\n3. Try manual push: \`git push -u origin ${currentBranch}\`\n4. Use local merge workflow instead`,
                    },
                  ],
                  isError: true,
                };
              } else {
                // No remote - offer local merge
                return {
                  content: [
                    {
                      type: 'text',
                      text: `🤔 **No Remote Repository**\n\n${steps.join('\n')}\n\nCannot push branch "${currentBranch}" - no remote configured.\n\n**Options:**\n1. Add remote: \`git remote add origin <url>\`\n2. **Merge locally into ${originalBranch}**\n\n**Local merge will:**\n• Switch to ${originalBranch} branch\n• Merge your changes\n• Delete feature branch\n• Keep work local\n\n**Proceed with local merge?**`,
                    },
                  ],
                };
              }
            }
          }
        }

        // Phase 6: PR creation with enhanced error handling
        if (pushSuccess && !noPR) {
          const platformManager = new PlatformManager(updatedStatus.platform, updatedStatus.remoteURL, repoPath);
          const capabilities = await platformManager.getCapabilities();

          if (capabilities.canCreatePR) {
            try {
              const prRequest = {
                title: analysis.title,
                body: analysis.description,
                branch: currentBranch,
                baseBranch: baseBranch || updatedStatus.baseBranch,
                draft,
                reviewers,
                labels,
                autoMerge,
              };

              const prResponse = await platformManager.createPR(prRequest);
              if (prResponse.status === 'created') {
                steps.push(`✅ Created PR: ${prResponse.url}`);
                prInfo = `\n\n🔗 **Pull Request:** ${prResponse.url}`;
                
                // Phase 6.5: Check for PR conflicts and attempt resolution
                const targetBranch = baseBranch || updatedStatus.baseBranch;
                const conflictResolution = await handlePRConflictResolution(
                  gitClient,
                  currentBranch,
                  targetBranch,
                  prResponse.url,
                  { verbose, force }
                );
                
                steps.push(...conflictResolution.steps);
              } else {
                steps.push(`⚠️ PR creation failed: ${prResponse.message}`);
              }
            } catch (prError) {
              steps.push(`⚠️ PR creation error - may need manual creation`);
              if (verbose) {
                steps.push(`Debug: ${prError}`);
              }
            }
          } else {
            const terminology = platformManager.getPRTerminology();
            steps.push(`ℹ️ ${terminology.singular} creation not available: Platform CLI not installed or authenticated`);
          }
        }
      }

      // Phase 7: Restore stashed changes if any
      if (stashedChanges) {
        try {
          await gitClient.stash({ pop: true });
          steps.push('✅ Restored previously stashed changes');
        } catch (stashError) {
          steps.push('⚠️ Could not restore stashed changes - check stash list');
        }
      }

      // Final success message
      return {
        content: [
          {
            type: 'text',
            text: `🚀 **Ship Complete!**\n\n${steps.join('\n')}\n\n📊 **Summary:**\n• ${analysis.additions} additions, ${analysis.deletions} deletions\n• ${analysis.filesChanged.length} files changed\n• Change type: ${analysis.changeType}\n• Branch: ${currentBranch}${prInfo}`,
          },
        ],
      };

    } catch (error) {
      // Enhanced error handling with recovery suggestions
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Ship Failed**\n\n**Error:** ${errorMessage}\n\n**Recovery Steps:**\n1. Check repository status: Use \`status\` tool\n2. Validate repository: Use \`validate\` tool\n3. Check for conflicts: Use \`sync\` tool\n4. Manual recovery: Use \`recover\` tool if needed\n\n**Debug Info:**\n• Steps completed: ${steps.length}\n• Use verbose=true for more details`,
          },
        ],
        isError: true,
      };
    }
  }





  private async handleStatus(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { verbose = false } = args;

    try {
      const isRepo = await gitClient.isGitRepository();
      
      if (!isRepo) {
        return {
          content: [
            {
              type: 'text',
              text: `📊 **Git Status**\n\n❌ **Not a Git Repository**\n\nThe current directory is not a git repository. Initialize one with:\n\`git init\``,
            },
          ],
        };
      }

      const status = await gitClient.getStatus();
      const platformManager = new PlatformManager(status.platform, status.remoteURL, gitClient.getWorkingDirectory());
      const capabilities = await platformManager.getCapabilities();
      const repoInfo = platformManager.parseRepositoryInfo();

      let statusText = `📊 **Git Repository Status**\n\n`;
      statusText += `**Branch:** ${status.branch}`;
      
      if (status.ahead > 0 || status.behind > 0) {
        statusText += ` (${status.ahead} ahead, ${status.behind} behind)`;
      }
      
      statusText += `\n**Base Branch:** ${status.baseBranch}\n`;
      statusText += `**Platform:** ${status.platform}\n`;
      
      if (repoInfo) {
        statusText += `**Repository:** ${repoInfo.owner}/${repoInfo.repo}\n`;
      }
      
      if (status.remoteURL) {
        statusText += `**Remote:** ${status.remoteURL}\n`;
      }

      statusText += `\n**Changes:**\n`;
      statusText += `- Staged: ${status.staged.length} files\n`;
      statusText += `- Unstaged: ${status.unstaged.length} files\n`;
      statusText += `- Untracked: ${status.untracked.length} files\n`;
      statusText += `- Clean: ${status.isDirty ? 'No' : 'Yes'}\n`;

      if (verbose) {
        if (status.staged.length > 0) {
          statusText += `\n**Staged Files:**\n${status.staged.map(f => `- ${f}`).join('\n')}\n`;
        }
        if (status.unstaged.length > 0) {
          statusText += `\n**Unstaged Files:**\n${status.unstaged.map(f => `- ${f}`).join('\n')}\n`;
        }
        if (status.untracked.length > 0) {
          statusText += `\n**Untracked Files:**\n${status.untracked.map(f => `- ${f}`).join('\n')}\n`;
        }

        statusText += `\n**Platform Capabilities:**\n`;
        statusText += `- Create PR/MR: ${capabilities.canCreatePR ? '✅' : '❌'}\n`;
        statusText += `- List PR/MR: ${capabilities.canListPRs ? '✅' : '❌'}\n`;
        statusText += `- Merge PR/MR: ${capabilities.canMergePR ? '✅' : '❌'}\n`;
        statusText += `- Requires Auth: ${capabilities.requiresAuth ? 'Yes' : 'No'}\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }









  /**
   * Handle GitPlus MCP info request
   */
  async handleInfo(args: any): Promise<ToolResult> {
    const { repoPath } = args;

    try {
      // Get current timestamp and version info
      const now = new Date().toISOString();
      
      // Get package version
      let version = '1.0.3';
      try {
        const packageJson = require('../../package.json');
        version = packageJson.version;
      } catch {
        // Use fallback version
      }

      let infoText = `# 🚀 GitPlus MCP Server Information\n\n`;
      infoText += `**Version:** ${version}\n`;
      infoText += `**Server Type:** Model Context Protocol (MCP) Server\n`;
      infoText += `**Generated:** ${now.split('T')[0]} ${now.split('T')[1]?.split('.')[0]} UTC\n\n`;

      // Repository-specific information
      if (repoPath) {
        try {
          const gitClient = new GitClient(repoPath);
          const isRepo = await gitClient.isGitRepository();
          
          if (isRepo) {
            const status = await gitClient.getStatus();
            const platformManager = new PlatformManager(status.platform, status.remoteURL, repoPath);
            const repoInfo = platformManager.parseRepositoryInfo();
            
            infoText += `## 📁 Current Repository\n\n`;
            infoText += `**Path:** \`${repoPath}\`\n`;
            infoText += `**Branch:** ${status.branch}\n`;
            infoText += `**Platform:** ${status.platform}\n`;
            if (repoInfo) {
              infoText += `**Repository:** ${repoInfo.owner}/${repoInfo.repo}\n`;
            }
            if (status.remoteURL) {
              infoText += `**Remote:** ${status.remoteURL}\n`;
            }
            infoText += `**Status:** ${status.isDirty ? 'Has changes' : 'Clean'}\n`;
            if (status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0) {
              infoText += `**Files:** ${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked\n`;
            }
            infoText += `\n`;
          } else {
            infoText += `## 📁 Directory Information\n\n`;
            infoText += `**Path:** \`${repoPath}\`\n`;
            infoText += `**Status:** ❌ Not a Git repository\n\n`;
          }
        } catch (error) {
          infoText += `## ⚠️ Repository Access Issue\n\n`;
          infoText += `**Path:** \`${repoPath}\`\n`;
          infoText += `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;
        }
      }

      // Available tools
      infoText += `## 🛠️ Available GitPlus Tools\n\n`;
      infoText += `### Primary Workflow Tool\n`;
      infoText += `- **\`ship\`** - Complete git workflow: analyze → commit → push → PR\n`;
      infoText += `  - AI-powered commit messages\n`;
      infoText += `  - Automatic branch creation\n`;
      infoText += `  - Smart conflict resolution\n`;
      infoText += `  - Pull request creation\n\n`;

      infoText += `### Repository Information\n`;
      infoText += `- **\`status\`** - Enhanced git status with platform detection\n`;
      infoText += `- **\`info\`** - GitPlus MCP server information and capabilities\n\n`;

      // Usage examples
      infoText += `## 💡 Common Usage Patterns\n\n`;
      infoText += `### Complete Workflow\n`;
      infoText += `> "Ship my current changes to a new PR"\n\n`;
      infoText += `### Repository Status\n`;
      infoText += `> "Show me the current git status with detailed information"\n\n`;
      infoText += `### Server Information\n`;
      infoText += `> "Tell me about GitPlus capabilities and tools"\n\n`;

      // Features
      infoText += `## ✨ Key Features\n\n`;
      infoText += `- **🤖 AI-Powered**: Uses Claude AI for intelligent commit messages, branch names, and PR descriptions\n`;
      infoText += `- **📋 Conventional Commits**: Follows strict conventional commit specification\n`;
      infoText += `- **🔄 Smart Conflict Resolution**: AI-assisted conflict resolution\n`;
      infoText += `- **🌐 Multi-Platform**: Supports GitHub, GitLab, and local repositories\n`;
      infoText += `- **🚀 Complete Workflows**: One-command ship from changes to PR\n`;
      infoText += `- **🔍 Repository Health**: Validation and integrity checks\n`;
      infoText += `- **📊 Detailed Analysis**: Comprehensive change analysis with impact assessment\n\n`;

      // Tips
      infoText += `## 💭 Pro Tips\n\n`;
      infoText += `- Always provide the **repoPath** parameter as an absolute path to your git repository\n`;
      infoText += `- Use **\`status\`** first to understand your repository state\n`;
      infoText += `- Try **\`analyze\`** to get AI insights before making commits\n`;
      infoText += `- Use **\`dryRun: true\`** to preview operations before executing\n`;
      infoText += `- The **\`ship\`** tool is your best friend for complete workflows\n\n`;

      infoText += `## 📚 Need Help?\n\n`;
      infoText += `- **Repository:** [NeuBlink/gitplus](https://github.com/NeuBlink/gitplus)\n`;
      infoText += `- **Documentation:** Full README with examples and troubleshooting\n`;
      infoText += `- **Issues:** Report bugs or request features on GitHub\n\n`;

      infoText += `---\n`;
      infoText += `*GitPlus MCP Server - AI-Powered Git Automation for Claude Code*`;

      return {
        content: [
          {
            type: 'text',
            text: infoText,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Info Error**\n\nFailed to generate GitPlus information: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
}