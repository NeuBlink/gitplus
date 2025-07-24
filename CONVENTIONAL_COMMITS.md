# Conventional Commits Implementation

## Overview

Gitplus now provides comprehensive support for [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification with AI-enhanced intelligence and strict validation.

## Features Implemented

### ✅ AI-Enhanced Commit Generation
- **Smart Type Detection**: Automatically determines commit type (`feat`, `fix`, `docs`, etc.) based on file changes and diff analysis
- **Intelligent Scope Suggestion**: Infers scope from affected directories and modules
- **Breaking Change Detection**: Identifies API changes and automatically adds `!` notation
- **Context-Aware Descriptions**: Generates precise, imperative mood descriptions

### ✅ Strict Validation
- **Format Validation**: Ensures messages follow `type(scope): description` format exactly
- **Type Validation**: Restricts to the 10 conventional commit types
- **Scope Validation**: Enforces kebab-case, no spaces
- **Description Validation**: Checks for imperative mood, length limits, proper capitalization
- **Breaking Change Validation**: Validates `!` notation and `BREAKING CHANGE:` footers

### ✅ Intelligent Analysis
- **File Pattern Recognition**: Automatically detects commit types from file paths
- **Diff Analysis**: Examines code changes to determine appropriate commit classification
- **Project Context**: Considers recent commits and project structure
- **Fallback Logic**: Rule-based fallback when AI is unavailable

## Architecture

### Core Components

#### 1. AI Service (`src/ai/service.ts`)
Enhanced to generate strictly compliant conventional commits:

```typescript
// Enhanced prompts with conventional commits examples
const prompt = `Generate a strict Conventional Commits message according to the specification.

CONVENTIONAL COMMITS RULES:
1. Format: type(scope): description
2. Breaking changes: Use "!" after type/scope OR add BREAKING CHANGE: in footer
3. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
4. Scope: Component/file area affected (api, ui, auth, etc.)
5. Description: Imperative mood, lowercase, no period, under 50 chars
6. Breaking: Set to true if API changes break existing functionality

EXAMPLES:
- feat(auth): add OAuth2 login support
- fix(api): handle null response in user service  
- docs: update installation instructions
- style: fix indentation in login component
- refactor(database): extract query builder logic`;
```

#### 2. Validation Utilities (`src/utils/conventionalCommits.ts`)
Comprehensive validation and analysis toolkit:

```typescript
// Validate commit message format
export function validateConventionalCommit(message: string): ValidationResult {
  // Strict regex validation
  const conventionalPattern = /^(\w+)(\([^)]+\))?(!)?: (.+)$/;
  // Type validation
  // Scope validation (kebab-case, lowercase)
  // Description validation (imperative mood, length)
  // Breaking change detection
}

// Auto-detect commit type from changes
export function detectCommitType(filesChanged: string[], diff: string): ConventionalCommitType {
  // Priority-based detection:
  // 1. Test files -> 'test'
  // 2. Documentation -> 'docs'  
  // 3. Build files -> 'build'
  // 4. CI files -> 'ci'
  // 5. Bug fixes (from diff) -> 'fix'
  // 6. Performance (from diff) -> 'perf'
  // 7. New features (from diff) -> 'feat'
  // 8. Style changes -> 'style'
  // 9. Default -> 'chore'
}

// Suggest scope from file paths
export function suggestScope(filesChanged: string[]): string | undefined {
  // Pattern matching for common scopes:
  // src/components/ -> 'components'
  // src/api/ -> 'api'
  // src/auth/ -> 'auth'
  // *.test.* -> 'test'
  // docs/ -> 'docs'
  // package.json -> 'deps'
  // webpack.config.js -> 'build'
}

// Detect breaking changes
export function detectBreakingChanges(diff: string, filesChanged: string[]): boolean {
  // Look for:
  // - Removed exports
  // - API signature changes
  // - Major version bumps
  // - Explicit BREAKING CHANGE keywords
}
```

#### 3. Enhanced Git Analyzer (`src/git/analyzer.ts`)
Integrates conventional commits utilities:

```typescript
// Validate and enhance AI-generated commits
async enhanceCommitMessage(aiMessage: string, context: {
  filesChanged: string[];
  diff: string;
}): Promise<{
  message: string;
  valid: boolean;
  improvements: string[];
}> {
  // Validate AI message
  // Generate fallback if invalid
  // Provide improvement suggestions
}

// Rule-based fallback when AI unavailable
async generateFallbackCommitMessage(options): Promise<{
  message: string;
  type: ConventionalCommitType;
  scope?: string;
  breaking: boolean;
}> {
  // Detect type, scope, breaking changes
  // Generate basic conventional commit
}
```

## Usage Examples

### AI-Generated Commits

#### Feature Addition
```bash
# Files: src/auth/oauth.ts, src/components/LoginForm.tsx
# Diff: +function authenticateWithOAuth() { ... }

# Generated:
feat(auth): add OAuth2 login support

Implements OAuth2 authentication flow with Google 
and GitHub providers including token refresh.

Closes #156
```

#### Bug Fix with Breaking Change
```bash
# Files: src/api/users.ts
# Diff: -export function getUser(id) // +export function getUser(userId)

# Generated:
fix(api)!: change user function parameter name

BREAKING CHANGE: getUser() now expects `userId` instead of `id`.
Update all calls: getUser(userId) instead of getUser(id).

Fixes #234
```

#### Documentation Update
```bash
# Files: README.md, docs/api.md
# Diff: +## Authentication, +### OAuth Setup

# Generated:
docs: add OAuth authentication guide

Includes setup instructions, configuration examples,
and troubleshooting section for OAuth integration.
```

### Validation Results

#### Valid Messages ✅
```bash
feat: add user registration
fix(auth): resolve login timeout issue  
docs: update API documentation
style: fix indentation in components
refactor(utils): extract validation logic
test(auth): add OAuth integration tests
chore(deps): update typescript to v5.0
perf(parser): improve regex performance by 50%
ci: add automated security scanning
build: update webpack configuration
feat(api)!: remove legacy endpoints
```

#### Invalid Messages ❌
```bash
added new feature              # Wrong tense, no type
feat add feature              # Missing colon
feat(My API): new endpoint    # Scope not kebab-case
feat: Added new feature.      # Wrong tense, has period
fix: Fix the bug             # Not imperative mood
feat: This is a very long description that exceeds the recommended character limit # Too long
```

## Testing

### Test Coverage
- **60 tests** covering all conventional commits functionality
- **Unit tests** for validation, formatting, detection
- **Integration tests** for complete workflows  
- **Edge case tests** for error handling

### Test Categories

#### Validation Tests
```typescript
describe('validateConventionalCommit', () => {
  test('valid conventional commit messages', () => {
    const validMessages = [
      'feat: add user authentication',
      'fix: resolve login issue', 
      'feat(auth)!: breaking change to API'
    ];
    // All should pass validation
  });
});
```

#### Detection Tests
```typescript
describe('detectCommitType', () => {
  test('detect features from diff', () => {
    const diff = '+function newFeature() {}';
    const result = detectCommitType(['src/api.ts'], diff);
    expect(result).toBe('feat');
  });
  
  test('detect test files', () => {
    const result = detectCommitType(['src/auth.test.ts'], '');
    expect(result).toBe('test');
  });
});
```

#### Integration Tests
```typescript
describe('end-to-end commit message workflow', () => {
  test('validate and format complete workflow', () => {
    const parts = {
      type: 'feat' as const,
      scope: 'auth',
      description: 'add OAuth2 login support',
      breaking: false
    };
    
    const formatted = formatConventionalCommit(parts);
    const validation = validateConventionalCommit(formatted);
    
    expect(validation.valid).toBe(true);
    expect(formatted).toBe('feat(auth): add OAuth2 login support');
  });
});
```

## Configuration

### Environment Variables
```bash
# AI Configuration (already supported)
export GITPLUS_MODEL="sonnet"
export GITPLUS_TIMEOUT="60000"
export GITPLUS_CLAUDE_COMMAND="claude"
```

### Future Configuration Options
```yaml
# ~/.gitplus/config.yaml (planned)
conventions:
  commit_style: conventional  # strict | loose | custom
  max_length: 72             # character limit
  require_scope: false       # always require scope
  custom_types: []           # additional commit types
  custom_scopes: []          # project-specific scopes
```

## Benefits

### For Developers
- **Consistency**: All commits follow the same format
- **Automation**: No need to remember conventional commit rules
- **Intelligence**: AI suggests the most appropriate type and scope
- **Validation**: Immediate feedback on commit message quality
- **Learning**: Examples and suggestions improve commit writing skills

### For Projects
- **Automated Changelogs**: Generate release notes from commit messages
- **Semantic Versioning**: Automatically determine version bumps
- **Better Git History**: More readable and searchable commit history
- **Tool Integration**: Compatible with conventional commit tooling ecosystem

### For Teams
- **Standardization**: Consistent commit style across all contributors
- **Code Review**: Easier to understand changes from commit messages
- **Release Management**: Automated release workflows based on commit types
- **Documentation**: Commit messages serve as development documentation

## Migration Guide

### From Legacy Commits
1. **No Breaking Changes**: Existing commits remain unchanged
2. **Gradual Adoption**: New commits automatically use conventional format
3. **Validation Feedback**: Helpful suggestions for improvement
4. **Fallback Support**: Works even when AI is unavailable

### Integration Steps
1. **Install/Update**: `claude mcp add gitplus -- npx @gitplus/mcp@latest`
2. **Commit as Usual**: Use `ship`, `commit`, or direct git commands
3. **Review Suggestions**: Check AI-generated messages before confirming
4. **Learn Patterns**: Observe how AI categorizes your changes

## Future Enhancements

- **Custom Templates**: Project-specific commit message templates
- **Team Rules**: Shared validation rules across team members  
- **Advanced Scopes**: Multi-level scopes (e.g., `feat(auth/oauth)`)
- **Commit Linking**: Automatic issue/PR linking in commit messages
- **Metrics**: Commit quality scoring and improvement suggestions

## Conclusion

Gitplus now provides the most comprehensive conventional commits implementation for AI-assisted development, combining strict specification compliance with intelligent automation. This ensures all commits are properly formatted, semantically meaningful, and ready for automated tooling while reducing the cognitive load on developers.