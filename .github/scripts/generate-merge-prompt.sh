#!/bin/bash

# Generate merge decision prompt with PR context
# Usage: ./generate-merge-prompt.sh

cat << 'EOF'
You are an AI merge decision maker for the GitPlus repository.

## PR Context:
EOF

# Use printf to safely output PR context variables
printf -- "- **Title**: %s\n" "${PR_TITLE}"
printf -- "- **Author**: %s\n" "${PR_AUTHOR}"
printf -- "- **Target Branch**: %s\n" "${BASE_BRANCH}"
printf -- "- **PR Number**: #%s\n" "${PR_NUMBER}"
printf -- "- **Is Draft**: %s\n" "${PR_IS_DRAFT}"
printf -- "- **Is Release Please PR**: %s\n" "${IS_RELEASE_PLEASE}"
printf -- "- **Mergeable**: %s\n" "${PR_MERGEABLE}"
printf -- "- **Merge State**: %s\n" "${PR_MERGE_STATE}"

cat << 'EOF'

## CI Status Summary:
EOF

printf -- "- **Overall Summary**: %s\n" "${CHECKS_SUMMARY}"
printf -- "- **Tests**: %s\n" "${TEST_CONCLUSION}"
printf -- "- **Security**: %s\n" "${SECURITY_CONCLUSION}"
printf -- "- **Validation**: %s\n" "${VALIDATE_CONCLUSION}"
printf -- "- **Claude Review**: %s\n" "${CLAUDE_REVIEW_CONCLUSION}"
printf -- "- **Failed Checks**: %s\n" "${FAILED_CHECKS}"

cat << 'EOF'

## Workflow Analysis:
EOF

printf -- "%s\n" "${WORKFLOW_FAILURE_ANALYSIS}"

cat << 'EOF'

## Claude Code Review Analysis:
EOF

# Safely output Claude review content to prevent command injection
printf -- "%s\n" "${CLAUDE_REVIEW_CONTENT}"

cat << 'EOF'

---

**Decision Options**: APPROVE, MANUAL_APPROVAL, REJECT

**APPROVE**: All tests pass, no security issues, Claude review positive/minor concerns
**MANUAL_APPROVAL**: Tests pass but significant issues requiring human review  
**REJECT**: Failed tests, security vulnerabilities, or major concerns

**CRITICAL - Respond with valid JSON:**
```json
{
  "decision": "APPROVE|MANUAL_APPROVAL|REJECT",
  "reason": "Brief explanation based on analysis above",
  "critical_issues": ["list", "any", "blocking", "issues"],
  "recommended_action": "auto-merge|manual-review|fix-issues"
}
```

**IMPORTANT**: Write your JSON decision to this file:
```bash
echo 'YOUR_JSON_HERE' > /tmp/merge-decision-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/merge-decision.json
```
EOF