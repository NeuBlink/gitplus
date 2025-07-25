# GitHub Workflows Configuration Guide

This document provides operational guidance for configuring and customizing the GitPlus GitHub Actions workflows.

## Claude Code Review Workflow Configuration

### Adaptive Polling Parameters

The Claude code review workflow uses adaptive polling for efficient review detection:

```yaml
# Environment variables you can set in workflow settings
env:
  MAX_ATTEMPTS: 20          # Maximum polling attempts (default: 20)
  MIN_REVIEW_LENGTH: 100    # Minimum characters for valid review (default: 100)
```

### Polling Intervals

The workflow uses adaptive intervals for optimal performance:

- **Attempts 1-5**: 3 seconds (quick detection for fast reviews)
- **Attempts 6-10**: 6 seconds (moderate wait)
- **Attempts 11-15**: 10 seconds (standard wait)
- **Attempts 16-20**: 15 seconds (final attempts)

**Total timeout**: ~175 seconds (just under 3 minutes)

### Configuration Examples

#### High-Traffic Repository (Faster Polling)
```yaml
env:
  MAX_ATTEMPTS: 30
  MIN_REVIEW_LENGTH: 50
```

#### Large Repository (More Patient Polling)
```yaml
env:
  MAX_ATTEMPTS: 15
  MIN_REVIEW_LENGTH: 200
```

## NPM Publishing Workflow Configuration

### Exponential Backoff for NPM Propagation

The publish workflow uses exponential backoff for NPM package availability checking:

```bash
# Backoff pattern: 10s → 20s → 40s → 60s → 60s (capped at 60s)
MAX_ATTEMPTS=6  # Total attempts
```

### Configuration Options

```yaml
# In publish.yml workflow
steps:
  - name: Wait for NPM propagation
    env:
      NPM_MAX_ATTEMPTS: 8     # Extend for slower NPM propagation
      NPM_INITIAL_WAIT: 5     # Start with shorter wait
```

## Merge Decision Workflow Configuration

### AI Decision Parameters

The merge decision workflow supports these configuration options:

```yaml
env:
  # Workflow timeout settings
  CHECK_TIMEOUT_MINUTES: 30    # Maximum wait for CI checks
  CHECK_POLL_INTERVAL: 30      # Seconds between status checks
  
  # Review validation
  MIN_FILE_SIZE: 1000          # Minimum Claude review file size
  ARTIFACT_RETENTION_DAYS: 7   # How long to keep review artifacts
```

### Auto-merge Criteria Configuration

The auto-merge logic can be configured per repository:

```yaml
# For Release Please PRs
release_please_auto_merge: true   # Auto-merge release PRs if CI passes

# For Regular PRs  
require_manual_approval: false   # Set to true for high-security repos
```

## Security Configuration Best Practices

### Permissions

All workflows use minimal required permissions:

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: read
  id-token: write    # Only for Claude authentication
  actions: read      # Only for CI result reading
```

### Secret Management

Required secrets for GitPlus workflows:

```yaml
# Required secrets
secrets:
  CLAUDE_CODE_OAUTH_TOKEN    # Claude AI integration
  GITHUB_TOKEN              # Automatic GitHub token
  NPM_TOKEN                 # NPM publishing (publish workflow only)
```

## Performance Optimization

### Resource Usage Guidelines

1. **Polling Optimization**
   - Use adaptive intervals for better resource efficiency
   - Set appropriate timeouts based on repository size
   - Monitor GitHub Actions minutes usage

2. **Artifact Management**
   - Clean up artifacts regularly (7-day retention default)
   - Use compression for large review files
   - Minimize artifact upload/download operations

3. **Workflow Parallelization**
   - CI checks run in parallel with Claude review
   - Separate jobs for independent operations
   - Conditional execution to skip unnecessary steps

### Cost Management

```yaml
# Optimize for GitHub Actions minutes
timeout-minutes: 10        # Set reasonable timeouts
if: github.event_name != 'schedule'  # Skip on scheduled runs if not needed
```

## Troubleshooting Common Configuration Issues

### Issue: Claude Review Not Detected
```yaml
# Increase polling attempts and reduce minimum length
env:
  MAX_ATTEMPTS: 30
  MIN_REVIEW_LENGTH: 50
```

### Issue: NPM Package Not Found After Publishing
```yaml
# Extend NPM propagation wait time
env:
  NPM_MAX_ATTEMPTS: 10
```

### Issue: Workflow Timeouts
```yaml
# Extend timeout for large repositories
timeout-minutes: 20
```

### Issue: Too Many False Rejections
```yaml
# Adjust AI decision sensitivity
env:
  WORKFLOW_FAILURE_THRESHOLD: "high"  # Only reject on critical failures
```

## Monitoring and Observability

### Workflow Health Metrics

Monitor these key indicators:

1. **Claude Review Success Rate**: % of reviews successfully captured
2. **Auto-merge Success Rate**: % of eligible PRs that auto-merge successfully
3. **False Rejection Rate**: PRs rejected but later manually approved
4. **Average Review Time**: Time from PR creation to merge decision

### Alerting Configuration

Set up alerts for:

```yaml
# Workflow failure rates
- claude_review_failure_rate > 10%
- auto_merge_failure_rate > 5%
- workflow_timeout_rate > 15%

# Performance metrics
- average_review_time > 300s
- npm_propagation_failures > 2/day
```

## Environment-Specific Configuration

### Development Environment
```yaml
env:
  MAX_ATTEMPTS: 10           # Faster feedback
  MIN_REVIEW_LENGTH: 50      # Accept shorter reviews
  AUTO_MERGE_ENABLED: false  # Require manual approval
```

### Production Environment
```yaml
env:
  MAX_ATTEMPTS: 20           # More thorough checking
  MIN_REVIEW_LENGTH: 200     # Require detailed reviews
  AUTO_MERGE_ENABLED: true   # Enable for Release Please
```

## Advanced Configuration

### Custom Decision Logic

You can customize the merge decision logic by modifying the prompt templates:

```bash
# Edit the prompt generation script
.github/scripts/generate-merge-prompt.sh
```

### Integration with External Tools

```yaml
# Add custom validation steps
- name: Custom Quality Gate
  run: |
    # Your custom validation logic
    ./scripts/quality-check.sh
```

This configuration guide ensures optimal performance and reliability of your GitPlus workflows while maintaining security and efficiency.