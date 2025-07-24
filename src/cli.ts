#!/usr/bin/env node

import { Command } from 'commander';
import prompts from 'prompts';
import { GitClient } from './git/client';
import { ChangeAnalyzer } from './git/analyzer';
import { PlatformManager } from './git/platform';
import { Platform } from './types';

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
  .version('1.0.0');

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

      // Implementation would continue here...
      output('Ship command not fully implemented yet');

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

program.parse();