import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

export type AgentRunStatus =
  | 'created'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunRisk = 'unknown' | 'low' | 'medium' | 'high';

export interface AgentRunCheckpoint {
  summary: string;
  commit?: string;
  tests_run: string[];
  risk: AgentRunRisk;
  created_at: string;
}

export interface AgentRunRecord {
  run_id: string;
  agent: string;
  task: string;
  base_branch: string;
  base_sha: string;
  branch: string;
  worktree: string;
  claimed_paths: string[];
  commits: string[];
  checkpoints: AgentRunCheckpoint[];
  tests_run: string[];
  risk: AgentRunRisk;
  status: AgentRunStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRunOptions {
  runId: string;
  agent: string;
  task: string;
  branch: string;
  baseBranch?: string;
  claimedPaths?: string[];
  risk?: AgentRunRisk;
  status?: AgentRunStatus;
}

export type AgentRunUpdate = Partial<
  Pick<AgentRunRecord, 'commits' | 'checkpoints' | 'tests_run' | 'risk' | 'status' | 'task' | 'agent'>
>;

export interface AgentRunCheckpointOptions {
  summary: string;
  testsRun?: string[];
  risk?: AgentRunRisk;
  status?: AgentRunStatus;
}

interface GitResult {
  stdout: string;
  stderr: string;
}

interface CurrentRunPointer {
  run_id: string;
  ledger_root: string;
}

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CURRENT_RUN_FILE = 'current-run.json';

export class AgentRuntime {
  constructor(private readonly cwd: string = process.cwd()) {}

  async locateRepoRoot(startDir: string = this.cwd): Promise<string> {
    const result = await this.git(['rev-parse', '--show-toplevel'], { cwd: startDir });
    return path.normalize(result.stdout.trim());
  }

  async createRun(options: CreateAgentRunOptions): Promise<AgentRunRecord> {
    const runId = validateRunId(options.runId);
    const repoRoot = await this.locateRepoRoot();
    const baseBranch = options.baseBranch ?? await this.getCurrentBranch(repoRoot);
    const baseSha = await this.getBaseSha(repoRoot, baseBranch);
    const branch = await this.validateBranchName(options.branch, repoRoot);
    const gitplusDir = path.join(repoRoot, '.gitplus');
    const runsDir = path.join(gitplusDir, 'runs');
    const worktreesDir = path.join(gitplusDir, 'worktrees');
    const worktree = path.join(worktreesDir, runId);
    const recordPath = this.getRunRecordPath(gitplusDir, runId);

    await fs.mkdir(runsDir, { recursive: true });
    await fs.mkdir(worktreesDir, { recursive: true });

    if (await exists(recordPath)) {
      throw new Error(`Agent run already exists: ${runId}`);
    }

    await this.git(['worktree', 'add', '-b', branch, worktree, baseSha], { cwd: repoRoot });

    const timestamp = new Date().toISOString();
    const record: AgentRunRecord = {
      run_id: runId,
      agent: options.agent,
      task: options.task,
      base_branch: baseBranch,
      base_sha: baseSha,
      branch,
      worktree,
      claimed_paths: normalizeClaimedPaths(options.claimedPaths ?? []),
      commits: [],
      checkpoints: [],
      tests_run: [],
      risk: options.risk ?? 'unknown',
      status: options.status ?? 'created',
      created_at: timestamp,
      updated_at: timestamp
    };

    await writeJsonAtomic(recordPath, record);
    await this.writeCurrentRunPointer(worktree, {
      run_id: runId,
      ledger_root: gitplusDir
    });
    return record;
  }

  async readRun(runId: string): Promise<AgentRunRecord> {
    const gitplusDir = await this.getGitPlusDir();
    const recordPath = this.getRunRecordPath(gitplusDir, validateRunId(runId));
    return readRunRecord(recordPath);
  }

  async listRuns(): Promise<AgentRunRecord[]> {
    const gitplusDir = await this.getGitPlusDir();
    const runsDir = path.join(gitplusDir, 'runs');

    if (!await exists(runsDir)) {
      return [];
    }

    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => readRunRecord(path.join(runsDir, entry.name)))
    );

    return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async updateRun(runId: string, update: AgentRunUpdate): Promise<AgentRunRecord> {
    const gitplusDir = await this.getGitPlusDir();
    const recordPath = this.getRunRecordPath(gitplusDir, validateRunId(runId));
    const current = await readRunRecord(recordPath);
    const next: AgentRunRecord = {
      ...current,
      ...update,
      updated_at: new Date().toISOString()
    };

    await writeJsonAtomic(recordPath, next);
    return next;
  }

  async addPathClaims(runId: string, claimedPaths: string[]): Promise<AgentRunRecord> {
    const gitplusDir = await this.getGitPlusDir();
    const recordPath = this.getRunRecordPath(gitplusDir, validateRunId(runId));
    const current = await readRunRecord(recordPath);
    const merged = new Set([...current.claimed_paths, ...normalizeClaimedPaths(claimedPaths)]);
    const next: AgentRunRecord = {
      ...current,
      claimed_paths: [...merged].sort(),
      updated_at: new Date().toISOString()
    };

    await writeJsonAtomic(recordPath, next);
    return next;
  }

  async getCurrentRun(): Promise<AgentRunRecord | undefined> {
    const pointer = await this.readCurrentRunPointer();
    if (pointer) {
      return this.readRun(pointer.run_id);
    }

    const runs = await this.listRuns();
    const active = runs.filter(run => ['created', 'running', 'blocked'].includes(run.status));
    const candidates = active.length > 0 ? active : runs;
    return candidates[candidates.length - 1];
  }

  async recordCheckpoint(
    runId: string,
    options: AgentRunCheckpointOptions
  ): Promise<AgentRunRecord> {
    const current = await this.readRun(runId);
    const testsRun = normalizeTests([...current.tests_run, ...(options.testsRun ?? [])]);
    const checkpointCommit = await this.getHeadSha();
    const commits = checkpointCommit && checkpointCommit !== current.base_sha
      ? [...new Set([...current.commits, checkpointCommit])]
      : current.commits;
    const risk = options.risk ?? current.risk;
    const checkpoint: AgentRunCheckpoint = {
      summary: options.summary,
      commit: checkpointCommit,
      tests_run: options.testsRun ?? [],
      risk,
      created_at: new Date().toISOString()
    };

    return this.updateRun(runId, {
      commits,
      checkpoints: [...current.checkpoints, checkpoint],
      tests_run: testsRun,
      risk,
      status: options.status ?? 'running'
    });
  }

  private async getCurrentBranch(repoRoot: string): Promise<string> {
    const result = await this.git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
    const branch = result.stdout.trim();

    if (!branch || branch === 'HEAD') {
      throw new Error('Cannot infer base branch from detached HEAD; pass baseBranch explicitly');
    }

    return branch;
  }

  private async getBaseSha(repoRoot: string, baseBranch: string): Promise<string> {
    const result = await this.git(['rev-parse', '--verify', '--end-of-options', `${baseBranch}^{commit}`], { cwd: repoRoot });
    return result.stdout.trim();
  }

  private async validateBranchName(branch: string, repoRoot: string): Promise<string> {
    if (!branch || branch.trim() !== branch) {
      throw new Error('Branch name must be a non-empty trimmed string');
    }

    await this.git(['check-ref-format', '--branch', branch], { cwd: repoRoot });
    return branch;
  }

  private async getHeadSha(): Promise<string | undefined> {
    try {
      const repoRoot = await this.locateRepoRoot();
      const result = await this.git(['rev-parse', '--verify', 'HEAD'], { cwd: repoRoot });
      return result.stdout.trim();
    } catch {
      return undefined;
    }
  }

  private async getGitPlusDir(): Promise<string> {
    const repoRoot = await this.locateRepoRoot();
    const localGitPlusDir = path.join(repoRoot, '.gitplus');
    const localRunsDir = path.join(localGitPlusDir, 'runs');

    if (await exists(localRunsDir)) {
      return localGitPlusDir;
    }

    const pointer = await this.readCurrentRunPointer(repoRoot);
    return pointer?.ledger_root ?? localGitPlusDir;
  }

  private async readCurrentRunPointer(repoRoot?: string): Promise<CurrentRunPointer | undefined> {
    const root = repoRoot ?? await this.locateRepoRoot();
    const pointerPath = path.join(root, '.gitplus', CURRENT_RUN_FILE);

    if (!await exists(pointerPath)) {
      return undefined;
    }

    const raw = await fs.readFile(pointerPath, 'utf8');
    const pointer = JSON.parse(raw) as CurrentRunPointer;
    if (!pointer.run_id || !path.isAbsolute(pointer.ledger_root)) {
      throw new Error(`Invalid GitPlus current run pointer: ${pointerPath}`);
    }

    return pointer;
  }

  private async writeCurrentRunPointer(worktree: string, pointer: CurrentRunPointer): Promise<void> {
    const gitplusDir = path.join(worktree, '.gitplus');
    await fs.mkdir(gitplusDir, { recursive: true });
    await writeJsonAtomic(path.join(gitplusDir, CURRENT_RUN_FILE), pointer);
  }

  private getRunRecordPath(gitplusDir: string, runId: string): string {
    return path.join(gitplusDir, 'runs', `${runId}.json`);
  }

  private git(args: string[], options: { cwd: string }): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(new Error(`git ${args.join(' ')} failed with exit code ${code}: ${stderr.trim()}`));
      });
    });
  }
}

export async function locateRepoRoot(startDir: string = process.cwd()): Promise<string> {
  return new AgentRuntime(startDir).locateRepoRoot(startDir);
}

export function validateRunId(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId) || runId.includes('..')) {
    throw new Error(`Invalid agent run id: ${runId}`);
  }

  return runId;
}

function normalizeClaimedPaths(claimedPaths: string[]): string[] {
  const normalized = claimedPaths.map(claimedPath => {
    if (!claimedPath || path.isAbsolute(claimedPath)) {
      throw new Error(`Claimed path must be repo-relative: ${claimedPath}`);
    }

    const normalizedPath = path.posix.normalize(claimedPath.replace(/\\/g, '/'));
    if (normalizedPath === '.' || normalizedPath.startsWith('../') || normalizedPath === '..') {
      throw new Error(`Claimed path must stay inside the repository: ${claimedPath}`);
    }

    return normalizedPath;
  });

  return [...new Set(normalized)].sort();
}

function normalizeTests(tests: string[]): string[] {
  return [...new Set(tests.filter(test => test.trim().length > 0))];
}

async function readRunRecord(recordPath: string): Promise<AgentRunRecord> {
  const raw = await fs.readFile(recordPath, 'utf8');
  const parsed = JSON.parse(raw) as AgentRunRecord;
  return {
    ...parsed,
    checkpoints: parsed.checkpoints ?? []
  };
}

async function writeJsonAtomic<T>(filePath: string, value: T): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
