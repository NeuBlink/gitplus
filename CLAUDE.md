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

### When Making Changes

1. **Maintain Simplicity**: Resist adding more MCP tools. The power is in the intelligent automation, not tool proliferation.

2. **Architecture Consistency**: Ensure `toolDefinitions.ts` and `toolHandler.ts` remain in sync. Only expose tools that have corresponding handlers.

3. **AI Integration**: The `ship` command uses AI for:
   - Commit message generation
   - Branch name suggestions
   - PR title/description creation
   - Conflict resolution (with safety thresholds)

4. **Testing**: Run `npm test` before committing. Key test files:
   - `tests/mcp/toolDefinitions.test.ts` - Validates MCP tool structure
   - `tests/conventionalCommits.test.ts` - Ensures commit message compliance

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

#### Using GitPlus for Development
When working on this repo, use GitPlus itself:
```bash
mcp__gitplus__ship --repoPath=/path/to/gitplus
```

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