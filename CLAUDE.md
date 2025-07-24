# GitPlus MCP Server - AI-Powered Git Automation

This project uses GitPlus MCP server for intelligent git workflow automation with Claude Code integration.

## Overview

GitPlus is a Model Context Protocol (MCP) server that provides AI-powered git automation directly within Claude Code. It simplifies git workflows through intelligent commit messages, automatic branch creation, and seamless pull request management.

## Git Operations

**Always use the GitPlus MCP server for ALL git operations. Never use manual git commands.**

GitPlus handles everything automatically with AI-powered analysis and decision-making.

## Available Tools

### Primary Command
- **`mcp__gitplus__ship`** - Complete git workflow automation
  - Analyzes changes intelligently
  - Creates AI-generated conventional commit messages
  - Handles branch creation automatically
  - Resolves conflicts with AI assistance
  - Creates pull requests with proper titles and descriptions
  - Ensures PRs are always mergeable

### Repository Information
- **`mcp__gitplus__status`** - Enhanced repository status with platform detection
- **`mcp__gitplus__info`** - Comprehensive server information and capabilities

## Usage Patterns

### Shipping Changes
When ready to ship your work:
```
1. Simply call: mcp__gitplus__ship with repoPath
2. GitPlus handles everything else automatically
```

**Example requests:**
- "Ship my current changes to a new PR"
- "Create a pull request with my latest work"
- "Commit and push my changes with an AI-generated message"

### Getting Repository Status
```
mcp__gitplus__status with repoPath and optional verbose flag
```

**Example requests:**
- "Show me the current git status"
- "What's the current state of my repository?"
- "Give me detailed information about my git repository"

### Server Information
```
mcp__gitplus__info with optional repoPath
```

**Example requests:**
- "Tell me about GitPlus capabilities"
- "What tools are available in GitPlus?"
- "Show me GitPlus server information for this repository"

## Key Features

- **🤖 AI-Powered**: Uses Claude AI for intelligent commit messages, branch names, and PR descriptions
- **📋 Conventional Commits**: Follows strict conventional commit specification automatically
- **🔄 Smart Conflict Resolution**: AI-assisted conflict resolution with high confidence thresholds
- **🌐 Multi-Platform**: Supports GitHub, GitLab, and local repositories seamlessly
- **🚀 Complete Workflows**: One-command ship from changes to mergeable PR
- **🔍 Repository Health**: Automatic validation and integrity checks
- **📊 Detailed Analysis**: Comprehensive change analysis with impact assessment

## What GitPlus Does Automatically

✅ **Analyzes your changes** and determines appropriate commit types
✅ **Generates conventional commit messages** following best practices
✅ **Creates appropriate branch names** based on change analysis
✅ **Stages files intelligently** based on change patterns
✅ **Detects and resolves merge conflicts** using AI when possible
✅ **Creates pull requests** with proper titles and descriptions
✅ **Ensures PRs are mergeable** by checking conflicts post-creation
✅ **Validates repository health** before operations
✅ **Handles multiple file types** and complex change patterns
✅ **Maintains git history** with clean, professional commits

## Parameters

### For `ship` command:
- **repoPath** (required): Full absolute path to your git repository
- **draft** (optional): Create PR as draft (default: false)
- **dryRun** (optional): Preview what would be done without executing (default: false)

### For `status` command:
- **repoPath** (required): Full absolute path to your git repository
- **verbose** (optional): Include detailed status information (default: false)

### For `info` command:
- **repoPath** (optional): Full absolute path to git repository for repo-specific info

## Best Practices

1. **Always provide absolute paths** to your git repository
2. **Use `mcp__gitplus__status` first** to understand your repository state
3. **Try `dryRun: true`** to preview operations before executing
4. **The `ship` command is your best friend** for complete workflows
5. **Let GitPlus handle commit messages** - it follows conventional commit standards
6. **Trust the AI conflict resolution** - it uses high confidence thresholds for safety

## Example Workflows

### Quick Ship (Most Common)
```
User: "Ship my changes to a new PR"
Claude: Uses mcp__gitplus__ship with current directory as repoPath
Result: Complete workflow from unstaged changes to mergeable PR
```

### Status Check
```
User: "What's the current state of my repository?"
Claude: Uses mcp__gitplus__status with verbose details
Result: Comprehensive repository information and change summary
```

### Preview Before Ship
```
User: "Show me what would happen if I ship my changes"
Claude: Uses mcp__gitplus__ship with dryRun: true
Result: Detailed preview of all planned operations
```

## Troubleshooting

If you encounter issues:
1. **Check repository path** - ensure you're providing absolute paths
2. **Verify git repository** - GitPlus can initialize repos if needed
3. **Review status first** - use `mcp__gitplus__status` to understand current state
4. **Use dry run** - preview operations with `dryRun: true` before executing

## Development Notes

This project follows:
- **Conventional Commits** specification for all commit messages
- **TypeScript** for type safety and better development experience
- **Model Context Protocol** for Claude Code integration
- **Automated testing** with comprehensive test coverage
- **CI/CD workflows** for quality assurance and automated releases

GitPlus makes git operations simple, intelligent, and reliable - let it handle the complexity while you focus on your code.