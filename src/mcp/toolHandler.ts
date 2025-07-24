import { ToolName } from './toolDefinitions';
import { GitClient } from '../git/client';
import { PlatformManager } from '../git/platform';
import { ChangeAnalyzer } from '../git/analyzer';
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
      message, 
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
        const commitMsg = message || analysis.commitMessage;
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
      const commitMessage = message || analysis.commitMessage;
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

  private async handleCommit(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { 
      message, 
      files = [], 
      type, 
      scope, 
      breaking = false, 
      all = false, 
      dryRun = false 
    } = args;

    try {
      const status = await gitClient.getStatus();
      
      if (status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `ℹ️ **No Changes to Commit**\n\nThe repository is clean with no staged, unstaged, or untracked changes.`,
            },
          ],
        };
      }

      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      // Generate commit message
      let commitMessage: string;
      if (message) {
        commitMessage = message;
      } else {
        const commitType = type || analysis.conventionalType;
        const prefix = scope ? `${commitType}(${scope})` : commitType;
        const breakingFlag = breaking ? '!' : '';
        const subject = analysis.title.toLowerCase().replace(/^(add|fix|update|refactor)\s+/i, '');
        commitMessage = `${prefix}${breakingFlag}: ${subject}`;
      }

      if (dryRun) {
        const filesToCommit = files && files.length > 0 ? files : 
                            status.staged.length > 0 ? status.staged : 
                            ['All changed files'];
        
        return {
          content: [
            {
              type: 'text',
              text: `💻 **Commit Preview**\n\n**📝 Commit Message:**\n\`${commitMessage}\`\n\n**📁 Files to Commit:**\n${filesToCommit.map((f: string) => `• ${f}`).join('\n')}\n\n**📊 Changes:**\n• **Type:** ${analysis.changeType}\n• **Impact:** +${analysis.additions}/-${analysis.deletions} lines`,
            },
          ],
        };
      }

      // Stage files if needed
      const stagedFiles: string[] = [];
      if (files.length > 0) {
        await gitClient.add(files);
        stagedFiles.push(...files);
      } else if (all || status.staged.length === 0) {
        await gitClient.add('all');
        stagedFiles.push(...status.unstaged, ...status.untracked);
      }

      // Create commit
      await gitClient.commit(commitMessage);

      return {
        content: [
          {
            type: 'text',
            text: `💻 **Commit Created Successfully!**\n\n**Message:** \`${commitMessage}\`\n\n**Files committed:**\n${(stagedFiles.length > 0 ? stagedFiles : status.staged).map(f => `- ${f}`).join('\n')}\n\n**Stats:** ${analysis.additions} additions, ${analysis.deletions} deletions`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleAnalyze(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { commitRange, includeDiff = false, contextFile } = args;

    try {
      const status = await gitClient.getStatus();
      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ 
        commitRange, 
        includeDiff, 
        contextFile 
      });

      let contextContent = '';
      if (contextFile) {
        // TODO: Read context file content
        contextContent = `\n\n**Context from ${contextFile}:**\n(Context file reading not yet implemented)`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Repository Analysis**\n\n**Current Status:**\n- Branch: ${status.branch} (${status.ahead} ahead, ${status.behind} behind)\n- Platform: ${status.platform}\n- Changes: ${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked\n\n**Change Analysis:**\n- Type: ${analysis.changeType}\n- Conventional type: ${analysis.conventionalType}\n- Files affected: ${analysis.filesChanged.length}\n- Impact: ${analysis.additions} additions, ${analysis.deletions} deletions\n\n**Suggested Actions:**\n- Branch name: \`${analysis.branchName}\`\n- Commit message: \`${analysis.commitMessage}\`\n- PR title: ${analysis.title}\n\n${analysis.description}${contextContent}`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleSuggest(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { for: suggestFor, context, diff, files = [] } = args;

    try {
      const status = await gitClient.getStatus();
      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      let suggestion = '';
      let explanation = '';

      switch (suggestFor) {
        case 'branch':
          suggestion = analysis.branchName;
          explanation = `Based on the change type (${analysis.changeType}) and affected files, this branch name follows conventional patterns.`;
          break;

        case 'commit':
          suggestion = analysis.commitMessage;
          explanation = `This follows conventional commit format with type "${analysis.conventionalType}" based on the changes detected.`;
          break;

        case 'pr_title':
          suggestion = analysis.title;
          explanation = `Generated based on the scope and nature of changes across ${analysis.filesChanged.length} files.`;
          break;

        case 'pr_description':
          suggestion = analysis.description;
          explanation = `Comprehensive description including file changes, commit history, and change type analysis.`;
          break;

        default:
          throw new Error(`Unknown suggestion type: ${suggestFor}`);
      }

      let contextInfo = '';
      if (context) {
        contextInfo = `\n\n**Additional Context:** ${context}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `💡 **AI Suggestion for ${suggestFor}**\n\n**Suggestion:**\n${suggestFor === 'pr_description' ? suggestion : `\`${suggestion}\``}\n\n**Explanation:** ${explanation}\n\n**Analysis Context:**\n- Change type: ${analysis.changeType}\n- Files: ${analysis.filesChanged.length}\n- Stats: +${analysis.additions}/-${analysis.deletions}${contextInfo}`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Suggestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handlePRDraft(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { commits = [], commitRange, includeDiff = false, template, contextFile } = args;

    try {
      const status = await gitClient.getStatus();
      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ 
        commitRange, 
        includeDiff, 
        contextFile 
      });

      const platformManager = new PlatformManager(status.platform, status.remoteURL, gitClient.getWorkingDirectory());
      const terminology = platformManager.getPRTerminology();

      // Try to use AI for PR generation
      let title = analysis.title;
      let description = analysis.description;

      try {
        const diff = includeDiff ? await gitClient.getDiff({ staged: true }) || await gitClient.getDiff({ staged: false }) : '';
        const commitHistory = await gitClient.getCommitHistory(10, commitRange);

        // Use AI to generate better PR content
        const aiPR = await analyzer.aiService.generatePRDescription({
          commits: commitHistory.map(c => ({ message: c.message, hash: c.hash })),
          filesChanged: analysis.filesChanged,
          diff,
          branch: status.branch,
          baseBranch: status.baseBranch,
          template
        });

        if (aiPR) {
          title = aiPR.title;
          description = aiPR.description;
        }
      } catch (aiError) {
        console.warn('AI PR generation failed, using rule-based:', aiError);
        // Apply template modifications if specified
        if (template) {
          description = this.applyPRTemplate(description, template, analysis);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `📝 **${terminology.singular} Draft**\n\n**Title:**\n${title}\n\n**Description:**\n${description}\n\n**Summary:**\n- Platform: ${status.platform}\n- Files changed: ${analysis.filesChanged.length}\n- Impact: +${analysis.additions}/-${analysis.deletions}\n- Change type: ${analysis.changeType}${template ? `\n- Template: ${template}` : ''}`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`PR draft failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private applyPRTemplate(
    description: string, 
    template: string, 
    analysis: any
  ): string {
    const templates = {
      feature: `## 🚀 New Feature\n\n${description}\n\n## ✅ Testing\n- [ ] Unit tests added/updated\n- [ ] Integration tests passed\n- [ ] Manual testing completed`,
      bugfix: `## 🐛 Bug Fix\n\n${description}\n\n## 🧪 Testing\n- [ ] Bug reproduction confirmed\n- [ ] Fix verified\n- [ ] Regression tests added`,
      hotfix: `## 🚨 Hotfix\n\n${description}\n\n⚠️ **This is a critical hotfix that needs immediate attention.**\n\n## ✅ Verification\n- [ ] Critical issue resolved\n- [ ] Production testing completed`,
      docs: `## 📚 Documentation Update\n\n${description}\n\n## 📝 Changes\n- Documentation updated\n- No functional changes`,
      refactor: `## ♻️ Code Refactoring\n\n${description}\n\n## 🔄 Changes\n- Code restructured for better maintainability\n- No functional changes expected`,
      chore: `## 🔧 Maintenance\n\n${description}\n\n## 🛠️ Changes\n- Maintenance tasks completed\n- Build/config updates`
    };

    return templates[template as keyof typeof templates] || description;
  }

  private async handleMergeLocal(args: Record<string, any>, gitClient: GitClient): Promise<ToolResult> {
    const { 
      branchName, 
      baseBranch = 'main', 
      deleteAfter = true, 
      confirm 
    } = args;

    try {
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Merge Cancelled**\n\nLocal merge was not confirmed. Your feature branch "${branchName}" remains unchanged.\n\nTo merge manually later:\n\`\`\`bash\ngit checkout ${baseBranch}\ngit merge ${branchName}\ngit branch -d ${branchName}  # Delete after merge\n\`\`\``,
            },
          ],
        };
      }

      const currentBranch = await gitClient.getCurrentBranch();
      const steps: string[] = [];

      // Ensure we're not already on the target branch
      if (currentBranch === baseBranch) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Already on Base Branch**\n\nYou're already on "${baseBranch}". Cannot merge "${branchName}" into itself.\n\nSwitch to the feature branch first or specify a different base branch.`,
            },
          ],
          isError: true,
        };
      }

      // Switch to base branch
      await gitClient.checkout(baseBranch);
      steps.push(`✅ Switched to branch: ${baseBranch}`);

      // Merge the feature branch
      await gitClient.merge(branchName, { noFf: true }); // Use --no-ff for clear history
      steps.push(`✅ Merged branch "${branchName}" into ${baseBranch}`);

      // Delete the feature branch if requested
      if (deleteAfter) {
        await gitClient.deleteBranch(branchName);
        steps.push(`✅ Deleted feature branch: ${branchName}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `🎉 **Local Merge Complete!**\n\n${steps.join('\n')}\n\n📊 **Summary:**\n- Branch "${branchName}" merged into ${baseBranch}\n- Currently on: ${baseBranch}\n- Feature branch: ${deleteAfter ? 'Deleted' : 'Preserved'}\n\n💡 **Next Steps:**\n- Your changes are now in ${baseBranch}\n- Consider pushing to remote: \`git push origin ${baseBranch}\``,
          },
        ],
      };

    } catch (error) {
      // Handle merge conflicts or other issues
      if (error instanceof Error && error.message.includes('CONFLICT')) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ **Merge Conflict Detected**\n\nThe merge has conflicts that need to be resolved manually.\n\n**To resolve:**\n1. Edit the conflicted files\n2. Stage the resolved files: \`git add <files>\`\n3. Complete the merge: \`git commit\`\n\n**To abort the merge:**\n\`git merge --abort\``,
            },
          ],
          isError: true,
        };
      }

      throw new Error(`Local merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle repository synchronization
   */
  async handleSync(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const strategy = (args.strategy as string) || 'merge';
    const remote = (args.remote as string) || 'origin';
    const branch = args.branch as string;
    const autoResolve = args.autoResolve as 'ours' | 'theirs' | 'manual';
    const force = args.force as boolean;

    const client = new GitClient(repoPath);

    try {
      // First, check sync status
      const syncStatus = await client.getSyncStatus(branch);
      const steps: string[] = [];

      if (!syncStatus.hasUpstream) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ **No Upstream Branch**\n\nBranch "${syncStatus.localBranch}" has no upstream branch.\n\n**To set upstream:**\n\`git push -u ${remote} ${syncStatus.localBranch}\``,
            },
          ],
        };
      }

      if (syncStatus.upToDate) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ **Already Up to Date**\n\nBranch "${syncStatus.localBranch}" is already up to date with ${syncStatus.remoteBranch}.`,
            },
          ],
        };
      }

      // Fetch first
      steps.push('🔄 Fetching updates from remote...');
      await client.fetch({ remote, prune: true });

      if (strategy === 'fetch-only') {
        const newSyncStatus = await client.getSyncStatus(branch);
        return {
          content: [
            {
              type: 'text',
              text: `📥 **Fetch Complete**\n\n${steps.join('\n')}\n\n📊 **Status:**\n- Ahead: ${newSyncStatus.ahead} commits\n- Behind: ${newSyncStatus.behind} commits\n- Diverged: ${newSyncStatus.diverged ? 'Yes' : 'No'}\n\n💡 Use sync with 'merge' or 'rebase' strategy to integrate changes.`,
            },
          ],
        };
      }

      // Handle pull with conflict resolution
      if (syncStatus.needsPull) {
        steps.push(`📥 Pulling changes using ${strategy} strategy...`);
        
        const pullResult = await client.pull({
          remote,
          branch,
          strategy: strategy as 'merge' | 'rebase'
        });

        if (!pullResult.success && pullResult.conflicts) {
          steps.push(`⚠️ Conflicts detected in ${pullResult.conflicts.length} files`);
          
          if (autoResolve && autoResolve !== 'manual') {
            steps.push(`🔧 Auto-resolving conflicts using '${autoResolve}' strategy...`);
            const resolveResult = await client.resolveConflicts(autoResolve);
            
            if (resolveResult.success) {
              steps.push(`✅ Resolved ${resolveResult.resolvedFiles.length} conflicts`);
              if (strategy === 'merge') {
                await client.continueMerge();
              } else if (strategy === 'rebase') {
                await client.rebase({ onto: '', continue: true });
              }
            } else {
              return {
                content: [
                  {
                    type: 'text',
                    text: `⚠️ **Conflicts Need Manual Resolution**\n\n${steps.join('\n')}\n\n**Conflicted Files:**\n${resolveResult.remainingConflicts.map(f => `- ${f}`).join('\n')}\n\n**To resolve:**\n1. Edit the conflicted files\n2. Stage resolved files: \`git add <files>\`\n3. Continue: \`git ${strategy === 'merge' ? 'merge --continue' : 'rebase --continue'}\``,
                  },
                ],
                isError: true,
              };
            }
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ **Manual Conflict Resolution Required**\n\n${steps.join('\n')}\n\n**Conflicted Files:**\n${pullResult.conflicts.map(f => `- ${f}`).join('\n')}\n\n**To resolve:**\n1. Edit the conflicted files\n2. Stage resolved files: \`git add <files>\`\n3. Continue: \`git ${strategy === 'merge' ? 'merge --continue' : 'rebase --continue'}\``,
                },
              ],
              isError: true,
            };
          }
        }
      }

      steps.push('✅ Synchronization complete');
      const finalStatus = await client.getSyncStatus(branch);

      return {
        content: [
          {
            type: 'text',
            text: `🎉 **Sync Complete!**\n\n${steps.join('\n')}\n\n📊 **Final Status:**\n- Branch: ${finalStatus.localBranch}\n- Up to date: ${finalStatus.upToDate ? 'Yes' : 'No'}\n- Ahead: ${finalStatus.ahead} commits\n- Behind: ${finalStatus.behind} commits`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle git stash operations
   */
  async handleStash(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const action = args.action as 'push' | 'pop' | 'apply' | 'drop' | 'list';
    const message = args.message as string;
    const includeUntracked = args.includeUntracked as boolean;
    const stashIndex = args.stashIndex as number;

    const client = new GitClient(repoPath);

    try {
      let output: string;
      let resultText: string;

      switch (action) {
        case 'list':
          output = await client.stash({ list: true });
          const stashes = output.split('\n').filter(line => line.trim());
          resultText = stashes.length > 0 
            ? `📋 **Git Stash List**\n\n${stashes.map((stash, i) => `${i}: ${stash}`).join('\n')}`
            : '📋 **Git Stash List**\n\nNo stashes found.';
          break;

        case 'push':
          output = await client.stash({ 
            message, 
            includeUntracked 
          });
          resultText = `💾 **Stash Created**\n\n${message ? `Message: ${message}` : 'Stashed current changes'}\n${includeUntracked ? 'Included untracked files' : 'Tracked files only'}`;
          break;

        case 'pop':
          output = await client.stash({ 
            pop: true, 
            stashIndex 
          });
          resultText = `📤 **Stash Applied & Removed**\n\n${stashIndex !== undefined ? `Applied stash@{${stashIndex}}` : 'Applied latest stash'}\n\nChanges restored to working directory.`;
          break;

        case 'apply':
          output = await client.stash({ 
            apply: true, 
            stashIndex 
          });
          resultText = `📥 **Stash Applied**\n\n${stashIndex !== undefined ? `Applied stash@{${stashIndex}}` : 'Applied latest stash'}\n\nStash preserved for future use.`;
          break;

        case 'drop':
          output = await client.stash({ 
            drop: true, 
            stashIndex 
          });
          resultText = `🗑️ **Stash Dropped**\n\n${stashIndex !== undefined ? `Dropped stash@{${stashIndex}}` : 'Dropped latest stash'}\n\nStash permanently removed.`;
          break;

        default:
          throw new Error(`Unknown stash action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Stash operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle git reset operations
   */
  async handleReset(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const mode = args.mode as 'soft' | 'mixed' | 'hard';
    const target = (args.target as string) || 'HEAD';
    const files = args.files as string[];
    const confirm = args.confirm as boolean;

    if (mode === 'hard' && !confirm) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ **Destructive Operation Warning**\n\nHard reset will permanently discard all changes.\n\n**What will happen:**\n- All uncommitted changes will be lost\n- Working directory will match ${target}\n- This cannot be undone\n\n**To proceed, call reset again with confirm=true**`,
          },
        ],
        isError: true,
      };
    }

    const client = new GitClient(repoPath);

    try {
      await client.reset({ mode, target, files });

      const descriptions = {
        soft: 'Reset HEAD to target, keeping changes staged',
        mixed: 'Reset HEAD and index, keeping changes in working directory', 
        hard: 'Reset HEAD, index, and working directory (all changes discarded)'
      };

      const fileText = files && files.length > 0 
        ? `\n\n📁 **Files Reset:**\n${files.map(f => `- ${f}`).join('\n')}`
        : '';

      return {
        content: [
          {
            type: 'text',
            text: `🔄 **Reset Complete**\n\n**Mode:** ${mode}\n**Target:** ${target}\n**Action:** ${descriptions[mode]}${fileText}`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle git rebase operations
   */
  async handleRebase(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const onto = args.onto as string;
    const interactive = args.interactive as boolean;
    const action = (args.action as string) || 'start';
    const autoResolve = args.autoResolve as 'ours' | 'theirs' | 'manual';

    const client = new GitClient(repoPath);

    try {
      let result: { success: boolean; output: string; conflicts?: string[] };
      let resultText: string;

      switch (action) {
        case 'start':
          if (!onto) {
            throw new Error('Target branch (onto) is required for rebase');
          }
          result = await client.rebase({ onto, interactive });
          
          if (!result.success && result.conflicts) {
            if (autoResolve && autoResolve !== 'manual') {
              const resolveResult = await client.resolveConflicts(autoResolve);
              if (resolveResult.success) {
                await client.rebase({ onto: '', continue: true });
                resultText = `🎉 **Rebase Complete**\n\nRebased onto ${onto} with auto-resolved conflicts using '${autoResolve}' strategy.`;
              } else {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `⚠️ **Rebase Conflicts**\n\nConflicts in: ${result.conflicts.join(', ')}\n\n**To resolve:**\n1. Edit conflicted files\n2. Stage resolved files: \`git add <files>\`\n3. Continue: Use rebase tool with action='continue'`,
                    },
                  ],
                  isError: true,
                };
              }
            } else {
              return {
                content: [
                  {
                    type: 'text',
                    text: `⚠️ **Rebase Conflicts**\n\nConflicts in: ${result.conflicts.join(', ')}\n\n**To resolve:**\n1. Edit conflicted files\n2. Stage resolved files: \`git add <files>\`\n3. Continue: Use rebase tool with action='continue'`,
                  },
                ],
                isError: true,
              };
            }
          } else {
            resultText = `🎉 **Rebase Complete**\n\nSuccessfully rebased onto ${onto}.`;
          }
          break;

        case 'continue':
          result = await client.rebase({ onto: '', continue: true });
          resultText = `✅ **Rebase Continued**\n\nRebase operation continued successfully.`;
          break;

        case 'abort':
          result = await client.rebase({ onto: '', abort: true });
          resultText = `🚫 **Rebase Aborted**\n\nRebase operation aborted. Repository restored to pre-rebase state.`;
          break;

        case 'skip':
          result = await client.rebase({ onto: '', skip: true });
          resultText = `⏭️ **Commit Skipped**\n\nSkipped current commit and continued rebase.`;
          break;

        default:
          throw new Error(`Unknown rebase action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Rebase failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle git recovery operations
   */
  async handleRecover(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const action = args.action as 'show-reflog' | 'recover-commit' | 'show-lost';
    const commitHash = args.commitHash as string;
    const limit = (args.limit as number) || 20;

    const client = new GitClient(repoPath);

    try {
      let resultText: string;

      switch (action) {
        case 'show-reflog':
          const reflogEntries = await client.getReflog(limit);
          if (reflogEntries.length === 0) {
            resultText = '📜 **Reflog**\n\nNo reflog entries found.';
          } else {
            resultText = `📜 **Reflog (last ${limit} entries)**\n\n${reflogEntries.map((entry, i) => 
              `${i}: ${entry.shortHash} ${entry.action}: ${entry.message}`
            ).join('\n')}\n\n💡 Use 'recover-commit' action with commitHash to recover a specific commit.`;
          }
          break;

        case 'recover-commit':
          if (!commitHash) {
            throw new Error('Commit hash is required for recovery');
          }
          
          // Create a new branch pointing to the lost commit
          const recoveryBranch = `recovery-${commitHash.substring(0, 8)}-${Date.now()}`;
          await client.createBranch(recoveryBranch, false);
          await client.reset({ mode: 'hard', target: commitHash });
          
          resultText = `🎉 **Commit Recovered**\n\nRecovered commit ${commitHash} to new branch: ${recoveryBranch}\n\n**Next steps:**\n- Review the recovered changes\n- Merge or cherry-pick to your main branch if needed\n- Delete recovery branch when done: \`git branch -d ${recoveryBranch}\``;
          break;

        case 'show-lost':
          // Show commits that are not reachable from any branch
          const reflog = await client.getReflog(50);
          const lostCommits = reflog.filter(entry => 
            entry.action.includes('commit') || entry.action.includes('reset')
          ).slice(0, 10);
          
          if (lostCommits.length === 0) {
            resultText = '🔍 **Lost Commits**\n\nNo potentially lost commits found in recent reflog.';
          } else {
            resultText = `🔍 **Potentially Lost Commits**\n\n${lostCommits.map((entry, i) => 
              `${i + 1}. ${entry.shortHash} - ${entry.message}`
            ).join('\n')}\n\n💡 Use 'recover-commit' with the hash to recover any of these commits.`;
          }
          break;

        default:
          throw new Error(`Unknown recovery action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Recovery operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle repository validation
   */
  async handleValidate(args: any): Promise<ToolResult> {
    const repoPath = args.repoPath as string;
    const deep = args.deep as boolean;
    const fix = args.fix as boolean;

    const client = new GitClient(repoPath);

    try {
      const validation = await client.validateRepository();
      const stats = await client.getRepositoryStats();

      let resultText = `🔍 **Repository Validation**\n\n`;
      
      if (validation.isValid) {
        resultText += `✅ **Repository is healthy**\n\n`;
      } else {
        resultText += `❌ **Repository has issues**\n\n`;
      }

      // Show issues
      if (validation.issues.length > 0) {
        resultText += `**Issues Found:**\n${validation.issues.map(issue => `❌ ${issue}`).join('\n')}\n\n`;
      }

      // Show warnings
      if (validation.warnings.length > 0) {
        resultText += `**Warnings:**\n${validation.warnings.map(warning => `⚠️ ${warning}`).join('\n')}\n\n`;
      }

      // Show repository statistics
      resultText += `📊 **Repository Statistics:**\n`;
      resultText += `- Total commits: ${stats.totalCommits}\n`;
      resultText += `- Total branches: ${stats.totalBranches}\n`;
      resultText += `- Total tags: ${stats.totalTags}\n`;
      resultText += `- Repository size: ${stats.repositorySize}\n`;
      if (stats.lastCommitDate) {
        resultText += `- Last commit: ${stats.lastCommitDate.toISOString().split('T')[0]}\n`;
      }

      // Show sync status if deep validation
      if (deep) {
        try {
          const syncStatus = await client.getSyncStatus();
          resultText += `\n🔄 **Sync Status:**\n`;
          resultText += `- Current branch: ${syncStatus.localBranch}\n`;
          resultText += `- Has upstream: ${syncStatus.hasUpstream ? 'Yes' : 'No'}\n`;
          if (syncStatus.hasUpstream) {
            resultText += `- Up to date: ${syncStatus.upToDate ? 'Yes' : 'No'}\n`;
            resultText += `- Ahead: ${syncStatus.ahead} commits\n`;
            resultText += `- Behind: ${syncStatus.behind} commits\n`;
          }
        } catch (error) {
          resultText += `\n⚠️ Could not check sync status: ${error}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      let version = '1.0.1';
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
      infoText += `### Core Workflow Tools\n`;
      infoText += `- **\`ship\`** - Complete git workflow: commit → push → PR\n`;
      infoText += `- **\`commit\`** - AI-powered conventional commits\n`;
      infoText += `- **\`analyze\`** - Analyze repository changes and provide insights\n`;
      infoText += `- **\`status\`** - Enhanced git status with platform detection\n\n`;

      infoText += `### AI-Powered Suggestions\n`;
      infoText += `- **\`suggest\`** - Get AI suggestions for branches, commits, PR titles/descriptions\n`;
      infoText += `- **\`pr_draft\`** - Generate pull request titles and descriptions\n\n`;

      infoText += `### Repository Management\n`;
      infoText += `- **\`sync\`** - Synchronize with remote repository\n`;
      infoText += `- **\`merge_local\`** - Merge feature branches locally\n`;
      infoText += `- **\`stash\`** - Manage git stash operations\n`;
      infoText += `- **\`reset\`** - Reset repository state safely\n`;
      infoText += `- **\`rebase\`** - Rebase branches with conflict handling\n`;
      infoText += `- **\`recover\`** - Recover lost commits using reflog\n`;
      infoText += `- **\`validate\`** - Validate repository health and integrity\n\n`;

      // Usage examples
      infoText += `## 💡 Common Usage Patterns\n\n`;
      infoText += `### Quick Ship Workflow\n`;
      infoText += `> "Ship my current changes to a new PR"\n\n`;
      infoText += `### Smart Commits\n`;
      infoText += `> "Commit my staged changes with an AI-generated message"\n\n`;
      infoText += `### Repository Analysis\n`;
      infoText += `> "Analyze my repository changes and suggest improvements"\n\n`;
      infoText += `### AI Suggestions\n`;
      infoText += `> "Suggest a branch name for my authentication feature"\n\n`;

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