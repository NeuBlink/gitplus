# Gitplus: Complete Implementation Plan

## Project Overview
**Gitplus** is a new AI-powered Git automation tool designed specifically for Claude Code integration via MCP (Model Context Protocol). It provides intelligent git workflows while maintaining simplicity and efficiency.

## Core Requirements Summary
- ✅ Brand new project (inspired by auto-pr)
- ✅ MCP-first design for Claude Code
- ✅ Simple one-line installation: `claude mcp add gitplus -- npx -y @gitplus/mcp@latest`
- ✅ Local-first operation (works without gh/glab CLI)
- ✅ Simple & efficient (no team features, no web UI)
- ✅ Focus on git best practices with AI intelligence

## Architecture Overview

### 1. Project Structure
```
gitplus/
├── cmd/
│   └── gitplus/
│       └── main.go              # Entry point with dual-mode operation
├── internal/
│   ├── mcp/
│   │   ├── server.go           # MCP stdio server implementation
│   │   ├── protocol.go         # MCP protocol types & handlers
│   │   ├── tools.go            # Tool definitions & implementations
│   │   └── handlers.go         # Individual tool handlers
│   ├── git/
│   │   ├── client.go           # Git operations wrapper
│   │   ├── analyzer.go         # Change analysis & diff parsing
│   │   ├── operations.go       # Core git commands
│   │   └── platform.go         # Platform detection (GitHub/GitLab/Local)
│   ├── ai/
│   │   ├── client.go           # AI client interface
│   │   ├── claude.go           # Claude API integration
│   │   └── prompts.go          # Optimized prompts for git operations
│   ├── cli/
│   │   ├── root.go             # CLI root command
│   │   ├── ship.go             # Ship command implementation
│   │   ├── commit.go           # Commit command
│   │   └── analyze.go          # Analyze command
│   └── config/
│       └── config.go           # Minimal configuration management
├── pkg/
│   └── types/
│       └── types.go            # Shared types
├── go.mod
├── go.sum
└── Makefile                    # Build automation
```

### 2. NPM Package Structure
```
npm/
├── package.json
├── index.js                    # MCP server entry point
├── lib/
│   ├── download.js            # Binary downloader
│   └── platform.js            # Platform detection
└── dist/                      # Pre-built binaries (added during release)
    ├── gitplus-darwin-arm64
    ├── gitplus-darwin-x64
    ├── gitplus-linux-x64
    └── gitplus-windows-x64.exe
```

## Implementation Phases

### Phase 1: Core Foundation (Days 1-3)

#### 1.1 Project Setup
```bash
# Initialize project
mkdir gitplus && cd gitplus
go mod init github.com/gitplus/gitplus

# Create directory structure
mkdir -p cmd/gitplus internal/{mcp,git,ai,cli,config} pkg/types
mkdir -p npm/lib

# Initialize git repository
git init
```

#### 1.2 Core Types & Interfaces
```go
// pkg/types/types.go
package types

type GitStatus struct {
    Branch      string
    IsDirty     bool
    Staged      []string
    Unstaged    []string
    Untracked   []string
}

type AIRequest struct {
    Operation   string
    Context     string
    Diff        string
    History     []string
}

type Platform int
const (
    Unknown Platform = iota
    GitHub
    GitLab
    LocalOnly
)
```

#### 1.3 Main Entry Point
```go
// cmd/gitplus/main.go
package main

import (
    "os"
    "github.com/gitplus/gitplus/internal/mcp"
    "github.com/gitplus/gitplus/internal/cli"
)

func main() {
    // Dual-mode operation
    if len(os.Args) > 1 && os.Args[1] == "mcp" {
        // MCP server mode for Claude Code
        mcp.RunServer()
    } else {
        // CLI mode for direct usage
        cli.Execute()
    }
}
```

### Phase 2: MCP Implementation (Days 3-5)

#### 2.1 MCP Protocol Implementation
```go
// internal/mcp/protocol.go
package mcp

type Request struct {
    Jsonrpc string          `json:"jsonrpc"`
    Method  string          `json:"method"`
    Params  json.RawMessage `json:"params"`
    ID      interface{}     `json:"id"`
}

type Response struct {
    Jsonrpc string      `json:"jsonrpc"`
    Result  interface{} `json:"result,omitempty"`
    Error   *Error      `json:"error,omitempty"`
    ID      interface{} `json:"id"`
}

type Tool struct {
    Name        string      `json:"name"`
    Description string      `json:"description"`
    InputSchema InputSchema `json:"inputSchema"`
}
```

#### 2.2 MCP Server (stdio)
```go
// internal/mcp/server.go
package mcp

func RunServer() {
    scanner := bufio.NewScanner(os.Stdin)
    encoder := json.NewEncoder(os.Stdout)
    
    for scanner.Scan() {
        var req Request
        json.Unmarshal(scanner.Bytes(), &req)
        
        res := handleRequest(req)
        encoder.Encode(res)
    }
}
```

#### 2.3 Tool Definitions
```go
// internal/mcp/tools.go
package mcp

var tools = []Tool{
    {
        Name: "ship",
        Description: "Complete git workflow: analyze, commit, push, and create PR",
        InputSchema: InputSchema{
            Type: "object",
            Properties: map[string]Property{
                "message": {Type: "string", Description: "Optional commit message"},
                "branch": {Type: "string", Description: "Target branch"},
                "draft": {Type: "boolean", Description: "Create as draft PR"},
            },
        },
    },
    {
        Name: "commit",
        Description: "Create AI-powered conventional commit",
        InputSchema: InputSchema{
            Type: "object",
            Properties: map[string]Property{
                "files": {Type: "array", Items: &Property{Type: "string"}},
                "type": {Type: "string", Enum: []string{"feat", "fix", "docs", "style", "refactor", "test", "chore"}},
            },
        },
    },
    {
        Name: "analyze",
        Description: "Analyze repository changes and provide insights",
        InputSchema: InputSchema{Type: "object"},
    },
    {
        Name: "suggest",
        Description: "Get AI suggestions for branch names, commits, or PRs",
        InputSchema: InputSchema{
            Type: "object",
            Properties: map[string]Property{
                "for": {Type: "string", Enum: []string{"branch", "commit", "pr"}},
            },
        },
    },
    {
        Name: "pr_draft",
        Description: "Generate pull request title and description",
        InputSchema: InputSchema{
            Type: "object",
            Properties: map[string]Property{
                "commits": {Type: "array", Items: &Property{Type: "string"}},
            },
        },
    },
}
```

### Phase 3: Git Operations (Days 5-7)

#### 3.1 Git Client Implementation
```go
// internal/git/client.go
package git

type Client struct {
    workDir  string
    platform Platform
}

func NewClient(workDir string) (*Client, error) {
    platform := detectPlatform()
    return &Client{workDir: workDir, platform: platform}, nil
}

func (c *Client) Status() (*types.GitStatus, error)
func (c *Client) Add(files []string) error
func (c *Client) Commit(message string) error
func (c *Client) Push(branch string) error
func (c *Client) CreatePR(title, body string, draft bool) (string, error)
```

#### 3.2 Platform Detection
```go
// internal/git/platform.go
package git

func detectPlatform() Platform {
    // Check if gh CLI exists and is authenticated
    if _, err := exec.LookPath("gh"); err == nil {
        if isGitHubRepo() {
            return GitHub
        }
    }
    
    // Check if glab CLI exists and is authenticated
    if _, err := exec.LookPath("glab"); err == nil {
        if isGitLabRepo() {
            return GitLab
        }
    }
    
    return LocalOnly
}
```

### Phase 4: AI Integration (Days 7-9)

#### 4.1 Claude Integration
```go
// internal/ai/claude.go
package ai

type ClaudeClient struct {
    apiKey string
}

func (c *ClaudeClient) GenerateCommitMessage(diff string) (string, error)
func (c *ClaudeClient) SuggestBranchName(changes string) (string, error)
func (c *ClaudeClient) GeneratePRDescription(commits []string, diff string) (string, string, error)
```

#### 4.2 Optimized Prompts
```go
// internal/ai/prompts.go
package ai

const commitPrompt = `Analyze the following git diff and generate a conventional commit message.
Follow the format: <type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, test, chore
Keep the subject under 50 characters.
Be specific and descriptive.

Diff:
%s`

const branchPrompt = `Based on the following changes, suggest a descriptive branch name.
Follow the pattern detected in the repository or use: <type>/<description>
Keep it short, lowercase, with hyphens.

Changes:
%s`
```

### Phase 5: CLI Implementation (Days 9-10)

#### 5.1 CLI Commands
```go
// internal/cli/root.go
package cli

var rootCmd = &cobra.Command{
    Use:   "gitplus",
    Short: "AI-powered git automation tool",
}

func Execute() {
    rootCmd.Execute()
}

// internal/cli/ship.go
var shipCmd = &cobra.Command{
    Use:   "ship",
    Short: "Complete git workflow in one command",
    RunE: func(cmd *cobra.Command, args []string) error {
        // Implementation
    },
}
```

### Phase 6: NPM Package (Days 10-12)

#### 6.1 Package.json
```json
{
  "name": "@gitplus/mcp",
  "version": "1.0.0",
  "description": "AI-powered Git automation MCP server for Claude Code",
  "bin": {
    "gitplus-mcp": "./index.js"
  },
  "scripts": {
    "postinstall": "node lib/download.js"
  },
  "mcp": {
    "server": {
      "command": "node",
      "args": ["${pkgPath}/index.js"],
      "transport": "stdio"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/gitplus/gitplus"
  },
  "keywords": ["mcp", "claude", "git", "automation", "ai"],
  "license": "MIT",
  "engines": {
    "node": ">=16.0.0"
  }
}
```

#### 6.2 Entry Point
```javascript
// npm/index.js
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const { getBinaryPath } = require('./lib/platform');

const binaryPath = getBinaryPath();
const child = spawn(binaryPath, ['mcp'], {
  stdio: 'inherit',
  env: { ...process.env, GITPLUS_MCP_MODE: '1' }
});

// Handle signals
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
```

#### 6.3 Binary Downloader
```javascript
// npm/lib/download.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getBinaryName } = require('./platform');

async function download() {
  const binaryName = getBinaryName();
  const version = require('../package.json').version;
  const url = `https://github.com/gitplus/gitplus/releases/download/v${version}/${binaryName}`;
  
  const destPath = path.join(__dirname, '..', 'dist', binaryName);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  
  // Download binary
  console.log(`Downloading gitplus ${version} for your platform...`);
  // Implementation
}
```

### Phase 7: Build & Release (Days 12-14)

#### 7.1 Makefile
```makefile
VERSION := $(shell git describe --tags --always --dirty)
LDFLAGS := -X main.version=$(VERSION)

.PHONY: build
build:
	go build -ldflags "$(LDFLAGS)" -o gitplus cmd/gitplus/main.go

.PHONY: build-all
build-all:
	GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/gitplus-darwin-arm64 cmd/gitplus/main.go
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/gitplus-darwin-x64 cmd/gitplus/main.go
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/gitplus-linux-x64 cmd/gitplus/main.go
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/gitplus-windows-x64.exe cmd/gitplus/main.go

.PHONY: release
release: build-all
	# Copy binaries to npm package
	cp dist/* npm/dist/
	# Publish to npm
	cd npm && npm publish
```

#### 7.2 GitHub Actions
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Build all platforms
        run: make build-all
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/*
      
      - name: Publish to NPM
        run: |
          cp dist/* npm/dist/
          cd npm
          npm publish
        env:
          NODE_AUTH_TOKEN: ${{secrets.NPM_TOKEN}}
```

## Key Features Implementation

### 1. Smart Ship Command
```go
func handleShip(params ShipParams) error {
    // 1. Analyze changes
    status := git.Status()
    diff := git.Diff()
    
    // 2. Generate branch name if on main
    if status.Branch == "main" {
        branch := ai.SuggestBranchName(diff)
        git.CheckoutNewBranch(branch)
    }
    
    // 3. Stage and commit
    git.Add(".")
    message := ai.GenerateCommitMessage(diff)
    git.Commit(message)
    
    // 4. Push
    git.Push()
    
    // 5. Create PR if platform available
    if platform != LocalOnly {
        title, body := ai.GeneratePRDescription(commits, diff)
        url := git.CreatePR(title, body, params.Draft)
    }
    
    return nil
}
```

### 2. Local-First Operation
```go
func (c *Client) CreatePR(title, body string, draft bool) (string, error) {
    switch c.platform {
    case GitHub:
        return c.createGitHubPR(title, body, draft)
    case GitLab:
        return c.createGitLabMR(title, body, draft)
    case LocalOnly:
        // Save PR info locally for manual creation
        return c.savePRLocally(title, body)
    }
}
```

### 3. Minimal Configuration
```yaml
# ~/.gitplus/config.yaml (optional)
ai:
  provider: claude
conventions:
  commit_style: conventional
  branch_pattern: auto
```

## Testing Strategy

### Unit Tests
- Git operations mocking
- AI response handling
- MCP protocol compliance
- Platform detection

### Integration Tests
- Real git repository operations
- Claude API integration
- End-to-end workflows

### Manual Testing
- Claude Code integration
- Cross-platform binary execution
- NPM package installation

## Documentation

### README.md
- Quick installation guide
- Basic usage examples
- Claude Code setup
- Troubleshooting

### Docs
- `/docs/mcp-integration.md` - MCP protocol details
- `/docs/cli-reference.md` - CLI command reference
- `/docs/configuration.md` - Configuration options

## Success Metrics
1. **Installation**: < 30 seconds via Claude MCP command
2. **Performance**: < 1 second for most operations
3. **Reliability**: Works offline for local git operations
4. **Intelligence**: 90%+ accurate AI suggestions
5. **Simplicity**: < 5 commands to learn

## Timeline Summary
- Days 1-3: Core foundation
- Days 3-5: MCP implementation
- Days 5-7: Git operations
- Days 7-9: AI integration
- Days 9-10: CLI implementation
- Days 10-12: NPM package
- Days 12-14: Build, release, documentation

This plan creates a focused, efficient tool that integrates seamlessly with Claude Code while maintaining simplicity and local-first operation.