import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentRuntime, locateRepoRoot } from './runtime';

async function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
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
        resolve(stdout);
        return;
      }

      reject(new Error(`git ${args.join(' ')} failed with exit code ${code}: ${stderr}`));
    });
  });
}

async function createTempRepo(): Promise<string> {
  const repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gitplus-runtime-')));
  await runGit(repo, ['init', '-b', 'main']);
  await runGit(repo, ['config', 'user.name', 'GitPlus Test']);
  await runGit(repo, ['config', 'user.email', 'gitplus@example.test']);
  await fs.writeFile(path.join(repo, 'README.md'), '# Test\n', 'utf8');
  await runGit(repo, ['add', 'README.md']);
  await runGit(repo, ['commit', '-m', 'initial commit']);
  return repo;
}

describe('AgentRuntime', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it('locates the repository root from a nested directory', async () => {
    const nested = path.join(repo, 'src', 'agent');
    await fs.mkdir(nested, { recursive: true });

    await expect(locateRepoRoot(nested)).resolves.toBe(repo);
  });

  it('creates a run ledger and matching git worktree', async () => {
    const runtime = new AgentRuntime(repo);
    const baseSha = (await runGit(repo, ['rev-parse', 'HEAD'])).trim();

    const record = await runtime.createRun({
      runId: 'run-001',
      agent: 'codex',
      task: 'implement runtime',
      branch: 'agent/run-001',
      claimedPaths: ['src/agent/runtime.ts', 'src/agent/../agent/runtime.test.ts'],
      risk: 'medium'
    });

    expect(record).toMatchObject({
      run_id: 'run-001',
      agent: 'codex',
      task: 'implement runtime',
      base_branch: 'main',
      base_sha: baseSha,
      branch: 'agent/run-001',
      claimed_paths: ['src/agent/runtime.test.ts', 'src/agent/runtime.ts'],
      commits: [],
      checkpoints: [],
      tests_run: [],
      risk: 'medium',
      status: 'created'
    });
    expect(record.worktree).toBe(path.join(repo, '.gitplus', 'worktrees', 'run-001'));

    const ledgerPath = path.join(repo, '.gitplus', 'runs', 'run-001.json');
    const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
    expect(ledger).toEqual(record);

    const worktreeHead = (await runGit(record.worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    expect(worktreeHead).toBe('agent/run-001');

    const currentRunPointer = JSON.parse(
      await fs.readFile(path.join(record.worktree, '.gitplus', 'current-run.json'), 'utf8')
    );
    expect(currentRunPointer).toEqual({
      run_id: 'run-001',
      ledger_root: path.join(repo, '.gitplus')
    });
  });

  it('lists, reads, updates, and adds path claims', async () => {
    const runtime = new AgentRuntime(repo);
    await runtime.createRun({
      runId: 'run-002',
      agent: 'codex',
      task: 'initial task',
      branch: 'agent/run-002'
    });

    const updated = await runtime.updateRun('run-002', {
      status: 'running',
      tests_run: ['npm test -- runtime'],
      commits: ['abc123'],
      risk: 'low'
    });
    expect(updated.status).toBe('running');
    expect(updated.tests_run).toEqual(['npm test -- runtime']);

    const claimed = await runtime.addPathClaims('run-002', [
      'src/agent/runtime.ts',
      'src/agent/runtime.ts',
      'src/agent/runtime.test.ts'
    ]);
    expect(claimed.claimed_paths).toEqual([
      'src/agent/runtime.test.ts',
      'src/agent/runtime.ts'
    ]);

    await expect(runtime.readRun('run-002')).resolves.toEqual(claimed);
    await expect(runtime.listRuns()).resolves.toHaveLength(1);
  });

  it('resolves the current run and records checkpoints from the agent worktree', async () => {
    const runtime = new AgentRuntime(repo);
    const record = await runtime.createRun({
      runId: 'run-004',
      agent: 'codex',
      task: 'checkpoint from worktree',
      branch: 'agent/run-004'
    });

    await fs.writeFile(path.join(record.worktree, 'runtime.md'), 'checkpoint\n', 'utf8');
    await runGit(record.worktree, ['add', 'runtime.md']);
    await runGit(record.worktree, ['commit', '-m', 'checkpoint']);

    const worktreeRuntime = new AgentRuntime(record.worktree);
    await expect(worktreeRuntime.getCurrentRun()).resolves.toMatchObject({
      run_id: 'run-004',
      worktree: record.worktree
    });

    const checkpoint = await worktreeRuntime.recordCheckpoint('run-004', {
      summary: 'added runtime checkpoint',
      testsRun: ['npm test -- runtime'],
      risk: 'low'
    });

    expect(checkpoint.checkpoints).toHaveLength(1);
    expect(checkpoint.checkpoints[0]).toMatchObject({
      summary: 'added runtime checkpoint',
      tests_run: ['npm test -- runtime'],
      risk: 'low'
    });
    expect(checkpoint.tests_run).toEqual(['npm test -- runtime']);
    expect(checkpoint.commits).toHaveLength(1);
    await expect(runtime.readRun('run-004')).resolves.toEqual(checkpoint);
  });

  it('rejects unsafe run ids and claimed paths', async () => {
    const runtime = new AgentRuntime(repo);

    await expect(runtime.createRun({
      runId: '../escape',
      agent: 'codex',
      task: 'bad run',
      branch: 'agent/bad'
    })).rejects.toThrow('Invalid agent run id');

    await expect(runtime.createRun({
      runId: 'run-003',
      agent: 'codex',
      task: 'bad claim',
      branch: 'agent/run-003',
      claimedPaths: ['../outside']
    })).rejects.toThrow('Claimed path must stay inside the repository');
  });
});
