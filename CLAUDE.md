# GitPlus Development Guide

This document provides context for Claude Code when working on the GitPlus codebase.

## Project Overview

GitPlus is a Model Context Protocol (MCP) server that provides AI-powered git automation directly to Claude Code. It has been intentionally simplified to focus on 3 essential tools that provide maximum automation with minimal decision-making overhead.

## Architecture Philosophy

### Simplified MCP-First Design
GitPlus follows a **simplified MCP-first architecture** designed around intelligent automation:

- **3 Essential Tools**: Reduced from 14+ CLI commands to 3 MCP tools that handle complete workflows
- **AI-Powered Intelligence**: Uses Claude AI for all decision-making (commit messages, branch names, conflict resolution)
- **Complete Workflows**: Each tool provides complete functionality rather than partial operations
- **Zero Configuration**: Works out-of-the-box with sensible defaults

### MCP Interface
The 3 essential MCP tools exposed to Claude:
- `ship` - Complete git workflow (analyze → commit → push → PR)
- `status` - Enhanced repository status information with platform detection
- `info` - Server capabilities and usage information

This simplification makes the tool more powerful by removing decision paralysis and providing intelligent, complete workflows.

### Key Architecture Components

- `src/mcp/toolDefinitions.ts` - Defines the 3 MCP tools exposed to Claude
- `src/mcp/toolHandler.ts` - Implements handlers for these 3 tools
- `src/mcp/server.ts` - MCP server setup with descriptive metadata
- `src/git/client.ts` - Core git operations wrapper
- `src/ai/service.ts` - AI integration for intelligent analysis

### Technology Stack
- **TypeScript**: Type-safe development with strict compilation
- **MCP SDK**: Official Model Context Protocol SDK for Claude Code integration
- **Zod**: Runtime type validation for inputs and outputs
- **Node.js**: Cross-platform compatibility (Node 16+)
- **Conventional Commits**: Strict adherence to commit message standards

## Development Guidelines

### Core Principles

1. **Always Use GitPlus for Git Operations**: Never use manual `git commit -m` or similar commands. This prevents conventional commit violations and ensures consistent quality.

2. **Maintain Simplicity**: Resist adding more MCP tools. The power is in the intelligent automation, not tool proliferation.

3. **MCP-First**: The MCP interface is primary. CLI is secondary for advanced users.

4. **AI-First Development**: Let AI analyze changes and generate appropriate conventional commits, PR descriptions, and branch names.

5. **Architecture Consistency**: Ensure `toolDefinitions.ts` and `toolHandler.ts` remain in sync. Only expose tools that have corresponding handlers.

6. **Complete Workflows**: Each tool should provide complete functionality, not partial operations.

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

1. **AI Integration**: All tools use AI for intelligent decision-making:
   - Commit message generation following Conventional Commits
   - Branch name suggestions based on change analysis
   - PR title/description creation
   - Conflict resolution with safety thresholds
   - Security vulnerability analysis

2. **Security First**: 
   - All workflow files must have explicit permissions
   - Use environment variables for user-controlled inputs
   - Properly escape shell strings
   - Validate URLs with proper parsing

3. **Testing Requirements**: 
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

### Integration Guidelines

1. **MCP Server Integration**:
   - Always provide absolute paths for `repoPath` parameter
   - Use `verbose: true` for debugging complex operations
   - Handle MCP protocol errors gracefully

2. **CLI Usage**:
   - Build project before using: `npm run build`
   - Use `--dry-run` flag to preview operations
   - Check `--help` for available options and parameters

### Testing Strategy

Run comprehensive tests before committing:

```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
npm run validate        # Typecheck + tests
```

Key test files:
- `tests/mcp/toolDefinitions.test.ts` - Validates MCP tool structure
- `tests/conventionalCommits.test.ts` - Ensures commit message compliance
- `tests/ai/service.test.ts` - AI integration tests
- `tests/git/client.test.ts` - Git operations tests

### Building and Development

```bash
npm run build          # TypeScript compilation (includes permission fixes)
npm run dev            # Watch mode for development
npm run typecheck      # Type checking only
npm run clean          # Clean build artifacts
```

## Git Operations

**IMPORTANT: Always use GitPlus MCP server for ALL git operations on this repository. Never use manual git commands.**

### Primary Workflow: Ship Changes

When you've made changes to the GitPlus codebase:

```typescript
// Use the ship tool with absolute repoPath
mcp__gitplus__ship with repoPath: "/absolute/path/to/gitplus"
```

The ship command will automatically:
- ✅ Analyze your changes using AI
- ✅ Generate conventional commit messages
- ✅ Create appropriate branch names
- ✅ Push to remote with conflict resolution
- ✅ Create pull requests with generated titles and descriptions

### Repository Status

Before shipping, check the repository state:

```typescript
mcp__gitplus__status with repoPath: "/absolute/path/to/gitplus" and verbose: true
```

### Server Information

Get comprehensive information about GitPlus capabilities:

```typescript
mcp__gitplus__info with repoPath: "/absolute/path/to/gitplus"
```

### Example Development Workflow

1. **Make your code changes**
2. **Run tests**: `npm test`
3. **Check status**: Use `mcp__gitplus__status` with verbose mode
4. **Ship changes**: Use `mcp__gitplus__ship` 

GitPlus will handle all git operations intelligently, ensuring proper commit messages and workflow automation.

## AI-Powered Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format
```
type(scope): description

- Body with details (max 100 chars per line)
- Additional context

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### AI Features
- **Type detection**: Analyzes file changes to suggest appropriate commit types
- **Scope suggestion**: Infers scope from affected directories
- **Breaking changes**: Automatically detects API changes and adds `!` notation
- **Validation**: Real-time validation with helpful error messages

## Important Development Constraints

1. **Absolute Paths Required**: All MCP tools require absolute paths for the `repoPath` parameter.

2. **AI Dependency**: The project requires Claude CLI for AI features. Ensure Claude CLI is installed and authenticated.

3. **No Manual Git Commands**: Always use GitPlus MCP tools instead of manual git commands.

4. **3-Tool Limit**: Resist adding more MCP tools. Enhance existing tools instead.

## CI/CD Pipeline

The project uses comprehensive CI checks:
- **Multi-platform Testing**: Ubuntu, Windows, macOS
- **Multi-Node Testing**: Node 18.x, 20.x, 22.x  
- **Security**: Dependency scanning and vulnerability checks
- **Build Validation**: TypeScript compilation and CLI installation tests
- **Coverage**: Test coverage reporting

## Debugging and Troubleshooting

### Debugging Tips

1. **Enable Verbose Mode**: Use `verbose: true` in tool parameters for detailed output.

2. **Dry Run First**: Use `dryRun: true` to preview operations without execution.

3. **Check Tool Handler**: When debugging MCP issues, check the switch statement in `toolHandler.ts`.

4. **AI Service Logs**: Check `src/ai/service.ts` for AI-related issues and fallback behavior.

### Common Issues

1. **MCP Connection Issues**: Ensure files have execute permissions after build
2. **AI Integration Issues**: Verify Claude CLI is installed and authenticated
3. **Type Errors**: Run `npm run typecheck` to identify TypeScript issues
4. **Test Failures**: Check test logs and ensure all dependencies are installed

## File Organization and Structure

```
src/
├── mcp/                    # MCP server implementation
│   ├── toolDefinitions.ts  # 3 MCP tool definitions
│   ├── toolHandler.ts      # Tool implementation handlers
│   └── server.ts           # MCP server setup
├── git/                    # Git operations
│   ├── client.ts           # Core git wrapper
│   ├── analyzer.ts         # Change analysis
│   ├── platform.ts         # Platform detection
│   └── conflictResolver.ts # AI conflict resolution
├── ai/                     # AI integration
│   └── service.ts          # Claude AI service
├── utils/                  # Utilities
│   └── conventionalCommits.ts # Commit validation
├── types.ts               # TypeScript type definitions
├── index.ts              # MCP server entry point
├── main.ts              # CLI entry point
└── cli.ts               # CLI implementation
```

## Future Development Guidelines

### Maintain Focus
- Keep the tool set minimal - complexity should be in intelligence, not interface
- Enhance AI capabilities rather than adding more tools
- Focus on making the `ship` command smarter, not adding alternatives
- Maintain backward compatibility with the MCP protocol

### AI Enhancement Priorities
1. Improve conflict resolution accuracy
2. Better change analysis and categorization
3. Enhanced PR description generation
4. Smarter branch naming strategies

### Architecture Evolution
- Consider adding configuration options only when absolutely necessary
- Maintain the 3-tool limit strictly
- Ensure all new features integrate with the existing AI workflow
- Preserve the MCP-first design philosophy

## Success Metrics

The goal is to make git operations so simple that developers never need to think about them. Success is measured by:

1. **Single Command Workflows**: Complete git operations with one MCP tool call
2. **AI Accuracy**: High-quality commit messages and PR descriptions
3. **Conflict Resolution**: Successful automatic conflict resolution
4. **User Experience**: Minimal configuration and maximum automation

Remember: One intelligent command should handle everything, making git operations invisible to the developer workflow.