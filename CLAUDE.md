# GitPlus Development Guide

This document provides context for Claude Code when working on the GitPlus codebase.

## Project Overview

GitPlus is a Model Context Protocol (MCP) server that provides AI-powered git automation. It has been intentionally simplified to focus on a single powerful workflow: the `ship` command.

## Architecture Decisions

### Simplified MCP Interface
We've reduced the MCP interface from 14+ tools to just 3 essential ones:
- `ship` - Complete git workflow (analyze → commit → push → PR)
- `status` - Repository status information
- `info` - Server capabilities information

This simplification makes the tool more powerful by removing decision paralysis and providing a single, intelligent workflow.

### Key Files

- `src/mcp/toolDefinitions.ts` - Defines the 3 MCP tools exposed to Claude
- `src/mcp/toolHandler.ts` - Implements handlers for these 3 tools
- `src/mcp/server.ts` - MCP server setup with descriptive metadata
- `src/git/client.ts` - Core git operations wrapper
- `src/ai/service.ts` - AI integration for intelligent analysis

## Development Guidelines

### Core Principles

1. **Always Use GitPlus for Git Operations**: Never use manual `git commit -m` or similar commands. This prevents conventional commit violations and ensures consistent quality.

2. **Maintain Simplicity**: Resist adding more MCP tools. The power is in the intelligent automation, not tool proliferation.

3. **AI-First Development**: Let AI analyze changes and generate appropriate conventional commits, PR descriptions, and branch names.

### Development Workflow

#### ✅ Correct Workflow
```bash
# 1. Make your changes
# 2. Run validation
npm run validate

# 3. Use GitPlus to commit and ship
node dist/main.js ship
# OR if using as MCP server
mcp__gitplus__ship with repoPath set to the GitPlus directory
```

#### ❌ Avoid These Patterns
```bash
# Don't manually create commits
git commit -m "fix something"  # May violate conventional commits

# Don't bypass AI analysis
git add . && git commit -m "manual message"  # Misses AI insights

# Don't use invalid conventional commit types
git commit -m "security: fix issues"  # "security" is not a valid type
```

### Code Quality Standards

1. **Architecture Consistency**: Ensure `toolDefinitions.ts` and `toolHandler.ts` remain in sync. Only expose tools that have corresponding handlers.

2. **Security First**: 
   - All workflow files must have explicit permissions
   - Use environment variables for user-controlled inputs
   - Properly escape shell strings
   - Validate URLs with proper parsing

3. **AI Integration**: The `ship` command uses AI for:
   - Commit message generation (following conventional commits)
   - Branch name suggestions
   - PR title/description creation
   - Conflict resolution (with safety thresholds)
   - Security vulnerability analysis

4. **Testing Requirements**: 
   - Run `npm test` before every commit
   - Achieve meaningful test coverage
   - Key test files:
     - `tests/mcp/toolDefinitions.test.ts` - Validates MCP tool structure
     - `tests/conventionalCommits.test.ts` - Ensures commit message compliance
     - `tests/git/platform.test.ts` - Tests platform detection and PR creation
     - `tests/ai/service.test.ts` - Validates AI service functionality

### Conventional Commits Compliance

All commits MUST follow the conventional commits specification. Valid types:
- `feat` - New features
- `fix` - Bug fixes  
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code changes that neither fix bugs nor add features
- `perf` - Performance improvements
- `test` - Adding/updating tests
- `build` - Build system changes
- `ci` - CI/CD configuration changes
- `chore` - Other changes (dependencies, tooling, etc.)

**Never use**: `security`, `update`, `change`, or other non-standard types.

### Error Handling & Debugging

1. **Error Recovery**: When commits fail validation:
   ```bash
   # If you accidentally created an invalid commit
   git reset --soft HEAD~1  # Undo commit, keep changes staged
   node dist/main.js ship   # Let GitPlus create proper commit
   ```

   **Real Example**: A commit with message "security: fix GitHub code scanning vulnerabilities" failed because "security" is not a valid conventional commit type. GitPlus automatically analyzed the same changes and generated "ci: enhance workflow security with explicit permissions" which passed all validations.

2. **Debugging MCP Issues**:
   - Check `toolDefinitions.ts` and `toolHandler.ts` are in sync
   - Use `verbose: true` in tool parameters
   - Examine the switch statement in `toolHandler.ts`

3. **AI Service Debugging**:
   - Check Claude CLI installation and PATH
   - Review fallback behavior in `src/ai/service.ts`
   - Use dry-run mode to preview AI decisions

### Security Guidelines

1. **Workflow Security**:
   - Always add explicit `permissions:` blocks to GitHub Actions jobs
   - Use environment variables for user-controlled inputs
   - Never use string interpolation with untrusted data
   - Validate PR authors and branch patterns for automated workflows

2. **Code Security**:
   - Properly escape shell strings using single quotes
   - Parse URLs instead of substring matching
   - Use specific commit SHAs instead of branch refs for checkouts
   - Limit fetch depth and disable credential persistence

3. **Secret Management**:
   - Never log or expose tokens in output
   - Use `secrets.GITHUB_TOKEN` for API calls
   - Configure git with tokens only when needed

### Performance Considerations

1. **AI Service Usage**:
   - Use appropriate models (sonnet for analysis, haiku for simple tasks)
   - Truncate large diffs to stay within token limits
   - Cache AI responses when appropriate
   - Implement fallbacks for AI service failures

2. **Git Operations**:
   - Use shallow clones (`fetch-depth: 1`) when possible
   - Batch git operations to reduce command overhead
   - Use `--no-verify` flags cautiously and only when safe

### Troubleshooting Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Commit fails with "type must be one of [...]" | Used invalid conventional commit type | `git reset --soft HEAD~1` then use GitPlus ship |
| "GitHub Advanced Security" code scanning alerts | Security vulnerabilities in code | Add explicit permissions, escape inputs, validate URLs |
| AI service fails | Claude CLI not installed/configured | Install Claude CLI or rely on fallback analysis |
| PR creation fails | Missing platform CLI (gh/glab) | Install GitHub CLI or GitLab CLI as needed |
| Merge conflicts during ship | Branch diverged from main | Use GitPlus conflict resolution or manual merge |
| Tests fail in CI | Code doesn't meet quality standards | Run `npm run validate` locally and fix issues |

### Integration Guidelines

1. **MCP Server Integration**:
   - Always provide absolute paths for `repoPath` parameter
   - Use `verbose: true` for debugging complex operations
   - Handle MCP protocol errors gracefully

2. **CLI Usage**:
   - Build project before using: `npm run build`
   - Use `--dry-run` flag to preview operations
   - Check `--help` for available options and parameters

### Common Tasks

#### Running Tests
```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
npm run validate        # Typecheck + tests
```

#### Building
```bash
npm run build          # TypeScript compilation
npm run dev            # Watch mode for development
```

## Git Operations

**IMPORTANT: Always use GitPlus MCP server for ALL git operations on this repository. Never use manual git commands.**

### Shipping Changes
When you've made changes to the GitPlus codebase:
```
mcp__gitplus__ship with repoPath set to the GitPlus directory
```

This will:
- Analyze your changes to the codebase
- Generate an appropriate conventional commit message
- Create or update the branch
- Push to remote
- Create a pull request if needed

### Checking Status
Before shipping, check the repository state:
```
mcp__gitplus__status with repoPath and verbose: true
```

### Example Workflow
1. Make your code changes
2. Run tests: `npm test`
3. Check status: `mcp__gitplus__status`
4. Ship changes: `mcp__gitplus__ship`

GitPlus will handle all git operations intelligently, ensuring proper commit messages and workflow.

### CI/CD Pipeline

The project uses comprehensive CI checks:
- **PR Validation**: Conventional commit messages, version checks
- **Testing**: Multi-platform, multi-Node version testing
- **Security**: Dependency scanning and security analysis
- **AI Review**: Automated code review suggestions

### Commit Message Format

All commits must follow Conventional Commits:
```
type(scope): description

- Body with details (max 100 chars per line)
- Additional context

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Important Constraints

1. **No Manual Commit Messages**: The `ship` command doesn't accept custom messages - AI generates them based on changes.

2. **Absolute Paths Required**: All MCP tools require absolute paths for the `repoPath` parameter.

3. **AI Dependency**: The project requires Claude CLI for AI features. Fallback to rule-based analysis if unavailable.

## Debugging Tips

1. **Enable Verbose Mode**: Use `verbose: true` in tool parameters for detailed output.

2. **Dry Run First**: Use `dryRun: true` to preview operations without execution.

3. **Check Tool Handler**: When debugging MCP issues, check the switch statement in `toolHandler.ts`.

4. **AI Service Logs**: Check `src/ai/service.ts` for AI-related issues and fallback behavior.

## Future Considerations

- Keep the tool set minimal - complexity should be in intelligence, not interface
- Enhance AI capabilities rather than adding more tools
- Focus on making the `ship` command smarter, not adding alternatives
- Maintain backward compatibility with the MCP protocol

Remember: The goal is to make git operations so simple that developers never need to think about them. One command should intelligently handle everything.