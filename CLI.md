# GitPlus CLI Interface

This document describes the CLI interface for GitPlus. **Note**: The CLI is secondary to the MCP interface. For Claude Code users, the MCP tools (`ship`, `status`, `info`) are the primary interface.

## Overview

GitPlus provides a comprehensive CLI interface with 14+ commands for advanced git operations. The CLI is designed for direct command-line usage and offers more granular control than the simplified MCP interface.

## Installation

The CLI is automatically available after installing GitPlus:

```bash
# Global CLI installation (after local development setup)
npm link
```

After linking, both `gitplus` and `gp` commands are available globally.

**Note**: The `gp` alias may conflict with existing shell aliases for `git push`. Use `gitplus` instead if `gp` doesn't work.

## Prerequisites

Before using the CLI, ensure you have:

- **Node.js 16+**: Required runtime environment
- **Claude CLI**: Install and authenticate with `claude auth login`
  ```bash
  # Verify Claude CLI is available and authenticated
  claude --version
  claude -p "test" --output-format json --model sonnet
  ```
- **Git repository**: A local git repository with changes to test
- **Platform CLIs** (optional for enhanced functionality):
  - **GitHub CLI**: `gh auth login` for GitHub repository features
  - **GitLab CLI**: `glab auth login` for GitLab repository features

**Important**: AI is mandatory - GitPlus will fail immediately if Claude CLI is not available or working.

## Environment Variables

Configure GitPlus behavior with these environment variables:

```bash
# AI Configuration
export GITPLUS_MODEL="sonnet"                    # Claude model (default: sonnet)
export GITPLUS_TIMEOUT="60000"                   # Timeout in milliseconds (default: 60000)
export GITPLUS_CLAUDE_COMMAND="claude"           # Claude CLI command path (default: claude)
```

## Available Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `gitplus commit` | `gp commit`* | AI-powered conventional commits |
| `gitplus ship` | `gp ship`* | Complete workflow: commit → push → PR |
| `gitplus analyze` | `gp analyze`* | AI analysis of repository changes |
| `gitplus suggest <type>` | `gp suggest <type>`* | AI suggestions for branch/commit/PR |
| `gitplus status` | `gp status`* | Enhanced git status with platform detection |
| `gitplus sync` | `gp sync`* | Synchronize with remote repository |
| `gitplus stash <action>` | `gp stash <action>`* | Manage git stash operations |
| `gitplus reset <mode>` | `gp reset <mode>`* | Reset repository state safely |
| `gitplus rebase [onto]` | `gp rebase [onto]`* | Interactive and automatic rebasing |
| `gitplus recover <action>` | `gp recover <action>`* | Recover lost commits using reflog |
| `gitplus validate` | `gp validate`* | Validate repository health and integrity |

*Note: `gp` alias may conflict with existing shell aliases for `git push`

## Command Reference

### `gitplus commit` - AI-Powered Commits

Create AI-powered commit with staged changes.

```bash
# Basic usage
gitplus commit

# With custom message
gitplus commit -m "feat: add new authentication system"

# With specific type and scope
gitplus commit -t feat -s auth

# Stage all changes and commit
gitplus commit --all

# Preview without executing
gitplus commit --dry-run

# Mark as breaking change
gitplus commit --breaking
```

**Options:**
- `-m, --message <message>`: Custom commit message
- `-t, --type <type>`: Conventional commit type (feat, fix, docs, etc.)
- `-s, --scope <scope>`: Conventional commit scope
- `-b, --breaking`: Mark as breaking change
- `-a, --all`: Stage all changes before committing
- `-d, --dry-run`: Preview without executing
- `-v, --verbose`: Show detailed information

### `gitplus ship` - Complete Workflow

Complete workflow: commit, push, and create PR.

```bash
# Basic ship
gitplus ship

# With custom commit message
gitplus ship -m "feat: implement new dashboard"

# With specific branch name
gitplus ship -b feature/dashboard

# Create draft PR
gitplus ship --draft

# Skip PR creation
gitplus ship --no-pr

# Skip push (commit only)
gitplus ship --no-push

# Preview without executing
gitplus ship --dry-run
```

**Options:**
- `-m, --message <message>`: Custom commit message
- `-b, --branch <branch>`: Target branch name
- `--base-branch <branch>`: Base branch for PR
- `--draft`: Create PR as draft
- `--no-pr`: Skip PR creation
- `--no-push`: Skip push
- `-d, --dry-run`: Preview without executing
- `-v, --verbose`: Show detailed information

### `gitplus status` - Enhanced Status

Show repository status with platform detection.

```bash
# Basic status
gitplus status

# Detailed status with file lists
gitplus status --verbose
```

**Options:**
- `-v, --verbose`: Show detailed information including file lists

### `gitplus analyze` - AI Analysis

Analyze repository changes with AI insights.

```bash
# Basic analysis
gitplus analyze

# Include diff in analysis
gitplus analyze --diff

# Analyze specific commit range
gitplus analyze --range main..HEAD

# Verbose analysis
gitplus analyze --verbose
```

**Options:**
- `-d, --diff`: Include diff in analysis
- `-r, --range <range>`: Commit range to analyze
- `-v, --verbose`: Show detailed information

### `gitplus suggest` - AI Suggestions

Get AI suggestions for branch names, commit messages, or PR content.

```bash
# Suggest branch name
gitplus suggest branch

# Suggest commit message
gitplus suggest commit

# Suggest PR title
gitplus suggest pr_title

# Suggest PR description
gitplus suggest pr_description
```

**Arguments:**
- `branch`: AI branch name suggestion
- `commit`: AI commit message suggestion
- `pr_title`: AI PR title suggestion
- `pr_description`: AI PR description suggestion

### `gitplus sync` - Repository Synchronization

Synchronize with remote repository using fetch/pull with intelligent conflict handling.

```bash
# Basic sync (merge strategy)
gitplus sync

# Sync with rebase strategy
gitplus sync --strategy rebase

# Fetch only (no merge/rebase)
gitplus sync --strategy fetch-only

# Sync specific branch
gitplus sync --branch develop

# Auto-resolve conflicts
gitplus sync --auto-resolve ours

# Force synchronization
gitplus sync --force
```

**Options:**
- `-s, --strategy <strategy>`: Sync strategy (merge, rebase, fetch-only)
- `-r, --remote <remote>`: Remote name (default: origin)
- `-b, --branch <branch>`: Branch to sync
- `--auto-resolve <strategy>`: Auto conflict resolution (ours, theirs, manual)
- `-f, --force`: Force synchronization
- `-v, --verbose`: Show detailed information

### `gitplus stash` - Stash Management

Manage git stash for temporary storage of changes.

```bash
# Create stash
gitplus stash push

# Create stash with message
gitplus stash push -m "WIP: working on feature"

# Include untracked files
gitplus stash push --include-untracked

# List all stashes
gitplus stash list

# Apply and remove latest stash
gitplus stash pop

# Apply specific stash
gitplus stash apply --index 1

# Remove specific stash
gitplus stash drop --index 1
```

**Options:**
- `-m, --message <message>`: Stash message (for push action)
- `-u, --include-untracked`: Include untracked files
- `-i, --index <index>`: Stash index for pop/apply/drop actions
- `-v, --verbose`: Show detailed information

### `gitplus reset` - Repository Reset

Reset repository state to undo changes with different modes.

```bash
# Soft reset (keep changes staged)
gitplus reset soft

# Mixed reset (unstage changes, keep in working directory)
gitplus reset mixed

# Hard reset (discard all changes) - requires confirmation
gitplus reset hard --confirm

# Reset to specific commit
gitplus reset mixed --target HEAD~2

# Reset specific files
gitplus reset mixed --files file1.js file2.js
```

**Options:**
- `-t, --target <target>`: Target commit/branch (default: HEAD)
- `-f, --files <files...>`: Specific files to reset
- `-c, --confirm`: Confirm destructive operations (required for hard reset)
- `-v, --verbose`: Show detailed information

### `gitplus rebase` - Interactive Rebasing

Rebase current branch onto another branch with conflict handling.

```bash
# Rebase onto main
gitplus rebase main

# Interactive rebase
gitplus rebase main --interactive

# Continue interrupted rebase
gitplus rebase --action continue

# Abort rebase
gitplus rebase --action abort

# Skip current commit during rebase
gitplus rebase --action skip
```

**Options:**
- `-i, --interactive`: Start interactive rebase
- `-a, --action <action>`: Rebase action (start, continue, abort, skip)
- `--auto-resolve <strategy>`: Auto conflict resolution (ours, theirs, manual)
- `-v, --verbose`: Show detailed information

### `gitplus recover` - Lost Commit Recovery

Recover lost commits or changes using reflog and advanced git recovery.

```bash
# Show reflog entries
gitplus recover show-reflog

# Show more reflog entries
gitplus recover show-reflog --limit 50

# Show potentially lost commits
gitplus recover show-lost

# Recover specific commit
gitplus recover recover-commit --commit abc123def
```

**Options:**
- `-c, --commit <hash>`: Commit hash to recover (for recover-commit action)
- `-l, --limit <limit>`: Number of reflog entries (default: 20)
- `-v, --verbose`: Show detailed information

### `gitplus validate` - Repository Validation

Validate repository integrity, health, and detect issues.

```bash
# Basic validation
gitplus validate

# Deep validation including remote connectivity
gitplus validate --deep

# Attempt to fix issues automatically
gitplus validate --fix

# Verbose validation with detailed output
gitplus validate --verbose
```

**Options:**
- `-d, --deep`: Perform deep validation including remote connectivity
- `-f, --fix`: Attempt to fix issues automatically
- `-v, --verbose`: Show detailed information

## CLI Usage Examples

### Basic Development Workflow

```bash
# Navigate to your git repository
cd /path/to/your/git/repo

# Check repository status
gitplus status --verbose

# Analyze changes with AI
gitplus analyze --diff

# Create commit with AI message (dry run first)
gitplus commit --dry-run
gitplus commit --all

# Ship complete workflow
gitplus ship --dry-run    # Preview
gitplus ship              # Execute
```

### Advanced Git Operations

```bash
# Synchronize with remote
gitplus sync --strategy merge
gitplus sync --strategy rebase

# Manage stash operations
gitplus stash push -m "WIP: feature work"
gitplus stash list
gitplus stash pop

# Safe repository resets
gitplus reset mixed               # Reset index, keep working directory
gitplus reset hard --confirm     # Hard reset (requires confirmation)

# Interactive rebasing
gitplus rebase main
gitplus rebase --action continue # Continue interrupted rebase

# Recover lost work
gitplus recover show-reflog
gitplus recover recover-commit --commit abc123
```

### AI-Powered Suggestions

```bash
# Get AI suggestions for different purposes
gitplus suggest branch      # AI branch name suggestion
gitplus suggest commit      # AI commit message suggestion
gitplus suggest pr_title    # AI PR title suggestion
gitplus suggest pr_description  # AI PR description
```

## Testing AI Integration

The AI integration requires Claude CLI to be installed and authenticated. Test the AI functionality:

```bash
# Verify AI is working
claude --version  # Should show Claude CLI version

# Test AI with sample repository
cd /tmp && mkdir test-repo && cd test-repo
git init
echo "console.log('Hello World');" > app.js
git add app.js

# Test AI commit generation
gitplus commit --dry-run  # Should generate intelligent commit message

# If AI fails, gitplus falls back to rule-based analysis
```

## Troubleshooting

### Common CLI Issues

#### `gp` Command Not Working
**Issue**: `gp` command shows `git push` instead of gitplus commands.  
**Solution**: Your shell has `gp` aliased to `git push`. Use `gitplus` instead of `gp` for all commands.

#### CLI Commands Not Found
**Issue**: `gitplus: command not found`  
**Solutions**:
1. Ensure npm link was successful: `npm link`
2. Check if command exists: `which gitplus`
3. Rebuild and relink:
   ```bash
   npm run build
   chmod +x dist/main.js dist/cli.js dist/index.js
   npm link
   ```

#### Permission Denied Errors
**Issue**: `permission denied: /path/to/dist/main.js`  
**Solution**: Files need execute permissions after build:
```bash
chmod +x dist/main.js dist/cli.js dist/index.js
```

#### AI Integration Not Working
**Issue**: Commands fail with Claude CLI errors.  
**Solutions**:
1. Verify Claude CLI is installed and authenticated:
   ```bash
   claude --version
   claude auth login
   ```
2. Test Claude CLI directly:
   ```bash
   claude -p "test" --output-format json --model sonnet
   ```

## CLI vs MCP Comparison

| Feature | CLI Interface | MCP Interface |
|---------|---------------|---------------|
| **Primary Use** | Direct command-line usage | Claude Code integration |
| **Commands** | 14+ specialized commands | 3 essential tools |
| **Complexity** | Granular control | Simplified automation |
| **Target Users** | Advanced git users | Claude Code users |
| **AI Integration** | Individual command AI | Complete workflow AI |
| **Automation Level** | Manual command chaining | Automatic workflows |

## Best Practices

1. **Use MCP for Claude Code**: If you're using Claude Code, prefer the MCP tools over CLI commands
2. **Test with Dry Run**: Always use `--dry-run` first for destructive operations
3. **Verify AI**: Ensure Claude CLI is working before relying on AI features
4. **Check Status**: Use `gitplus status -v` to understand repository state
5. **Validate Repository**: Use `gitplus validate` to check repository health
6. **Recover Safely**: Use `gitplus recover` instead of manual git reflog operations

## Development Commands

```bash
# Run in development mode with auto-reload
npm run dev

# Test MCP server directly  
npm run start

# Run tests
npm test

# Run full validation (typecheck + tests)
npm run validate

# Clean and rebuild
npm run clean && npm run build
```

---

For the primary MCP interface documentation, see the main [README.md](README.md).