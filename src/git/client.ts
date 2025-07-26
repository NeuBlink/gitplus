import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { GitStatus, CommitInfo, Platform, ConflictSection, ConflictResolutionResult, ConflictData, ErrorInfo, GitCommandResult, CorruptionDetectionResult, RecoveryOptions } from '../types';
import { ProjectDetector, ProjectType } from '../utils/projectDetector';
import { GitignoreManager } from '../utils/gitignoreManager';
import type { ConflictResolution } from '../ai/service';
import { CorruptionRecoveryCoordinator } from './corruptionRecoveryCoordinator';
import { SecurityValidationResult, validateGitPath } from '../utils/pathSecurity';
import { ErrorRecoveryGuide } from './errorRecoveryGuide';

const execAsync = promisify(exec);

export interface GitCommandOptions {
  cwd?: string;
  timeout?: number;
}

export class GitClient {
  private workingDirectory: string;
  private lastFetchTime: number = 0;
  private fetchCacheMs: number = 30000; // Cache fetch for 30 seconds
  private isSecurityValidated: boolean = false;
  private securityValidationResult?: SecurityValidationResult;
  private recoveryCoordinator: CorruptionRecoveryCoordinator;
  private corruptionCheckEnabled: boolean = true;
  private lastCorruptionCheck: number = 0;
  private corruptionCheckInterval: number = 300000; // 5 minutes
  private errorRecoveryGuide: ErrorRecoveryGuide;

  constructor(workingDirectory: string = process.cwd()) {
    // SECURITY: Store path without validation initially - validation happens on first operation
    // This allows for async validation while maintaining backward compatibility
    this.workingDirectory = workingDirectory;
    this.recoveryCoordinator = new CorruptionRecoveryCoordinator(workingDirectory);
    this.errorRecoveryGuide = new ErrorRecoveryGuide();
  }

  /**
   * SECURITY: Validate the working directory path before any git operations
   * This method must be called before any git operations to ensure security
   */
  private async validateWorkingDirectory(): Promise<void> {
    if (this.isSecurityValidated) {
      return; // Already validated
    }

    try {
      const validationResult = await validateGitPath(this.workingDirectory);
      
      if (!validationResult.isValid) {
        const violations = validationResult.violations.join(', ');
        throw new Error(`Security validation failed for working directory: ${violations}`);
      }
      
      // Update to use canonical path
      this.workingDirectory = validationResult.canonicalPath;
      this.securityValidationResult = validationResult;
      this.isSecurityValidated = true;
      
      // Log security warnings
      if (validationResult.warnings.length > 0) {
        console.warn('[GitClient Security] Working directory warnings:', validationResult.warnings);
      }
      
    } catch (error) {
      throw new Error(`Failed to validate working directory security: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * SECURITY: Comprehensive input validation and sanitization for git arguments
   * Prevents shell injection, command injection, and directory traversal attacks
   */
  private validateGitArgument(arg: string, context: 'command' | 'argument' | 'filepath' | 'message' = 'argument'): string {
    if (typeof arg !== 'string') {
      throw new Error('Git argument must be a string');
    }
    
    // Validate argument length
    const maxLengths = {
      command: 50,
      argument: 255,
      filepath: 4096,
      message: 2048
    };
    
    if (arg.length > maxLengths[context]) {
      throw new Error(`Git ${context} exceeds maximum length (${maxLengths[context]} characters)`);
    }
    
    // Check for null bytes (command injection vector)
    if (arg.includes('\0')) {
      throw new Error('Git argument contains null byte');
    }
    
    // Context-specific validation
    switch (context) {
      case 'command':
        return this.validateGitCommand(arg);
      case 'filepath':
        return this.validateFilePath(arg);
      case 'message':
        return this.validateCommitMessage(arg);
      default:
        return this.validateGenericArgument(arg);
    }
  }
  
  /**
   * SECURITY: Validate git command names against whitelist
   */
  private validateGitCommand(command: string): string {
    // Strict whitelist of allowed git commands
    const allowedCommands = new Set([
      'add', 'branch', 'checkout', 'commit', 'diff', 'fetch', 'log', 'merge',
      'pull', 'push', 'rebase', 'reset', 'status', 'stash', 'show-ref', 
      'rev-parse', 'rev-list', 'cherry-pick', 'reflog', 'clean', 'count-objects',
      'symbolic-ref', 'remote', 'init', 'tag', 'config'
    ]);
    
    // Extract base command (first word)
    const parts = command.trim().toLowerCase().split(/\s+/);
    const baseCommand = parts[0];
    
    if (!baseCommand || !allowedCommands.has(baseCommand)) {
      throw new Error(`Git command not allowed: ${baseCommand || 'empty'}`);
    }
    
    // Validate command format - no shell metacharacters
    if (/[;&|`$(){}[\]<>\n\r]/.test(command)) {
      throw new Error('Git command contains shell metacharacters');
    }
    
    return command;
  }
  
  /**
   * SECURITY: Validate file paths to prevent directory traversal and injection
   */
  private validateFilePath(filepath: string): string {
    // Check for directory traversal
    if (/\.\.[\\/]/.test(filepath) || filepath.includes('../') || filepath.includes('..\\')) {
      throw new Error('File path contains directory traversal sequence');
    }
    
    // Check for absolute paths outside working directory (security risk)
    if (filepath.startsWith('/') && !filepath.startsWith(this.workingDirectory)) {
      throw new Error('Absolute file paths outside working directory not allowed');
    }
    
    // Check for shell metacharacters in paths
    if (/[;&|`$(){}[\]<>\n\r]/.test(filepath)) {
      throw new Error('File path contains shell metacharacters');
    }
    
    return filepath;
  }
  
  /**
   * SECURITY: Validate commit messages for injection attacks
   */
  private validateCommitMessage(message: string): string {
    if (!message || message.trim().length === 0) {
      throw new Error('Commit message cannot be empty');
    }
    
    // Check for command injection patterns
    if (/[;&|`$(){}[\]<>]/.test(message)) {
      throw new Error('Commit message contains shell metacharacters');
    }
    
    // Check for control characters
    if (/[\x00-\x08\x0E-\x1F\x7F]/.test(message)) {
      throw new Error('Commit message contains control characters');
    }
    
    return message;
  }
  
  /**
   * SECURITY: Validate generic git arguments
   */
  private validateGenericArgument(arg: string): string {
    // Check for shell metacharacters
    if (/[;&|`$(){}[\]<>\n\r]/.test(arg)) {
      throw new Error('Git argument contains shell metacharacters');
    }
    
    // Prevent arguments that start with dashes (could be git options)
    if (/^-/.test(arg)) {
      throw new Error('Git argument starts with dash (potential option injection)');
    }
    
    return arg;
  }

  /**
   * SECURITY: Build safe git command arguments for spawn() execution
   * Returns array of validated arguments - NEVER concatenates to strings
   */
  private buildSecureGitArgs(command: string, args: string[] = []): string[] {
    // Validate command
    const validatedCommand = this.validateGitArgument(command, 'command');
    
    // Parse command into parts
    const commandParts = validatedCommand.trim().split(/\s+/);
    
    // Validate all arguments
    const validatedArgs = args.map(arg => this.validateGitArgument(arg, 'argument'));
    
    // Return as separate array elements (secure for spawn)
    return [...commandParts, ...validatedArgs];
  }

  /**
   * SECURITY: Execute git command using spawn for complete shell injection protection
   */
  private async executeGitCommandWithSpawn(
    executable: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`Git command timed out after ${options.timeout}ms`));
      }, options.timeout);

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutHandle);
        
        if (timedOut) return; // Already handled by timeout
        
        if (code !== 0 && !stdout) {
          reject(new Error(`Git command failed (exit code ${code}): ${stderr || 'No error message'}`));
          return;
        }

        // Some git commands output to stderr (like status with colors)
        resolve(stdout || stderr || '');
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          reject(error);
        }
      });
    });
  }

  /**
   * SECURITY: Execute git commands with explicit argument separation
   * This method provides maximum security by using spawn with argument arrays
   */
  async executeSecureGitCommand(command: string, args: string[] = []): Promise<string> {
    const secureArgs = this.buildSecureGitArgs(command, args);
    return this.executeGitCommandWithSpawn('git', secureArgs, {
      cwd: this.workingDirectory,
      timeout: 30000
    });
  }

  /**
   * SECURITY: Execute git command with comprehensive security controls
   * 
   * @param command - The git command to execute (without 'git' prefix)
   * @param options - Optional configuration for command execution
   * @param options.cwd - Working directory for the command (defaults to repo directory)  
   * @param options.timeout - Command timeout in milliseconds (defaults to 30s)
   * @returns Promise resolving to command output
   * @throws {Error} If git is not installed, command fails, or timeout occurs
   * 
   * @example
   * ```typescript
   * const output = await gitClient.executeGitCommand('status --porcelain');
   * const commits = await gitClient.executeGitCommand('log --oneline -5');
   * ```
   */
  async executeGitCommand(
    command: string,
    options: GitCommandOptions = {}
  ): Promise<string> {
    // SECURITY: Validate working directory before ANY git operations
    await this.validateWorkingDirectory();
    
    const { cwd = this.workingDirectory, timeout = 30000 } = options;
    
    // SECURITY: If a custom cwd is provided, validate it as well
    if (options.cwd && options.cwd !== this.workingDirectory) {
      const cwdValidation = await validateGitPath(options.cwd, this.workingDirectory);
      if (!cwdValidation.isValid) {
        throw new Error(`Security validation failed for custom working directory: ${cwdValidation.violations.join(', ')}`);
      }
    }
    
    try {
      // SECURITY: Build secure argument array - NO string concatenation
      const secureArgs = this.buildSecureGitArgs(command, []);
      const result = await this.executeGitCommandWithSpawn('git', secureArgs, { cwd, timeout });
      return result;
    } catch (error: unknown) {
      // Handle git command errors with enhanced recovery guidance
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error('Git is not installed or not found in PATH');
      }
      
      const errorMessage = this.extractErrorMessage(error);
      
      // Handle specific git warnings that shouldn't fail operations
      if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string') {
        const stderr = error.stderr.toLowerCase();
        
        // Common git warnings that we can ignore or handle gracefully
        if (stderr.includes('no upstream branch') || 
            stderr.includes('set-upstream')) {
          return (error as any).stderr;
        }
        
        if (stderr.includes('nothing to commit') || 
            stderr.includes('working tree clean')) {
          return (error as any).stdout || (error as any).stderr;
        }
        
        if (stderr.includes('already exists') && command.includes('branch')) {
          throw new Error(`Branch already exists: ${(error as any).stderr}`);
        }
      }
      
      // Check if this might be corruption-related
      const corruptionCheck = this.errorRecoveryGuide.isCorruptionIndicator(errorMessage);
      
      if (corruptionCheck.isCorruption) {
        // Provide enhanced error message with recovery guidance
        const analysis = this.errorRecoveryGuide.analyzeError(errorMessage);
        const userFriendlyMessage = this.errorRecoveryGuide.generateUserFriendlyErrorMessage(
          errorMessage,
          analysis.guidance
        );
        
        // Create enhanced error with recovery information
        const enhancedError = new Error(userFriendlyMessage);
        (enhancedError as any).originalError = error;
        (enhancedError as any).recoveryGuidance = analysis.guidance;
        (enhancedError as any).quickFixes = this.errorRecoveryGuide.getQuickFixes(errorMessage);
        (enhancedError as any).isCorruption = true;
        (enhancedError as any).corruptionType = corruptionCheck.corruptionType;
        
        throw enhancedError;
      }
      
      // For non-corruption errors, still provide basic guidance
      if (error && typeof error === 'object' && 'code' in error && error.code === 128) {
        const analysis = this.errorRecoveryGuide.analyzeError(errorMessage);
        const quickFixes = this.errorRecoveryGuide.getQuickFixes(errorMessage);
        
        let enhancedMessage = `Git command failed: ${errorMessage}`;
        if (quickFixes.length > 0) {
          enhancedMessage += `\n\nQuick fixes to try:\n${quickFixes.map(fix => `  • ${fix}`).join('\n')}`;
        }
        
        const enhancedError = new Error(enhancedMessage);
        (enhancedError as any).originalError = error;
        (enhancedError as any).quickFixes = quickFixes;
        
        throw enhancedError;
      }
      
      throw error;
    }
  }

  /**
   * Check if the current directory is a git repository
   * 
   * @returns Promise resolving to true if directory contains a valid git repository
   * 
   * @example
   * ```typescript
   * if (await gitClient.isGitRepository()) {
   *   console.log('This is a git repository');
   * }
   * ```
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
   * Get comprehensive git repository status including staged, unstaged, and untracked files
   * 
   * @returns Promise resolving to complete git status information
   * @throws {Error} If not in a git repository
   * 
   * @example
   * ```typescript
   * const status = await gitClient.getStatus();
   * console.log(`Current branch: ${status.branch}`);
   * console.log(`Files staged: ${status.staged.length}`);
   * console.log(`Repository is ${status.isDirty ? 'dirty' : 'clean'}`);
   * ```
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
   * SECURITY: Get commit history with validated parameters
   */
  async getCommitHistory(limit: number = 10, range?: string): Promise<CommitInfo[]> {
    // SECURITY: Validate limit
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error('Invalid commit history limit');
    }
    
    const args: string[] = ['log'];
    args.push('--pretty=format:%H|%s|%an|%ad|%h');
    args.push('--date=iso');
    
    if (range) {
      // SECURITY: Validate range argument
      const validatedRange = this.validateGitArgument(range, 'argument');
      args.push(validatedRange);
    } else {
      args.push(`HEAD~${limit}..HEAD`);
    }
    
    try {
      const command = args[0];
      if (!command) {
        throw new Error('No git command specified');
      }
      const output = await this.executeSecureGitCommand(command, args.slice(1));
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
   * SECURITY: Get git diff with validated arguments
   */
  async getDiff(options: {
    staged?: boolean;
    files?: string[];
    contextLines?: number;
  } = {}): Promise<string> {
    const { staged = false, files = [], contextLines = 3 } = options;
    
    // SECURITY: Validate context lines
    if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 100) {
      throw new Error('Invalid context lines value');
    }
    
    const args: string[] = ['diff', `-U${contextLines}`];
    
    if (staged) {
      args.push('--cached');
    }
    
    if (files.length > 0) {
      // SECURITY: Validate file paths
      const validatedFiles = files.map(file => this.validateGitArgument(file, 'filepath'));
      args.push('--', ...validatedFiles);
    }
    
    try {
      const command = args[0];
      if (!command) {
        throw new Error('No git command specified');
      }
      return await this.executeSecureGitCommand(command, args.slice(1));
    } catch {
      return '';
    }
  }

  /**
   * SECURITY: Stage files with smart detection and secure argument handling
   */
  async add(files: string[] | 'all', options: { smart?: boolean } = {}): Promise<void> {
    const { smart = true } = options;

    if (files !== 'all') {
      // SECURITY: Validate and stage specific files using argument arrays
      const validatedFiles = files.map(file => this.validateGitArgument(file, 'filepath'));
      await this.executeSecureGitCommand('add', validatedFiles);
      return;
    }

    if (!smart) {
      // If smart staging is disabled, use secure version
      await this.executeSecureGitCommand('add', ['-A']);
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

    // 6. SECURITY: Stage files using secure argument arrays
    if (smartFilesToStage.length > 0) {
      // Stage files in batches to avoid command line length limits
      const batchSize = 50;
      for (let i = 0; i < smartFilesToStage.length; i += batchSize) {
        const batch = smartFilesToStage.slice(i, i + batchSize);
        
        // SECURITY: Validate all file paths and use argument arrays
        const validatedFiles = batch.map(file => this.validateGitArgument(file, 'filepath'));
        await this.executeSecureGitCommand('add', validatedFiles);
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
   * SECURITY: Create a git commit with comprehensive input validation
   * 
   * @param message - The commit message (must be non-empty, max 2048 characters)
   * @param options - Optional commit configuration
   * @param options.amend - Whether to amend the previous commit instead of creating new one
   * @throws {Error} If message is invalid or commit fails
   * 
   * @example
   * ```typescript
   * await gitClient.commit('feat: add user authentication');
   * await gitClient.commit('fix: resolve merge conflict', { amend: true });
   * ```
   */
  async commit(message: string, options: { amend?: boolean } = {}): Promise<void> {
    const { amend = false } = options;
    
    // SECURITY: Comprehensive message validation
    const validatedMessage = this.validateGitArgument(message, 'message');
    
    // SECURITY: Build secure argument array - no string interpolation
    const args = amend 
      ? ['commit', '--amend', '-m', validatedMessage] 
      : ['commit', '-m', validatedMessage];
    
    await this.executeGitCommandWithSpawn('git', args, {
      cwd: this.workingDirectory,
      timeout: 30000
    });
  }

  /**
   * SECURITY: Push changes to remote with secure argument handling
   */
  async push(options: {
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
  } = {}): Promise<void> {
    const { branch, force = false, setUpstream = false } = options;
    
    const args: string[] = ['push'];
    
    if (force) {
      args.push('--force');
    }
    
    if (setUpstream && branch) {
      // SECURITY: Validate branch name
      const validatedBranch = this.validateGitArgument(branch, 'argument');
      args.push('-u', 'origin', validatedBranch);
    }
    
    const command = args[0];
    if (!command) {
      throw new Error('No git command specified');
    }
    await this.executeSecureGitCommand(command, args.slice(1));
  }

  /**
   * SECURITY: Create a new branch with validated name
   */
  async createBranch(branchName: string, checkout: boolean = true): Promise<void> {
    // SECURITY: Validate branch name
    const validatedBranchName = this.validateGitArgument(branchName, 'argument');
    
    if (checkout) {
      await this.executeSecureGitCommand('checkout', ['-b', validatedBranchName]);
    } else {
      await this.executeSecureGitCommand('branch', [validatedBranchName]);
    }
  }

  /**
   * SECURITY: Switch to a branch with validated name
   */
  async checkout(branchName: string): Promise<void> {
    const validatedBranchName = this.validateGitArgument(branchName, 'argument');
    await this.executeSecureGitCommand('checkout', [validatedBranchName]);
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
   * SECURITY: Delete a branch with validated name
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const validatedBranchName = this.validateGitArgument(branchName, 'argument');
    const flag = force ? '-D' : '-d';
    await this.executeSecureGitCommand('branch', [flag, validatedBranchName]);
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
      // Log auto-fetch failure (only in development)
      if (process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true') {
        console.log('Auto-fetch failed, continuing without fetch:', error);
      }
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
    } catch (error: unknown) {
      // Handle merge conflicts
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.toLowerCase().includes('conflict')) {
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
  private async applyAIResolution(resolution: ConflictResolution): Promise<{
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
      if (resolution.unresolved) {
        remainingConflicts.push(...resolution.unresolved);
      }
      
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
        remainingConflicts: resolution.resolvedFiles.map(f => f.path).concat(resolution.unresolved || [])
      };
    }
  }
  
  /**
   * Extract detailed conflict data for AI analysis
   */
  private async extractConflictData(conflictedFiles: string[]): Promise<ConflictData> {
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
  private parseConflictMarkers(content: string, filePath: string): ConflictSection[] {
    const lines = content.split('\n');
    const sections: ConflictSection[] = [];
    let currentSection: Partial<ConflictSection> | null = null;
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
        const startLine = currentSection.startLine || 1;
        const endLine = currentSection.endLine || lineNumber;
        const contextStart = Math.max(0, startLine - 6);
        const contextEnd = Math.min(lines.length, endLine + 5);
        currentSection.context = lines.slice(contextStart, contextEnd).join('\n');
        
        sections.push(currentSection as ConflictSection);
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
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.toLowerCase().includes('conflict')) {
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
   * SECURITY: Stash changes with comprehensive input validation
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

    const args: string[] = ['stash'];

    if (list) {
      args.push('list');
    } else if (pop) {
      args.push('pop');
      if (stashIndex !== undefined) {
        // SECURITY: Validate stash index
        if (!Number.isInteger(stashIndex) || stashIndex < 0 || stashIndex > 999) {
          throw new Error('Invalid stash index');
        }
        args.push(`stash@{${stashIndex}}`);
      }
    } else if (apply) {
      args.push('apply');
      if (stashIndex !== undefined) {
        if (!Number.isInteger(stashIndex) || stashIndex < 0 || stashIndex > 999) {
          throw new Error('Invalid stash index');
        }
        args.push(`stash@{${stashIndex}}`);
      }
    } else if (drop) {
      args.push('drop');
      if (stashIndex !== undefined) {
        if (!Number.isInteger(stashIndex) || stashIndex < 0 || stashIndex > 999) {
          throw new Error('Invalid stash index');
        }
        args.push(`stash@{${stashIndex}}`);
      }
    } else {
      // Default stash push
      args.push('push');
      if (message) {
        // SECURITY: Validate stash message
        const validatedMessage = this.validateGitArgument(message, 'message');
        args.push('-m', validatedMessage);
      }
      if (includeUntracked) {
        args.push('--include-untracked');
      }
      if (keepIndex) {
        args.push('--keep-index');
      }
    }

    const command = args[0];
    if (!command) {
      throw new Error('No git command specified');
    }
    return await this.executeSecureGitCommand(command, args.slice(1));
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
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.toLowerCase().includes('conflict')) {
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
        this.executeGitCommand('branch -a --format=%(refname:short)').then(out => out.split('\n').filter(b => b.trim()).length).catch(() => 0),
        this.executeGitCommand('tag -l').then(out => out.split('\n').filter(t => t.trim()).length).catch(() => 0),
        this.executeGitCommand('log -1 --format=%ad --date=iso-strict').catch(() => '')
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

  // Corruption Recovery Methods

  /**
   * Enable or disable automatic corruption checking
   */
  setCorruptionCheckEnabled(enabled: boolean): void {
    this.corruptionCheckEnabled = enabled;
  }

  /**
   * Perform automatic corruption check if needed (called before critical operations)
   */
  private async performAutomaticCorruptionCheck(): Promise<void> {
    if (!this.corruptionCheckEnabled) return;
    
    const now = Date.now();
    if (now - this.lastCorruptionCheck < this.corruptionCheckInterval) {
      return; // Skip check if recently performed
    }

    try {
      const quickCheck = await this.recoveryCoordinator.quickCorruptionCheck();
      this.lastCorruptionCheck = now;

      if (quickCheck.isCorrupted && !quickCheck.canContinue) {
        const criticalIssueTypes = quickCheck.criticalIssues.map(i => i.type).join(', ');
        throw new Error(
          `Repository corruption detected: ${criticalIssueTypes}. ` +
          'Run corruption recovery before continuing.'
        );
      }
    } catch (error) {
      // Log but don't fail the operation for corruption check errors
      if (process.env['GITPLUS_DEBUG'] === 'true') {
        console.warn('Automatic corruption check failed:', error);
      }
    }
  }

  /**
   * Perform comprehensive repository corruption detection
   */
  async detectCorruption(): Promise<CorruptionDetectionResult> {
    return this.recoveryCoordinator.detectCorruption();
  }

  /**
   * Recover from repository corruption with automatic detection and recovery
   */
  async recoverFromCorruption(options?: Partial<RecoveryOptions>): Promise<{
    success: boolean;
    recoveryResult?: any;
    message: string;
  }> {
    try {
      // Use default recovery options with user overrides
      const defaultOptions: RecoveryOptions = {
        maxDataLoss: 'minimal',
        autoRepair: true,
        createBackup: true,
        preserveUncommitted: true,
        aggressive: false,
        timeoutMinutes: 30,
        requireConfirmation: false
      };

      const recoveryOptions = { ...defaultOptions, ...options };

      // Detect corruption
      const detectionResult = await this.recoveryCoordinator.detectCorruption();
      
      if (!detectionResult.isCorrupted) {
        return {
          success: true,
          message: 'No corruption detected - repository is healthy'
        };
      }

      // Get recovery recommendations
      const recommendations = await this.recoveryCoordinator.getRecoveryRecommendations(detectionResult);
      
      if (!recommendations.canProceed && !recoveryOptions.aggressive) {
        return {
          success: false,
          message: `Critical corruption detected. ${recommendations.warningMessage || 'Manual intervention required.'}`
        };
      }

      // Create recovery plan
      const plan = await this.recoveryCoordinator.createRecoveryPlan(detectionResult, recoveryOptions);

      // Execute recovery
      const recoveryResult = await this.recoveryCoordinator.executeRecoveryPlan(plan, recoveryOptions);

      return {
        success: recoveryResult.success,
        recoveryResult,
        message: recoveryResult.success 
          ? 'Repository corruption recovery completed successfully'
          : 'Recovery completed with issues - manual intervention may be required'
      };

    } catch (error) {
      return {
        success: false,
        message: `Recovery failed: ${error}`
      };
    }
  }

  /**
   * Create a backup of the repository
   */
  async createBackup(reason: string, options?: {
    includeWorkingDirectory?: boolean;
    compress?: boolean;
  }): Promise<{ success: boolean; backupId?: string; message: string }> {
    try {
      const backupManager = this.recoveryCoordinator.getBackupManager();
      const backupInfo = await backupManager.createBackup({
        reason,
        includeWorkingDirectory: options?.includeWorkingDirectory ?? true,
        compress: options?.compress ?? true,
        maxBackups: 10
      });

      return {
        success: true,
        backupId: backupInfo.id,
        message: `Backup created successfully: ${backupInfo.id}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Backup creation failed: ${error}`
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{
    id: string;
    createdAt: Date;
    reason: string;
    size: number;
    branch: string;
    commit: string;
  }>> {
    try {
      const backupManager = this.recoveryCoordinator.getBackupManager();
      const backups = await backupManager.listBackups();
      
      return backups.map(backup => ({
        id: backup.id,
        createdAt: backup.createdAt,
        reason: backup.reason,
        size: backup.size,
        branch: backup.branchState.branch,
        commit: backup.branchState.commit
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(
    backupId: string, 
    options?: {
      preserveCurrentChanges?: boolean;
      targetBranch?: string;
    }
  ): Promise<{ success: boolean; message: string; warnings?: string[] }> {
    try {
      const backupManager = this.recoveryCoordinator.getBackupManager();
      const result = await backupManager.restoreFromBackup(backupId, {
        preserveCurrentChanges: options?.preserveCurrentChanges ?? true,
        targetBranch: options?.targetBranch
      });

      return {
        success: result.success,
        message: result.success 
          ? `Repository restored from backup ${backupId}`
          : `Restore failed for backup ${backupId}`,
        warnings: result.warnings
      };
    } catch (error) {
      return {
        success: false,
        message: `Restore failed: ${error}`
      };
    }
  }

  /**
   * Extract error message from various error object formats
   */
  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object') {
      if ('stderr' in error && typeof (error as any).stderr === 'string') {
        return (error as any).stderr;
      }
      if ('message' in error && typeof (error as any).message === 'string') {
        return (error as any).message;
      }
      if ('stdout' in error && typeof (error as any).stdout === 'string') {
        return (error as any).stdout;
      }
    }
    
    return String(error);
  }

  /**
   * Enhanced execute command with automatic corruption checking
   */
  async executeGitCommandSafe(
    command: string,
    options: GitCommandOptions = {}
  ): Promise<string> {
    // Perform automatic corruption check before critical operations
    const criticalCommands = ['commit', 'merge', 'rebase', 'reset --hard', 'checkout'];
    const isCritical = criticalCommands.some(cmd => command.includes(cmd));
    
    if (isCritical) {
      await this.performAutomaticCorruptionCheck();
    }

    try {
      return await this.executeGitCommand(command, options);
    } catch (error) {
      // Check if error might be corruption-related
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error);
      const corruptionIndicators = [
        'corrupt', 'bad object', 'broken', 'invalid', 'missing blob',
        'loose object', 'pack', 'index file', 'unable to read'
      ];

      const mightBeCorruption = corruptionIndicators.some(indicator => 
        errorMessage.includes(indicator)
      );

      if (mightBeCorruption) {
        // Suggest corruption recovery
        throw new Error(
          `${error}\n\nThis error might indicate repository corruption. ` +
          'Consider running corruption detection and recovery.'
        );
      }

      throw error;
    }
  }
}