# Branch Protection Setup for AI Merge Decider

This document explains how to configure GitHub branch protection rules to work with the AI Merge Decider system.

## Overview

The AI Merge Decider acts as the single gatekeeper for merging PRs. It waits for all CI checks to complete, analyzes the Claude Code review findings, and makes the final merge decision. Branch protection should be configured to **only require the merge decider check**.

## Required Branch Protection Configuration

### Main Branch Protection

Navigate to: `Settings > Branches > Add rule` (or edit existing rule for `main`)

#### Required Settings:

1. **Branch name pattern**: `main`

2. **Protect matching branches**: ✅ Enabled
   - [x] Restrict pushes that create files larger than 100MB
   - [x] Restrict force pushes  
   - [x] Restrict deletions

3. **Require a pull request before merging**: ✅ Enabled
   - [x] Dismiss stale PR approvals when new commits are pushed
   - [x] Require review from CODEOWNERS
   - **Required number of reviewers**: `1` (minimum)

4. **Require status checks to pass before merging**: ✅ Enabled
   - [x] Require branches to be up to date before merging
   - **Required status checks**: ⚠️ **ONLY** add:
     - `merge-decision-summary` (from the AI Merge Decider workflow)
   
   **Important**: Do NOT add individual CI checks like:
   - ❌ `test` 
   - ❌ `security`
   - ❌ `validate-pr`
   - ❌ `claude-review`
   
   The merge decider will wait for all these checks internally.

5. **Require conversation resolution before merging**: ✅ Enabled

6. **Include administrators**: ✅ Enabled (recommended for consistency)

### Develop Branch Protection (Optional)

If using GitFlow with a develop branch:

1. **Branch name pattern**: `develop`
2. **Require status checks**: Only `merge-decision-summary`
3. **Required reviewers**: `1` (can be lower than main)
4. **Other settings**: Same as main but potentially less strict

### Release Branch Protection

For `release/*` branches:

1. **Branch name pattern**: `release/*`
2. **Require status checks**: Only `merge-decision-summary`
3. **Restrict pushes**: Only allow specific users/teams
4. **Require reviews**: From release managers

## Verification Steps

After configuring branch protection:

1. **Create a test PR** to main branch
2. **Verify the following sequence**:
   - CI checks run automatically (test, security, pr-checks, claude-review)
   - AI Merge Decider waits for all CI to complete
   - AI Merge Decider analyzes results and posts decision
   - Only "merge-decision-summary" appears in the branch protection status
   - PR can only be merged if merge-decision-summary passes

3. **Test failure scenarios**:
   - PR with failing tests → Merge decider should FAIL
   - PR with Claude Code concerns → Merge decider should FAIL  
   - PR with security issues → Merge decider should FAIL

## Troubleshooting

### "merge-decision-summary" check not appearing
- Ensure the merge-decider.yml workflow is in `.github/workflows/`
- Check that the workflow runs on PR events for your target branch
- Verify the `merge-decision-summary` job name matches exactly

### CI checks running but merge decider not triggering
- Check the `await-ci-completion` job configuration
- Verify check names in the `wait-for-check` actions match your CI job names
- Review workflow permissions in merge-decider.yml

### Merge decider failing despite passing CI
- Check Claude Code review findings in the PR comments
- Review the AI decision analysis for specific issues
- Ensure all required context files are being generated

### False positives/negatives
- Review the AI prompt in merge-decider.yml
- Adjust Claude Code review weighting if needed
- Consider branch-specific thresholds

## Migration from Existing Setup

If you currently have individual CI checks as required status checks:

1. **Document current required checks**:
   ```bash
   gh api repos/OWNER/REPO/branches/main/protection --jq '.required_status_checks.contexts[]'
   ```

2. **Update branch protection** to only require `merge-decision-summary`

3. **Test thoroughly** with a few PRs before announcing the change

4. **Monitor for issues** and be prepared to rollback if needed

## Security Considerations

- The merge decider has access to PR content and CI results
- Ensure `CLAUDE_CODE_OAUTH_TOKEN` is properly secured
- Review the AI decision logic periodically
- Consider audit logging for merge decisions

## Customization Options

### Adjust AI Decision Criteria
Edit the `direct_prompt` in `.github/workflows/merge-decider.yml` to:
- Change branch-specific rules
- Modify Claude Code review weighting
- Add/remove evaluation criteria

### Add Custom Context
Modify `.github/scripts/collect-context.js` to:
- Gather additional project-specific information
- Add custom security checks
- Include external tool results

### Notification Integration
Add steps to the merge decider workflow to:
- Send Slack notifications on decisions
- Update project management tools
- Trigger custom webhooks

## Best Practices

1. **Start with develop branch** to test the system before enabling on main
2. **Monitor AI decisions** closely for the first few weeks
3. **Gather team feedback** and adjust prompts as needed
4. **Document any customizations** for team knowledge sharing
5. **Regular review** of merge decision quality and accuracy
6. **Backup plan** - keep the ability to bypass for emergencies

## Support

For issues with this setup:
1. Check GitHub Actions logs for the merge-decider workflow
2. Review PR comments for AI decision reasoning
3. Consult the troubleshooting section above
4. Open an issue with workflow logs and PR examples