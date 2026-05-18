import { promises as fs } from 'fs';
import { dirname, join } from 'path';

export type AgentInstallTarget = 'codex' | 'claude' | 'gemini' | 'all';
export type AgentName = Exclude<AgentInstallTarget, 'all'>;

export type InstallFileStatus = 'created' | 'updated' | 'unchanged';

export interface InstallFileResult {
  agent: AgentName;
  path: string;
  status: InstallFileStatus;
}

export interface InstallAgentKitOptions {
  repoPath: string;
  agent: AgentInstallTarget;
}

interface InstallSurface {
  agent: AgentName;
  relativePath: string;
  preamble?: string;
  content: string;
  markers: MarkerPair;
}

export interface MarkerPair {
  start: string;
  end: string;
}

const MARKDOWN_MARKERS: MarkerPair = {
  start: '<!-- gitplus-agent-kit:start -->',
  end: '<!-- gitplus-agent-kit:end -->',
};

const TOML_MARKERS: MarkerPair = {
  start: '# gitplus-agent-kit:start',
  end: '# gitplus-agent-kit:end',
};

const AGENT_ORDER: AgentName[] = ['codex', 'claude', 'gemini'];

export async function installAgentKit(options: InstallAgentKitOptions): Promise<InstallFileResult[]> {
  const agents = resolveAgents(options.agent);
  const results: InstallFileResult[] = [];

  for (const surface of getInstallSurfaces()) {
    if (!agents.includes(surface.agent)) {
      continue;
    }

    const absolutePath = join(options.repoPath, surface.relativePath);
    const status = await writeManagedBlock(absolutePath, surface.content, surface.markers, surface.preamble);

    results.push({
      agent: surface.agent,
      path: surface.relativePath,
      status,
    });
  }

  return results;
}

export async function writeManagedBlock(
  filePath: string,
  content: string,
  markers: MarkerPair = MARKDOWN_MARKERS,
  preamble?: string,
): Promise<InstallFileStatus> {
  const existing = await readFileIfExists(filePath);
  const managedBlock = formatManagedBlock(content, markers);
  const nextContent = upsertManagedBlock(existing, managedBlock, markers, preamble);

  if (existing === nextContent) {
    return 'unchanged';
  }

  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent, 'utf8');

  return existing === undefined ? 'created' : 'updated';
}

function resolveAgents(target: AgentInstallTarget): AgentName[] {
  return target === 'all' ? AGENT_ORDER : [target];
}

function getInstallSurfaces(): InstallSurface[] {
  return [
    {
      agent: 'codex',
      relativePath: 'AGENTS.md',
      content: codexInstructions(),
      markers: MARKDOWN_MARKERS,
    },
    {
      agent: 'codex',
      relativePath: '.agents/skills/gitplus/SKILL.md',
      preamble: gitplusSkillPreamble(),
      content: codexSkill(),
      markers: MARKDOWN_MARKERS,
    },
    {
      agent: 'claude',
      relativePath: 'CLAUDE.md',
      content: claudeInstructions(),
      markers: MARKDOWN_MARKERS,
    },
    {
      agent: 'claude',
      relativePath: '.claude/skills/gitplus/SKILL.md',
      preamble: gitplusSkillPreamble(),
      content: claudeSkill(),
      markers: MARKDOWN_MARKERS,
    },
    {
      agent: 'gemini',
      relativePath: 'GEMINI.md',
      content: geminiInstructions(),
      markers: MARKDOWN_MARKERS,
    },
    {
      agent: 'gemini',
      relativePath: '.gemini/commands/git/ship.toml',
      content: geminiShipCommand(),
      markers: TOML_MARKERS,
    },
  ];
}

function upsertManagedBlock(
  existing: string | undefined,
  managedBlock: string,
  markers: MarkerPair,
  preamble?: string,
): string {
  if (!existing) {
    return preamble ? `${ensureTrailingNewline(preamble)}${managedBlock}` : managedBlock;
  }

  const blockPattern = new RegExp(
    `${escapeRegExp(markers.start)}[\\s\\S]*?${escapeRegExp(markers.end)}\\n?`,
    'm',
  );

  if (blockPattern.test(existing)) {
    return ensureTrailingNewline(existing.replace(blockPattern, managedBlock));
  }

  return `${ensureTrailingNewline(existing)}\n${managedBlock}`;
}

function formatManagedBlock(content: string, markers: MarkerPair): string {
  return `${markers.start}\n${content.trim()}\n${markers.end}\n`;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sharedInstructions(agentLabel: string): string {
  const agentName = agentLabel.toLowerCase();

  return `## GitPlus Git Operations

When working in this repository as ${agentLabel}, use GitPlus for repository operations:

- Use \`npx @neublink/gitplus start --agent ${agentName} --task "<task>"\` before making changes so GitPlus can create an isolated worktree and run ledger.
- Use \`npx @neublink/gitplus status --verbose\` instead of raw \`git status\` for change review, branch context, and current run context.
- Use \`npx @neublink/gitplus claim <paths...>\` before editing files that may overlap with another agent's work.
- Use \`npx @neublink/gitplus checkpoint --summary "<what changed>" --test "<validation command>"\` to save meaningful work-in-progress states.
- Use \`npx @neublink/gitplus ship\` to create commits, push branches, and open pull requests.
- Avoid raw \`git commit\`, \`git push\`, and manual pull request creation except when recovering from a broken GitPlus operation.
- If recovery requires raw git commands, explain why in your final response and return to GitPlus commands afterward.`;
}

function codexInstructions(): string {
  return sharedInstructions('Codex');
}

function claudeInstructions(): string {
  return sharedInstructions('Claude');
}

function geminiInstructions(): string {
  return sharedInstructions('Gemini');
}

function gitplusSkillPreamble(): string {
  return `---
name: gitplus
description: Use GitPlus commands for repository start, status, checkpoint, and ship workflows.
---
`;
}

function codexSkill(): string {
  return `
# GitPlus

Use this skill whenever you need to inspect repository state, save a checkpoint, create commits, push branches, or open pull requests.

${sharedInstructions('Codex')}`;
}

function claudeSkill(): string {
  return `
# GitPlus

Use this skill whenever you need to inspect repository state, save a checkpoint, create commits, push branches, or open pull requests.

${sharedInstructions('Claude')}`;
}

function geminiShipCommand(): string {
  return `description = "Ship repository changes with GitPlus"
prompt = """
Use GitPlus for this repository workflow.

Run:
1. npx @neublink/gitplus start --agent gemini --task "<task>"
2. npx @neublink/gitplus status --verbose
3. npx @neublink/gitplus claim <paths...> before overlapping edits
4. npx @neublink/gitplus checkpoint --summary "<what changed>" --test "<validation command>" when useful
5. npx @neublink/gitplus ship

Avoid raw git commit, git push, and manual pull request creation except when recovering from a broken GitPlus operation. If recovery is required, explain why and return to GitPlus commands afterward.
"""`;
}
