import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { ParsedClaudeResponse, ConflictData, ConflictResolutionResult, ResolvedConflictFile } from '../types';

const execAsync = promisify(exec);

// Constants for retry mechanism configuration
const DEFAULT_TIMEOUT_MS = 120000; // 120 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds maximum delay
const RETRY_JITTER_FACTOR = 0.25; // ±25% random variation
const EXPONENTIAL_BACKOFF_BASE = 2;

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

/**
 * Security configuration for AI prompt protection
 */
interface SecurityConfig {
  maxPromptLength: number;
  maxDiffLength: number;
  maxFileNameLength: number;
  maxCommitMessageLength: number;
  maxConflictSectionLength: number;
  maxFileListLength: number;
}

/**
 * Default security limits for prompt injection protection
 */
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxPromptLength: 50000,        // Total prompt length limit
  maxDiffLength: 3000,           // Git diff content limit
  maxFileNameLength: 255,        // Individual file name limit
  maxCommitMessageLength: 500,   // Commit message limit
  maxConflictSectionLength: 2000, // Individual conflict section limit
  maxFileListLength: 50          // Maximum number of files to include
};


export class AIService {
  private claudeCommand: string;
  private defaultModel: string;
  private timeout: number;
  private maxRetries: number;
  private baseRetryDelay: number;
  private securityConfig: SecurityConfig;

  constructor() {
    // Validate and set configuration from environment variables
    this.claudeCommand = this.getValidatedClaudeCommand();
    this.defaultModel = this.getValidatedModel();
    this.timeout = this.getValidatedTimeout();
    this.maxRetries = this.getValidatedMaxRetries();
    this.baseRetryDelay = this.getValidatedBaseRetryDelay();
    this.securityConfig = this.getSecurityConfig();
  }

  /**
   * Validate and get Claude command from environment
   */
  private getValidatedClaudeCommand(): string {
    const envValue = process.env['GITPLUS_CLAUDE_COMMAND'];
    const command = envValue !== undefined ? envValue : 'claude';
    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('GITPLUS_CLAUDE_COMMAND must be a non-empty string');
    }
    return command.trim();
  }

  /**
   * Validate and get AI model from environment
   */
  private getValidatedModel(): string {
    const envValue = process.env['GITPLUS_MODEL'];
    const model = envValue !== undefined ? envValue : 'sonnet';
    const validModels = ['sonnet', 'haiku', 'opus'];
    if (!validModels.includes(model)) {
      throw new Error(`GITPLUS_MODEL must be one of: ${validModels.join(', ')}`);
    }
    return model;
  }

  /**
   * Validate and get timeout from environment
   */
  private getValidatedTimeout(): number {
    const envValue = process.env['GITPLUS_TIMEOUT'];
    const timeoutStr = envValue !== undefined ? envValue : DEFAULT_TIMEOUT_MS.toString();
    const timeout = parseInt(timeoutStr, 10);
    
    if (isNaN(timeout)) {
      throw new Error(`GITPLUS_TIMEOUT must be a valid number, got: ${timeoutStr}`);
    }
    
    if (timeout < 1000) {
      throw new Error('GITPLUS_TIMEOUT must be at least 1000ms (1 second)');
    }
    
    if (timeout > 600000) {
      throw new Error('GITPLUS_TIMEOUT must be at most 600000ms (10 minutes)');
    }
    
    return timeout;
  }

  /**
   * Validate and get max retries from environment
   */
  private getValidatedMaxRetries(): number {
    const envValue = process.env['GITPLUS_MAX_RETRIES'];
    const retriesStr = envValue !== undefined ? envValue : DEFAULT_MAX_RETRIES.toString();
    const retries = parseInt(retriesStr, 10);
    
    if (isNaN(retries)) {
      throw new Error(`GITPLUS_MAX_RETRIES must be a valid number, got: ${retriesStr}`);
    }
    
    if (retries < 0) {
      throw new Error('GITPLUS_MAX_RETRIES must be at least 0');
    }
    
    if (retries > 10) {
      throw new Error('GITPLUS_MAX_RETRIES must be at most 10');
    }
    
    return retries;
  }

  /**
   * Validate and get base retry delay from environment
   */
  private getValidatedBaseRetryDelay(): number {
    const envValue = process.env['GITPLUS_BASE_RETRY_DELAY'];
    const delayStr = envValue !== undefined ? envValue : DEFAULT_BASE_RETRY_DELAY_MS.toString();
    const delay = parseInt(delayStr, 10);
    
    if (isNaN(delay)) {
      throw new Error(`GITPLUS_BASE_RETRY_DELAY must be a valid number, got: ${delayStr}`);
    }
    
    if (delay < 100) {
      throw new Error('GITPLUS_BASE_RETRY_DELAY must be at least 100ms');
    }
    
    if (delay > 10000) {
      throw new Error('GITPLUS_BASE_RETRY_DELAY must be at most 10000ms (10 seconds)');
    }
    
    return delay;
  }

  /**
   * Get security configuration from environment or use defaults
   */
  private getSecurityConfig(): SecurityConfig {
    return {
      maxPromptLength: this.getEnvNumber('GITPLUS_MAX_PROMPT_LENGTH', DEFAULT_SECURITY_CONFIG.maxPromptLength),
      maxDiffLength: this.getEnvNumber('GITPLUS_MAX_DIFF_LENGTH', DEFAULT_SECURITY_CONFIG.maxDiffLength),
      maxFileNameLength: this.getEnvNumber('GITPLUS_MAX_FILENAME_LENGTH', DEFAULT_SECURITY_CONFIG.maxFileNameLength),
      maxCommitMessageLength: this.getEnvNumber('GITPLUS_MAX_COMMIT_MSG_LENGTH', DEFAULT_SECURITY_CONFIG.maxCommitMessageLength),
      maxConflictSectionLength: this.getEnvNumber('GITPLUS_MAX_CONFLICT_LENGTH', DEFAULT_SECURITY_CONFIG.maxConflictSectionLength),
      maxFileListLength: this.getEnvNumber('GITPLUS_MAX_FILE_LIST_LENGTH', DEFAULT_SECURITY_CONFIG.maxFileListLength)
    };
  }

  /**
   * Get environment variable as number with validation
   */
  private getEnvNumber(envVar: string, defaultValue: number): number {
    const value = process.env[envVar];
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      console.warn(`Invalid ${envVar}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return parsed;
  }

  /**
   * Sanitize user input to prevent prompt injection attacks
   */
  private sanitizeInput(input: string, maxLength?: number): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input
      // Remove or escape dangerous characters that could break prompt structure
      .replace(/`+/g, '`')                // Limit consecutive backticks to single backtick
      .replace(/\$\{/g, '\\${')           // Escape template literals
      .replace(/<\|/g, '&lt;|')           // Escape potential prompt tokens
      .replace(/\|>/g, '|&gt;')           // Escape potential prompt tokens
      .replace(/\[INST\]/gi, '[INST-ESCAPED]')  // Escape instruction tokens
      .replace(/\[\/INST\]/gi, '[/INST-ESCAPED]') // Escape instruction tokens
      .replace(/Human:/gi, 'Human-Escaped:')     // Escape role indicators
      .replace(/Assistant:/gi, 'Assistant-Escaped:') // Escape role indicators
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Limit consecutive newlines
      .trim();

    // Apply length limit if specified
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength - 20) + '... [truncated]';
    }

    return sanitized;
  }

  /**
   * Sanitize file path to prevent directory traversal and other attacks
   */
  private sanitizeFilePath(path: string): string {
    if (!path || typeof path !== 'string') {
      return 'invalid-path';
    }

    return path
      .replace(/\.\./g, '')           // Remove directory traversal
      .replace(/[<>"|*?]/g, '_')      // Replace problematic characters
      .replace(/\0/g, '')             // Remove null bytes
      .substring(0, this.securityConfig.maxFileNameLength);
  }

  /**
   * Sanitize git diff content with length limits and content filtering
   */
  private sanitizeDiff(diff: string): string {
    if (!diff || typeof diff !== 'string') {
      return '';
    }

    // First apply general sanitization
    let sanitized = this.sanitizeInput(diff);

    // Apply diff-specific sanitization
    sanitized = sanitized
      .replace(/password\s*[:=]\s*[^\s\n]+/gi, 'password: [REDACTED]')
      .replace(/token\s*[:=]\s*[^\s\n]+/gi, 'token: [REDACTED]')
      .replace(/key\s*[:=]\s*[^\s\n]+/gi, 'key: [REDACTED]')
      .replace(/secret\s*[:=]\s*[^\s\n]+/gi, 'secret: [REDACTED]');

    // Apply length limit
    if (sanitized.length > this.securityConfig.maxDiffLength) {
      sanitized = sanitized.substring(0, this.securityConfig.maxDiffLength - 50) + '\n... [diff truncated for security]';
    }

    return sanitized;
  }

  /**
   * Sanitize commit message with length and content validation
   */
  private sanitizeCommitMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return '';
    }

    return this.sanitizeInput(message, this.securityConfig.maxCommitMessageLength);
  }

  /**
   * Sanitize file list with count and individual file limits
   */
  private sanitizeFileList(files: string[]): string[] {
    if (!Array.isArray(files)) {
      return [];
    }

    return files
      .slice(0, this.securityConfig.maxFileListLength)
      .map(file => this.sanitizeFilePath(file))
      .filter(file => file && file !== 'invalid-path');
  }

  /**
   * Detect potential prompt injection patterns
   */
  private detectPromptInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const injectionPatterns = [
      /ignore\s+(?:previous|all)\s+instructions/i,
      /forget\s+(?:everything|all|instructions)/i,
      /new\s+instructions?:/i,
      /system\s*:\s*you\s+(?:are|must)/i,
      /override\s+(?:security|safety|instructions)/i,
      /\[INST\].*?\[\/INST\]/i,
      /human\s*:\s*(?:ignore|forget|override)/i,
      /assistant\s*:\s*(?:i\s+will|ok\s+i)/i,
      /jailbreak|prompt\s+injection/i,
      /execute\s+(?:code|command|script)/i,
      /```.*?\bexec\b.*?```/i,
      /\$\(.*?\)/,  // Command substitution
      /`.*?`/       // Backtick commands (limited)
    ];

    return injectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Validate total prompt length to prevent overflow attacks
   */
  private validatePromptLength(prompt: string): boolean {
    return prompt.length <= this.securityConfig.maxPromptLength;
  }

  /**
   * Secure prompt builder with boundaries and injection detection
   */
  private buildSecurePrompt(template: string, data: Record<string, any>): string {
    // First, sanitize all data inputs
    const sanitizedData: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Check for injection attempts
        if (this.detectPromptInjection(value)) {
          throw new Error(`Potential prompt injection detected in ${key}`);
        }
        sanitizedData[key] = this.sanitizeInput(value);
      } else if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
        // Handle string arrays (like file lists)
        sanitizedData[key] = this.sanitizeFileList(value);
      } else {
        sanitizedData[key] = value;
      }
    }

    // Build prompt with clear delimiters
    let prompt = `=== SYSTEM INSTRUCTIONS ===
${template}

=== USER DATA START ===
`;

    // Add data with clear boundaries
    for (const [key, value] of Object.entries(sanitizedData)) {
      if (Array.isArray(value)) {
        prompt += `${key.toUpperCase()}:\n${value.map(item => `- ${item}`).join('\n')}\n\n`;
      } else {
        prompt += `${key.toUpperCase()}:\n${value}\n\n`;
      }
    }

    prompt += `=== USER DATA END ===

Please analyze the user data above and respond according to the system instructions.`;

    // Validate total length
    if (!this.validatePromptLength(prompt)) {
      throw new Error(`Prompt length exceeds security limit of ${this.securityConfig.maxPromptLength} characters`);
    }

    return prompt;
  }

  /**
   * Execute Claude CLI command with retry logic and exponential backoff
   */
  private async executeClaudeCommand(
    prompt: string, 
    options: {
      model?: string;
      outputFormat?: 'text' | 'json';
      maxTokens?: number;
      retryCount?: number;
    } = {}
  ): Promise<AIResponse> {
    const { model = this.defaultModel, outputFormat = 'text', retryCount = 0 } = options;
    
    try {
      const result = await this.executeClaudeCommandAttempt(prompt, model, outputFormat);
      
      // If successful, return result
      if (result.success) {
        return result;
      }
      
      // Handle retry logic for failed attempts
      return await this.handleRetryLogic(result, prompt, options);
      
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: `Unexpected error in Claude CLI execution: ${error.message || 'Unknown error occurred'}`
      };
    }
  }

  /**
   * Handle retry logic for failed Claude CLI attempts
   */
  private async handleRetryLogic(
    failedResult: AIResponse,
    prompt: string,
    options: {
      model?: string;
      outputFormat?: 'text' | 'json';
      maxTokens?: number;
      retryCount?: number;
    }
  ): Promise<AIResponse> {
    const { retryCount = 0 } = options;
    
    // Check if this is a retryable error
    const isRetryable = this.isRetryableError(failedResult.error || '');
    
    // If not retryable or we've exceeded max retries, return the error
    if (!isRetryable || retryCount >= this.maxRetries) {
      return failedResult;
    }
    
    // Execute retry with delay
    await this.executeRetryDelay(retryCount, failedResult.error);
    
    // Retry with incremented count
    return this.executeClaudeCommand(prompt, {
      ...options,
      retryCount: retryCount + 1
    });
  }

  /**
   * Execute retry delay with logging
   */
  private async executeRetryDelay(retryCount: number, error?: string): Promise<void> {
    const delay = this.calculateRetryDelay(retryCount);
    
    // Log retry attempt for debugging (only in development)
    if (this.shouldLogRetryAttempts()) {
      console.log(`AI service retry ${retryCount + 1}/${this.maxRetries} after ${delay}ms: ${error}`);
    }
    
    // Wait for the calculated delay
    await this.sleep(delay);
  }

  /**
   * Determine if retry attempts should be logged
   */
  private shouldLogRetryAttempts(): boolean {
    return process.env['NODE_ENV'] === 'development' || process.env['GITPLUS_DEBUG'] === 'true';
  }

  /**
   * Single attempt to execute Claude CLI command
   */
  private async executeClaudeCommandAttempt(
    prompt: string,
    model: string,
    outputFormat: string
  ): Promise<AIResponse> {
    return new Promise<AIResponse>((resolve) => {
      const args = ['-p', prompt, '--model', model, '--output-format', outputFormat];
      
      const child = spawn(this.claudeCommand, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Set up timeout handling for proper cleanup
      if (this.timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            child.kill('SIGTERM');
            resolve({
              success: false,
              content: '',
              error: `Claude CLI timeout after ${this.timeout}ms`
            });
          }
        }, this.timeout);
      }

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (isResolved) return;
        isResolved = true;
        
        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        if (code !== 0 && !stdout) {
          resolve({
            success: false,
            content: '',
            error: `Claude CLI error (exit code ${code}): ${stderr || 'Process failed with no error message'}`
          });
          return;
        }

        // Handle timeout specifically
        if (code === null) {
          resolve({
            success: false,
            content: '',
            error: `Claude CLI timeout after ${this.timeout}ms`
          });
          return;
        }

        // Claude CLI often writes status messages to stderr even on success
        if (!stdout || stdout.trim().length === 0) {
          resolve({
            success: false,
            content: '',
            error: `Claude CLI error: ${stderr || 'No output received from Claude API'}`
          });
          return;
        }

        resolve({
          success: true,
          content: stdout.trim()
        });
      });

      child.on('error', (error: Error) => {
        if (isResolved) return;
        isResolved = true;
        
        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        resolve({
          success: false,
          content: '',
          error: `Failed to execute Claude CLI at ${this.claudeCommand}: ${error.message}. Check if Claude CLI is installed and in PATH.`
        });
      });
    });
  }

  /**
   * Check if an error is retryable (transient failure)
   */
  private isRetryableError(error: string): boolean {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /rate limit/i,
      /throttle/i,
      /5\d\d/,  // 5xx HTTP errors
      /temporarily unavailable/i,
      /service unavailable/i,
      /internal server error/i,
      /bad gateway/i,
      /gateway timeout/i
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error));
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * EXPONENTIAL_BACKOFF_BASE^retryCount
    const exponentialDelay = this.baseRetryDelay * Math.pow(EXPONENTIAL_BACKOFF_BASE, retryCount);
    
    // Add jitter to prevent thundering herd (±RETRY_JITTER_FACTOR random variation)
    const randomFactor = 1 + (Math.random() * 2 - 1) * RETRY_JITTER_FACTOR;
    
    // Cap at MAX_RETRY_DELAY_MS maximum
    return Math.min(exponentialDelay * randomFactor, MAX_RETRY_DELAY_MS);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Type guard to check if a value is a string
   */
  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  /**
   * Type guard to check if a value is a boolean
   */
  private isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  /**
   * Type guard to check if a value is a number
   */
  private isNumber(value: unknown): value is number {
    return typeof value === 'number';
  }

  /**
   * Type guard to check if a value is an array
   */
  private isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  /**
   * Type guard to check if a value is an object
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Safely get a string property from an object
   */
  private getString(obj: Record<string, unknown>, key: string, defaultValue = ''): string {
    const value = obj[key];
    return this.isString(value) ? value : defaultValue;
  }

  /**
   * Safely get a boolean property from an object
   */
  private getBoolean(obj: Record<string, unknown>, key: string, defaultValue = false): boolean {
    const value = obj[key];
    return this.isBoolean(value) ? value : defaultValue;
  }

  /**
   * Safely get a number property from an object
   */
  private getNumber(obj: Record<string, unknown>, key: string, defaultValue = 0): number {
    const value = obj[key];
    return this.isNumber(value) ? value : defaultValue;
  }

  /**
   * Safely get an array property from an object
   */
  private getArray(obj: Record<string, unknown>, key: string, defaultValue: unknown[] = []): unknown[] {
    const value = obj[key];
    return this.isArray(value) ? value : defaultValue;
  }

  /**
   * Safely get a string array property from an object
   */
  private getStringArray(obj: Record<string, unknown>, key: string, defaultValue: string[] = []): string[] {
    const value = obj[key];
    if (this.isArray(value)) {
      return value.filter(this.isString);
    }
    return defaultValue;
  }

  /**
   * Safely get an object property from an object
   */
  private getObject(obj: Record<string, unknown>, key: string, defaultValue: Record<string, unknown> = {}): Record<string, unknown> {
    const value = obj[key];
    return this.isObject(value) ? value : defaultValue;
  }

  /**
   * Parse Claude CLI JSON response with wrapper handling and cleanup
   */
  private parseClaudeJSONResponse(content: string): Record<string, unknown> {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Empty or invalid AI response content');
    }

    let actualContent = content.trim();

    // Handle Claude CLI wrapper responses with type safety
    try {
      const wrapper = JSON.parse(content);
      
      // Ensure wrapper is an object before accessing properties
      if (this.isObject(wrapper)) {
        // Handle different Claude CLI response types
        if (this.getString(wrapper, 'type') === 'result') {
          const subtype = this.getString(wrapper, 'subtype');
          if (subtype === 'success' && wrapper['result']) {
            // Ensure result is a string before using it
            const result = wrapper['result'];
            if (typeof result === 'string') {
              actualContent = result;
            }
          } else if (subtype === 'error_during_execution') {
            const errorMsg = this.getString(wrapper, 'error', 'Unknown execution error');
            throw new Error(`Claude CLI execution error: ${errorMsg}`);
          }
        }
      }
    } catch (wrapperError) {
      // If it's not a wrapper, continue with original content
      // This is expected behavior for direct JSON responses
      if (wrapperError instanceof Error && wrapperError.message.includes('Claude CLI execution error')) {
        throw wrapperError; // Re-throw execution errors
      }
    }

    // Clean up the content - remove markdown code blocks if present
    let jsonContent = actualContent.trim();
    
    // Remove markdown code blocks with better type safety
    const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1] && typeof codeBlockMatch[1] === 'string') {
      jsonContent = codeBlockMatch[1].trim();
    }
    
    // Find JSON object boundaries with validation
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      throw new Error('No valid JSON object found in AI response');
    }
    
    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    
    // Validate JSON content is not empty after cleanup
    if (!jsonContent || jsonContent.trim().length < 2) {
      throw new Error('JSON content is empty after cleanup');
    }
    
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Ensure the parsed result is an object
      if (!this.isObject(parsed)) {
        throw new Error('Parsed JSON is not an object');
      }
      
      return parsed;
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
      throw new Error(`Failed to parse JSON response: ${errorMessage}`);
    }
  }

  /**
   * Validate required fields in parsed AI response
   */
  private validateRequiredFields(parsed: Record<string, unknown>, requiredFields: string[], context: string): void {
    const missingFields = requiredFields.filter(field => {
      const keys = field.split('.');
      let current: unknown = parsed;
      for (const key of keys) {
        if (!this.isObject(current) || !(key in current)) {
          return true;
        }
        current = current[key];
      }
      return false;
    });

    if (missingFields.length > 0) {
      throw new Error(`AI response for ${context} missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Generate intelligent commit message using Claude AI following Conventional Commits specification
   * 
   * @param context - Git repository context for commit message generation
   * @param context.diff - Git diff output showing changes to be committed
   * @param context.filesChanged - Array of file paths that have changed
   * @param context.status - Git status with staged, unstaged, and untracked files
   * @param context.recentCommits - Optional recent commit history for context
   * @param context.projectType - Optional project type hint (e.g., 'node', 'python')
   * @returns Promise resolving to commit suggestion or null if generation fails
   * 
   * @example
   * ```typescript
   * const suggestion = await aiService.generateCommitMessage({
   *   diff: gitDiff,
   *   filesChanged: ['src/auth.ts', 'tests/auth.test.ts'],
   *   status: gitStatus,
   *   recentCommits: recentCommits
   * });
   * 
   * if (suggestion) {
   *   console.log(`Suggested: ${suggestion.message}`);
   *   console.log(`Type: ${suggestion.type}, Breaking: ${suggestion.breaking}`);
   * }
   * ```
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
    try {
      // Sanitize all inputs
      const sanitizedContext = {
        diff: this.sanitizeDiff(context.diff),
        filesChanged: this.sanitizeFileList(context.filesChanged),
        staged: this.sanitizeFileList(context.status.staged),
        unstaged: this.sanitizeFileList(context.status.unstaged),
        untracked: this.sanitizeFileList(context.status.untracked),
        recentCommits: context.recentCommits?.slice(0, 3).map(c => ({
          message: this.sanitizeCommitMessage(c.message),
          hash: this.sanitizeInput(c.hash, 40)
        })) || []
      };

      // Build secure prompt template
      const template = `Analyze the provided git changes and generate a STRICT Conventional Commits message.

RESPOND WITH JSON ONLY:
{
  "message": "type(scope): description",
  "type": "feat|fix|docs|style|refactor|test|chore|perf|ci|build",
  "scope": "optional scope (kebab-case)",
  "description": "imperative mood description",
  "breaking": false,
  "body": "optional multiline body",
  "footer": "optional footer for breaking changes"
}

STRICT CONVENTIONAL COMMITS SPECIFICATION:
Format: <type>[optional scope]: <description>

REQUIRED TYPES (only these are allowed):
- feat: A new feature (correlates with MINOR in semantic versioning)
- fix: A bug fix (correlates with PATCH in semantic versioning)  
- docs: Documentation only changes
- style: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- refactor: A code change that neither fixes a bug nor adds a feature
- perf: A code change that improves performance
- test: Adding missing tests or correcting existing tests
- build: Changes that affect the build system or external dependencies
- ci: Changes to CI configuration files and scripts
- chore: Other changes that don't modify src or test files

BREAKING CHANGES:
- Add "!" after type/scope: feat(api)!: remove deprecated endpoints
- OR include "BREAKING CHANGE:" in footer

RULES:
1. Type must be lowercase, from approved list above
2. Scope is optional, lowercase, kebab-case if used
3. Description: imperative mood, lowercase, no period, under 50 chars
4. Breaking changes MUST be marked with ! or BREAKING CHANGE: footer

EXAMPLES:
- feat: add user authentication
- fix(api): handle null response in user service  
- docs: update installation instructions
- style: fix indentation in components
- refactor(auth): extract validation logic
- perf: improve query performance by 50%
- test: add unit tests for login
- build: update dependencies
- ci: add automated testing
- chore: update license year

ANALYZE THE CHANGES AND GENERATE THE MOST APPROPRIATE CONVENTIONAL COMMIT MESSAGE.`;

      const prompt = this.buildSecurePrompt(template, {
        filesChanged: sanitizedContext.filesChanged,
        stagedFiles: sanitizedContext.staged,
        gitDiff: sanitizedContext.diff,
        recentCommits: sanitizedContext.recentCommits.map(c => `${c.hash.substring(0, 7)}: ${c.message}`).join('\n')
      });

      const response = await this.executeClaudeCommand(prompt, {
        outputFormat: 'json',
        model: 'sonnet'
      });

      if (!response.success) {
        console.error('AI commit generation failed:', response.error);
        return null;
      }

      if (!response.content || response.content.trim().length === 0) {
        console.error('AI commit generation returned empty response');
        return null;
      }

      try {
        const parsed = this.parseClaudeJSONResponse(response.content);
        
        // Validate required fields
        this.validateRequiredFields(parsed, ['type', 'message'], 'commit message generation');
        
        // Handle breaking changes in message format
        let message = this.getString(parsed, 'message');
        const breaking = this.getBoolean(parsed, 'breaking');
        const type = this.getString(parsed, 'type');
        const scope = this.getString(parsed, 'scope');
        
        if (breaking && type && scope) {
          // Add ! for breaking changes: type(scope)!: description
          message = message.replace(/^(\w+)(\([^)]+\))(:)/, '$1$2!$3');
        } else if (breaking && type) {
          // Add ! for breaking changes: type!: description
          message = message.replace(/^(\w+)(:)/, '$1!$2');
        }
        
        return {
          message,
          type: type || 'chore',
          scope: scope || undefined,
          description: this.getString(parsed, 'description'),
          breaking,
          body: this.getString(parsed, 'body') || undefined,
          footer: this.getString(parsed, 'footer') || undefined
        };
      } catch (error) {
        console.error('Failed to parse AI response:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Raw content sample:', response.content.substring(0, 500));
        return null;
      }
    } catch (securityError) {
      console.error('Security error in commit message generation:', securityError instanceof Error ? securityError.message : 'Unknown security error');
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
    try {
      // Sanitize all inputs
      const sanitizedContext = {
        commitMessage: context.commitMessage ? this.sanitizeCommitMessage(context.commitMessage) : '',
        filesChanged: this.sanitizeFileList(context.filesChanged).slice(0, 10),
        changeType: this.sanitizeInput(context.changeType, 50),
        description: context.description ? this.sanitizeInput(context.description, 200) : ''
      };

      const template = `Generate a git branch name for the provided changes.

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

      const prompt = this.buildSecurePrompt(template, {
        changeType: sanitizedContext.changeType,
        filesChanged: sanitizedContext.filesChanged,
        commitMessage: sanitizedContext.commitMessage,
        description: sanitizedContext.description
      });

      const response = await this.executeClaudeCommand(prompt, {
        outputFormat: 'json',
        model: 'sonnet'
      });

      if (!response.success) {
        console.error('AI branch generation failed:', response.error);
        return null;
      }

      try {
        const parsed = this.parseClaudeJSONResponse(response.content);
        this.validateRequiredFields(parsed, ['name'], 'branch name generation');
        
        return {
          name: this.getString(parsed, 'name'),
          description: this.getString(parsed, 'description'),
          alternative: this.getString(parsed, 'alternative') || undefined
        };
      } catch (error) {
        console.error('Failed to parse AI response for branch name:', error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    } catch (securityError) {
      console.error('Security error in branch name generation:', securityError instanceof Error ? securityError.message : 'Unknown security error');
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
    try {
      // Sanitize all inputs
      const sanitizedContext = {
        commits: context.commits.slice(0, 10).map(c => ({
          message: this.sanitizeCommitMessage(c.message),
          hash: this.sanitizeInput(c.hash, 40)
        })),
        filesChanged: this.sanitizeFileList(context.filesChanged),
        diff: this.sanitizeDiff(context.diff),
        branch: this.sanitizeInput(context.branch, 100),
        baseBranch: this.sanitizeInput(context.baseBranch, 100),
        template: context.template ? this.sanitizeInput(context.template, 1000) : ''
      };

      const template = `Generate a pull request title and description for the provided changes.

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

      const prompt = this.buildSecurePrompt(template, {
        branchInfo: `${sanitizedContext.branch} → ${sanitizedContext.baseBranch}`,
        filesChanged: sanitizedContext.filesChanged.slice(0, 15),
        additionalFiles: sanitizedContext.filesChanged.length > 15 ? `... and ${sanitizedContext.filesChanged.length - 15} more files` : '',
        commits: sanitizedContext.commits.map(c => `${c.hash.substring(0, 7)}: ${c.message}`),
        diffSummary: sanitizedContext.diff,
        prTemplate: sanitizedContext.template
      });

      const response = await this.executeClaudeCommand(prompt, {
        outputFormat: 'json',
        model: 'sonnet'
      });

      if (!response.success) {
        console.error('AI PR generation failed:', response.error);
        return null;
      }

      try {
        const parsed = this.parseClaudeJSONResponse(response.content);
        this.validateRequiredFields(parsed, ['title', 'description'], 'PR description generation');
        
        return {
          title: this.getString(parsed, 'title'),
          description: this.getString(parsed, 'description'),
          labels: this.getStringArray(parsed, 'labels'),
          reviewers: this.getStringArray(parsed, 'reviewers')
        };
      } catch (error) {
        console.error('Failed to parse AI response for PR description:', error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    } catch (securityError) {
      console.error('Security error in PR description generation:', securityError instanceof Error ? securityError.message : 'Unknown security error');
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
    try {
      // Sanitize all inputs
      const sanitizedContext = {
        diff: this.sanitizeDiff(context.diff),
        filesChanged: this.sanitizeFileList(context.filesChanged),
        commits: context.commits.slice(0, 5).map(c => ({
          message: this.sanitizeCommitMessage(c.message),
          hash: this.sanitizeInput(c.hash, 40)
        })),
        branch: this.sanitizeInput(context.branch, 100)
      };

      const template = `Analyze the provided git changes and provide intelligent insights.

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

      const prompt = this.buildSecurePrompt(template, {
        branch: sanitizedContext.branch,
        filesChanged: sanitizedContext.filesChanged,
        recentCommits: sanitizedContext.commits.map(c => `${c.hash.substring(0, 7)}: ${c.message}`),
        diff: sanitizedContext.diff
      });

      const response = await this.executeClaudeCommand(prompt, {
        outputFormat: 'json',
        model: 'sonnet'
      });

      if (!response.success) {
        console.error('AI analysis failed:', response.error);
        return null;
      }

      try {
        const parsed = this.parseClaudeJSONResponse(response.content);
        this.validateRequiredFields(parsed, ['changeType', 'impact', 'summary'], 'change analysis');
        
        const impact = this.getString(parsed, 'impact') as 'low' | 'medium' | 'high';
        
        return {
          changeType: this.getString(parsed, 'changeType', 'chore'),
          impact: ['low', 'medium', 'high'].includes(impact) ? impact : 'medium',
          risks: this.getStringArray(parsed, 'risks'),
          suggestions: this.getStringArray(parsed, 'suggestions'),
          summary: this.getString(parsed, 'summary')
        };
      } catch (error) {
        console.error('Failed to parse AI response for change analysis:', error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    } catch (securityError) {
      console.error('Security error in change analysis:', securityError instanceof Error ? securityError.message : 'Unknown security error');
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
    try {
      // Sanitize all inputs
      const sanitizedContext = {
        diff: this.sanitizeDiff(context.diff),
        filesChanged: this.sanitizeFileList(context.filesChanged),
        staged: this.sanitizeFileList(context.status.staged),
        unstaged: this.sanitizeFileList(context.status.unstaged),
        untracked: this.sanitizeFileList(context.status.untracked),
        recentCommits: context.recentCommits?.slice(0, 3).map(c => ({
          message: this.sanitizeCommitMessage(c.message),
          hash: this.sanitizeInput(c.hash, 40)
        })) || [],
        branch: this.sanitizeInput(context.branch, 100),
        baseBranch: this.sanitizeInput(context.baseBranch || 'main', 100)
      };

      const template = `Analyze the provided git changes and provide comprehensive information for a complete git workflow.

RESPOND WITH ONLY VALID JSON FOLLOWING STRICT CONVENTIONAL COMMITS:

{
  "commit": {
    "message": "conventional commit message under 50 characters",
    "type": "feat|fix|docs|style|refactor|test|chore|perf|ci|build",
    "scope": "optional scope (kebab-case)",
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
    "changeType": "feat|fix|docs|style|refactor|test|chore|perf|ci|build",
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

CONVENTIONAL COMMITS SPECIFICATION COMPLIANCE:
- Use ONLY approved types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
- Format: <type>[optional scope]: <description>
- Breaking changes: Add ! after type/scope OR use BREAKING CHANGE: footer
- Description: imperative mood, lowercase, no period, under 50 chars
- Scope: optional, kebab-case if used

CRITICAL: Return ONLY the JSON object above. No markdown formatting, code blocks, or explanatory text.`;

      const prompt = this.buildSecurePrompt(template, {
        filesChanged: sanitizedContext.filesChanged,
        stagedFiles: sanitizedContext.staged,
        currentBranch: sanitizedContext.branch,
        baseBranch: sanitizedContext.baseBranch,
        gitDiff: sanitizedContext.diff,
        recentCommits: sanitizedContext.recentCommits.map(c => `${c.hash.substring(0, 7)}: ${c.message}`).join('\n')
      });

    const response = await this.executeClaudeCommand(prompt, {
      outputFormat: 'json',
      model: 'sonnet'
    });

    if (!response.success) {
      console.error('AI comprehensive analysis failed:', response.error);
      return null;
    }

    try {
      const parsed = this.parseClaudeJSONResponse(response.content);
      
      // Validate required nested fields
      this.validateRequiredFields(parsed, [
        'commit.message', 'commit.type', 
        'branch.name', 
        'analysis.changeType', 'analysis.impact', 'analysis.summary',
        'pr.title', 'pr.description'
      ], 'comprehensive analysis');
      
      // Extract nested objects safely
      const commitObj = this.getObject(parsed, 'commit');
      const branchObj = this.getObject(parsed, 'branch');
      const analysisObj = this.getObject(parsed, 'analysis');
      const prObj = this.getObject(parsed, 'pr');
      
      // Handle breaking changes in commit message format
      let commitMessage = this.getString(commitObj, 'message');
      const commitBreaking = this.getBoolean(commitObj, 'breaking');
      const commitType = this.getString(commitObj, 'type');
      const commitScope = this.getString(commitObj, 'scope');
      
      if (commitBreaking && commitType && commitScope) {
        // Add ! for breaking changes: type(scope)!: description
        commitMessage = commitMessage.replace(/^(\w+)(\([^)]+\))(:)/, '$1$2!$3');
      } else if (commitBreaking && commitType) {
        // Add ! for breaking changes: type!: description
        commitMessage = commitMessage.replace(/^(\w+)(:)/, '$1!$2');
      }
      
      // Validate impact value
      const impactValue = this.getString(analysisObj, 'impact') as 'low' | 'medium' | 'high';
      const validImpact = ['low', 'medium', 'high'].includes(impactValue) ? impactValue : 'medium';
      
      return {
        commit: {
          message: commitMessage,
          type: commitType || 'chore',
          scope: commitScope || undefined,
          description: this.getString(commitObj, 'description'),
          breaking: commitBreaking,
          body: this.getString(commitObj, 'body') || undefined,
          footer: this.getString(commitObj, 'footer') || undefined
        },
        branch: {
          name: this.getString(branchObj, 'name'),
          description: this.getString(branchObj, 'description'),
          alternative: this.getString(branchObj, 'alternative') || undefined
        },
        analysis: {
          changeType: this.getString(analysisObj, 'changeType', 'chore'),
          impact: validImpact,
          risks: this.getStringArray(analysisObj, 'risks'),
          suggestions: this.getStringArray(analysisObj, 'suggestions'),
          summary: this.getString(analysisObj, 'summary')
        },
        pr: {
          title: this.getString(prObj, 'title'),
          description: this.getString(prObj, 'description'),
          labels: this.getStringArray(prObj, 'labels'),
          reviewers: this.getStringArray(prObj, 'reviewers')
        }
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError instanceof Error ? parseError.message : 'Unknown error');
      console.log('Raw response content:', response.content.substring(0, 1000));
      return null;
    }
    } catch (securityError) {
      console.error('Security error in comprehensive analysis:', securityError instanceof Error ? securityError.message : 'Unknown security error');
      return null;
    }
  }

  /**
   * Analyze and resolve merge conflicts using AI
   */
  async analyzeAndResolveConflicts(conflictData: ConflictData): Promise<ConflictResolution | null> {
    try {
      // Sanitize all conflict data inputs to prevent injection
      const sanitizedConflictData = {
        branch: this.sanitizeInput(conflictData.branch, 100),
        baseBranch: this.sanitizeInput(conflictData.baseBranch, 100),
        files: this.sanitizeFileList(conflictData.files).slice(0, 20), // Limit to 20 files
        fileTypes: conflictData.fileTypes?.map(type => this.sanitizeInput(type, 50)).slice(0, 10) || [],
        commits: conflictData.commits?.slice(0, 5).map(c => ({
          hash: this.sanitizeInput(c.hash, 40),
          message: this.sanitizeCommitMessage(c.message),
          author: this.sanitizeInput(c.author, 100)
        })) || [],
        conflictSections: conflictData.conflictSections?.slice(0, 10).map(section => ({
          file: this.sanitizeFilePath(section.file),
          startLine: Math.max(0, Math.min(section.startLine || 0, 999999)),
          endLine: Math.max(0, Math.min(section.endLine || 0, 999999)),
          oursContent: this.sanitizeInput(section.oursContent || '', this.securityConfig.maxConflictSectionLength),
          theirsContent: this.sanitizeInput(section.theirsContent || '', this.securityConfig.maxConflictSectionLength),
          context: this.sanitizeInput(section.context || '', 500)
        })) || []
      };

      // Check for prompt injection in any conflict data
      const allContent = [
        sanitizedConflictData.branch,
        sanitizedConflictData.baseBranch,
        ...sanitizedConflictData.files,
        ...sanitizedConflictData.commits.map(c => `${c.message} ${c.author}`),
        ...sanitizedConflictData.conflictSections.map(s => `${s.oursContent} ${s.theirsContent} ${s.context}`)
      ].join(' ');

      if (this.detectPromptInjection(allContent)) {
        console.error('Potential prompt injection detected in conflict data');
        return {
          strategy: 'escalate',
          resolvedFiles: [],
          unresolved: sanitizedConflictData.files,
          reasoning: 'Security check failed: Potential prompt injection detected in conflict data',
          confidence: 0,
          warnings: ['Manual resolution required due to security concerns']
        };
      }

      const template = `You are an expert software engineer with deep knowledge of git merge conflicts and code semantics. Analyze the provided merge conflicts and provide intelligent resolution.

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

      // Build secure prompt with conflict data
      const conflictSectionData = sanitizedConflictData.conflictSections.map(section => 
        `File: ${section.file} (Lines: ${section.startLine}-${section.endLine})
Our version: ${section.oursContent}
Their version: ${section.theirsContent}
Context: ${section.context}`
      ).join('\n---\n');

      const prompt = this.buildSecurePrompt(template, {
        branchInfo: `${sanitizedConflictData.branch} → ${sanitizedConflictData.baseBranch}`,
        conflictFiles: sanitizedConflictData.files,
        fileTypes: sanitizedConflictData.fileTypes,
        recentCommits: sanitizedConflictData.commits.map(c => `${c.hash.slice(0, 8)}: ${c.message} (${c.author})`),
        conflictSections: conflictSectionData
      });

      const response = await this.executeClaudeCommand(prompt, {
        maxTokens: 8192,
        outputFormat: 'json'
      });

      if (!response.success) {
        console.error('AI conflict analysis failed:', response.error);
        return null;
      }

      try {
        const parsed = this.parseClaudeJSONResponse(response.content);
        
        // Validate required fields for conflict resolution
        this.validateRequiredFields(parsed, ['strategy', 'confidence', 'reasoning'], 'conflict resolution');
        
        const strategy = this.getString(parsed, 'strategy') as 'auto' | 'manual' | 'escalate';
        const validStrategy = ['auto', 'manual', 'escalate'].includes(strategy) ? strategy : 'escalate';
        
        // Parse resolved files array with sanitization
        const resolvedFilesArray = this.getArray(parsed, 'resolvedFiles');
        const resolvedFiles: ResolvedFile[] = resolvedFilesArray.map(item => {
          if (this.isObject(item)) {
            return {
              path: this.sanitizeFilePath(this.getString(item, 'path')),
              content: this.sanitizeInput(this.getString(item, 'content'), 50000), // Limit content length
              changes: this.sanitizeInput(this.getString(item, 'changes'), 1000),
              reasoning: this.sanitizeInput(this.getString(item, 'reasoning'), 1000)
            };
          }
          return {
            path: '',
            content: '',
            changes: '',
            reasoning: ''
          };
        });
        
        return {
          strategy: validStrategy,
          resolvedFiles,
          unresolved: this.getStringArray(parsed, 'unresolved').map(f => this.sanitizeFilePath(f)),
          reasoning: this.sanitizeInput(this.getString(parsed, 'reasoning'), 2000),
          confidence: Math.max(0, Math.min(100, this.getNumber(parsed, 'confidence'))),
          warnings: this.getStringArray(parsed, 'warnings').map(w => this.sanitizeInput(w, 500))
        };
        
      } catch (parseError) {
        console.error('Failed to parse AI conflict resolution:', parseError instanceof Error ? parseError.message : 'Unknown error');
        console.log('Raw response sample:', response.content.substring(0, 500));
        return null;
      }
      
    } catch (securityError) {
      console.error('Security error in conflict resolution:', securityError instanceof Error ? securityError.message : 'Unknown security error');
      return {
        strategy: 'escalate',
        resolvedFiles: [],
        unresolved: conflictData.files || [],
        reasoning: 'Security check failed during conflict analysis',
        confidence: 0,
        warnings: ['Manual resolution required due to security concerns']
      };
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