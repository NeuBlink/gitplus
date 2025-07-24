import { GitClient } from './client';
import { ChangeAnalysis, CommitInfo, ConventionalCommitType } from '../types';
import { AIService } from '../ai/service';
import { 
  validateConventionalCommit, 
  detectBreakingChanges, 
  suggestScope, 
  detectCommitType,
  formatConventionalCommit
} from '../utils/conventionalCommits';

export class ChangeAnalyzer {
  private gitClient: GitClient;
  public aiService: AIService;
  private useAI: boolean = true;

  constructor(gitClient: GitClient, useAI: boolean = true) {
    this.gitClient = gitClient;
    this.aiService = new AIService();
    this.useAI = useAI;
  }

  /**
   * Analyze repository changes and generate insights
   */
  async analyzeChanges(options: {
    commitRange?: string;
    includeDiff?: boolean;
    contextFile?: string;
  } = {}): Promise<ChangeAnalysis> {
    const { commitRange, includeDiff = false, contextFile } = options;

    // Get current status
    const status = await this.gitClient.getStatus();
    
    // Get commit history
    const commits = await this.gitClient.getCommitHistory(10, commitRange);
    
    // Get diff if requested
    let diff = '';
    if (includeDiff) {
      diff = await this.gitClient.getDiff({ staged: true });
      if (!diff) {
        diff = await this.gitClient.getDiff({ staged: false });
      }
    }

    // Analyze files changed
    const filesChanged = [
      ...status.staged,
      ...status.unstaged,
      ...status.untracked,
    ];

    // Count additions/deletions from diff
    const { additions, deletions } = this.parseDiffStats(diff);

    // AI will determine all change types and analysis
    let changeType: string;
    let conventionalType: string;
    let title: string;
    let description: string;
    let commitMessage: string;
    let branchName: string;

    // AI is mandatory - fail immediately if not available
    // Temporarily bypass isAvailable check to test comprehensive analysis directly
    // if (!await this.aiService.isAvailable()) {
    //   throw new Error('AI is required but Claude CLI is not available or not working. Please ensure Claude CLI is installed and authenticated.');
    // }

    console.log('Using AI for comprehensive analysis...');
    
    // Use single comprehensive AI analysis - no fallbacks
    const comprehensiveAnalysis = await this.aiService.generateComprehensiveAnalysis({
      diff,
      filesChanged,
      status: { staged: status.staged, unstaged: status.unstaged, untracked: status.untracked },
      recentCommits: commits.map(c => ({ message: c.message, hash: c.hash })),
      branch: status.branch,
      baseBranch: status.baseBranch
    });

    if (!comprehensiveAnalysis) {
      throw new Error('AI analysis failed to generate results. Please check your Claude CLI configuration and try again.');
    }

    // Use comprehensive AI results
    title = comprehensiveAnalysis.pr.title || comprehensiveAnalysis.commit.message;
    commitMessage = comprehensiveAnalysis.commit.message;
    branchName = comprehensiveAnalysis.branch.name;
    description = comprehensiveAnalysis.pr.description || comprehensiveAnalysis.analysis.summary;
    
    // Update change type from AI
    changeType = comprehensiveAnalysis.analysis.changeType;
    conventionalType = comprehensiveAnalysis.commit.type;

    return {
      title,
      description,
      commitMessage,
      branchName,
      commits,
      filesChanged,
      additions,
      deletions,
      changeType,
      conventionalType,
    };
  }

  /**
   * Parse diff statistics for additions/deletions
   */
  private parseDiffStats(diff: string): { additions: number; deletions: number } {
    if (!diff) return { additions: 0, deletions: 0 };

    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    return { additions, deletions };
  }

  /**
   * Validate and suggest improvements for a commit message
   */
  async validateCommitMessage(message: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }> {
    const validation = validateConventionalCommit(message);
    
    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      suggestions: []
    };
  }

  /**
   * Generate a fallback conventional commit message using rule-based analysis
   */
  async generateFallbackCommitMessage(options: {
    filesChanged: string[];
    diff: string;
    status: {
      staged: string[];
      unstaged: string[];
      untracked: string[];
    };
  }): Promise<{
    message: string;
    type: ConventionalCommitType;
    scope?: string;
    breaking: boolean;
  }> {
    const { filesChanged, diff, status } = options;
    
    // Detect commit type based on files and diff
    const type = detectCommitType(filesChanged, diff);
    
    // Suggest scope based on file paths
    const scope = suggestScope(filesChanged);
    
    // Detect breaking changes
    const breaking = detectBreakingChanges(diff, filesChanged);
    
    // Generate basic description
    let description: string;
    if (filesChanged.length === 1) {
      const fileName = filesChanged[0]?.split('/').pop() || filesChanged[0] || 'file';
      description = `update ${fileName}`;
    } else if (filesChanged.length <= 3) {
      description = `update ${filesChanged.length} files`;
    } else {
      description = `update multiple files`;
    }
    
    // Improve description based on type
    switch (type) {
      case 'feat':
        description = filesChanged.length === 1 
          ? `add new feature in ${filesChanged[0]?.split('/').pop() || 'component'}` 
          : 'add new features';
        break;
      case 'fix':
        description = 'fix issues';
        break;
      case 'docs':
        description = 'update documentation';
        break;
      case 'test':
        description = 'add tests';
        break;
      case 'build':
        description = 'update build configuration';
        break;
      case 'ci':
        description = 'update CI configuration';
        break;
    }
    
    // Format the message
    const message = formatConventionalCommit({
      type,
      scope,
      breaking,
      description
    });
    
    return {
      message,
      type,
      scope,
      breaking
    };
  }

  /**
   * Enhance AI-generated commit with validation and improvements
   */
  async enhanceCommitMessage(aiMessage: string, context: {
    filesChanged: string[];
    diff: string;
  }): Promise<{
    message: string;
    valid: boolean;
    improvements: string[];
  }> {
    const validation = validateConventionalCommit(aiMessage);
    const improvements: string[] = [];
    
    if (!validation.valid) {
      improvements.push(...validation.errors);
      
      // Generate fallback if AI message is invalid
      const fallback = await this.generateFallbackCommitMessage({
        filesChanged: context.filesChanged,
        diff: context.diff,
        status: { staged: [], unstaged: [], untracked: [] }
      });
      
      improvements.push(`Using fallback message: ${fallback.message}`);
      return {
        message: fallback.message,
        valid: false,
        improvements
      };
    }
    
    improvements.push(...validation.warnings);
    
    return {
      message: aiMessage,
      valid: true,
      improvements
    };
  }

}