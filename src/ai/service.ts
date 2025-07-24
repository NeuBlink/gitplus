import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AIResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface CommitSuggestion {
  message: string;
  type: string;
  scope?: string;
  description: string;
  breaking?: boolean;
  body?: string;
  footer?: string;
}

export interface BranchSuggestion {
  name: string;
  description: string;
  alternative?: string;
}

export interface PRSuggestion {
  title: string;
  description: string;
  labels?: string[];
  reviewers?: string[];
}

export interface ComprehensiveAnalysis {
  commit: CommitSuggestion;
  branch: BranchSuggestion;
  analysis: {
    changeType: string;
    impact: 'low' | 'medium' | 'high';
    risks: string[];
    suggestions: string[];
    summary: string;
  };
  pr: PRSuggestion;
}

export interface ConflictData {
  files: string[];
  conflictSections: ConflictSection[];
  branch: string;
  baseBranch: string;
  commits: Array<{
    hash: string;
    message: string;
    author: string;
  }>;
  fileTypes: string[];
}

export interface ConflictSection {
  file: string;
  startLine: number;
  endLine: number;
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
  context: string;
}

export interface ConflictResolution {
  strategy: 'auto' | 'manual' | 'escalate';
  resolvedFiles: ResolvedFile[];
  unresolved: string[];
  reasoning: string;
  confidence: number;
  warnings: string[];
}

export interface ResolvedFile {
  path: string;
  content: string;
  changes: string;
  reasoning: string;
}

export class AIService {
  private claudeCommand = process.env.GITPLUS_CLAUDE_COMMAND || '/Users/krysp/.nvm/versions/node/v23.9.0/bin/claude';
  private defaultModel = process.env.GITPLUS_MODEL || 'sonnet';
  private timeout = parseInt(process.env.GITPLUS_TIMEOUT || '120000'); // 120 seconds

  /**
   * Execute Claude CLI command with proper error handling
   */
  private async executeClaudeCommand(
    prompt: string, 
    options: {
      model?: string;
      outputFormat?: 'text' | 'json';
      maxTokens?: number;
    } = {}
  ): Promise<AIResponse> {
    const { model = this.defaultModel, outputFormat = 'text' } = options;
    
    try {
      // Use spawn for better handling of large prompts
      return new Promise<AIResponse>((resolve) => {
        const args = ['-p', prompt, '--model', model, '--output-format', outputFormat];
        
        // console.log(`Executing Claude CLI: ${this.claudeCommand} ${args.slice(0, 2).join(' ')} ... (${prompt.length} chars)`);
        
        const child = spawn(this.claudeCommand, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: this.timeout
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
          // console.log('Command output:', { stdoutLength: stdout?.length, stderrLength: stderr?.length, exitCode: code });
          
          if (code !== 0 && !stdout) {
            resolve({
              success: false,
              content: '',
              error: `Claude CLI error (${code}): ${stderr}`
            });
            return;
          }

          // Claude CLI often writes status messages to stderr even on success
          // Only fail if there's no stdout content at all
          if (!stdout || stdout.trim().length === 0) {
            resolve({
              success: false,
              content: '',
              error: `Claude CLI error: ${stderr || 'No output received'}`
            });
            return;
          }

          resolve({
            success: true,
            content: stdout.trim()
          });
        });

        child.on('error', (error: Error) => {
          resolve({
            success: false,
            content: '',
            error: `Failed to execute Claude CLI: ${error.message}`
          });
        });
      });
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: `Failed to execute Claude CLI: ${error.message}`
      };
    }
  }

  /**
   * Generate intelligent commit message using Claude following Conventional Commits spec
   */
  async generateCommitMessage(context: {
    diff: string;
    filesChanged: string[];
    status: {
      staged: string[];
      unstaged: string[];
      untracked: string[];
    };
    recentCommits?: Array<{
      message: string;
      hash: string;
    }>;
    projectType?: string;
  }): Promise<CommitSuggestion | null> {
    const prompt = `Analyze these git changes and generate a strict Conventional Commits message according to the specification.

FILES CHANGED:
${context.filesChanged.map(f => `- ${f}`).join('\n')}

STAGED FILES:
${context.status.staged.map(f => `- ${f}`).join('\n')}

GIT DIFF:
${context.diff.substring(0, 2000)}${context.diff.length > 2000 ? '\n... (truncated for length)' : ''}

${context.recentCommits ? `RECENT COMMITS:
${context.recentCommits.slice(0, 3).map(c => `- ${c.message}`).join('\n')}` : ''}

RESPOND WITH JSON ONLY:
{
  "message": "type(scope): description",
  "type": "feat|fix|docs|style|refactor|test|chore|perf|ci|build",
  "scope": "optional scope (no spaces, kebab-case)",
  "description": "imperative mood description",
  "breaking": false,
  "body": "optional multiline body",
  "footer": "optional footer for breaking changes"
}

CONVENTIONAL COMMITS RULES:
1. Format: type(scope): description
2. Breaking changes: Use "!" after type/scope OR add BREAKING CHANGE: in footer
3. Types:
   - feat: new feature for users (not build tools)
   - fix: bug fix for users (not build tools)  
   - docs: documentation changes
   - style: formatting, missing semicolons, etc (no code change)
   - refactor: code restructuring without behavior change
   - perf: performance improvements
   - test: adding/correcting tests
   - build: build system or external dependencies
   - ci: CI configuration files and scripts
   - chore: other changes that don't modify src or test files
4. Scope: Component/file area affected (api, ui, auth, etc.)
5. Description: Imperative mood, lowercase, no period, under 50 chars
6. Breaking: Set to true if API changes break existing functionality

EXAMPLES:
- feat(auth): add OAuth2 login support
- fix(api): handle null response in user service  
- docs: update installation instructions
- style: fix indentation in login component
- refactor(database): extract query builder logic
- perf(parser): improve regex performance by 50%
- test(auth): add unit tests for login validation
- build(deps): update express to version 4.18
- ci: add automated security scanning
- chore(release): prepare version 2.1.0

BREAKING CHANGE DETECTION:
Look for: API changes, removed functions, changed signatures, removed exports, major refactors, version bumps that could break compatibility.`;

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI commit generation failed:', response.error);
      return null;
    }

    try {
      // Parse Claude CLI wrapper response
      let actualContent = response.content;
      try {
        const wrapper = JSON.parse(response.content);
        if (wrapper.type === 'result' && wrapper.subtype === 'success' && wrapper.result) {
          actualContent = wrapper.result;
        } else if (wrapper.subtype === 'error_during_execution') {
          console.error('Claude CLI execution error for commit message');
          return null;
        }
      } catch {
        // Not a wrapper, use content directly
      }
      
      // Clean up the content and extract JSON
      let jsonContent = actualContent.trim();
      
      // Remove code blocks if present
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonContent = codeBlockMatch[1].trim();
      }
      
      // Extract JSON object
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonContent);
        
        // Handle breaking changes in message format
        let message = parsed.message || '';
        if (parsed.breaking && parsed.type && parsed.scope) {
          // Add ! for breaking changes: type(scope)!: description
          message = message.replace(/^(\w+)(\([^)]+\))(:)/, '$1$2!$3');
        } else if (parsed.breaking && parsed.type) {
          // Add ! for breaking changes: type!: description
          message = message.replace(/^(\w+)(:)/, '$1!$2');
        }
        
        return {
          message,
          type: parsed.type || 'chore',
          scope: parsed.scope,
          description: parsed.description || '',
          breaking: parsed.breaking || false,
          body: parsed.body,
          footer: parsed.footer
        };
      }
      
      console.error('No valid JSON found in commit message response');
      return null;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw content:', response.content);
      return null;
    }
  }

  /**
   * Generate intelligent branch name using Claude
   */
  async generateBranchName(context: {
    commitMessage?: string;
    filesChanged: string[];
    changeType: string;
    description?: string;
  }): Promise<BranchSuggestion | null> {
    const prompt = `Generate a git branch name for these changes:

CHANGE TYPE: ${context.changeType}
FILES CHANGED: ${context.filesChanged.slice(0, 10).join(', ')}
${context.commitMessage ? `COMMIT MESSAGE: ${context.commitMessage}` : ''}
${context.description ? `DESCRIPTION: ${context.description}` : ''}

Please respond with a JSON object:
{
  "name": "branch-name-using-kebab-case",
  "description": "brief explanation",
  "alternative": "alternative-branch-name"
}

Rules:
- Use kebab-case (lowercase with hyphens)
- Start with appropriate prefix: feature/, fix/, docs/, refactor/, etc.
- Keep under 50 characters
- Be descriptive but concise
- Avoid special characters except hyphens`;

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI branch generation failed:', response.error);
      return null;
    }

    try {
      const parsed = JSON.parse(response.content);
      return {
        name: parsed.name || '',
        description: parsed.description || '',
        alternative: parsed.alternative
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return null;
    }
  }

  /**
   * Generate intelligent PR title and description using Claude
   */
  async generatePRDescription(context: {
    commits: Array<{
      message: string;
      hash: string;
    }>;
    filesChanged: string[];
    diff: string;
    branch: string;
    baseBranch: string;
    template?: string;
  }): Promise<PRSuggestion | null> {
    const prompt = `Generate a pull request title and description for these changes:

BRANCH: ${context.branch} → ${context.baseBranch}
FILES CHANGED (${context.filesChanged.length} files):
${context.filesChanged.slice(0, 15).map(f => `- ${f}`).join('\n')}
${context.filesChanged.length > 15 ? `... and ${context.filesChanged.length - 15} more files` : ''}

COMMITS:
${context.commits.map(c => `- ${c.message} (${c.hash.substring(0, 7)})`).join('\n')}

DIFF SUMMARY:
${context.diff.substring(0, 1500)}${context.diff.length > 1500 ? '\n... (truncated)' : ''}

${context.template ? `TEMPLATE: ${context.template}` : ''}

Please respond with a JSON object:
{
  "title": "Clear, descriptive PR title",
  "description": "Detailed PR description with markdown formatting",
  "labels": ["optional", "labels"],
  "reviewers": ["suggested", "reviewers"]
}

Requirements:
- Title should be under 72 characters
- Description should include:
  * Summary of changes
  * Files affected (if significant)
  * Testing checklist
  * Any breaking changes
- Use proper markdown formatting
- Suggest relevant labels based on change type
- Don't suggest specific usernames for reviewers`;

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI PR generation failed:', response.error);
      return null;
    }

    try {
      const parsed = JSON.parse(response.content);
      return {
        title: parsed.title || '',
        description: parsed.description || '',
        labels: parsed.labels || [],
        reviewers: parsed.reviewers || []
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return null;
    }
  }

  /**
   * Analyze changes intelligently using Claude
   */
  async analyzeChanges(context: {
    diff: string;
    filesChanged: string[];
    commits: Array<{
      message: string;
      hash: string;
    }>;
    branch: string;
  }): Promise<{
    changeType: string;
    impact: 'low' | 'medium' | 'high';
    risks: string[];
    suggestions: string[];
    summary: string;
  } | null> {
    const prompt = `Analyze these git changes and provide intelligent insights:

BRANCH: ${context.branch}
FILES CHANGED (${context.filesChanged.length} files):
${context.filesChanged.map(f => `- ${f}`).join('\n')}

RECENT COMMITS:
${context.commits.slice(0, 5).map(c => `- ${c.message}`).join('\n')}

DIFF:
${context.diff.substring(0, 2000)}${context.diff.length > 2000 ? '\n... (truncated)' : ''}

Please respond with a JSON object:
{
  "changeType": "feature|bugfix|refactor|docs|config|test|chore",
  "impact": "low|medium|high",
  "risks": ["potential risks or concerns"],
  "suggestions": ["improvement suggestions"],
  "summary": "brief summary of what these changes accomplish"
}

Consider:
- Code quality and potential issues
- Security implications
- Performance impact
- Breaking changes
- Test coverage
- Documentation needs`;

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI analysis failed:', response.error);
      return null;
    }

    try {
      const parsed = JSON.parse(response.content);
      return {
        changeType: parsed.changeType || 'chore',
        impact: parsed.impact || 'medium',
        risks: parsed.risks || [],
        suggestions: parsed.suggestions || [],
        summary: parsed.summary || ''
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return null;
    }
  }

  /**
   * Generate comprehensive analysis in a single AI request
   */
  async generateComprehensiveAnalysis(context: {
    diff: string;
    filesChanged: string[];
    status: {
      staged: string[];
      unstaged: string[];
      untracked: string[];
    };
    recentCommits?: Array<{
      message: string;
      hash: string;
    }>;
    branch: string;
    baseBranch?: string;
    projectType?: string;
  }): Promise<ComprehensiveAnalysis | null> {
    const prompt = `Analyze these git changes and provide comprehensive information for a complete git workflow:

FILES CHANGED (${context.filesChanged.length} files):
${context.filesChanged.map(f => `- ${f}`).join('\n')}

STAGED FILES:
${context.status.staged.map(f => `- ${f}`).join('\n')}

CURRENT BRANCH: ${context.branch}
BASE BRANCH: ${context.baseBranch || 'main'}

GIT DIFF:
${context.diff.substring(0, 3000)}${context.diff.length > 3000 ? '\n... (truncated for length)' : ''}

${context.recentCommits ? `RECENT COMMITS:
${context.recentCommits.slice(0, 3).map(c => `- ${c.message}`).join('\n')}` : ''}

RESPOND WITH ONLY VALID JSON - NO MARKDOWN, NO EXPLANATIONS:

{
  "commit": {
    "message": "conventional commit message under 50 characters",
    "type": "feat|fix|docs|style|refactor|test|chore|perf|ci|build",
    "scope": "optional scope (kebab-case, no spaces)",
    "description": "imperative mood description",
    "breaking": false,
    "body": "optional multiline body",
    "footer": "optional footer for breaking changes"
  },
  "branch": {
    "name": "kebab-case-branch-name-with-prefix",
    "description": "brief explanation of the branch purpose",
    "alternative": "alternative-branch-name"
  },
  "analysis": {
    "changeType": "feature|bugfix|refactor|docs|config|test|chore",
    "impact": "low|medium|high",
    "risks": ["potential risks or concerns"],
    "suggestions": ["improvement suggestions"],
    "summary": "comprehensive summary of what these changes accomplish"
  },
  "pr": {
    "title": "Clear, descriptive PR title under 72 characters",
    "description": "Detailed markdown PR description with summary, testing notes, and impact",
    "labels": ["relevant", "labels", "based", "on", "changes"],
    "reviewers": []
  }
}

CRITICAL: Return ONLY the JSON object above with your analysis. Do NOT include markdown formatting, code blocks, or any explanatory text. The response must start with { and end with }.`;

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI comprehensive analysis failed:', response.error);
      return null;
    }

    try {
      // console.log('Parsing comprehensive AI analysis');
      
      // Parse Claude CLI wrapper response
      let actualContent = response.content;
      try {
        const wrapper = JSON.parse(response.content);
        
        // Handle different Claude CLI response types
        if (wrapper.type === 'result') {
          if (wrapper.subtype === 'success' && wrapper.result) {
            actualContent = wrapper.result;
          } else if (wrapper.subtype === 'error_during_execution') {
            console.error('Claude CLI execution error:', wrapper);
            return null;
          }
        }
      } catch (wrapperError) {
        // If it's not a wrapper, use content directly
        // console.log('Not a Claude CLI wrapper, using content directly');
      }
      
      // Clean up the content - remove code blocks if present
      let jsonContent = actualContent.trim();
      
      // Remove markdown code blocks
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonContent = codeBlockMatch[1].trim();
      }
      
      // Find JSON object boundaries
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
        throw new Error('No valid JSON object found in response');
      }
      
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      
      // console.log('Extracted JSON content length:', jsonContent.length);
      
      const parsed = JSON.parse(jsonContent);
      
      // Handle breaking changes in commit message format
      let commitMessage = parsed.commit?.message || '';
      if (parsed.commit?.breaking && parsed.commit?.type && parsed.commit?.scope) {
        // Add ! for breaking changes: type(scope)!: description
        commitMessage = commitMessage.replace(/^(\w+)(\([^)]+\))(:)/, '$1$2!$3');
      } else if (parsed.commit?.breaking && parsed.commit?.type) {
        // Add ! for breaking changes: type!: description
        commitMessage = commitMessage.replace(/^(\w+)(:)/, '$1!$2');
      }
      
      return {
        commit: {
          message: commitMessage,
          type: parsed.commit?.type || 'chore',
          scope: parsed.commit?.scope,
          description: parsed.commit?.description || '',
          breaking: parsed.commit?.breaking || false,
          body: parsed.commit?.body,
          footer: parsed.commit?.footer
        },
        branch: {
          name: parsed.branch?.name || '',
          description: parsed.branch?.description || '',
          alternative: parsed.branch?.alternative
        },
        analysis: {
          changeType: parsed.analysis?.changeType || 'chore',
          impact: parsed.analysis?.impact || 'medium',
          risks: parsed.analysis?.risks || [],
          suggestions: parsed.analysis?.suggestions || [],
          summary: parsed.analysis?.summary || ''
        },
        pr: {
          title: parsed.pr?.title || '',
          description: parsed.pr?.description || '',
          labels: parsed.pr?.labels || [],
          reviewers: parsed.pr?.reviewers || []
        }
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError instanceof Error ? parseError.message : 'Unknown error');
      console.log('Raw response content:', response.content.substring(0, 1000));
      return null;
    }
  }

  /**
   * Analyze and resolve merge conflicts using AI
   */
  async analyzeAndResolveConflicts(conflictData: ConflictData): Promise<ConflictResolution | null> {
    try {
      const prompt = `You are an expert software engineer with deep knowledge of git merge conflicts and code semantics. Analyze the following merge conflicts and provide intelligent resolution.

CONFLICT CONTEXT:
- Branch: ${conflictData.branch} merging into ${conflictData.baseBranch}
- Files: ${conflictData.files.join(', ')}
- File types: ${conflictData.fileTypes.join(', ')}
- Recent commits:
${conflictData.commits.map(c => `  - ${c.hash.slice(0, 8)}: ${c.message} (${c.author})`).join('\n')}

CONFLICT SECTIONS:
${conflictData.conflictSections.map(section => `
File: ${section.file}
Lines: ${section.startLine}-${section.endLine}

<<<<<<< HEAD (ours - ${conflictData.baseBranch})
${section.oursContent}
=======
${section.theirsContent}
>>>>>>> ${conflictData.branch}

Context around conflict:
${section.context}
`).join('\n---\n')}

RESOLUTION GUIDELINES:
1. SEMANTIC ANALYSIS: Understand the purpose and functionality of each conflicting change
2. COMPATIBILITY: Preserve functionality from both sides when possible
3. SAFETY: Flag high-risk conflicts that could break functionality
4. CODE QUALITY: Maintain consistency, style, and best practices
5. BUSINESS LOGIC: Prioritize preserving critical business functionality

CONFIDENCE LEVELS:
- HIGH (90-100%): Simple, non-overlapping changes that can be safely merged
- MEDIUM (70-89%): Compatible changes with minor complexity
- LOW (50-69%): Complex changes requiring careful analysis
- ESCALATE (<50%): High-risk conflicts requiring human review

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "strategy": "auto" | "manual" | "escalate",
  "confidence": 0-100,
  "reasoning": "Detailed explanation of the analysis and decisions",
  "resolvedFiles": [
    {
      "path": "filename",
      "content": "complete resolved file content",
      "changes": "summary of what was changed",
      "reasoning": "why this resolution was chosen"
    }
  ],
  "unresolved": ["files that need manual resolution"],
  "warnings": ["potential issues or things to watch out for"]
}

IMPORTANT:
- If confidence < 70%, use "escalate" strategy
- For "auto" strategy, provide complete resolved file content
- For "escalate" strategy, explain what makes the conflict complex
- Always prioritize code safety over convenience`;

      const response = await this.executeClaudeCommand(prompt, {
        maxTokens: 8192,
        outputFormat: 'json'
      });

      if (!response.success) {
        console.error('AI conflict analysis failed:', response.error);
        return null;
      }

      try {
        // Parse the response similar to other AI methods
        let actualContent = response.content;
        
        // Handle Claude CLI wrapper responses
        try {
          const wrapper = JSON.parse(response.content);
          if (wrapper.type === 'result' && wrapper.subtype === 'success' && wrapper.result) {
            actualContent = wrapper.result;
          }
        } catch {
          // Not a wrapper, use content directly
        }
        
        // Clean up the content
        let jsonContent = actualContent.trim();
        
        // Remove markdown code blocks if present
        const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonContent = codeBlockMatch[1].trim();
        }
        
        // Find JSON boundaries
        const jsonStart = jsonContent.indexOf('{');
        const jsonEnd = jsonContent.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
          throw new Error('No valid JSON object found in AI response');
        }
        
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonContent);
        
        // Validate the response structure
        if (!parsed.strategy || !parsed.confidence || !parsed.reasoning) {
          throw new Error('AI response missing required fields');
        }
        
        return {
          strategy: parsed.strategy,
          resolvedFiles: parsed.resolvedFiles || [],
          unresolved: parsed.unresolved || [],
          reasoning: parsed.reasoning,
          confidence: parsed.confidence,
          warnings: parsed.warnings || []
        };
        
      } catch (parseError) {
        console.error('Failed to parse AI conflict resolution:', parseError);
        console.log('Raw response:', response.content.substring(0, 1000));
        return null;
      }
      
    } catch (error) {
      console.error('AI conflict resolution failed:', error);
      return null;
    }
  }

  /**
   * Check if Claude CLI is available and properly configured using a simple test call
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.executeClaudeCommand('test', { outputFormat: 'text' });
      console.log('isAvailable check:', { success: response.success, contentLength: response.content?.length, error: response.error });
      return response.success && response.content.length > 0;
    } catch (error) {
      console.error('isAvailable error:', error);
      return false;
    }
  }
}