# GitPlus Workflow Pipeline

This document describes the complete automated workflow pipeline for GitPlus.

## Pipeline Overview

```
PR Created → CI Checks → Claude Review → Merge Decision → Auto Merge → Release
```

## Workflow Details

### 1. PR Creation Triggers

When a PR is opened, synchronize, or reopened:

- **CI Workflow** (`ci.yml`) - Runs tests, security checks, compatibility tests
- **PR Checks** (`pr-checks.yml`) - Validates conventional commits, bundle size, documentation
- **Claude Code Review** (`claude-code-review.yml`) - AI-powered code review
- **Merge Decision** (`merge-decision.yml`) - Waits for all checks, then makes merge decision

### 2. Special PR Types

#### Release Please PRs
- **Release Please Post** (`release-please-post.yml`) - Updates package-lock.json when version changes
- Follows same review pipeline but with auto-merge preference

#### Manual PRs
- Full review pipeline with manual merge option based on Claude's recommendation

### 3. Auto-Merge Pipeline

When Merge Decision completes successfully:
- **Auto Merge** (`auto-merge.yml`) - Checks if decision was "auto-merge" and PR is mergeable
- Performs actual merge if all conditions are met
- Comments on PR with merge status

### 4. Release Pipeline

When changes are merged to main:
- **Release Please** (`release-please.yml`) - Creates release PRs when needed
- When release tags are created:
  - **Release** (`release.yml`) - Publishes to NPM and creates GitHub releases

## Workflow Dependencies

### Required Checks for Merge Decision

The merge decision workflow now dynamically determines required checks based on what's available:

1. **Preferred Checks** (in priority order):
   - `claude-review` - Claude AI code review
   - `test (20.x)` or `CI / test (20.x)` - Node.js 20.x tests
   - `security` or `CI / security` - Security audit
   - `validate-pr` - PR validation checks

2. **Fallback**: If no preferred checks are available, waits for any running checks

### Auto-Merge Conditions

For a PR to be auto-merged, ALL conditions must be met:

1. ✅ Merge Decision workflow completed successfully
2. ✅ Claude's recommendation is "auto-merge"
3. ✅ PR is in "OPEN" state
4. ✅ PR is not a draft
5. ✅ PR is mergeable (GitHub merge status is "MERGEABLE")
6. ✅ PR merge state is "CLEAN" (no conflicts)

## Workflow Files

| File | Purpose | Triggers |
|------|---------|----------|
| `ci.yml` | Core CI/CD checks | Push to main/develop, PRs to main |
| `pr-checks.yml` | PR validation | PR opened/synchronized/reopened |
| `claude-code-review.yml` | AI code review | PR opened/synchronized/reopened |
| `merge-decision.yml` | AI merge decision | PR opened/synchronized/reopened, manual |
| `auto-merge.yml` | Automatic merging | Merge Decision workflow completion |
| `release-please.yml` | Release automation | Push to main |
| `release-please-post.yml` | Package lock updates | Release Please PRs |
| `release.yml` | NPM publishing | Version tags (v*) |

## Security & Permissions

Each workflow has minimal required permissions:

- **Read**: `contents: read`, `actions: read`, `issues: read`
- **Write**: `pull-requests: write` (for comments), `contents: write` (for releases)
- **Special**: `id-token: write` (for Claude AI integration)

## Error Handling

### Auto-Merge Failures
- Falls back to manual merge requirement
- Comments on PR with failure details
- Preserves merge decision for manual review

### Missing Checks
- Dynamically adapts to available checks
- Falls back to waiting for any running checks
- Provides clear logging of check status

### Release Failures
- Release pipeline isolated from merge pipeline
- Manual release workflow available as backup
- Package-lock updates happen automatically

## Testing the Pipeline

To test the complete pipeline:

1. Create a test PR with code changes
2. Verify all CI checks run and pass
3. Verify Claude review generates analysis
4. Verify merge decision makes appropriate recommendation
5. For auto-merge PRs, verify automatic merge occurs
6. For release PRs, verify package-lock updates

## Monitoring

Key indicators of pipeline health:

- ✅ All workflows complete successfully
- ✅ Claude reviews provide meaningful analysis
- ✅ Merge decisions align with review quality
- ✅ Auto-merge only occurs for appropriate PRs
- ✅ Release pipeline activates after merges

## Future Enhancements

Potential improvements to consider:

1. **Parallel Check Execution** - Run more checks in parallel
2. **Smart Check Selection** - Choose checks based on changed files
3. **Progressive Merge Confidence** - Build confidence scores over time
4. **Enhanced Conflict Resolution** - More sophisticated merge conflict handling
5. **Release Notes Enhancement** - Better automated release notes generation