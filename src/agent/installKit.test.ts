import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installAgentKit } from './installKit';

describe('installAgentKit', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(join(tmpdir(), 'gitplus-install-kit-'));
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  test('writes Codex files idempotently', async () => {
    const firstInstall = await installAgentKit({ repoPath, agent: 'codex' });
    const agentsPath = join(repoPath, 'AGENTS.md');
    const skillPath = join(repoPath, '.agents/skills/gitplus/SKILL.md');
    const firstAgentsContent = await fs.readFile(agentsPath, 'utf8');
    const firstSkillContent = await fs.readFile(skillPath, 'utf8');

    const secondInstall = await installAgentKit({ repoPath, agent: 'codex' });
    const secondAgentsContent = await fs.readFile(agentsPath, 'utf8');
    const secondSkillContent = await fs.readFile(skillPath, 'utf8');

    expect(firstInstall).toEqual([
      { agent: 'codex', path: 'AGENTS.md', status: 'created' },
      { agent: 'codex', path: '.agents/skills/gitplus/SKILL.md', status: 'created' },
    ]);
    expect(secondInstall).toEqual([
      { agent: 'codex', path: 'AGENTS.md', status: 'unchanged' },
      { agent: 'codex', path: '.agents/skills/gitplus/SKILL.md', status: 'unchanged' },
    ]);
    expect(secondAgentsContent).toBe(firstAgentsContent);
    expect(secondSkillContent).toBe(firstSkillContent);
    expect(countOccurrences(secondAgentsContent, '<!-- gitplus-agent-kit:start -->')).toBe(1);
    expect(secondSkillContent.startsWith('---\nname: gitplus')).toBe(true);
    expect(countOccurrences(secondSkillContent, '<!-- gitplus-agent-kit:start -->')).toBe(1);
    expect(secondAgentsContent).toContain('GitPlus Agent Git Contract');
    expect(secondAgentsContent).toContain('npx @neublink/gitplus init-agent --agent codex');
    expect(secondAgentsContent).toContain('npx @neublink/gitplus ship');
    expect(secondAgentsContent).toContain('Parallel Agent Rules');
    expect(secondAgentsContent).toContain('Keep each agent on its own GitPlus worktree and branch');
    expect(secondAgentsContent).toContain('Avoid raw `git commit`, `git push`, and manual pull request creation');
  });

  test('updates an existing managed block while preserving surrounding content', async () => {
    const claudePath = join(repoPath, 'CLAUDE.md');
    await fs.writeFile(
      claudePath,
      [
        '# Existing Claude Instructions',
        '',
        '<!-- gitplus-agent-kit:start -->',
        'stale instructions',
        '<!-- gitplus-agent-kit:end -->',
        '',
        'Keep this project-specific note.',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = await installAgentKit({ repoPath, agent: 'claude' });
    const content = await fs.readFile(claudePath, 'utf8');

    expect(result).toContainEqual({ agent: 'claude', path: 'CLAUDE.md', status: 'updated' });
    expect(content).toContain('# Existing Claude Instructions');
    expect(content).toContain('Keep this project-specific note.');
    expect(content).not.toContain('stale instructions');
    expect(content).toContain('npx @neublink/gitplus checkpoint');
    expect(countOccurrences(content, '<!-- gitplus-agent-kit:start -->')).toBe(1);
    expect(countOccurrences(content, '<!-- gitplus-agent-kit:end -->')).toBe(1);
  });

  test('installs all agent surfaces with managed markers', async () => {
    const result = await installAgentKit({ repoPath, agent: 'all' });
    const installedPaths = result.map((entry) => entry.path);

    expect(installedPaths).toEqual([
      'AGENTS.md',
      '.agents/skills/gitplus/SKILL.md',
      'CLAUDE.md',
      '.claude/skills/gitplus/SKILL.md',
      'GEMINI.md',
      '.gemini/commands/git/ship.toml',
    ]);
    expect(result.every((entry) => entry.status === 'created')).toBe(true);

    const geminiCommand = await fs.readFile(join(repoPath, '.gemini/commands/git/ship.toml'), 'utf8');
    expect(geminiCommand).toContain('# gitplus-agent-kit:start');
    expect(geminiCommand).toContain('description = "Ship repository changes with GitPlus"');
    expect(geminiCommand).toContain('npx @neublink/gitplus start');
    expect(geminiCommand).toContain('Parallel Agent Rules');
    expect(countOccurrences(geminiCommand, '# gitplus-agent-kit:start')).toBe(1);
  });
});

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
