import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { GitStatus, CommitInfo, Platform } from '../types';
import { ProjectDetector, ProjectType } from '../utils/projectDetector';
import { GitignoreManager } from '../utils/gitignoreManager';

const execAsync = promisify(exec);

export interface GitCommandOptions {
  cwd?: string;
  timeout?: number;
}

export class GitClient {
  private workingDirectory: string;
  private lastFetchTime: number = 0;
  private fetchCacheMs: number = 30000; // Cache fetch for 30 seconds

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Execute a git command and return the output
   */
  async executeGitCommand(
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
    
    try {
      // Handle SSH URLs like git@github.com:user/repo.git
      let normalizedUrl = remoteURL;
      if (remoteURL.startsWith('git@')) {
        const sshMatch = remoteURL.match(/git@([^:]+):(.+)/);
        if (sshMatch) {
          normalizedUrl = `https://${sshMatch[1]}/${sshMatch[2]}`;
        }
      }
      
      const url = new URL(normalizedUrl);
      const hostname = url.hostname.toLowerCase();
      
      if (hostname === 'github.com') {
        return Platform.GitHub;
      } else if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com')) {
        return Platform.GitLab;
      } else {
        return Platform.LocalOnly;
      }
    } catch (error) {
      // If URL parsing fails, fall back to safer string matching
      const cleanUrl = remoteURL.toLowerCase();
      if (cleanUrl.match(/^https?:\/\/github\.com\//)) {
        return Platform.GitHub;
      } else if (cleanUrl.match(/^https?:\/\/gitlab\.com\//)) {
        return Platform.GitLab;
      } else {
        return Platform.LocalOnly;
      }
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
   * Stage files with smart detection and .gitignore management
   */
  async add(files: string[] | 'all', options: { smart?: boolean } = {}): Promise<void> {
    const { smart = true } = options;

    if (files !== 'all') {
      // If specific files are provided, stage them directly
      const command = `add ${files.join(' ')}`;
      await this.executeGitCommand(command);
      return;
    }

    if (!smart) {
      // If smart staging is disabled, use the old behavior
      await this.executeGitCommand('add -A');
      return;
    }

    // Smart staging logic
    await this.smartStageFiles();
  }

  /**
   * Smart staging that auto-manages .gitignore and ignores build artifacts
   */
  private async smartStageFiles(): Promise<void> {
    // 1. Detect project type
    const detector = new ProjectDetector(this.workingDirectory);
    const projectInfo = detector.detectProjectType();

    // 2. Update .gitignore if needed
    const gitignoreManager = new GitignoreManager(this.workingDirectory);
    if (gitignoreManager.needsUpdate(projectInfo.primaryType, projectInfo.secondaryTypes)) {
      const updateResult = gitignoreManager.updateGitignore(projectInfo.primaryType, projectInfo.secondaryTypes);
      
      if (updateResult.created || updateResult.updated) {
        // Stage the updated .gitignore
        await this.executeGitCommand('add .gitignore');
      }
    }

    // 3. Get files to stage (exclude patterns)
    const ignorePatterns = gitignoreManager.getIgnorePatternsForStaging(
      projectInfo.primaryType,
      projectInfo.secondaryTypes
    );

    // 4. Get current repository status
    const status = await this.getStatus();
    const filesToStage = [
      ...status.unstaged,
      ...status.untracked
    ];

    // 5. Filter out files that should be ignored
    const smartFilesToStage = filesToStage.filter(file => 
      !this.shouldIgnoreFile(file, ignorePatterns)
    );

    // 6. Stage the filtered files
    if (smartFilesToStage.length > 0) {
      // Stage files in batches to avoid command line length limits
      const batchSize = 50;
      for (let i = 0; i < smartFilesToStage.length; i += batchSize) {
        const batch = smartFilesToStage.slice(i, i + batchSize);
        const escapedFiles = batch.map(file => `"${file}"`).join(' ');
        await this.executeGitCommand(`add ${escapedFiles}`);
      }
    }
  }

  /**
   * Check if a file should be ignored based on patterns
   */
  private shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
    for (const pattern of ignorePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a file path matches a gitignore pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Normalize the file path
    const normalizedPath = filePath.replace(/^\.\//, '');
    const normalizedPattern = pattern.replace(/^\.\//, '');

    // Handle directory patterns
    if (normalizedPattern.endsWith('/')) {
      const dirPattern = normalizedPattern.slice(0, -1);
      return normalizedPath.startsWith(dirPattern + '/') || normalizedPath === dirPattern;
    }

    // Convert gitignore pattern to regex
    let regexPattern = normalizedPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\\\*\\\*/g, '.*') // ** matches any path
      .replace(/\\\*/g, '[^/]*') // * matches anything except /
      .replace(/\\\?/g, '[^/]'); // ? matches single char except /

    // Check for exact match or path match
    const exactRegex = new RegExp(`^${regexPattern}$`);
    const pathRegex = new RegExp(`(^|/)${regexPattern}(/|$)`);

    return exactRegex.test(normalizedPath) || pathRegex.test(normalizedPath);
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

  /**
   * Ensure repository is up-to-date by fetching if needed
   */
  async ensureUpToDate(force: boolean = false): Promise<void> {
    const now = Date.now();
    
    // Skip if we fetched recently and not forced
    if (!force && (now - this.lastFetchTime) < this.fetchCacheMs) {
      return;
    }

    try {
      // Check if we have a remote before fetching
      const remoteURL = await this.getRemoteURL();
      if (remoteURL) {
        await this.fetch({ prune: true });
        this.lastFetchTime = now;
      }
    } catch (error) {
      // Don't fail if fetch fails - might be offline or no remote
      console.debug('Auto-fetch failed, continuing without fetch:', error);
    }
  }

  /**
   * Fetch updates from remote repository
   */
  async fetch(options: {
    remote?: string;
    branch?: string;
    all?: boolean;
    prune?: boolean;
  } = {}): Promise<string> {
    const { remote = 'origin', branch, all = false, prune = false } = options;
    
    let command = 'fetch';
    if (all) {
      command += ' --all';
    } else {
      command += ` ${remote}`;
      if (branch) {
        command += ` ${branch}`;
      }
    }
    
    if (prune) {
      command += ' --prune';
    }
    
    const result = await this.executeGitCommand(command);
    this.lastFetchTime = Date.now(); // Update fetch time
    return result;
  }

  /**
   * Pull changes from remote repository
   */
  async pull(options: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
    fastForwardOnly?: boolean;
    strategy?: 'merge' | 'rebase';
  } = {}): Promise<{ success: boolean; output: string; conflicts?: string[] }> {
    const { 
      remote = 'origin', 
      branch, 
      rebase = false, 
      fastForwardOnly = false,
      strategy = 'merge'
    } = options;
    
    let command = 'pull';
    
    if (strategy === 'rebase' || rebase) {
      command += ' --rebase';
    }
    
    if (fastForwardOnly) {
      command += ' --ff-only';
    }
    
    command += ` ${remote}`;
    if (branch) {
      command += ` ${branch}`;
    }
    
    try {
      const output = await this.executeGitCommand(command);
      return { success: true, output };
    } catch (error: any) {
      // Handle merge conflicts
      if (error.message && error.message.toLowerCase().includes('conflict')) {
        const conflicts = await this.getConflictedFiles();
        return { 
          success: false, 
          output: error.message, 
          conflicts 
        };
      }
      throw error;
    }
  }

  /**
   * Get the synchronization status between local and remote branches
   */
  async getSyncStatus(branch?: string): Promise<{
    localBranch: string;
    remoteBranch: string;
    ahead: number;
    behind: number;
    diverged: boolean;
    upToDate: boolean;
    needsPull: boolean;
    needsPush: boolean;
    hasUpstream: boolean;
  }> {
    const currentBranch = branch || await this.getCurrentBranch();
    const remoteBranch = `origin/${currentBranch}`;
    
    try {
      // Check if upstream exists
      const upstreamCheck = await this.executeGitCommand(`rev-parse --verify ${remoteBranch}`);
      const hasUpstream = !!upstreamCheck;
      
      if (!hasUpstream) {
        return {
          localBranch: currentBranch,
          remoteBranch,
          ahead: 0,
          behind: 0,
          diverged: false,
          upToDate: false,
          needsPull: false,
          needsPush: false,
          hasUpstream: false
        };
      }
      
      // Get ahead/behind counts
      const { ahead, behind } = await this.getAheadBehind();
      const diverged = ahead > 0 && behind > 0;
      const upToDate = ahead === 0 && behind === 0;
      const needsPull = behind > 0;
      const needsPush = ahead > 0;
      
      return {
        localBranch: currentBranch,
        remoteBranch,
        ahead,
        behind,
        diverged,
        upToDate,
        needsPull,
        needsPush,
        hasUpstream: true
      };
      
    } catch (error) {
      return {
        localBranch: currentBranch,
        remoteBranch,
        ahead: 0,
        behind: 0,
        diverged: false,
        upToDate: false,
        needsPull: false,
        needsPush: false,
        hasUpstream: false
      };
    }
  }

  /**
   * Get list of files with merge conflicts
   */
  async getConflictedFiles(): Promise<string[]> {
    try {
      const output = await this.executeGitCommand('diff --name-only --diff-filter=U');
      return output.split('\n').filter(line => line.trim().length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Check if repository has merge conflicts
   */
  async hasConflicts(): Promise<boolean> {
    const conflicts = await this.getConflictedFiles();
    return conflicts.length > 0;
  }

  /**
   * Resolve conflicts by accepting a strategy for all files
   */
  async resolveConflicts(strategy: 'ours' | 'theirs' | 'manual' | 'ai-smart' | 'ai-safe' | 'ai-review'): Promise<{
    success: boolean;
    resolvedFiles: string[];
    remainingConflicts: string[];
    reasoning?: string;
    confidence?: number;
    warnings?: string[];
  }> {
    const conflictedFiles = await this.getConflictedFiles();
    
    if (conflictedFiles.length === 0) {
      return { success: true, resolvedFiles: [], remainingConflicts: [] };
    }
    
    const resolvedFiles: string[] = [];
    const remainingConflicts: string[] = [];
    
    if (strategy === 'manual') {
      return {
        success: false,
        resolvedFiles: [],
        remainingConflicts: conflictedFiles
      };
    }
    
    // Handle AI-powered strategies
    if (strategy.startsWith('ai-')) {
      return await this.resolveConflictsWithAI(strategy as 'ai-smart' | 'ai-safe' | 'ai-review', conflictedFiles);
    }
    
    // Handle basic strategies (ours/theirs)
    for (const file of conflictedFiles) {
      try {
        const command = strategy === 'ours' 
          ? `checkout --ours "${file}"` 
          : `checkout --theirs "${file}"`;
        
        await this.executeGitCommand(command);
        await this.add([file]);
        resolvedFiles.push(file);
      } catch (error) {
        remainingConflicts.push(file);
      }
    }
    
    return {
      success: remainingConflicts.length === 0,
      resolvedFiles,
      remainingConflicts
    };
  }

  /**
   * Resolve conflicts using AI-powered strategies
   */
  private async resolveConflictsWithAI(
    strategy: 'ai-smart' | 'ai-safe' | 'ai-review', 
    conflictedFiles: string[]
  ): Promise<{
    success: boolean;
    resolvedFiles: string[];
    remainingConflicts: string[];
    reasoning?: string;
    confidence?: number;
    warnings?: string[];
  }> {
    try {
      // Import AIService dynamically to avoid circular dependencies
      const { AIService } = await import('../ai/service');
      const aiService = new AIService();
      
      // Check if AI is available
      const isAvailable = await aiService.isAvailable();
      if (!isAvailable) {
        console.log('AI service not available, falling back to "ours" strategy');
        return await this.fallbackToBasicStrategy(conflictedFiles, 'ours');
      }
      
      // Extract conflict data
      const conflictData = await this.extractConflictData(conflictedFiles);
      
      // Get AI analysis
      const resolution = await aiService.analyzeAndResolveConflicts(conflictData);
      
      if (!resolution) {
        console.log('AI conflict analysis failed, falling back to "ours" strategy');
        return await this.fallbackToBasicStrategy(conflictedFiles, 'ours');
      }
      
      // Apply strategy-specific logic
      const shouldAutoResolve = this.shouldAutoResolve(strategy, resolution.confidence);
      
      if (!shouldAutoResolve || resolution.strategy === 'escalate') {
        return {
          success: false,
          resolvedFiles: [],
          remainingConflicts: conflictedFiles,
          reasoning: resolution.reasoning,
          confidence: resolution.confidence,
          warnings: resolution.warnings
        };
      }
      
      // Apply AI resolution
      const resolved = await this.applyAIResolution(resolution);
      
      return {
        success: resolved.success,
        resolvedFiles: resolved.resolvedFiles,
        remainingConflicts: resolved.remainingConflicts,
        reasoning: resolution.reasoning,
        confidence: resolution.confidence,
        warnings: resolution.warnings
      };
      
    } catch (error) {
      console.error('AI conflict resolution error:', error);
      return await this.fallbackToBasicStrategy(conflictedFiles, 'ours');
    }
  }
  
  /**
   * Determine if AI resolution should be automatically applied based on strategy and confidence
   */
  private shouldAutoResolve(strategy: string, confidence: number): boolean {
    switch (strategy) {
      case 'ai-smart':
        return confidence >= 70; // Medium confidence threshold
      case 'ai-safe':
        return confidence >= 85; // High confidence threshold
      case 'ai-review':
        return false; // Always require manual review
      default:
        return false;
    }
  }
  
  /**
   * Apply AI resolution to conflicted files
   */
  private async applyAIResolution(resolution: any): Promise<{
    success: boolean;
    resolvedFiles: string[];
    remainingConflicts: string[];
  }> {
    const resolvedFiles: string[] = [];
    const remainingConflicts: string[] = [];
    
    try {
      // Write resolved content to files
      const fs = await import('fs').then(m => m.promises);
      
      for (const resolvedFile of resolution.resolvedFiles) {
        try {
          await fs.writeFile(resolvedFile.path, resolvedFile.content, 'utf8');
          await this.add([resolvedFile.path]);
          resolvedFiles.push(resolvedFile.path);
        } catch (error) {
          console.error(`Failed to apply resolution to ${resolvedFile.path}:`, error);
          remainingConflicts.push(resolvedFile.path);
        }
      }
      
      // Add any unresolved files to remaining conflicts
      remainingConflicts.push(...resolution.unresolved);
      
      return {
        success: remainingConflicts.length === 0,
        resolvedFiles,
        remainingConflicts
      };
      
    } catch (error) {
      console.error('Failed to apply AI resolution:', error);
      return {
        success: false,
        resolvedFiles,
        remainingConflicts: resolution.resolvedFiles.map((f: any) => f.path).concat(resolution.unresolved)
      };
    }
  }
  
  /**
   * Extract detailed conflict data for AI analysis
   */
  private async extractConflictData(conflictedFiles: string[]): Promise<any> {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    
    const conflictSections = [];
    const commits = await this.getCommitHistory(5);
    const currentBranch = await this.getCurrentBranch();
    const baseBranch = await this.getBaseBranch();
    
    for (const file of conflictedFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const sections = this.parseConflictMarkers(content, file);
        conflictSections.push(...sections);
      } catch (error) {
        console.error(`Failed to read conflict file ${file}:`, error);
      }
    }
    
    return {
      files: conflictedFiles,
      conflictSections,
      branch: currentBranch,
      baseBranch,
      commits: commits.map(c => ({
        hash: c.hash,
        message: c.message,
        author: c.author
      })),
      fileTypes: conflictedFiles.map(f => path.extname(f)).filter(ext => ext)
    };
  }
  
  /**
   * Parse git conflict markers in file content
   */
  private parseConflictMarkers(content: string, filePath: string): any[] {
    const lines = content.split('\n');
    const sections = [];
    let currentSection: any = null;
    let lineNumber = 0;
    
    for (const line of lines) {
      lineNumber++;
      
      if (line.startsWith('<<<<<<<')) {
        // Start of conflict
        currentSection = {
          file: filePath,
          startLine: lineNumber,
          oursContent: '',
          theirsContent: '',
          context: ''
        };
      } else if (line === '=======' && currentSection) {
        // Switch from ours to theirs
        currentSection.inTheirs = true;
      } else if (line.startsWith('>>>>>>>') && currentSection) {
        // End of conflict
        currentSection.endLine = lineNumber;
        
        // Add context around the conflict (5 lines before and after)
        const contextStart = Math.max(0, currentSection.startLine - 6);
        const contextEnd = Math.min(lines.length, currentSection.endLine + 5);
        currentSection.context = lines.slice(contextStart, contextEnd).join('\n');
        
        sections.push(currentSection);
        currentSection = null;
      } else if (currentSection) {
        // Add content to current section
        if (currentSection.inTheirs) {
          currentSection.theirsContent += line + '\n';
        } else {
          currentSection.oursContent += line + '\n';
        }
      }
    }
    
    return sections;
  }
  
  /**
   * Fallback to basic conflict resolution strategy
   */
  private async fallbackToBasicStrategy(
    conflictedFiles: string[], 
    strategy: 'ours' | 'theirs'
  ): Promise<{
    success: boolean;
    resolvedFiles: string[];
    remainingConflicts: string[];
    reasoning?: string;
  }> {
    const resolvedFiles: string[] = [];
    const remainingConflicts: string[] = [];
    
    for (const file of conflictedFiles) {
      try {
        const command = strategy === 'ours' 
          ? `checkout --ours "${file}"` 
          : `checkout --theirs "${file}"`;
        
        await this.executeGitCommand(command);
        await this.add([file]);
        resolvedFiles.push(file);
      } catch (error) {
        remainingConflicts.push(file);
      }
    }
    
    return {
      success: remainingConflicts.length === 0,
      resolvedFiles,
      remainingConflicts,
      reasoning: `Fallback to ${strategy} strategy (AI unavailable)`
    };
  }

  /**
   * Abort an ongoing merge
   */
  async abortMerge(): Promise<void> {
    await this.executeGitCommand('merge --abort');
  }

  /**
   * Continue a merge after resolving conflicts
   */
  async continueMerge(): Promise<void> {
    await this.executeGitCommand('merge --continue');
  }

  /**
   * Check if a merge is in progress
   */
  async isMergeInProgress(): Promise<boolean> {
    try {
      await this.executeGitCommand('rev-parse --verify MERGE_HEAD');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rebase current branch onto another branch
   */
  async rebase(options: {
    onto: string;
    interactive?: boolean;
    abort?: boolean;
    continue?: boolean;
    skip?: boolean;
  }): Promise<{ success: boolean; output: string; conflicts?: string[] }> {
    const { onto, interactive = false, abort = false, continue: cont = false, skip = false } = options;
    
    let command = 'rebase';
    
    if (abort) {
      command += ' --abort';
    } else if (cont) {
      command += ' --continue';
    } else if (skip) {
      command += ' --skip';
    } else {
      if (interactive) {
        command += ' --interactive';
      }
      command += ` ${onto}`;
    }
    
    try {
      const output = await this.executeGitCommand(command);
      return { success: true, output };
    } catch (error: any) {
      if (error.message && error.message.toLowerCase().includes('conflict')) {
        const conflicts = await this.getConflictedFiles();
        return { 
          success: false, 
          output: error.message, 
          conflicts 
        };
      }
      throw error;
    }
  }

  /**
   * Check if a rebase is in progress
   */
  async isRebaseInProgress(): Promise<boolean> {
    try {
      await this.executeGitCommand('rev-parse --verify REBASE_HEAD');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stash changes
   */
  async stash(options: {
    message?: string;
    includeUntracked?: boolean;
    keepIndex?: boolean;
    pop?: boolean;
    apply?: boolean;
    drop?: boolean;
    list?: boolean;
    stashIndex?: number;
  } = {}): Promise<string> {
    const { 
      message, 
      includeUntracked = false, 
      keepIndex = false,
      pop = false,
      apply = false,
      drop = false,
      list = false,
      stashIndex
    } = options;

    let command = 'stash';

    if (list) {
      command += ' list';
    } else if (pop) {
      command += ' pop';
      if (stashIndex !== undefined) {
        command += ` stash@{${stashIndex}}`;
      }
    } else if (apply) {
      command += ' apply';
      if (stashIndex !== undefined) {
        command += ` stash@{${stashIndex}}`;
      }
    } else if (drop) {
      command += ' drop';
      if (stashIndex !== undefined) {
        command += ` stash@{${stashIndex}}`;
      }
    } else {
      // Default stash push
      command += ' push';
      if (message) {
        command += ` -m "${message}"`;
      }
      if (includeUntracked) {
        command += ' --include-untracked';
      }
      if (keepIndex) {
        command += ' --keep-index';
      }
    }

    return await this.executeGitCommand(command);
  }

  /**
   * Reset repository state
   */
  async reset(options: {
    mode: 'soft' | 'mixed' | 'hard';
    target?: string;
    files?: string[];
  }): Promise<void> {
    const { mode, target = 'HEAD', files = [] } = options;

    if (files.length > 0) {
      // Reset specific files
      const command = `reset ${target} -- ${files.join(' ')}`;
      await this.executeGitCommand(command);
    } else {
      // Reset to commit
      const command = `reset --${mode} ${target}`;
      await this.executeGitCommand(command);
    }
  }

  /**
   * Cherry-pick commits
   */
  async cherryPick(options: {
    commits: string[];
    abort?: boolean;
    continue?: boolean;
    quit?: boolean;
    noCommit?: boolean;
  }): Promise<{ success: boolean; output: string; conflicts?: string[] }> {
    const { commits, abort = false, continue: cont = false, quit = false, noCommit = false } = options;

    let command = 'cherry-pick';

    if (abort) {
      command += ' --abort';
    } else if (cont) {
      command += ' --continue';
    } else if (quit) {
      command += ' --quit';
    } else {
      if (noCommit) {
        command += ' --no-commit';
      }
      command += ` ${commits.join(' ')}`;
    }

    try {
      const output = await this.executeGitCommand(command);
      return { success: true, output };
    } catch (error: any) {
      if (error.message && error.message.toLowerCase().includes('conflict')) {
        const conflicts = await this.getConflictedFiles();
        return { 
          success: false, 
          output: error.message, 
          conflicts 
        };
      }
      throw error;
    }
  }

  /**
   * Get reflog entries
   */
  async getReflog(limit: number = 20): Promise<Array<{
    hash: string;
    shortHash: string;
    action: string;
    message: string;
  }>> {
    try {
      const output = await this.executeGitCommand(`reflog --oneline -n ${limit}`);
      const lines = output.split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const match = line.match(/^([a-f0-9]+)\s+(.+?):\s*(.*)$/);
        if (match) {
          const [, shortHash, action, message] = match;
          return {
            hash: shortHash || '',
            shortHash: shortHash || '',
            action: action || '',
            message: message || ''
          };
        }
        return {
          hash: '',
          shortHash: '',
          action: '',
          message: line
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Clean untracked files and directories
   */
  async clean(options: {
    dryRun?: boolean;
    force?: boolean;
    directories?: boolean;
    ignored?: boolean;
  } = {}): Promise<string> {
    const { dryRun = false, force = false, directories = false, ignored = false } = options;

    let command = 'clean';
    
    if (dryRun) {
      command += ' --dry-run';
    }
    if (force) {
      command += ' --force';
    }
    if (directories) {
      command += ' -d';
    }
    if (ignored) {
      command += ' -x';
    }

    return await this.executeGitCommand(command);
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(): Promise<{
    totalCommits: number;
    totalBranches: number;
    totalTags: number;
    repositorySize: string;
    lastCommitDate: Date | null;
  }> {
    try {
      const [commitCount, branchCount, tagCount, lastCommit] = await Promise.all([
        this.executeGitCommand('rev-list --count HEAD').catch(() => '0'),
        this.executeGitCommand('branch -a --format="%(refname:short)"').then(out => out.split('\n').filter(b => b.trim()).length).catch(() => 0),
        this.executeGitCommand('tag -l').then(out => out.split('\n').filter(t => t.trim()).length).catch(() => 0),
        this.executeGitCommand('log -1 --format="%ad" --date=iso-strict').catch(() => '')
      ]);
      
      const repoSize = await this.executeGitCommand('count-objects -vH').catch(() => '');
      const sizeMatch = repoSize.match(/size-pack\s+(\S+)/);
      
      return {
        totalCommits: parseInt(commitCount.trim()) || 0,
        totalBranches: branchCount,
        totalTags: tagCount,
        repositorySize: (sizeMatch && sizeMatch[1]) ? sizeMatch[1] : 'unknown',
        lastCommitDate: lastCommit ? new Date(lastCommit.trim()) : null
      };
    } catch {
      return {
        totalCommits: 0,
        totalBranches: 0,
        totalTags: 0,
        repositorySize: 'unknown',
        lastCommitDate: null
      };
    }
  }

  /**
   * Validate repository integrity
   */
  async validateRepository(): Promise<{
    isValid: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if .git directory exists and is valid
      await this.executeGitCommand('rev-parse --git-dir');
    } catch {
      issues.push('Invalid git repository - .git directory missing or corrupted');
      return { isValid: false, issues, warnings };
    }

    try {
      // Check for uncommitted changes
      const status = await this.getStatus();
      if (status.isDirty) {
        warnings.push('Repository has uncommitted changes');
      }

      // Check for merge conflicts
      const hasConflicts = await this.hasConflicts();
      if (hasConflicts) {
        issues.push('Repository has unresolved merge conflicts');
      }

      // Check for ongoing operations
      const mergeInProgress = await this.isMergeInProgress();
      const rebaseInProgress = await this.isRebaseInProgress();
      
      if (mergeInProgress) {
        warnings.push('Merge operation in progress');
      }
      if (rebaseInProgress) {
        warnings.push('Rebase operation in progress');
      }

      // Check remote connectivity
      try {
        await this.fetch({ all: true });
      } catch {
        warnings.push('Unable to connect to remote repositories');
      }

    } catch (error) {
      issues.push(`Repository validation failed: ${error}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Get the working directory path
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}