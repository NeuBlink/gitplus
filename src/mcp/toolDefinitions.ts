import { z } from 'zod';

// Tool definitions for registration - using the correct MCP SDK format
export const toolDefinitions = [
  {
    name: 'ship',
    title: 'Ship Changes',
    description: 'Complete git workflow: analyze changes, commit with AI-generated message, push, and create PR',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      message: z.string().optional().describe('Optional custom commit message (AI will generate if not provided)'),
      branch: z.string().optional().describe('Target branch name (AI will suggest if not provided)'),
      baseBranch: z.string().optional().describe('Base branch for PR (defaults to main/master)'),
      draft: z.boolean().optional().describe('Create PR as draft'),
      noPR: z.boolean().optional().describe('Skip PR creation, just commit and push'),
      noPush: z.boolean().optional().describe('Skip push, just stage and commit'),
      reviewers: z.array(z.string()).optional().describe('List of reviewers for the PR'),
      labels: z.array(z.string()).optional().describe('List of labels for the PR'),
      autoMerge: z.boolean().optional().describe('Enable auto-merge for the PR'),
      force: z.boolean().optional().describe('Force push and skip validations'),
      dryRun: z.boolean().optional().describe('Show what would be done without executing'),
      verbose: z.boolean().optional().describe('Show detailed technical information')
    },
  },
  {
    name: 'commit',
    title: 'Smart Commit',
    description: 'Create AI-powered conventional commit with staged changes',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      message: z.string().optional().describe('Custom commit message (AI will generate if not provided)'),
      files: z.array(z.string()).optional().describe('Specific files to stage and commit (stages all if not provided)'),
      type: z.enum(['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf', 'ci', 'build']).optional().describe('Conventional commit type'),
      scope: z.string().optional().describe('Conventional commit scope'),
      breaking: z.boolean().optional().describe('Mark as breaking change'),
      all: z.boolean().optional().describe('Stage all changes before committing'),
      dryRun: z.boolean().optional().describe('Show what would be committed without executing'),
      verbose: z.boolean().optional().describe('Show detailed technical information')
    },
  },
  {
    name: 'analyze',
    title: 'Analyze Changes',
    description: 'Analyze repository changes and provide insights about commits, diffs, and suggested actions',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      commitRange: z.string().optional().describe('Specific commit range to analyze (e.g., "main..HEAD")'),
      includeDiff: z.boolean().optional().describe('Include full diff in analysis'),
      contextFile: z.string().optional().describe('Additional context file to include in analysis'),
      verbose: z.boolean().optional().describe('Show detailed technical information')
    },
  },
  {
    name: 'suggest',
    title: 'AI Suggestions',
    description: 'Get AI suggestions for branch names, commit messages, or PR titles/descriptions',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      for: z.enum(['branch', 'commit', 'pr_title', 'pr_description']).describe('What to suggest'),
      context: z.string().optional().describe('Additional context for the suggestion'),
      diff: z.string().optional().describe('Git diff to base suggestions on'),
      files: z.array(z.string()).optional().describe('Specific files to focus suggestions on')
    },
  },
  {
    name: 'pr_draft',
    title: 'Draft PR',
    description: 'Generate pull request title and description based on recent commits and changes',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      commits: z.array(z.string()).optional().describe('List of commit messages to base PR on'),
      commitRange: z.string().optional().describe('Commit range to analyze for PR (e.g., "main..HEAD")'),
      includeDiff: z.boolean().optional().describe('Include diff analysis in PR description'),
      template: z.enum(['feature', 'bugfix', 'hotfix', 'docs', 'refactor', 'chore']).optional().describe('PR template to use'),
      contextFile: z.string().optional().describe('Additional context file (e.g., CHANGELOG.md, docs)')
    },
  },
  {
    name: 'status',
    title: 'Git Status',
    description: 'Get current repository status including branch info, changes, and platform details',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      verbose: z.boolean().optional().describe('Include detailed status information')
    },
  },
  {
    name: 'merge_local',
    title: 'Local Merge',
    description: 'Merge a feature branch into main locally and clean up the feature branch',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      branchName: z.string().describe('Name of the feature branch to merge'),
      baseBranch: z.string().optional().describe('Base branch to merge into (defaults to main)'),
      deleteAfter: z.boolean().optional().describe('Delete the feature branch after merge (default: true)'),
      confirm: z.boolean().describe('User confirmation to proceed with merge')
    },
  },
  {
    name: 'sync',
    title: 'Repository Sync',
    description: 'Synchronize with remote repository using fetch/pull with intelligent conflict handling',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      strategy: z.enum(['merge', 'rebase', 'fetch-only']).optional().describe('Synchronization strategy (default: merge)'),
      remote: z.string().optional().describe('Remote name (default: origin)'),
      branch: z.string().optional().describe('Branch to sync (default: current branch)'),
      autoResolve: z.enum(['ours', 'theirs', 'manual']).optional().describe('Automatic conflict resolution strategy'),
      force: z.boolean().optional().describe('Force synchronization (use with caution)')
    },
  },
  {
    name: 'stash',
    title: 'Git Stash Manager',
    description: 'Manage git stash for temporary storage of changes',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      action: z.enum(['push', 'pop', 'apply', 'drop', 'list']).describe('Stash action to perform'),
      message: z.string().optional().describe('Stash message (for push action)'),
      includeUntracked: z.boolean().optional().describe('Include untracked files in stash'),
      stashIndex: z.number().optional().describe('Stash index for pop/apply/drop actions')
    },
  },
  {
    name: 'reset',
    title: 'Git Reset',
    description: 'Reset repository state to undo changes with different modes',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      mode: z.enum(['soft', 'mixed', 'hard']).describe('Reset mode (soft=keep staged, mixed=unstage, hard=discard)'),
      target: z.string().optional().describe('Target commit/branch to reset to (default: HEAD)'),
      files: z.array(z.string()).optional().describe('Specific files to reset (optional)'),
      confirm: z.boolean().optional().describe('Confirmation for destructive operations')
    },
  },
  {
    name: 'rebase',
    title: 'Git Rebase',
    description: 'Rebase current branch onto another branch with conflict handling',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      onto: z.string().optional().describe('Branch to rebase onto'),
      interactive: z.boolean().optional().describe('Start interactive rebase'),
      action: z.enum(['start', 'continue', 'abort', 'skip']).optional().describe('Rebase action (default: start)'),
      autoResolve: z.enum(['ours', 'theirs', 'manual']).optional().describe('Automatic conflict resolution strategy')
    },
  },
  {
    name: 'recover',
    title: 'Git Recovery',
    description: 'Recover lost commits or changes using reflog and advanced git recovery',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      action: z.enum(['show-reflog', 'recover-commit', 'show-lost']).describe('Recovery action to perform'),
      commitHash: z.string().optional().describe('Commit hash to recover (for recover-commit action)'),
      limit: z.number().optional().describe('Number of reflog entries to show (default: 20)')
    },
  },
  {
    name: 'validate',
    title: 'Repository Validator',
    description: 'Validate repository integrity, health, and detect issues',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      deep: z.boolean().optional().describe('Perform deep validation including remote connectivity'),
      fix: z.boolean().optional().describe('Attempt to fix issues automatically')
    },
  },
  {
    name: 'info',
    title: 'GitPlus MCP Info',
    description: 'Get comprehensive information about GitPlus MCP server capabilities, tools, and usage',
    inputSchema: {
      repoPath: z.string().optional().describe('Full absolute path to the git repository (optional - provides repo-specific info if given)')
    },
  },
] as const;

export type ToolName = typeof toolDefinitions[number]['name'];

// Infer types from the inputSchema for type safety
export type ShipToolInput = z.infer<z.ZodObject<typeof toolDefinitions[0]['inputSchema']>>;
export type CommitToolInput = z.infer<z.ZodObject<typeof toolDefinitions[1]['inputSchema']>>;
export type AnalyzeToolInput = z.infer<z.ZodObject<typeof toolDefinitions[2]['inputSchema']>>;
export type SuggestToolInput = z.infer<z.ZodObject<typeof toolDefinitions[3]['inputSchema']>>;
export type PRDraftToolInput = z.infer<z.ZodObject<typeof toolDefinitions[4]['inputSchema']>>;
export type StatusToolInput = z.infer<z.ZodObject<typeof toolDefinitions[5]['inputSchema']>>;
export type MergeLocalToolInput = z.infer<z.ZodObject<typeof toolDefinitions[6]['inputSchema']>>;
export type SyncToolInput = z.infer<z.ZodObject<typeof toolDefinitions[7]['inputSchema']>>;
export type StashToolInput = z.infer<z.ZodObject<typeof toolDefinitions[8]['inputSchema']>>;
export type ResetToolInput = z.infer<z.ZodObject<typeof toolDefinitions[9]['inputSchema']>>;
export type RebaseToolInput = z.infer<z.ZodObject<typeof toolDefinitions[10]['inputSchema']>>;
export type RecoverToolInput = z.infer<z.ZodObject<typeof toolDefinitions[11]['inputSchema']>>;
export type ValidateToolInput = z.infer<z.ZodObject<typeof toolDefinitions[12]['inputSchema']>>;
export type InfoToolInput = z.infer<z.ZodObject<typeof toolDefinitions[13]['inputSchema']>>;