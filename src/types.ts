// Core types for gitplus MCP server

export enum Platform {
  Unknown = 'unknown',
  GitHub = 'github', 
  GitLab = 'gitlab',
  LocalOnly = 'local'
}

export interface GitStatus {
  branch: string;
  baseBranch: string;
  isDirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  remoteURL: string;
  platform: Platform;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
  shortHash: string;
}

export interface ChangeAnalysis {
  title: string;
  description: string;
  commitMessage: string;
  branchName: string;
  commits: CommitInfo[];
  filesChanged: string[];
  additions: number;
  deletions: number;
  changeType: string; // feat, fix, docs, etc.
  conventionalType: string;
}

export interface AIRequest {
  operation: string;
  context: string;
  diff: string;
  history: CommitInfo[];
  files: string[];
  options: Record<string, string>;
}

export interface AIResponse {
  content: string;
  metadata: Record<string, string>;
  reasoning: string;
}

export interface PRRequest {
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  draft: boolean;
  reviewers: string[];
  labels: string[];
  autoMerge: boolean;
}

export interface PRResponse {
  url: string;
  number: number;
  status: string;
  message: string;
}

export interface ShipParams {
  message?: string;
  branch?: string;
  baseBranch?: string;
  draft?: boolean;
  noPR?: boolean;
  noPush?: boolean;
  reviewers?: string[];
  labels?: string[];
  autoMerge?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface CommitParams {
  message?: string;
  files?: string[];
  type?: ConventionalCommitType;
  scope?: string;
  breaking?: boolean;
  all?: boolean;
  dryRun?: boolean;
}

export interface AnalyzeParams {
  commitRange?: string;
  includeDiff?: boolean;
  contextFile?: string;
}

export interface SuggestParams {
  for: 'branch' | 'commit' | 'pr_title' | 'pr_description';
  context?: string;
  diff?: string;
  files?: string[];
}

export interface PRDraftParams {
  commits?: string[];
  commitRange?: string;
  includeDiff?: boolean;
  template?: 'feature' | 'bugfix' | 'hotfix' | 'docs' | 'refactor' | 'chore';
  contextFile?: string;
}

export interface StatusParams {
  verbose?: boolean;
}

export type ConventionalCommitType = 
  | 'feat' 
  | 'fix' 
  | 'docs' 
  | 'style' 
  | 'refactor' 
  | 'test' 
  | 'chore' 
  | 'perf' 
  | 'ci' 
  | 'build';

// MCP Transport Types
export type MCPTransport = 'stdio' | 'http';

export interface MCPServerConfig {
  transport: MCPTransport;
  port?: number;
  host?: string;
}

// Config types
export interface Config {
  ai: AIConfig;
  git: GitConfig;
  platforms: PlatformConfig;
}

export interface AIConfig {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface GitConfig {
  commitLimit: number;
  diffContext: number;
  maxDiffSize: number;
  ignorePatterns: string[];
  conventionalCommits: boolean;
}

export interface PlatformConfig {
  github: GitHubConfig;
  gitlab: GitLabConfig;
}

export interface GitHubConfig {
  defaultReviewers: string[];
  labels: string[];
  draft: boolean;
  autoMerge: boolean;
  deleteBranch: boolean;
}

export interface GitLabConfig {
  defaultAssignee: string;
  mergeWhenPipelineSucceeds: boolean;
  removeSourceBranch: boolean;
  squashBeforeMerge: boolean;
}