# GitPlus GitHub Configuration

This directory contains GitHub-specific configuration files, workflows, and scripts for the GitPlus repository.

## 📁 Directory Structure

```
.github/
├── docs/                          # Documentation for workflows and processes
│   ├── branch-protection-setup.md # Branch protection configuration guide
│   └── workflow-configuration.md  # Comprehensive workflow configuration guide
├── ISSUE_TEMPLATE/                # GitHub issue templates
│   ├── bug_report.md              # Bug report template
│   └── feature_request.md         # Feature request template
├── scripts/                       # Reusable workflow scripts
│   ├── generate-merge-prompt.sh   # Creates AI merge decision prompts
│   └── generate-todo-list.sh      # Generates TODO lists for rejected PRs
└── workflows/                     # GitHub Actions workflows
    ├── ci.yml                     # Continuous Integration pipeline
    ├── claude-code-review.yml     # Automated Claude code reviews
    ├── claude.yml                 # Interactive Claude assistance
    ├── dependencies.yml           # Dependency update automation
    ├── merge-decision.yml         # AI-powered merge decisions
    ├── pr-checks.yml              # Pull request validation
    ├── publish.yml                # NPM package publishing
    ├── release-please-post.yml    # Post-release automation
    ├── release-please.yml         # Automated release management
    └── release.yml                # Release publishing workflow
```

## 🚀 Key Workflows

### Core Automation
- **`claude-code-review.yml`**: Automatic comprehensive code reviews using Claude AI
- **`merge-decision.yml`**: AI-powered merge decisions with TODO list generation
- **`ci.yml`**: Multi-platform testing and validation
- **`pr-checks.yml`**: Pull request validation and compatibility testing

### Release Management
- **`release-please.yml`**: Automated version bumps and changelog generation
- **`release-please-post.yml`**: Post-release package.json synchronization
- **`publish.yml`**: NPM package publishing with propagation checking
- **`release.yml`**: GitHub release creation

### Maintenance
- **`dependencies.yml`**: Automated dependency updates
- **`claude.yml`**: Interactive Claude assistance on issues and PRs

## 🔧 Scripts

### `generate-merge-prompt.sh`
Creates structured prompts for AI merge decisions with proper context injection.

**Usage:**
```bash
.github/scripts/generate-merge-prompt.sh
```

### `generate-todo-list.sh`
Generates actionable TODO lists for rejected PRs based on rejection reasons and critical issues.

**Usage:**
```bash
.github/scripts/generate-todo-list.sh "$REASON" "$CRITICAL_ISSUES"
```

## 📚 Documentation

### `workflow-configuration.md`
Comprehensive guide for configuring and customizing GitPlus workflows including:
- Adaptive polling parameters
- Performance optimization
- Security configuration
- Troubleshooting guide

### `branch-protection-setup.md`
Instructions for setting up repository branch protection rules that work with GitPlus automation.

## 🔒 Security Features

All workflows implement security best practices:
- **Minimal permissions**: Each workflow uses least-privilege access
- **Input validation**: All user inputs are validated with regex patterns
- **Safe contexts**: No direct execution of user-controlled content
- **Token scoping**: Proper GitHub token usage with explicit permissions

## 🎯 Workflow Triggers

- **Pull Requests**: `claude-code-review.yml`, `merge-decision.yml`, `ci.yml`, `pr-checks.yml`
- **Releases**: `release-please.yml`, `publish.yml`, `release.yml`
- **Schedules**: `dependencies.yml` (weekly)
- **Manual**: `merge-decision.yml` (workflow_dispatch for debugging)
- **Issues/Comments**: `claude.yml` (interactive assistance)

## 🚨 Required Secrets

Configure these secrets in your repository settings:

```yaml
secrets:
  CLAUDE_CODE_OAUTH_TOKEN    # Claude AI integration token
  NPM_TOKEN                  # NPM publishing token (for releases)
  # GITHUB_TOKEN is automatically provided
```

## 📊 Monitoring

Key metrics to monitor:
- Claude review success rate
- Auto-merge success rate  
- Workflow execution times
- False rejection rates

See `docs/workflow-configuration.md` for detailed monitoring setup.

## 🛠️ Development

When modifying workflows:

1. **Test locally**: Use the test suite in `tests/workflows/`
2. **Validate syntax**: Ensure YAML is properly formatted
3. **Security review**: Follow security guidelines in documentation
4. **Documentation**: Update this README and workflow-configuration.md

## 🤝 Contributing

For workflow improvements:
1. Test changes thoroughly with dry-run capabilities
2. Maintain backward compatibility
3. Update documentation
4. Consider security implications
5. Use the GitPlus ship command for consistent commits

---

*This configuration enables fully automated, AI-powered development workflows while maintaining security and reliability.*