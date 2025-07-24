// Utility functions for Conventional Commits validation and formatting
import { ConventionalCommitType } from '../types';

export interface ConventionalCommitParts {
  type: ConventionalCommitType;
  scope?: string;
  breaking: boolean;
  description: string;
  body?: string;
  footer?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parts?: ConventionalCommitParts;
}

/**
 * Conventional commit types as per specification
 * Based on https://www.conventionalcommits.org/en/v1.0.0/#specification
 */
export const COMMIT_TYPES: Record<ConventionalCommitType, string> = {
  feat: 'A new feature (correlates with MINOR in semantic versioning)',
  fix: 'A bug fix (correlates with PATCH in semantic versioning)',
  docs: 'Documentation only changes',
  style: 'Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)',
  refactor: 'A code change that neither fixes a bug nor adds a feature',
  perf: 'A code change that improves performance',
  test: 'Adding missing tests or correcting existing tests',
  build: 'Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)',
  ci: 'Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)',
  chore: 'Other changes that don\'t modify src or test files'
};

/**
 * Validate a conventional commit message
 */
export function validateConventionalCommit(message: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!message || message.trim().length === 0) {
    return { valid: false, errors: ['Commit message is empty'], warnings: [] };
  }

  // Parse conventional commit format: <type>[optional scope]: <description>
  // According to specification: type(scope)!: description OR type!: description OR type(scope): description OR type: description
  const conventionalPattern = /^([a-z]+)(\([a-z0-9\-]+\))?(!)?: (.+)$/;
  const match = message.match(conventionalPattern);
  
  if (!match) {
    return {
      valid: false,
      errors: ['Message does not follow conventional commit format: <type>[optional scope]: <description>'],
      warnings: []
    };
  }

  const [, type, scopeMatch, breaking, description] = match;
  const scope = scopeMatch ? scopeMatch.slice(1, -1) : undefined; // Remove parentheses
  
  // Validate type
  if (!(type as ConventionalCommitType) || !COMMIT_TYPES[type as ConventionalCommitType]) {
    errors.push(`Invalid commit type "${type}". Valid types: ${Object.keys(COMMIT_TYPES).join(', ')}`);
  }
  
  // Validate scope format (if present)
  if (scope) {
    if (scope.includes(' ')) {
      errors.push('Scope should not contain spaces, use kebab-case');
    }
    if (scope !== scope.toLowerCase()) {
      warnings.push('Scope should be lowercase');
    }
  }
  
  // Validate description according to conventional commits specification
  if (!description || description.trim().length === 0) {
    errors.push('Description is required');
  } else {
    // Specification recommends keeping the first line under 50 characters
    if (description.length > 50) {
      warnings.push('Description should be under 50 characters for better readability');
    }
    if (description[0] && description[0] !== description[0].toLowerCase()) {
      warnings.push('Description should start with lowercase letter');
    }
    if (description.endsWith('.')) {
      warnings.push('Description should not end with a period');
    }
    if (!isImperativeMood(description)) {
      warnings.push('Description should use imperative mood (e.g., "add" not "added" or "adds")');
    }
  }
  
  // Validate overall message length
  if (message.length > 72) {
    warnings.push('First line should be under 72 characters');
  }

  const parts: ConventionalCommitParts = {
    type: type as ConventionalCommitType,
    scope,
    breaking: !!breaking,
    description: (description || '').trim()
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parts
  };
}

/**
 * Format a conventional commit message from parts
 */
export function formatConventionalCommit(parts: ConventionalCommitParts): string {
  let message = parts.type;
  
  if (parts.scope) {
    message += `(${parts.scope})`;
  }
  
  if (parts.breaking) {
    message += '!';
  }
  
  message += `: ${parts.description}`;
  
  // Add body and footer if present
  if (parts.body) {
    message += `\n\n${parts.body}`;
  }
  
  if (parts.footer) {
    message += `\n\n${parts.footer}`;
  }
  
  return message;
}

/**
 * Detect if description uses imperative mood (basic heuristic)
 */
function isImperativeMood(description: string): boolean {
  const words = description.toLowerCase().split(' ');
  const firstWord = words[0];
  
  if (!firstWord) return true; // Empty description handled elsewhere
  
  // Common non-imperative patterns (past tense and continuous forms)
  const nonImperativePatterns = [
    /^(added|adds|adding)$/,       // "add" is imperative
    /^(fixed|fixes|fixing)$/,      // "fix" is imperative  
    /^(updated|updates|updating)$/, // "update" is imperative
    /^(removed|removes|removing)$/, // "remove" is imperative
    /^(changed|changes|changing)$/, // "change" is imperative
    /^(implemented|implements|implementing)$/, // "implement" is imperative
    /^(refactored|refactors|refactoring)$/     // "refactor" is imperative
  ];
  
  return !nonImperativePatterns.some(pattern => pattern.test(firstWord));
}

/**
 * Suggest improvements for a commit message
 */
export function suggestImprovements(message: string): string[] {
  const suggestions: string[] = [];
  const validation = validateConventionalCommit(message);
  
  if (!validation.valid) {
    suggestions.push(...validation.errors);
  }
  
  suggestions.push(...validation.warnings);
  
  // Additional suggestions based on content analysis
  if (message.toLowerCase().includes('wip') || message.toLowerCase().includes('work in progress')) {
    suggestions.push('Consider avoiding "WIP" commits; instead use descriptive commit messages');
  }
  
  if (message.toLowerCase().includes('minor') || message.toLowerCase().includes('small')) {
    suggestions.push('Avoid vague words like "minor" or "small"; be specific about what changed');
  }
  
  return suggestions;
}

/**
 * Detect if changes represent a breaking change based on diff analysis
 */
export function detectBreakingChanges(diff: string, filesChanged: string[]): boolean {
  // Look for patterns that typically indicate breaking changes
  const breakingPatterns = [
    /^-.*export.*function/m,  // Removed exported functions
    /^-.*export.*class/m,     // Removed exported classes
    /^-.*export.*interface/m, // Removed exported interfaces
    /^-.*export.*type/m,      // Removed exported types
    /^-.*export.*const/m,     // Removed exported constants
  ];
  
  // Check for breaking change keywords
  const breakingKeywords = [
    'BREAKING CHANGE',
    'breaking:',
    'remove',
    'delete',
    'drop support',
    'deprecate',
    'major version'
  ];
  
  // Analyze diff content
  const hasBreakingPattern = breakingPatterns.some(pattern => pattern.test(diff));
  const hasBreakingKeyword = breakingKeywords.some(keyword => 
    diff.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Check for package.json major version changes
  const packageJsonChanged = filesChanged.some(file => file.includes('package.json'));
  const majorVersionChange = packageJsonChanged && /version.*["']\d+\.0\.0["']/g.test(diff);
  
  // Check for explicit major version patterns (e.g. version: "2.0.0")
  const explicitMajorVersion = /version:\s*["']\d+\.0\.0["']/.test(diff);
  
  return hasBreakingPattern || hasBreakingKeyword || majorVersionChange || explicitMajorVersion;
}

/**
 * Suggest scope based on file paths
 */
export function suggestScope(filesChanged: string[]): string | undefined {
  if (filesChanged.length === 0) return undefined;
  
  // Common scope patterns (order matters - more specific patterns first)
  const scopePatterns = [
    { pattern: /\.test\.|\.spec\.|^tests?\/|^spec\//, scope: 'test' },
    { pattern: /^docs?\//, scope: 'docs' },
    { pattern: /^\.github\//, scope: 'ci' },
    { pattern: /^\.gitlab\//, scope: 'ci' },
    { pattern: /webpack|babel|eslint|prettier|tsconfig|jest/, scope: 'build' },
    { pattern: /^package\.json$|yarn\.lock|npm-shrinkwrap/, scope: 'deps' },
    { pattern: /dockerfile|docker-compose/i, scope: 'docker' },
    { pattern: /^src\/components?\//, scope: 'components' },
    { pattern: /^src\/api\//, scope: 'api' },
    { pattern: /^src\/auth\//, scope: 'auth' },
    { pattern: /^src\/utils?\//, scope: 'utils' },
    { pattern: /^src\/services?\//, scope: 'services' },
    { pattern: /^src\/types?\//, scope: 'types' },
    { pattern: /^src\/hooks?\//, scope: 'hooks' },
    { pattern: /^src\/pages?\//, scope: 'pages' },
    { pattern: /^src\/lib\//, scope: 'lib' },
  ];
  
  // Find the most common scope among changed files
  const scopeCounts = new Map<string, number>();
  
  for (const file of filesChanged) {
    for (const { pattern, scope } of scopePatterns) {
      if (pattern.test(file)) {
        scopeCounts.set(scope, (scopeCounts.get(scope) || 0) + 1);
        break; // Use first matching pattern
      }
    }
  }
  
  if (scopeCounts.size === 0) return undefined;
  
  // Return the most frequent scope
  const sortedScopes = Array.from(scopeCounts.entries())
    .sort(([, a], [, b]) => b - a);
  
  return sortedScopes[0]?.[0];
}

/**
 * Detect commit type based on file changes and diff
 */
export function detectCommitType(filesChanged: string[], diff: string): ConventionalCommitType {
  // Test files
  if (filesChanged.some(file => /\.(test|spec)\.|__tests__/.test(file))) {
    return 'test';
  }
  
  // Documentation files
  if (filesChanged.every(file => /\.(md|txt|rst)$|^docs?\//.test(file))) {
    return 'docs';
  }
  
  // Build/config files (check package.json first for deps, then build tools)
  if (filesChanged.some(file => /package\.json|yarn\.lock|npm-shrinkwrap/.test(file))) {
    return 'build'; // package.json changes are build-related
  }
  
  if (filesChanged.some(file => 
    /webpack|babel|eslint|prettier|tsconfig|jest\.config/.test(file)
  )) {
    return 'build';
  }
  
  // CI files
  if (filesChanged.some(file => /^\.github\/|^\.gitlab\/|\.yml$|\.yaml$/.test(file))) {
    return 'ci';
  }
  
  // Look for bug fixes first (more specific)
  if (/fix|bug|error|issue|problem/i.test(diff)) {
    return 'fix';
  }
  
  // Performance improvements
  if (/performance|perf|optimize|speed|fast/i.test(diff)) {
    return 'perf';
  }
  
  // Look for new functionality (must come after fix detection)
  if (diff.includes('+function ') || diff.includes('+const ') || diff.includes('+class ')) {
    return 'feat';
  }
  
  // Only classify as style if there are no significant content changes
  // and the diff only contains whitespace/formatting changes
  const diffLines = diff.split('\n');
  const contentLines = diffLines.filter(line => 
    (line.startsWith('+') || line.startsWith('-')) && 
    !line.startsWith('+++') && 
    !line.startsWith('---')
  );
  
  const onlyStyleChanges = contentLines.length > 0 && contentLines.every(line => 
    /^\s*[+\-]\s*[{}();,]?\s*$/.test(line) || // Only brackets, semicolons, etc.
    /^\s*[+\-]\s*$/.test(line) // Empty lines
  );
  
  if (onlyStyleChanges) {
    return 'style';
  }
  
  // Default to chore if nothing else matches
  return 'chore';
}