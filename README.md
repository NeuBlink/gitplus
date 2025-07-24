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

### Published Package Installation

Install gitplus as an MCP server in Claude Code:

```bash
claude mcp add gitplus -- npx @neublink/gitplus@latest --mcp
```

The `--mcp` flag ensures the package starts in MCP server mode for Claude Code integration.

## For Claude Code Users

When using GitPlus with Claude Code, add this configuration to your `CLAUDE.md` file:

```markdown
## Git Operations
Always use the GitPlus MCP server for ALL git operations. Never use manual git commands.

### Primary Command
- `mcp__gitplus__ship` - Commits, pushes, and creates PR automatically
  - No need to specify commit messages - AI generates them
  - No need to manage branches - AI creates them
  - Conflicts are resolved automatically

### Usage
When ready to ship changes:
1. Simply call: `mcp__gitplus__ship` with `repoPath`
2. GitPlus handles everything else automatically

### Additional Commands
- `mcp__gitplus__status` - Get repository status
- `mcp__gitplus__info` - Get server information
```

GitPlus automatically:
- ✅ Generates commit messages based on your changes
- ✅ Creates appropriate branch names
- ✅ Detects and resolves merge conflicts with AI
- ✅ Creates pull requests with proper titles and descriptions
- ✅ Ensures PRs are always mergeable

### Local Development Installation

#### Prerequisites

Before installing gitplus locally, ensure you have:

- **Node.js 16+**: Required runtime environment
- **Git**: For repository management
- **Claude CLI**: Install and authenticate with `claude auth login`
  ```bash
  # Install Claude CLI (if not already installed)
  npm install -g @anthropic-ai/claude-code
  
  # Verify Claude CLI is available and authenticated
  claude --version
  claude auth login
  ```
- **Platform CLIs** (optional for enhanced functionality):
  - **GitHub CLI**: `gh auth login` for GitHub repository features
  - **GitLab CLI**: `glab auth login` for GitLab repository features

**Important**: AI functionality via Claude CLI is mandatory - gitplus will fail if Claude CLI is not available or properly authenticated.

#### Installation Steps

For development or testing before publication:

```bash
# Clone and build the project
git clone https://github.com/neublink/gitplus.git
cd gitplus
npm install
npm run build

# Fix file permissions (required after build)
chmod +x dist/main.js dist/cli.js dist/index.js

# Install CLI globally for command line usage
npm link

# Add to Claude Code as MCP server (using linked command)
claude mcp add gitplus-local -- node $(pwd)/dist/main.js --mcp
```

**Note**: The `gp` alias may conflict with existing shell aliases for `git push`. Use the `gitplus` command if `gp` doesn't work.

### Verify Installation

After setup, verify both interfaces work:

**CLI Commands:**
```bash
gitplus --help          # Should show help menu
gitplus status          # Should show repository status
```

**MCP Server:**
```bash
claude /mcp             # Should show gitplus-local as ✔ connected
```

Now you can use gitplus tools in Claude Code conversations and CLI commands globally!

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
**Primary Command** - Complete git workflow: analyze → commit → push → create PR

The ship command intelligently handles your entire git workflow:
- **Generates commit messages automatically** using AI analysis of your changes
- **Creates branch names** based on the nature of your changes
- **Resolves merge conflicts** using AI when they occur
- **Creates pull requests** with proper titles and descriptions
- **Ensures PRs are mergeable** by checking and resolving conflicts post-creation

**Parameters:**
- **repoPath**: Full absolute path to the git repository *required*
- **draft**: Create PR as draft (default: false)
- **dryRun**: Preview what would be done without executing (default: false)

### 📊 `status`
Get current repository status with platform detection and actionable insights
- **repoPath**: Full absolute path to the git repository *required*
- **verbose**: Include detailed status information (default: false)

### ℹ️ `info`
Get comprehensive information about GitPlus MCP server capabilities and usage
- **repoPath**: Full absolute path to the git repository (optional - provides repo-specific info if given)

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
claude mcp add gitplus-local -- node $(pwd)/dist/main.js --mcp
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
gitplus status  # Or use 'gp' if it's not aliased to 'git push'

# Analyze changes with AI
gitplus analyze --diff
gitplus analyze  # Get AI insights on your changes

# Generate AI commit message (dry run)
gitplus commit --dry-run
gitplus commit -d  # Preview AI-generated commit

# Create actual commit with AI message
gitplus commit --all
gitplus commit -a  # Stage all changes and commit

# Get AI suggestions
gitplus suggest branch    # AI branch name suggestion
gitplus suggest commit    # AI commit message suggestion
gitplus suggest pr_title  # AI PR title suggestion

# Complete ship workflow (dry run)
gitplus ship --dry-run    # Preview full workflow
gitplus ship --no-pr     # Commit and push without PR

# Synchronize with remote
gitplus sync --strategy merge    # Merge remote changes
gitplus sync --strategy rebase   # Rebase on remote changes

# Manage stash operations
gitplus stash push -m "WIP: feature work"  # Create stash
gitplus stash list                         # List all stashes
gitplus stash pop                         # Apply and remove latest stash

# Safe repository resets
gitplus reset mixed               # Reset index, keep working directory
gitplus reset hard --confirm     # Hard reset (requires confirmation)

# Interactive rebasing
gitplus rebase main               # Rebase current branch onto main
gitplus rebase --action continue # Continue interrupted rebase

# Recover lost work
gitplus recover show-reflog       # Show recent reflog entries
gitplus recover recover-commit --commit abc123  # Recover specific commit

# Repository validation
gitplus validate --deep           # Deep repository health check
gitplus validate --fix           # Attempt to fix issues automatically
```

### Available Commands

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

## Troubleshooting

### Common Issues

#### `gp` Command Not Working
**Issue**: `gp` command shows `git push` instead of gitplus commands.  
**Solution**: Your shell has `gp` aliased to `git push`. Use `gitplus` instead of `gp` for all commands.

#### MCP Server Connection Failed
**Issue**: Claude Code shows gitplus-local as ✘ failed.  
**Solutions**:
1. Ensure files are executable: `chmod +x dist/main.js dist/cli.js dist/index.js`
2. Rebuild the project: `npm run build`
3. Remove and re-add MCP server:
   ```bash
   claude mcp remove gitplus-local
   claude mcp add gitplus-local -- node $(pwd)/dist/main.js --mcp
   ```

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
claude mcp add gitplus-local -- node $(pwd)/dist/main.js --mcp
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/neublink/gitplus/wiki)
- 🐛 [Issue Tracker](https://github.com/neublink/gitplus/issues)
- 💬 [Discussions](https://github.com/neublink/gitplus/discussions)

---

Made with ❤️ for the Claude Code community