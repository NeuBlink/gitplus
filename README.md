# Gitplus - AI-Powered Git Automation for Claude Code

Gitplus is a Model Context Protocol (MCP) server that brings AI-powered git automation directly to Claude Code. Streamline your git workflow with intelligent commit messages, branch suggestions, and automated pull request creation.

## Features

🚀 **Complete Git Workflows**: One-command ship from changes to PR  
💻 **Smart Commits**: AI-generated conventional commit messages  
🔍 **Change Analysis**: Intelligent analysis of repository changes  
💡 **AI Suggestions**: Smart suggestions for branches, commits, and PRs  
📝 **PR Drafting**: Auto-generated pull request titles and descriptions  
📊 **Git Status**: Enhanced repository status with platform detection

## Quick Start

### Installation

Install gitplus as an MCP server in Claude Code:

```bash
claude mcp add gitplus -- npx @gitplus/mcp@latest
```

That's it! Gitplus is now available as a tool in Claude Code.

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

## Architecture

Gitplus is built with:
- **TypeScript**: Type-safe development
- **MCP SDK**: Official Model Context Protocol SDK
- **Zod**: Runtime type validation
- **Node.js**: Cross-platform compatibility

## Local Development

```bash
# Clone the repository
git clone https://github.com/neublink/gitplus.git
cd gitplus

# Install dependencies
npm install

# Build the project
npm run build

# Test the server
npm run start

# Development mode
npm run dev
```

## Configuration

Gitplus works out-of-the-box with sensible defaults. For advanced users, configuration options will be added in future versions.

## Platform Support

- ✅ **Local Git**: Works with any git repository
- 🚧 **GitHub**: Platform detection and PR creation (coming soon)
- 🚧 **GitLab**: Platform detection and MR creation (coming soon)

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/neublink/gitplus/wiki)
- 🐛 [Issue Tracker](https://github.com/neublink/gitplus/issues)
- 💬 [Discussions](https://github.com/neublink/gitplus/discussions)

---

Made with ❤️ for the Claude Code community