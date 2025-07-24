# Gitplus - AI-Powered Git Automation for Claude Code

[![CI](https://github.com/neublink/gitplus/workflows/CI/badge.svg)](https://github.com/neublink/gitplus/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

Gitplus is a Model Context Protocol (MCP) server that brings AI-powered git automation directly to Claude Code. Streamline your git workflow with intelligent commit messages, branch suggestions, and automated pull request creation.

## Features

🚀 **Complete Git Workflows**: One-command ship from changes to PR  
💻 **Smart Commits**: AI-generated conventional commit messages with strict spec compliance  
🔍 **Change Analysis**: Intelligent analysis of repository changes with breaking change detection  
💡 **AI Suggestions**: Smart suggestions for branches, commits, and PRs following best practices  
📝 **PR Drafting**: Auto-generated pull request titles and descriptions  
📊 **Git Status**: Enhanced repository status with platform detection  
✅ **Commit Validation**: Real-time validation against Conventional Commits specification  
🔧 **Auto-detection**: Automatic type/scope detection from file changes and diffs

## Quick Start

### Published Package Installation (Coming Soon)

Once published, install gitplus as an MCP server in Claude Code:

```bash
claude mcp add gitplus -- npx @gitplus/mcp@latest
```

### Local Development Installation

For development or testing before publication:

```bash
# Clone and build the project
git clone https://github.com/neublink/gitplus.git
cd gitplus
npm install
npm run build

# Install CLI globally for command line usage
npm link

# Add to Claude Code as MCP server
claude mcp add gitplus-local -- node $(pwd)/dist/index.js
```

Now you can use gitplus tools in Claude Code and CLI commands globally!

### Usage in Claude Code

Once installed, you can use gitplus tools directly in Claude Code:

**Ship your changes:**
> "Ship my current changes to a new PR"

**Create a smart commit:**
> "Commit my staged changes with an AI-generated message"

**Analyze repository:**
> "Analyze the changes in my repository and provide insights"

**Get suggestions:**
> "Suggest a branch name for my authentication feature"

**Draft a PR:**
> "Generate a PR description for my recent commits"

**Check status:**
> "Show me the current git status with detailed information"

## Available Tools

### 🚀 `ship`
Complete git workflow: analyze → commit → push → create PR
- **message**: Custom commit message (optional)
- **branch**: Target branch name (optional) 
- **baseBranch**: Base branch for PR (default: main/master)
- **draft**: Create PR as draft
- **noPR**: Skip PR creation, just commit and push
- **noPush**: Skip push, just stage and commit
- **reviewers**: List of reviewers for the PR
- **labels**: List of labels for the PR
- **autoMerge**: Enable auto-merge for the PR
- **force**: Force push and skip validations
- **dryRun**: Preview without executing

### 💻 `commit`
Create AI-powered conventional commit with staged changes
- **message**: Custom commit message (optional)
- **files**: Specific files to stage and commit (optional)
- **type**: Conventional commit type (feat, fix, docs, etc.)
- **scope**: Conventional commit scope
- **breaking**: Mark as breaking change
- **all**: Stage all changes before committing
- **dryRun**: Preview without executing

### 🔍 `analyze`
Analyze repository changes and provide insights
- **commitRange**: Specific commit range (e.g., "main..HEAD")
- **includeDiff**: Include full diff in analysis
- **contextFile**: Additional context file

### 💡 `suggest`
Get AI suggestions for branch names, commit messages, or PR content
- **for**: What to suggest (branch, commit, pr_title, pr_description) *required*
- **context**: Additional context for the suggestion
- **diff**: Git diff to base suggestions on
- **files**: Specific files to focus suggestions on

### 📝 `pr_draft`
Generate pull request title and description
- **commits**: List of commit messages to base PR on
- **commitRange**: Commit range to analyze (e.g., "main..HEAD")
- **includeDiff**: Include diff analysis in PR description
- **template**: PR template (feature, bugfix, hotfix, docs, refactor, chore)
- **contextFile**: Additional context file

### 📊 `status`
Get current repository status with platform detection
- **verbose**: Include detailed status information

### 🔧 `merge_local`
Merge a local branch into current branch
- **branchName**: Branch to merge into current branch *required*
- **baseBranch**: Base branch to merge into (default: main)
- **deleteAfter**: Delete feature branch after merge (default: true)
- **confirm**: User confirmation to proceed with merge *required*

### 🔄 `sync`
Synchronize with remote repository using fetch/pull with intelligent conflict handling
- **strategy**: Synchronization strategy (merge, rebase, fetch-only) (default: merge)
- **remote**: Remote name (default: origin)
- **branch**: Branch to sync (default: current branch)
- **autoResolve**: Automatic conflict resolution strategy (ours, theirs, manual)
- **force**: Force synchronization (use with caution)

### 📦 `stash`
Manage git stash for temporary storage of changes
- **action**: Stash action to perform (push, pop, apply, drop, list) *required*
- **message**: Stash message (for push action)
- **includeUntracked**: Include untracked files in stash
- **stashIndex**: Stash index for pop/apply/drop actions

### 🔄 `reset`
Reset repository state to undo changes with different modes
- **mode**: Reset mode (soft, mixed, hard) *required*
- **target**: Target commit/branch to reset to (default: HEAD)
- **files**: Specific files to reset (optional)
- **confirm**: Confirmation for destructive operations

### 🔀 `rebase`
Rebase current branch onto another branch with conflict handling
- **onto**: Branch to rebase onto
- **interactive**: Start interactive rebase
- **action**: Rebase action (start, continue, abort, skip) (default: start)
- **autoResolve**: Automatic conflict resolution strategy (ours, theirs, manual)

### 🔍 `recover`
Recover lost commits or changes using reflog and advanced git recovery
- **action**: Recovery action to perform (show-reflog, recover-commit, show-lost) *required*
- **commitHash**: Commit hash to recover (for recover-commit action)
- **limit**: Number of reflog entries to show (default: 20)

### ✅ `validate`
Validate repository integrity, health, and detect issues
- **deep**: Perform deep validation including remote connectivity
- **fix**: Attempt to fix issues automatically

## Conventional Commits

Gitplus follows the [Conventional Commits](https://www.conventionalcommits.org/) specification strictly. Every commit message is:

### ✅ **Validated** against the specification
- Format: `type(scope): description`
- Breaking changes: `type(scope)!: description`
- Supported types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

### 🤖 **AI-Enhanced** with intelligent detection
```bash
# AI automatically detects:
feat(auth): add OAuth2 login support        # New features
fix(api): handle null response errors       # Bug fixes  
docs: update installation guide             # Documentation
build(deps): upgrade typescript to v5       # Dependencies
refactor(utils): extract validation logic   # Code restructuring
```

### 🔍 **Smart Analysis** of your changes
- **Type detection**: Analyzes file changes to suggest appropriate commit types
- **Scope suggestion**: Infers scope from affected directories (api, components, utils, etc.)
- **Breaking changes**: Automatically detects API changes and adds `!` notation
- **Validation feedback**: Real-time validation with helpful error messages

### Examples

#### Feature with scope
```
feat(auth): add two-factor authentication

Implements TOTP-based 2FA with QR code generation
and backup codes for account recovery.

Closes #156
```

#### Breaking change
```
feat(api)!: change user data structure

BREAKING CHANGE: User objects now use `userId` instead of `id`.
Migration guide available in docs/migration.md
```

#### Simple fix
```
fix(validation): handle empty email addresses
```

## Architecture

Gitplus is built with:
- **TypeScript**: Type-safe development
- **MCP SDK**: Official Model Context Protocol SDK
- **Zod**: Runtime type validation
- **Node.js**: Cross-platform compatibility
- **Conventional Commits**: Strict adherence to commit message standards

## Development Setup

### Prerequisites

Before developing with gitplus, ensure you have:

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

### Environment Variables

Configure gitplus behavior with these environment variables:

```bash
# AI Configuration
export GITPLUS_MODEL="sonnet"                    # Claude model (default: sonnet)
export GITPLUS_TIMEOUT="60000"                   # Timeout in milliseconds (default: 60000)
export GITPLUS_CLAUDE_COMMAND="claude"           # Claude CLI command path (default: claude)
```

**Important**: AI is mandatory - gitplus will fail immediately if Claude CLI is not available or working.

### Development Workflow

```bash
# Clone the repository
git clone https://github.com/neublink/gitplus.git
cd gitplus

# Install dependencies
npm install

# Build the project
npm run build

# Link CLI globally for testing
npm link

# Add to Claude Code as MCP server (local development)
claude mcp add gitplus-local -- node $(pwd)/dist/index.js
```

After setup:
- Both `gitplus` and `gp` CLI commands are available globally
- Gitplus tools are available in Claude Code conversations
- Any changes require `npm run build` to rebuild

### CLI Commands

After linking (`npm link`), use gitplus commands in any git repository:

```bash
# Navigate to your git repository
cd /path/to/your/git/repo

# Check repository status
gitplus status --verbose
gp status  # Short alias

# Analyze changes with AI
gitplus analyze --diff
gp analyze  # Get AI insights on your changes

# Generate AI commit message (dry run)
gitplus commit --dry-run
gp commit -d  # Preview AI-generated commit

# Create actual commit with AI message
gitplus commit --all
gp commit -a  # Stage all changes and commit

# Get AI suggestions
gitplus suggest branch    # AI branch name suggestion
gitplus suggest commit    # AI commit message suggestion
gp suggest pr_title       # AI PR title suggestion

# Complete ship workflow (dry run)
gitplus ship --dry-run    # Preview full workflow
gp ship --no-pr          # Commit and push without PR

# Synchronize with remote
gitplus sync --strategy merge    # Merge remote changes
gp sync --strategy rebase        # Rebase on remote changes

# Manage stash operations
gitplus stash push -m "WIP: feature work"  # Create stash
gitplus stash list                         # List all stashes
gp stash pop                              # Apply and remove latest stash

# Safe repository resets
gitplus reset mixed               # Reset index, keep working directory
gp reset hard --confirm          # Hard reset (requires confirmation)

# Interactive rebasing
gitplus rebase main               # Rebase current branch onto main
gp rebase --action continue      # Continue interrupted rebase

# Recover lost work
gitplus recover show-reflog       # Show recent reflog entries
gp recover recover-commit --commit abc123  # Recover specific commit

# Repository validation
gitplus validate --deep           # Deep repository health check
gp validate --fix                # Attempt to fix issues automatically
```

### Available Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `gitplus commit` | `gp commit` | AI-powered conventional commits |
| `gitplus ship` | `gp ship` | Complete workflow: commit → push → PR |
| `gitplus analyze` | `gp analyze` | AI analysis of repository changes |
| `gitplus suggest <type>` | `gp suggest <type>` | AI suggestions for branch/commit/PR |
| `gitplus status` | `gp status` | Enhanced git status with platform detection |
| `gitplus sync` | `gp sync` | Synchronize with remote repository |
| `gitplus stash <action>` | `gp stash <action>` | Manage git stash operations |
| `gitplus reset <mode>` | `gp reset <mode>` | Reset repository state safely |
| `gitplus rebase [onto]` | `gp rebase [onto]` | Interactive and automatic rebasing |
| `gitplus recover <action>` | `gp recover <action>` | Recover lost commits using reflog |
| `gitplus validate` | `gp validate` | Validate repository health and integrity |

Note: The CLI also supports all MCP tools when built and run locally.

### Testing AI Integration

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

### Development Commands

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

## Configuration

Gitplus works out-of-the-box with sensible defaults. For advanced users, configuration options will be added in future versions.

## Platform Support

- ✅ **Local Git**: Works with any git repository
- ✅ **GitHub**: Full platform detection and PR creation via GitHub CLI
- ✅ **GitLab**: Full platform detection and MR creation via GitLab CLI
- ✅ **Auto-detection**: Automatically detects platform from remote URL

## Publishing & Release

### Manual Publishing
Use the GitHub Actions workflow to publish:

1. **Go to Actions tab** in GitHub repository
2. **Select "Manual Publish"** workflow  
3. **Choose version bump**: patch, minor, or major
4. **Click "Run workflow"** to automatically:
   - Run full test suite
   - Build the package
   - Bump version and create git tag
   - Publish to NPM registry
   - Create GitHub release with changelog
   - Verify published package

### Automated Release (Tag-based)
Alternatively, create a release tag:
```bash
git tag v1.x.x && git push origin v1.x.x
```

This triggers the existing release workflow for automated publishing.

## Contributing

We welcome contributions! Please follow these guidelines:

### Pull Request Process
1. **Fork the repository** and create a feature branch
2. **Follow conventional commits**: `feat:`, `fix:`, `docs:`, etc.
3. **Add tests** for new functionality
4. **Update documentation** as needed
5. **Ensure CI passes** before requesting review

### Code Standards
- **TypeScript**: All code must be properly typed
- **Testing**: Maintain >80% test coverage
- **Conventional Commits**: Use semantic commit messages
- **Security**: No credentials in code, audit dependencies regularly

### Development Setup
```bash
# Clone and setup
git clone https://github.com/neublink/gitplus.git
cd gitplus
npm install
npm run build

# Link for local testing
npm link
gitplus --help

# Add to Claude Code for MCP testing
claude mcp add gitplus-local -- node $(pwd)/dist/index.js
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/neublink/gitplus/wiki)
- 🐛 [Issue Tracker](https://github.com/neublink/gitplus/issues)
- 💬 [Discussions](https://github.com/neublink/gitplus/discussions)

---

Made with ❤️ for the Claude Code community