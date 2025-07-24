import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { GitStatus, CommitInfo, Platform } from '../types';

const execAsync = promisify(exec);

export interface GitCommandOptions {
  cwd?: string;
  timeout?: number;
}

export class GitClient {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Execute a git command and return the output
   */
  private async executeGitCommand(
    command: string,
    options: GitCommandOptions = {}
  ): Promise<string> {
    const { cwd = this.workingDirectory, timeout = 30000 } = options;
    
    try {
      const { stdout, stderr } = await execAsync(`git ${command}`, {
        cwd,
        timeout,
        encoding: 'utf8',
      });
      
      // Some git commands output to stderr (like status with colors)
      return stdout || stderr || '';
    } catch (error: any) {
      // Handle git command errors
      if (error.code === 'ENOENT') {
        throw new Error('Git is not installed or not found in PATH');
      }
      
      // Handle specific git warnings that shouldn't fail operations
      if (error.stderr && typeof error.stderr === 'string') {
        const stderr = error.stderr.toLowerCase();
        
        // Common git warnings that we can ignore or handle gracefully
        if (stderr.includes('no upstream branch') || 
            stderr.includes('set-upstream')) {
          // Return the stderr as output for upstream warnings
          return error.stderr;
        }
        
        if (stderr.includes('nothing to commit') || 
            stderr.includes('working tree clean')) {
          // Handle clean working tree
          return error.stdout || error.stderr;
        }
        
        if (stderr.includes('already exists') && command.includes('branch')) {
          // Branch already exists
          throw new Error(`Branch already exists: ${error.stderr}`);
        }
      }
      
      if (error.code === 128) {
        // Git command failed - provide more context
        const gitError = error.stderr || error.message;
        throw new Error(`Git command failed: ${gitError}`);
      }
      
      throw error;
    }
  }

  /**
   * Check if the current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.executeGitCommand('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current git status
   */
  async getStatus(): Promise<GitStatus> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) {
      throw new Error('Not a git repository');
    }

    // Get current branch
    const branch = await this.getCurrentBranch();
    
    // Get remote URL
    const remoteURL = await this.getRemoteURL();
    
    // Get status info
    const statusOutput = await this.executeGitCommand('status --porcelain');
    const { staged, unstaged, untracked } = this.parseStatusOutput(statusOutput);
    
    // Get ahead/behind info
    const { ahead, behind } = await this.getAheadBehind();
    
    // Determine base branch
    const baseBranch = await this.getBaseBranch();

    return {
      branch,
      baseBranch,
      isDirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
      staged,
      unstaged,
      untracked,
      ahead,
      behind,
      remoteURL,
      platform: this.detectPlatform(remoteURL),
    };
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const output = await this.executeGitCommand('rev-parse --abbrev-ref HEAD');
      return output.trim();
    } catch {
      return 'HEAD'; // Detached HEAD state
    }
  }

  /**
   * Get the remote URL
   */
  async getRemoteURL(): Promise<string> {
    try {
      const output = await this.executeGitCommand('remote get-url origin');
      return output.trim();
    } catch {
      return ''; // No remote or no origin
    }
  }

  /**
   * Get ahead/behind count compared to upstream
   */
  private async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      const output = await this.executeGitCommand('rev-list --count --left-right @{upstream}...HEAD');
      const [behind, ahead] = output.trim().split('\t').map(Number);
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * Determine the base branch (usually main or master)
   */
  private async getBaseBranch(): Promise<string> {
    try {
      // Try to get the default branch from remote
      const output = await this.executeGitCommand('symbolic-ref refs/remotes/origin/HEAD');
      const baseBranch = output.trim().replace('refs/remotes/origin/', '');
      return baseBranch;
    } catch {
      // Fallback: check if main or master exists
      try {
        await this.executeGitCommand('show-ref --verify --quiet refs/heads/main');
        return 'main';
      } catch {
        try {
          await this.executeGitCommand('show-ref --verify --quiet refs/heads/master');
          return 'master';
        } catch {
          return 'main'; // Default fallback
        }
      }
    }
  }

  /**
   * Parse git status --porcelain output
   */
  private parseStatusOutput(output: string): {
    staged: string[];
    unstaged: string[];
    untracked: string[];
  } {
    const lines = output.split('\n').filter(line => line.trim());
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;
      
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);
      
      // First character is staged, second is unstaged
      const stagedStatus = statusCode[0];
      const unstagedStatus = statusCode[1];
      
      if (stagedStatus === '?') {
        untracked.push(filePath);
      } else {
        if (stagedStatus !== ' ') {
          staged.push(filePath);
        }
        if (unstagedStatus !== ' ') {
          unstaged.push(filePath);
        }
      }
    }

    return { staged, unstaged, untracked };
  }

  /**
   * Detect git platform from remote URL
   */
  private detectPlatform(remoteURL: string): Platform {
    if (!remoteURL) return Platform.LocalOnly;
    
    const url = remoteURL.toLowerCase();
    if (url.includes('github.com')) {
      return Platform.GitHub;
    } else if (url.includes('gitlab.com') || url.includes('gitlab')) {
      return Platform.GitLab;
    } else {
      return Platform.LocalOnly;
    }
  }

  /**
   * Get commit history
   */
  async getCommitHistory(limit: number = 10, range?: string): Promise<CommitInfo[]> {
    const rangeArg = range || `HEAD~${limit}..HEAD`;
    const format = '--pretty=format:%H|%s|%an|%ad|%h';
    const command = `log ${format} --date=iso ${rangeArg}`;
    
    try {
      const output = await this.executeGitCommand(command);
      const lines = output.split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const [hash, message, author, date, shortHash] = line.split('|');
        return {
          hash: (hash || '').trim(),
          message: (message || '').trim(),
          author: (author || '').trim(),
          date: new Date((date || '').trim()),
          shortHash: (shortHash || '').trim(),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get git diff
   */
  async getDiff(options: {
    staged?: boolean;
    files?: string[];
    contextLines?: number;
  } = {}): Promise<string> {
    const { staged = false, files = [], contextLines = 3 } = options;
    
    let command = `diff -U${contextLines}`;
    if (staged) {
      command += ' --cached';
    }
    
    if (files.length > 0) {
      command += ` -- ${files.join(' ')}`;
    }
    
    try {
      return await this.executeGitCommand(command);
    } catch {
      return '';
    }
  }

  /**
   * Stage files
   */
  async add(files: string[] | 'all'): Promise<void> {
    const command = files === 'all' ? 'add -A' : `add ${files.join(' ')}`;
    await this.executeGitCommand(command);
  }

  /**
   * Create a commit
   */
  async commit(message: string, options: { amend?: boolean } = {}): Promise<void> {
    const { amend = false } = options;
    const command = amend ? `commit --amend -m "${message}"` : `commit -m "${message}"`;
    await this.executeGitCommand(command);
  }

  /**
   * Push changes to remote
   */
  async push(options: {
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
  } = {}): Promise<void> {
    const { branch, force = false, setUpstream = false } = options;
    
    let command = 'push';
    if (force) command += ' --force';
    if (setUpstream && branch) command += ` -u origin ${branch}`;
    
    await this.executeGitCommand(command);
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, checkout: boolean = true): Promise<void> {
    const command = checkout ? `checkout -b ${branchName}` : `branch ${branchName}`;
    await this.executeGitCommand(command);
  }

  /**
   * Switch to a branch
   */
  async checkout(branchName: string): Promise<void> {
    await this.executeGitCommand(`checkout ${branchName}`);
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.executeGitCommand('init');
  }

  /**
   * Merge a branch into the current branch
   */
  async merge(branchName: string, options: { noFf?: boolean; squash?: boolean } = {}): Promise<void> {
    let command = `merge ${branchName}`;
    if (options.noFf) command += ' --no-ff';
    if (options.squash) command += ' --squash';
    await this.executeGitCommand(command);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.executeGitCommand(`branch ${flag} ${branchName}`);
  }
}