import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
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

  constructor(platform: Platform, remoteURL: string) {
    this.platform = platform;
    this.remoteURL = remoteURL;
  }

  /**
   * Get platform capabilities
   */
  async getCapabilities(): Promise<PlatformCapabilities> {
    switch (this.platform) {
      case Platform.GitHub:
        const ghAvailable = await this.isGitHubCLIAvailable();
        return {
          canCreatePR: ghAvailable,
          canListPRs: ghAvailable,
          canMergePR: ghAvailable,
          requiresAuth: true,
        };
      case Platform.GitLab:
        const glabAvailable = await this.isGitLabCLIAvailable();
        return {
          canCreatePR: glabAvailable,
          canListPRs: glabAvailable,
          canMergePR: glabAvailable,
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
    const escapedTitle = request.title.replace(/"/g, '\\"');
    
    // Create temporary markdown file for the PR description
    const tempFile = this.createTempMarkdownFile(request.body);
    
    let command = `gh pr create --title "${escapedTitle}" --body-file "${tempFile}"`;
    
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
      const { stdout } = await execAsync(command);
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
      this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Create GitLab Merge Request using glab CLI
   */
  private async createGitLabMR(request: PRRequest): Promise<PRResponse> {
    const escapedTitle = request.title.replace(/"/g, '\\"');
    
    // Create temporary markdown file for the MR description
    const tempFile = this.createTempMarkdownFile(request.body);
    
    let command = `glab mr create --title "${escapedTitle}" --description-file "${tempFile}"`;
    
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
      const { stdout } = await execAsync(command);
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
      this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Create a temporary markdown file for PR/MR descriptions
   */
  private createTempMarkdownFile(content: string): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'gitplus-'));
    const tempFile = join(tempDir, 'pr-description.md');
    writeFileSync(tempFile, content, 'utf8');
    return tempFile;
  }

  /**
   * Clean up temporary file
   */
  private cleanupTempFile(filePath: string): void {
    try {
      unlinkSync(filePath);
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
      await execAsync('gh --version');
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
      await execAsync('glab --version');
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