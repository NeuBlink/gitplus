# GitPlus - AI-Powered Git Automation for Claude Code

[![CI](https://github.com/neublink/gitplus/workflows/CI/badge.svg)](https://github.com/neublink/gitplus/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

GitPlus is a Model Context Protocol (MCP) server that brings AI-powered git automation directly to Claude Code. It provides a simplified, intelligent interface with just 3 essential tools that handle complete git workflows automatically.

## Features

🚀 **Complete Git Workflows**: One-command ship from changes to PR  
💻 **Smart Commits**: AI-generated conventional commit messages with strict spec compliance  
🔍 **Change Analysis**: Intelligent analysis of repository changes with breaking change detection  
🤖 **AI-Powered**: Uses Claude AI for commit messages, branch names, and conflict resolution  
📝 **PR Automation**: Auto-generated pull request titles and descriptions  
📊 **Repository Status**: Enhanced repository status with platform detection  
✅ **Commit Validation**: Real-time validation against Conventional Commits specification  
🌐 **Multi-Platform**: Supports GitHub, GitLab, and local repositories

## Quick Start

### Install as MCP Server for Claude Code

Install GitPlus as an MCP server in Claude Code:

```bash
claude mcp add gitplus -- npx @neublink/gitplus@latest --mcp
```

The `--mcp` flag ensures the package starts in MCP server mode for Claude Code integration.

### Configuration for Claude Code

Add this configuration to your `CLAUDE.md` file to optimize GitPlus usage:

```markdown
## Git Operations
Always use the GitPlus MCP server for ALL git operations. Never use manual git commands.

### Primary Command
- `mcp__gitplus__ship` - Complete git workflow: analyze → commit → push → create PR
  - AI generates commit messages automatically
  - AI creates appropriate branch names
  - AI resolves conflicts when possible
  - Creates pull requests with generated titles and descriptions

### Usage Pattern
When ready to ship changes:
1. Simply call: `mcp__gitplus__ship` with absolute `repoPath`
2. GitPlus handles everything else automatically

### Additional Commands
- `mcp__gitplus__status` - Get enhanced repository status
- `mcp__gitplus__info` - Get server information and capabilities
```

GitPlus automatically:
- ✅ Generates conventional commit messages based on your changes
- ✅ Creates appropriate branch names from change analysis
- ✅ Detects and resolves merge conflicts with AI
- ✅ Creates pull requests with proper titles and descriptions
- ✅ Ensures PRs are always mergeable

## Available MCP Tools

GitPlus has been intentionally simplified to 3 essential tools that provide maximum automation with minimal decision-making overhead:

### 🚀 `ship` - Complete Git Workflow
**Primary Command** - Handles the complete workflow: analyze → commit → push → create PR

The ship command intelligently handles your entire git workflow:
- **Analyzes changes** using AI to understand the nature and impact of modifications
- **Generates commit messages** automatically using AI analysis of your changes
- **Creates branch names** based on the nature of your changes
- **Resolves merge conflicts** using AI when they occur
- **Creates pull requests** with proper titles and descriptions
- **Ensures PRs are mergeable** by checking and resolving conflicts post-creation

**Parameters:**
- **repoPath**: Full absolute path to the git repository *required*
- **draft**: Create PR as draft (default: false)
- **dryRun**: Preview what would be done without executing (default: false)

**Example Usage in Claude Code:**
> "Ship my current changes to a new PR"

### 📊 `status` - Enhanced Repository Status
Get current repository status with platform detection and actionable insights

**Parameters:**
- **repoPath**: Full absolute path to the git repository *required*
- **verbose**: Include detailed status information (default: false)

**Example Usage in Claude Code:**
> "Show me the current git status with detailed information"

### ℹ️ `info` - Server Information
Get comprehensive information about GitPlus MCP server capabilities and usage

**Parameters:**
- **repoPath**: Full absolute path to the git repository (optional - provides repo-specific info if given)

**Example Usage in Claude Code:**
> "Tell me about GitPlus capabilities and tools"

## Architecture

GitPlus follows a **simplified MCP-first architecture** designed around intelligent automation:

### Core Design Philosophy
- **3 Essential Tools**: Reduced from 14+ CLI commands to 3 MCP tools that handle everything
- **AI-Powered Intelligence**: Uses Claude AI for all decision-making (commit messages, branch names, conflict resolution)
- **Complete Workflows**: Each tool provides complete functionality rather than partial operations
- **Zero Configuration**: Works out-of-the-box with sensible defaults

### Technology Stack
- **TypeScript**: Type-safe development with strict compilation
- **MCP SDK**: Official Model Context Protocol SDK for Claude Code integration
- **Zod**: Runtime type validation for inputs and outputs
- **Node.js**: Cross-platform compatibility (Node 16+)
- **Conventional Commits**: Strict adherence to commit message standards

### Key Components
- `src/mcp/toolDefinitions.ts` - Defines the 3 MCP tools exposed to Claude
- `src/mcp/toolHandler.ts` - Implements handlers for the 3 tools
- `src/mcp/server.ts` - MCP server setup with descriptive metadata
- `src/git/client.ts` - Core git operations wrapper
- `src/ai/service.ts` - AI integration for intelligent analysis

## AI-Powered Conventional Commits

GitPlus follows the [Conventional Commits](https://www.conventionalcommits.org/) specification strictly. Every commit message is:

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

## Platform Support

- ✅ **Local Git**: Works with any git repository
- ✅ **GitHub**: Full platform detection and PR creation via GitHub CLI
- ✅ **GitLab**: Full platform detection and MR creation via GitLab CLI
- ✅ **Auto-detection**: Automatically detects platform from remote URL

## Prerequisites

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

**Important**: AI functionality via Claude CLI is mandatory - GitPlus will fail if Claude CLI is not available or properly authenticated.

## Local Development

For development or testing before publication:

```bash
# Clone and build the project
git clone https://github.com/neublink/gitplus.git
cd gitplus
npm install
npm run build

# Fix file permissions (required after build)
chmod +x dist/main.js dist/cli.js dist/index.js

# Install CLI globally for command line usage (optional)
npm link

# Add to Claude Code as MCP server (using local build)
claude mcp add gitplus-local -- node $(pwd)/dist/main.js --mcp
```

### Verify Installation

After setup, verify the MCP server works:

```bash
claude /mcp             # Should show gitplus-local as ✔ connected
```

Now you can use GitPlus tools directly in Claude Code conversations!

## CLI Interface (Optional)

GitPlus also provides a CLI interface for direct command-line usage. The CLI offers additional commands beyond the 3 MCP tools for advanced git operations.

**Note**: The CLI is secondary to the MCP interface. For Claude Code users, the MCP tools (`ship`, `status`, `info`) are the primary interface.

For detailed CLI documentation, see [CLI.md](CLI.md).

## Configuration

GitPlus works out-of-the-box with sensible defaults. Advanced configuration options:

### Environment Variables

```bash
# AI Configuration
export GITPLUS_MODEL="sonnet"                    # Claude model (default: sonnet)
export GITPLUS_TIMEOUT="60000"                   # Timeout in milliseconds (default: 60000)
export GITPLUS_CLAUDE_COMMAND="claude"           # Claude CLI command path (default: claude)
```

## Troubleshooting

### Common Issues

#### MCP Server Connection Failed
**Issue**: Claude Code shows gitplus as ✘ failed.  
**Solutions**:
1. Ensure files are executable: `chmod +x dist/main.js dist/cli.js dist/index.js`
2. Rebuild the project: `npm run build`
3. Remove and re-add MCP server:
   ```bash
   claude mcp remove gitplus
   claude mcp add gitplus -- npx @neublink/gitplus@latest --mcp
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

#### Permission Denied Errors
**Issue**: `permission denied: /path/to/dist/main.js`  
**Solution**: Files need execute permissions after build:
```bash
chmod +x dist/main.js dist/cli.js dist/index.js
```

## Development

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run validation (typecheck + tests)  
npm run validate
```

### Building

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev
```

### Using GitPlus for Development

**Important: Always use GitPlus MCP server for ALL git operations on this repository. Never use manual git commands.**

When you've made changes to the GitPlus codebase:
1. Make your code changes
2. Run tests: `npm test`
3. Check status: Use `mcp__gitplus__status` with `repoPath` and `verbose: true`
4. Ship changes: Use `mcp__gitplus__ship` with `repoPath`

GitPlus will handle all git operations intelligently, ensuring proper commit messages and workflow.

## Publishing & Release

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