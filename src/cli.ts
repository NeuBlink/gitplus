#!/usr/bin/env node

import { Command } from 'commander';
import prompts from 'prompts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GitClient } from './git/client';
import { ChangeAnalyzer } from './git/analyzer';
import { PlatformManager } from './git/platform';
import { handlePRConflictResolution } from './utils/conflictUtils';
import { Platform } from './types';

type AgentInitTarget = 'codex' | 'claude' | 'gemini' | 'all';
type CheckpointRisk = 'low' | 'medium' | 'high';

type AgentRuntimeModule = {
  AgentRuntime?: new (cwd?: string) => {
    createRun?: (options: {
      runId: string;
      agent: string;
      task: string;
      branch: string;
      baseBranch?: string;
      claimedPaths?: string[];
      risk?: string;
      status?: string;
    }) => Promise<unknown>;
    listRuns?: () => Promise<unknown[]>;
    getCurrentRun?: () => Promise<unknown | undefined>;
    updateRun?: (runId: string, update: {
      tests_run?: string[];
      risk?: string;
      status?: string;
    }) => Promise<unknown>;
    recordCheckpoint?: (runId: string, checkpoint: {
      summary: string;
      testsRun?: string[];
      risk?: string;
      status?: string;
    }) => Promise<unknown>;
    addPathClaims?: (runId: string, claimedPaths: string[]) => Promise<unknown>;
  };
  startRun?: (request: {
    agent: string;
    task: string;
    baseBranch?: string;
    branch?: string;
    cwd: string;
  }) => Promise<unknown> | unknown;
  start?: (request: {
    agent: string;
    task: string;
    baseBranch?: string;
    branch?: string;
    cwd: string;
  }) => Promise<unknown> | unknown;
  checkpoint?: (request: {
    summary: string;
    risk: CheckpointRisk;
    tests: string[];
    cwd: string;
  }) => Promise<unknown> | unknown;
  createCheckpoint?: (request: {
    summary: string;
    risk: CheckpointRisk;
    tests: string[];
    cwd: string;
  }) => Promise<unknown> | unknown;
  claim?: (request: { paths: string[]; cwd: string }) => Promise<unknown> | unknown;
  claimPaths?: (request: { paths: string[]; cwd: string }) => Promise<unknown> | unknown;
  getCurrentRun?: (request: { cwd: string }) => Promise<unknown> | unknown;
  currentRun?: (request: { cwd: string }) => Promise<unknown> | unknown;
};

type AgentInstallKitModule = {
  installAgentKit?: (request: {
    repoPath: string;
    agent: AgentInitTarget;
  }) => Promise<unknown> | unknown;
  initAgentRuntime?: (request: {
    agent: AgentInitTarget;
    cwd: string;
  }) => Promise<unknown> | unknown;
  init?: (request: {
    agent: AgentInitTarget;
    cwd: string;
  }) => Promise<unknown> | unknown;
};

// Get package version
function getPackageVersion(): string {
  try {
    const packageJsonPath = join(dirname(__dirname), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    return '1.0.3'; // fallback version
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

function loadOptionalModule<T>(moduleCandidates: string[]): T | undefined {
  for (const modulePath of moduleCandidates) {
    try {
      const loaded = require(modulePath);
      return (loaded.default || loaded) as T;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      const message = error instanceof Error ? error.message : '';
      if (code !== 'MODULE_NOT_FOUND' || !message.includes(modulePath)) {
        throw error;
      }
    }
  }
  return undefined;
}

function loadAgentRuntime(): AgentRuntimeModule | undefined {
  return loadOptionalModule<AgentRuntimeModule>([
    './agent/runtime',
    './runtime/agent',
    './runtime',
  ]);
}

function loadAgentInstallKit(): AgentInstallKitModule | undefined {
  return loadOptionalModule<AgentInstallKitModule>([
    './agent/install-kit',
    './agent/installKit',
    './install-kit/agent',
    './install-kit',
  ]);
}

function parseInitAgent(value: string): AgentInitTarget {
  if (value === 'codex' || value === 'claude' || value === 'gemini' || value === 'all') {
    return value;
  }
  throw new Error('Agent must be one of: codex, claude, gemini, all');
}

function parseRisk(value: string): CheckpointRisk {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  throw new Error('Risk must be one of: low, medium, high');
}

function printAgentRuntimeMissing(moduleName: 'runtime' | 'install kit') {
  output(`⚠️ GitPlus agent ${moduleName} module is not available in this workspace.`);
  output('Integration assumption: this CLI will call the agent-native runtime once its modules are added under src/agent, src/runtime, or src/install-kit.');
}

function printResult(result: unknown) {
  if (!result) {
    return;
  }

  if (typeof result === 'string') {
    output(result);
    return;
  }

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record['message'] === 'string') {
      output(record['message']);
      return;
    }
    output(JSON.stringify(result, null, 2));
  }
}

function createRunId(agent: string): string {
  const safeAgent = agent.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  return `${safeAgent}-${Date.now().toString(36)}`;
}

function createBranchName(agent: string, task: string): string {
  const safeAgent = agent.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  const safeTask = task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'task';
  return `gitplus/${safeAgent}/${safeTask}-${Date.now().toString(36)}`;
}

function getRunId(run: unknown): string | undefined {
  if (!run || typeof run !== 'object') {
    return undefined;
  }

  const record = run as Record<string, unknown>;
  const value = record['run_id'] || record['runId'] || record['id'];
  return typeof value === 'string' ? value : undefined;
}

function getRunTests(run: unknown): string[] {
  if (!run || typeof run !== 'object') {
    return [];
  }

  const record = run as Record<string, unknown>;
  const tests = record['tests_run'] || record['testsRun'] || record['tests'];
  return Array.isArray(tests) ? tests.filter((test): test is string => typeof test === 'string') : [];
}

async function getLatestAgentRun(runtime: AgentRuntimeModule, cwd: string): Promise<unknown | undefined> {
  const getCurrentRun = runtime.getCurrentRun || runtime.currentRun;
  if (getCurrentRun) {
    return getCurrentRun({ cwd });
  }

  if (!runtime.AgentRuntime) {
    return undefined;
  }

  const runtimeInstance = new runtime.AgentRuntime(cwd);
  if (runtimeInstance.getCurrentRun) {
    return runtimeInstance.getCurrentRun();
  }

  if (!runtimeInstance.listRuns) {
    return undefined;
  }

  const runs = await runtimeInstance.listRuns();
  const active = runs.filter(run => {
    if (!run || typeof run !== 'object') {
      return false;
    }
    const status = (run as Record<string, unknown>)['status'];
    return status === 'created' || status === 'running' || status === 'blocked';
  });

  const candidates = active.length > 0 ? active : runs;
  return candidates[candidates.length - 1];
}

function formatCurrentRun(run: unknown): string[] {
  if (!run || typeof run !== 'object') {
    return [];
  }

  const record = run as Record<string, unknown>;
  const lines = ['\nGitPlus Run:'];
  const fields: Array<[string, string[]]> = [
    ['ID', ['id', 'runId', 'run_id']],
    ['Agent', ['agent', 'agentName']],
    ['Task', ['task', 'summary']],
    ['Branch', ['branch']],
    ['Base', ['baseBranch', 'base', 'base_branch']],
    ['Status', ['status', 'state']],
  ];

  for (const [label, keys] of fields) {
    const value = keys.map(key => record[key]).find(field => field !== undefined && field !== null);
    if (value !== undefined && value !== null) {
      lines.push(`  - ${label}: ${String(value)}`);
    }
  }

  return lines.length > 1 ? lines : [];
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
                  const targetBranch = options.baseBranch || status.baseBranch;
                  const conflictResolution = await handlePRConflictResolution(
                    gitClient,
                    currentBranch,
                    targetBranch,
                    prResponse.url,
                    { verbose: options.verbose }
                  );
                  
                  steps.push(...conflictResolution.steps);
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

// Agent init command
program
  .command('init')
  .description('Initialize GitPlus agent-native runtime support')
  .requiredOption('--agent <agent>', 'Agent runtime to initialize (codex, claude, gemini, all)', parseInitAgent)
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);

      const installKit = loadAgentInstallKit();
      const initAgentRuntime = installKit?.initAgentRuntime || installKit?.init;
      const installAgentKit = installKit?.installAgentKit;

      if (!initAgentRuntime && !installAgentKit) {
        printAgentRuntimeMissing('install kit');
        return;
      }

      const cwd = gitClient.getWorkingDirectory();
      const result = installAgentKit
        ? await installAgentKit({ agent: options.agent, repoPath: cwd })
        : await initAgentRuntime!({ agent: options.agent, cwd });

      output(`✅ Initialized GitPlus agent runtime: ${options.agent}`);
      printResult(result);
    } catch (error) {
      handleError(error);
    }
  });

// Agent start command
program
  .command('start')
  .description('Start an agent-native GitPlus run')
  .requiredOption('--agent <name>', 'Agent runtime name')
  .requiredOption('--task <task>', 'Task for the agent run')
  .option('--base <branch>', 'Base branch for the agent run')
  .option('--branch <branch>', 'Working branch for the agent run')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);

      const runtime = loadAgentRuntime();
      const startRun = runtime?.startRun || runtime?.start;
      const AgentRuntime = runtime?.AgentRuntime;

      if (!startRun && !AgentRuntime) {
        printAgentRuntimeMissing('runtime');
        return;
      }

      const cwd = gitClient.getWorkingDirectory();
      const result = AgentRuntime
        ? await new AgentRuntime(cwd).createRun!({
            runId: createRunId(options.agent),
            agent: options.agent,
            task: options.task,
            baseBranch: options.base,
            branch: options.branch || createBranchName(options.agent, options.task),
            status: 'running',
          })
        : await startRun!({
            agent: options.agent,
            task: options.task,
            baseBranch: options.base,
            branch: options.branch,
            cwd,
          });

      output(`✅ Started GitPlus run for ${options.agent}`);
      printResult(result);
    } catch (error) {
      handleError(error);
    }
  });

// Agent checkpoint command
program
  .command('checkpoint')
  .description('Record an agent-native GitPlus checkpoint')
  .requiredOption('--summary <text>', 'Checkpoint summary')
  .option('--risk <risk>', 'Checkpoint risk (low, medium, high)', parseRisk, 'low')
  .option('--test <cmd...>', 'Validation command associated with this checkpoint')
  .action(async (options) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);

      const runtime = loadAgentRuntime();
      const checkpoint = runtime?.checkpoint || runtime?.createCheckpoint;
      const AgentRuntime = runtime?.AgentRuntime;

      if (!checkpoint && !AgentRuntime) {
        printAgentRuntimeMissing('runtime');
        return;
      }

      const cwd = gitClient.getWorkingDirectory();
      let result: unknown;
      if (AgentRuntime) {
        const runtimeInstance = new AgentRuntime(cwd);
        const currentRun = await getLatestAgentRun(runtime, cwd);
        const runId = getRunId(currentRun);
        if (!runId) {
          throw new Error('No current GitPlus run found. Start one with gitplus start first.');
        }

        if (runtimeInstance.recordCheckpoint) {
          result = await runtimeInstance.recordCheckpoint(runId, {
            summary: options.summary,
            risk: options.risk,
            status: 'running',
            testsRun: options.test || [],
          });
        } else if (runtimeInstance.updateRun) {
          result = await runtimeInstance.updateRun(runId, {
            risk: options.risk,
            status: 'running',
            tests_run: [...getRunTests(currentRun), ...(options.test || [])],
          });
        } else {
          throw new Error('GitPlus runtime cannot record checkpoints.');
        }
      } else {
        result = await checkpoint!({
          summary: options.summary,
          risk: options.risk,
          tests: options.test || [],
          cwd,
        });
      }

      output('✅ Recorded GitPlus checkpoint');
      if (AgentRuntime) {
        output(`Summary: ${options.summary}`);
      }
      printResult(result);
    } catch (error) {
      handleError(error);
    }
  });

// Agent claim command
program
  .command('claim <paths...>')
  .description('Claim ownership of paths for the current GitPlus run')
  .action(async (paths: string[]) => {
    try {
      const gitClient = new GitClient();
      await ensureGitRepository(gitClient);

      const runtime = loadAgentRuntime();
      const claimPaths = runtime?.claimPaths || runtime?.claim;
      const AgentRuntime = runtime?.AgentRuntime;

      if (!claimPaths && !AgentRuntime) {
        printAgentRuntimeMissing('runtime');
        return;
      }

      const cwd = gitClient.getWorkingDirectory();
      let result: unknown;
      if (AgentRuntime) {
        const runtimeInstance = new AgentRuntime(cwd);
        const currentRun = await getLatestAgentRun(runtime, cwd);
        const runId = getRunId(currentRun);
        if (!runId || !runtimeInstance.addPathClaims) {
          throw new Error('No current GitPlus run found. Start one with gitplus start first.');
        }
        result = await runtimeInstance.addPathClaims(runId, paths);
      } else {
        result = await claimPaths!({
          paths,
          cwd,
        });
      }

      output(`✅ Claimed ${paths.length} path${paths.length === 1 ? '' : 's'}`);
      printResult(result);
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

      const runtime = loadAgentRuntime();
      if (runtime) {
        try {
          const currentRun = await getLatestAgentRun(runtime, gitClient.getWorkingDirectory());
          const runLines = formatCurrentRun(currentRun);
          if (runLines.length > 0) {
            runLines.forEach(line => output(line));
          } else if (options.verbose) {
            output('\nGitPlus Run: none');
          }
        } catch (runError) {
          if (options.verbose) {
            output(`\nGitPlus Run: unavailable (${runError instanceof Error ? runError.message : 'unknown error'})`);
          }
        }
      } else if (options.verbose) {
        output('\nGitPlus Run: runtime module not available');
      }

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
