import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Platform, PRRequest, PRResponse } from '../types';

const execAsync = promisify(exec);

export interface PlatformCapabilities {
  canCreatePR: boolean;
  canListPRs: boolean;
  canMergePR: boolean;
  requiresAuth: boolean;
}

export class PlatformManager {
  private platform: Platform;
  private remoteURL: string;
  private repositoryPath: string;
  private tempFiles: Set<string> = new Set();

  constructor(platform: Platform, remoteURL: string, repositoryPath: string) {
    this.platform = platform;
    this.remoteURL = remoteURL;
    this.repositoryPath = repositoryPath;
    
    // Register cleanup on process exit for better resource management
    this.registerCleanupHandlers();
  }

  /**
   * Register process cleanup handlers to ensure temporary files are cleaned up
   */
  private registerCleanupHandlers(): void {
    const cleanup = () => {
      // Clean up any remaining temporary files
      for (const tempFile of this.tempFiles) {
        this.cleanupTempFile(tempFile).catch(() => {
          // Ignore cleanup errors during exit
        });
      }
    };

    // Register cleanup for various exit scenarios
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  /**
   * Get platform capabilities with enhanced authentication validation
   * 
   * @returns Promise resolving to platform capabilities including PR creation, authentication status
   * 
   * @example
   * ```typescript
   * const capabilities = await platformManager.getCapabilities();
   * if (capabilities.canCreatePR) {
   *   console.log('Platform supports PR creation');
   * }
   * if (capabilities.requiresAuth) {
   *   console.log('Authentication required for this platform');  
   * }
   * ```
   */
  async getCapabilities(): Promise<PlatformCapabilities> {
    switch (this.platform) {
      case Platform.GitHub:
        const ghAvailable = await this.isGitHubCLIAvailable();
        const ghAuthenticated = ghAvailable ? await this.isGitHubAuthenticated() : false;
        return {
          canCreatePR: ghAvailable && ghAuthenticated,
          canListPRs: ghAvailable && ghAuthenticated,
          canMergePR: ghAvailable && ghAuthenticated,
          requiresAuth: true,
        };
      case Platform.GitLab:
        const glabAvailable = await this.isGitLabCLIAvailable();
        const glabAuthenticated = glabAvailable ? await this.isGitLabAuthenticated() : false;
        return {
          canCreatePR: glabAvailable && glabAuthenticated,
          canListPRs: glabAvailable && glabAuthenticated,
          canMergePR: glabAvailable && glabAuthenticated,
          requiresAuth: true,
        };
      case Platform.LocalOnly:
      default:
        return {
          canCreatePR: false,
          canListPRs: false,
          canMergePR: false,
          requiresAuth: false,
        };
    }
  }

  /**
   * Validate GitHub CLI authentication status
   */
  private async isGitHubAuthenticated(): Promise<boolean> {
    try {
      // SECURITY FIX: Use spawn for consistency and security
      const output = await this.executeCommandWithSpawn('gh', ['auth', 'status']);
      
      // gh auth status writes output that we need to check
      const lowerOutput = output.toLowerCase();
      return lowerOutput.includes('logged in') && !lowerOutput.includes('not logged in') && !lowerOutput.includes('error');
    } catch (error: any) {
      // If command fails, likely not authenticated
      // Log authentication check failure (only in development)
      if (process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true') {
        console.log('GitHub authentication check failed:', error.message);
      }
      return false;
    }
  }

  /**
   * Validate GitLab CLI authentication status  
   */
  private async isGitLabAuthenticated(): Promise<boolean> {
    try {
      // SECURITY FIX: Use spawn for consistency and security
      const output = await this.executeCommandWithSpawn('glab', ['auth', 'status']);
      
      const lowerOutput = output.toLowerCase();
      return lowerOutput.includes('active') && !lowerOutput.includes('not authenticated') && !lowerOutput.includes('error');
    } catch (error: any) {
      // If command fails, likely not authenticated
      // Log authentication check failure (only in development)
      if (process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true') {
        console.log('GitLab authentication check failed:', error.message);
      }
      return false;
    }
  }

  /**
   * Validate git remote URL and repository access
   */
  async validateRepositoryAccess(): Promise<{
    isValid: boolean;
    hasAccess: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;
    let hasAccess = false;

    try {
      // Validate remote URL format
      if (!this.remoteURL) {
        errors.push('No remote URL configured');
        isValid = false;
      } else {
        // Basic URL validation
        try {
          const parsedUrl = new URL(this.remoteURL.replace(/^git@([^:]+):/, 'https://$1/'));
          if (!['https:', 'http:', 'ssh:'].includes(parsedUrl.protocol)) {
            errors.push(`Invalid remote URL protocol: ${parsedUrl.protocol}`);
            isValid = false;
          }
        } catch (urlError) {
          errors.push(`Invalid remote URL format: ${this.remoteURL}`);
          isValid = false;
        }
      }

      // Test repository access
      if (isValid) {
        try {
          // SECURITY FIX: Use spawn for consistency
          await this.executeCommandWithSpawn('git', ['ls-remote', '--heads', 'origin']);
          hasAccess = true;
        } catch (accessError: any) {
          if (accessError.message.includes('Authentication failed') || 
              accessError.message.includes('Permission denied')) {
            errors.push('Authentication failed - invalid credentials or insufficient permissions');
            warnings.push('Consider running platform CLI auth commands (gh auth login / glab auth login)');
          } else if (accessError.message.includes('timeout')) {
            warnings.push('Repository access timeout - network or server issues');
            hasAccess = false; // Assume no access on timeout
          } else {
            warnings.push(`Repository access test failed: ${accessError.message}`);
            hasAccess = false;
          }
        }
      }

      // Platform-specific authentication warnings
      if (this.platform === Platform.GitHub && !await this.isGitHubAuthenticated()) {
        warnings.push('GitHub CLI not authenticated - run: gh auth login');
      } else if (this.platform === Platform.GitLab && !await this.isGitLabAuthenticated()) {
        warnings.push('GitLab CLI not authenticated - run: glab auth login');
      }

    } catch (error: any) {
      errors.push(`Repository validation failed: ${error.message}`);
      isValid = false;
    }

    return {
      isValid,
      hasAccess,
      errors,
      warnings
    };
  }

  /**
   * Create a pull request/merge request
   */
  async createPR(request: PRRequest): Promise<PRResponse> {
    const capabilities = await this.getCapabilities();
    
    if (!capabilities.canCreatePR) {
      return {
        url: '',
        number: 0,
        status: 'error',
        message: `Cannot create PR: ${this.getPlatformRequirement()}`,
      };
    }

    try {
      switch (this.platform) {
        case Platform.GitHub:
          return await this.createGitHubPR(request);
        case Platform.GitLab:
          return await this.createGitLabMR(request);
        default:
          throw new Error('Unsupported platform for PR creation');
      }
    } catch (error) {
      return {
        url: '',
        number: 0,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create GitHub Pull Request using gh CLI
   */
  private async createGitHubPR(request: PRRequest): Promise<PRResponse> {
    // SECURITY FIX: Use spawn with proper argument separation instead of shell interpolation
    const args = ['pr', 'create'];
    
    // Add title with proper escaping
    args.push('--title', request.title);
    
    // Create temporary markdown file for the PR description
    const tempFile = await this.createTempMarkdownFile(request.body);
    args.push('--body-file', tempFile);
    
    if (request.baseBranch) {
      // Validate base branch name to prevent injection
      const validatedBaseBranch = this.validateBranchName(request.baseBranch);
      if (validatedBaseBranch) {
        args.push('--base', validatedBaseBranch);
      }
    }
    
    if (request.draft) {
      args.push('--draft');
    }
    
    if (request.reviewers.length > 0) {
      // Validate and sanitize reviewer names
      const validReviewers = request.reviewers
        .map(r => this.validateUsername(r))
        .filter(r => r !== null) as string[];
      if (validReviewers.length > 0) {
        args.push('--reviewer', validReviewers.join(','));
      }
    }
    
    if (request.labels.length > 0) {
      // Validate and sanitize label names
      const validLabels = request.labels
        .map(l => this.validateLabelName(l))
        .filter(l => l !== null) as string[];
      if (validLabels.length > 0) {
        args.push('--label', validLabels.join(','));
      }
    }

    try {
      const stdout = await this.executeCommandWithSpawn('gh', args);
      const prURL = stdout.trim();
      
      // Extract PR number from URL
      const prNumberMatch = prURL.match(/\/pull\/(\d+)$/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1] || '0', 10) : 0;
      
      return {
        url: prURL,
        number: prNumber,
        status: 'created',
        message: 'Pull request created successfully',
      };
    } catch (error: any) {
      throw new Error(`GitHub PR creation failed: ${error.message}`);
    } finally {
      // Clean up temporary file
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Create GitLab Merge Request using glab CLI
   */
  private async createGitLabMR(request: PRRequest): Promise<PRResponse> {
    // SECURITY FIX: Use spawn with proper argument separation instead of shell interpolation
    const args = ['mr', 'create'];
    
    // Add title with proper escaping
    args.push('--title', request.title);
    
    // Create temporary markdown file for the MR description
    const tempFile = await this.createTempMarkdownFile(request.body);
    args.push('--description-file', tempFile);
    
    if (request.baseBranch) {
      // Validate base branch name to prevent injection
      const validatedBaseBranch = this.validateBranchName(request.baseBranch);
      if (validatedBaseBranch) {
        args.push('--target-branch', validatedBaseBranch);
      }
    }
    
    if (request.draft) {
      args.push('--draft');
    }
    
    if (request.labels.length > 0) {
      // Validate and sanitize label names
      const validLabels = request.labels
        .map(l => this.validateLabelName(l))
        .filter(l => l !== null) as string[];
      if (validLabels.length > 0) {
        args.push('--label', validLabels.join(','));
      }
    }

    try {
      const stdout = await this.executeCommandWithSpawn('glab', args);
      const mrURL = stdout.trim();
      
      // Extract MR number from URL
      const mrNumberMatch = mrURL.match(/\/merge_requests\/(\d+)$/);
      const mrNumber = mrNumberMatch ? parseInt(mrNumberMatch[1] || '0', 10) : 0;
      
      return {
        url: mrURL,
        number: mrNumber,
        status: 'created',
        message: 'Merge request created successfully',
      };
    } catch (error: any) {
      throw new Error(`GitLab MR creation failed: ${error.message}`);
    } finally {
      // Clean up temporary file
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Properly escape a string for shell execution
   */
  private escapeShellString(str: string): string {
    // Use single quotes to avoid most shell interpretation
    // Escape any single quotes in the string by ending the quoted string,
    // adding an escaped single quote, and starting a new quoted string
    return `'${str.replace(/'/g, "'\"'\"'")}'`;
  }

  /**
   * Create a temporary markdown file for PR/MR descriptions
   */
  private async createTempMarkdownFile(content: string): Promise<string> {
    const tempDir = mkdtempSync(join(tmpdir(), 'gitplus-'));
    const tempFile = join(tempDir, 'pr-description.md');
    await fs.writeFile(tempFile, content, 'utf8');
    
    // Track the temporary file for cleanup
    this.tempFiles.add(tempFile);
    
    return tempFile;
  }

  /**
   * Clean up temporary file and directory with improved error handling
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    if (!filePath) {
      return; // Nothing to clean up
    }

    try {
      // Remove the temporary file
      await fs.unlink(filePath);
      
      // Remove from tracking set
      this.tempFiles.delete(filePath);
      
      // Also try to remove the parent directory if it's a gitplus temp directory
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (parentDir && parentDir.includes('gitplus-')) {
        try {
          // Use fs.rmdir with recursive option for better cleanup
          await fs.rmdir(parentDir, { recursive: true });
        } catch (dirError) {
          // Directory might not be empty or might not exist - log only in debug mode
          if (process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true') {
            console.log('Failed to cleanup temp directory:', dirError);
          }
        }
      }
    } catch (error) {
      // Log cleanup failures only in debug mode to avoid noise
      if (process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true') {
        console.log('Failed to cleanup temp file:', error);
      }
    }
  }

  /**
   * Check if GitHub CLI is available and authenticated
   */
  private async isGitHubCLIAvailable(): Promise<boolean> {
    try {
      // SECURITY FIX: Use spawn for consistency
      await this.executeCommandWithSpawn('gh', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if GitLab CLI is available and authenticated
   */
  private async isGitLabCLIAvailable(): Promise<boolean> {
    try {
      // SECURITY FIX: Use spawn for consistency
      await this.executeCommandWithSpawn('glab', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get platform requirement message
   */
  private getPlatformRequirement(): string {
    switch (this.platform) {
      case Platform.GitHub:
        return 'GitHub CLI (gh) is required and must be authenticated. Run: gh auth login';
      case Platform.GitLab:
        return 'GitLab CLI (glab) is required and must be authenticated. Run: glab auth login';
      case Platform.LocalOnly:
        return 'Repository is not connected to GitHub or GitLab';
      default:
        return 'Unknown platform';
    }
  }

  /**
   * Parse repository owner and name from remote URL
   */
  parseRepositoryInfo(): { owner: string; repo: string } | null {
    if (!this.remoteURL) return null;

    // Handle both HTTPS and SSH URLs
    const patterns = [
      /https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /https:\/\/gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /git@gitlab\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = this.remoteURL.match(pattern);
      if (match) {
        return {
          owner: match[1] || '',
          repo: match[2] || '',
        };
      }
    }

    return null;
  }

  /**
   * Get platform-specific PR/MR terminology
   */
  getPRTerminology(): { singular: string; plural: string } {
    switch (this.platform) {
      case Platform.GitHub:
        return { singular: 'Pull Request', plural: 'Pull Requests' };
      case Platform.GitLab:
        return { singular: 'Merge Request', plural: 'Merge Requests' };
      default:
        return { singular: 'PR', plural: 'PRs' };
    }
  }

  /**
   * SECURITY: Execute command using spawn for complete shell injection protection
   */
  private async executeCommandWithSpawn(
    executable: string,
    args: string[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: this.repositoryPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after 30s: ${executable} ${args.join(' ')}`));
      }, 30000);

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutHandle);
        
        if (timedOut) return; // Already handled by timeout
        
        // Special handling for auth status commands that might output to stderr
        const isAuthCommand = args.includes('auth') && args.includes('status');
        
        if (code !== 0 && !isAuthCommand) {
          reject(new Error(`Command failed (exit code ${code}): ${stderr || 'No error message'}`));
          return;
        }

        // For auth commands, return combined output; otherwise just stdout
        const output = isAuthCommand ? (stdout + stderr) : stdout;
        resolve(output);
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
   * SECURITY: Validate branch name to prevent injection
   */
  private validateBranchName(branchName: string): string | null {
    if (!branchName || typeof branchName !== 'string') {
      return null;
    }
    
    // Allow alphanumeric, hyphens, underscores, forward slashes, and dots
    // but prevent dangerous patterns
    const validPattern = /^[a-zA-Z0-9._\/-]+$/;
    const dangerousPatterns = [
      /\.\./,     // Path traversal
      /^-/,       // Options starting with dash
      /^\/+/,     // Leading slashes
      /\/+$/,     // Trailing slashes
      /;|&|\||`|\$|\(|\)|<|>|{|}|\[|\]/  // Shell metacharacters
    ];
    
    if (!validPattern.test(branchName)) {
      return null;
    }
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(branchName)) {
        return null;
      }
    }
    
    // Limit length to prevent buffer overflow
    if (branchName.length > 250) {
      return null;
    }
    
    return branchName;
  }

  /**
   * SECURITY: Validate username to prevent injection
   */
  private validateUsername(username: string): string | null {
    if (!username || typeof username !== 'string') {
      return null;
    }
    
    // GitHub/GitLab usernames: alphanumeric, hyphens, no leading/trailing hyphens
    const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    
    if (!validPattern.test(username)) {
      return null;
    }
    
    // Limit length
    if (username.length > 39) {  // GitHub username limit
      return null;
    }
    
    return username;
  }

  /**
   * SECURITY: Validate label name to prevent injection
   */
  private validateLabelName(labelName: string): string | null {
    if (!labelName || typeof labelName !== 'string') {
      return null;
    }
    
    // Labels can contain alphanumeric, spaces, hyphens, underscores
    const validPattern = /^[a-zA-Z0-9\s._-]+$/;
    const dangerousPatterns = [
      /;|&|\||`|\$|\(|\)|<|>|{|}|\[|\]/  // Shell metacharacters
    ];
    
    if (!validPattern.test(labelName)) {
      return null;
    }
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(labelName)) {
        return null;
      }
    }
    
    // Limit length
    if (labelName.length > 50) {
      return null;
    }
    
    return labelName.trim();
  }
}