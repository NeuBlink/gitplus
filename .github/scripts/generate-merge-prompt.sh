#!/bin/bash

# Generate merge decision prompt with PR context
# Usage: ./generate-merge-prompt.sh

cat << 'EOF'
You are an AI merge decision maker for the GitPlus repository.

## PR Context:
EOF

cat << EOF
- **Title**: ${PR_TITLE}
- **Author**: ${PR_AUTHOR}
- **Target Branch**: ${BASE_BRANCH}
- **PR Number**: #${PR_NUMBER}
- **Is Draft**: ${PR_IS_DRAFT}
- **Is Release Please PR**: ${IS_RELEASE_PLEASE}
- **Mergeable**: ${PR_MERGEABLE}
- **Merge State**: ${PR_MERGE_STATE}

## CI Status Summary:
- **Overall Summary**: ${CHECKS_SUMMARY}
- **Tests**: ${TEST_CONCLUSION}
- **Security**: ${SECURITY_CONCLUSION}
- **Validation**: ${VALIDATE_CONCLUSION}
- **Claude Review**: ${CLAUDE_REVIEW_CONCLUSION}
- **Failed Checks**: ${FAILED_CHECKS}

## Workflow Analysis:
${WORKFLOW_FAILURE_ANALYSIS}

## Claude Code Review Analysis:
${CLAUDE_REVIEW_CONTENT}
EOF

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