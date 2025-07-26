import { exec } from 'child_process';
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

  constructor(platform: Platform, remoteURL: string, repositoryPath: string) {
    this.platform = platform;
    this.remoteURL = remoteURL;
    this.repositoryPath = repositoryPath;
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
      // Use gh auth status to check authentication without exposing tokens
      const { stdout, stderr } = await execAsync('gh auth status', {
        timeout: 10000,
        cwd: this.repositoryPath
      });
      
      // gh auth status writes to stderr even on success
      const output = (stdout + stderr).toLowerCase();
      return output.includes('logged in') && !output.includes('not logged in') && !output.includes('error');
    } catch (error: any) {
      // If command fails, likely not authenticated
      console.debug('GitHub authentication check failed:', error.message);
      return false;
    }
  }

  /**
   * Validate GitLab CLI authentication status  
   */
  private async isGitLabAuthenticated(): Promise<boolean> {
    try {
      // Use glab auth status to check authentication
      const { stdout, stderr } = await execAsync('glab auth status', {
        timeout: 10000,
        cwd: this.repositoryPath
      });
      
      const output = (stdout + stderr).toLowerCase();
      return output.includes('active') && !output.includes('not authenticated') && !output.includes('error');
    } catch (error: any) {
      // If command fails, likely not authenticated
      console.debug('GitLab authentication check failed:', error.message);
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
          await execAsync('git ls-remote --heads origin', {
            timeout: 15000,
            cwd: this.repositoryPath
          });
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
    // Properly escape shell metacharacters
    const escapedTitle = this.escapeShellString(request.title);
    
    // Create temporary markdown file for the PR description
    const tempFile = await this.createTempMarkdownFile(request.body);
    
    let command = `gh pr create --title ${escapedTitle} --body-file "${tempFile}"`;
    
    if (request.baseBranch) {
      command += ` --base ${request.baseBranch}`;
    }
    
    if (request.draft) {
      command += ' --draft';
    }
    
    if (request.reviewers.length > 0) {
      command += ` --reviewer ${request.reviewers.join(',')}`;
    }
    
    if (request.labels.length > 0) {
      command += ` --label ${request.labels.join(',')}`;
    }

    try {
      const { stdout } = await execAsync(command, { cwd: this.repositoryPath });
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
    // Properly escape shell metacharacters
    const escapedTitle = this.escapeShellString(request.title);
    
    // Create temporary markdown file for the MR description
    const tempFile = await this.createTempMarkdownFile(request.body);
    
    let command = `glab mr create --title ${escapedTitle} --description-file "${tempFile}"`;
    
    if (request.baseBranch) {
      command += ` --target-branch ${request.baseBranch}`;
    }
    
    if (request.draft) {
      command += ' --draft';
    }
    
    if (request.labels.length > 0) {
      command += ` --label ${request.labels.join(',')}`;
    }

    try {
      const { stdout } = await execAsync(command, { cwd: this.repositoryPath });
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
    return tempFile;
  }

  /**
   * Clean up temporary file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      // Also try to remove the parent directory if it's empty
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (parentDir.includes('gitplus-')) {
        try {
          require('fs').rmdirSync(parentDir);
        } catch {
          // Ignore errors when cleaning up directory
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup temp file:', error);
    }
  }

  /**
   * Check if GitHub CLI is available and authenticated
   */
  private async isGitHubCLIAvailable(): Promise<boolean> {
    try {
      await execAsync('gh --version', { cwd: this.repositoryPath });
      // TODO: Check authentication status
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
      await execAsync('glab --version', { cwd: this.repositoryPath });
      // TODO: Check authentication status
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
}