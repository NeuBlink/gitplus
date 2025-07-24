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
      // Validate repoPath
      const { repoPath } = args;
      if (!repoPath) {
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

      // Check if path exists
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

      // Create GitClient for this specific repository
      const gitClient = new GitClient(repoPath);
      
      // Check if we're in a git repository, initialize if needed for MCP
      const isRepo = await gitClient.isGitRepository();
      if (!isRepo && name !== 'status') {
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

      switch (name) {
        case 'ship':
          return await this.handleShip(args, gitClient);
        case 'commit':
          return await this.handleCommit(args, gitClient);
        case 'analyze':
          return await this.handleAnalyze(args, gitClient);
        case 'suggest':
          return await this.handleSuggest(args, gitClient);
        case 'pr_draft':
          return await this.handlePRDraft(args, gitClient);
        case 'status':
          return await this.handleStatus(args, gitClient);
        case 'merge_local':
          return await this.handleMergeLocal(args, gitClient);
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
      dryRun = false 
    } = args;

    try {
      const status = await gitClient.getStatus();
      const analyzer = new ChangeAnalyzer(gitClient);
      const analysis = await analyzer.analyzeChanges({ includeDiff: true });

      if (dryRun) {
        const commitMsg = message || analysis.commitMessage;
        const branchName = branch || analysis.branchName;
        const prTitle = analysis.title;
        const prDescription = analysis.description;
        
        return {
          content: [
            {
              type: 'text',
              text: `🚀 **Ship Preview**\n\n**📝 Commit Message:**\n\`${commitMsg}\`\n\n**🌿 Branch Name:**\n\`${branchName}\`\n\n**📋 PR Title:**\n${prTitle}\n\n**📄 PR Description:**\n${prDescription.length > 200 ? prDescription.substring(0, 200) + '...' : prDescription}\n\n**⚡ Actions:**\n${status.staged.length === 0 ? '• Stage all changes' : '• Use staged changes'}\n• Commit with AI-generated message\n${noPush ? '• Skip push' : '• Push to remote'}\n${noPR ? '• Skip PR creation' : `• Create ${draft ? 'draft ' : ''}PR`}`,
            },
          ],
        };
      }

      const steps: string[] = [];

      // Step 1: Stage changes if needed
      if (status.staged.length === 0 && (status.unstaged.length > 0 || status.untracked.length > 0)) {
        await gitClient.add('all');
        steps.push(`✅ Staged ${status.unstaged.length + status.untracked.length} files`);
      }

      // Step 2: Create branch if on main/master (always create branch for ship)
      let targetBranch = branch;
      if (status.branch === 'main' || status.branch === 'master') {
        if (!targetBranch) {
          // Use AI-generated branch name if no branch specified
          targetBranch = analysis.branchName;
        }
        await gitClient.createBranch(targetBranch, true);
        steps.push(`✅ Created and switched to branch: ${targetBranch}`);
      }

      // Step 3: Commit changes
      const commitMessage = message || analysis.commitMessage;
      await gitClient.commit(commitMessage);
      steps.push(`✅ Created commit: ${commitMessage}`);

      // Step 4: Handle push and PR/merge logic
      let prInfo = '';
      const currentBranch = await gitClient.getCurrentBranch();
      const updatedStatus = await gitClient.getStatus();

      if (!noPush) {
        try {
          await gitClient.push({ 
            branch: currentBranch, 
            force, 
            setUpstream: true 
          });
          steps.push(`✅ Pushed to remote: ${currentBranch}`);

          // Step 5: Create PR if not disabled and platform supports it
          if (!noPR) {
            const platformManager = new PlatformManager(updatedStatus.platform, updatedStatus.remoteURL);
            const capabilities = await platformManager.getCapabilities();

            if (capabilities.canCreatePR) {
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
            } else {
              const terminology = platformManager.getPRTerminology();
              steps.push(`ℹ️ ${terminology.singular} creation not available: Platform CLI not installed or authenticated`);
            }
          }
        } catch (pushError) {
          // Handle no remote case - offer local merge
          if (!noPR && (status.branch === 'main' || status.branch === 'master')) {
            // Don't offer merge if we never created a branch
            steps.push(`⚠️ No remote repository found. Cannot push changes.`);
            steps.push(`ℹ️ Consider adding a remote: git remote add origin <url>`);
          } else {
            // We're on a feature branch and can't push - offer local merge
            return {
              content: [
                {
                  type: 'text',
                  text: `🤔 **No Remote Repository Found**\n\nCannot push branch "${currentBranch}" to remote.\n\n**Options:**\n1. Add a remote repository: \`git remote add origin <url>\`\n2. Merge locally into main branch\n\n**Would you like to merge "${currentBranch}" into main locally?**\n\n⚠️ This will:\n- Switch to main branch\n- Merge your feature branch\n- Delete the feature branch\n\n*Reply with "yes" to proceed with local merge, or "no" to keep the feature branch.*`,
                },
              ],
            };
          }
        }
      } else if (!noPR && currentBranch !== 'main' && currentBranch !== 'master') {
        // User wants PR but no push - offer local merge since we can't create remote PR
        return {
          content: [
            {
              type: 'text',
              text: `🤔 **Local Branch Created**\n\nBranch "${currentBranch}" created with your changes, but push was skipped.\n\n**Options:**\n1. Push later: \`git push -u origin ${currentBranch}\`\n2. Merge locally into main branch\n\n**Would you like to merge "${currentBranch}" into main locally?**\n\n⚠️ This will:\n- Switch to main branch\n- Merge your feature branch\n- Delete the feature branch\n\n*Reply with "yes" to proceed with local merge, or "no" to keep the feature branch.*`,
          },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `🚀 **Ship Complete!**\n\n${steps.join('\n')}\n\n📊 **Summary:**\n- ${analysis.additions} additions, ${analysis.deletions} deletions\n- ${analysis.filesChanged.length} files changed\n- Change type: ${analysis.changeType}${prInfo}`,
          },
        ],
      };

    } catch (error) {
      throw new Error(`Ship failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      const platformManager = new PlatformManager(status.platform, status.remoteURL);
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
      const platformManager = new PlatformManager(status.platform, status.remoteURL);
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
}