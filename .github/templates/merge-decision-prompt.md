# GitPlus Merge Decision Analysis

Please analyze this pull request and make a merge decision based on the comprehensive information provided below.

## Your Decision Options:
- **APPROVE**: Merge immediately (auto-merge for Release Please PRs)
- **MANUAL_APPROVAL**: Require manual review but allow eventual merge
- **REJECT**: Block merge due to critical issues

## PR Context:
- **Title**: {{ PR_TITLE }}
- **Author**: {{ PR_AUTHOR }}
- **Target Branch**: {{ BASE_BRANCH }}
- **PR Number**: #{{ PR_NUMBER }}
- **Is Draft**: {{ PR_IS_DRAFT }}
- **Is Release Please PR**: {{ IS_RELEASE_PLEASE }}
- **Mergeable**: {{ PR_MERGEABLE }}
- **Merge State**: {{ PR_MERGE_STATE }}

## CI Status Summary:
- **Overall Summary**: {{ CHECKS_SUMMARY }}
- **Tests**: {{ TEST_CONCLUSION }}
- **Security**: {{ SECURITY_CONCLUSION }}
- **Validation**: {{ VALIDATE_CONCLUSION }}
- **Claude Review**: {{ CLAUDE_REVIEW_CONCLUSION }}
- **Failed Checks**: {{ FAILED_CHECKS }}

## Workflow Analysis:
{{ WORKFLOW_FAILURE_ANALYSIS }}

## Claude Code Review Analysis:
{{ CLAUDE_REVIEW_CONTENT }}

---

## Analysis Instructions:

**For Release Please PRs:**
- APPROVE if all CI checks pass and security scans are clean
- Focus on automated validation rather than code review depth
- Consider file changes are limited to release-related updates

**For Regular PRs:**
- Analyze the Claude code review findings carefully
- Consider CI test results and security scan outcomes
- Evaluate if changes align with project standards
- Factor in the PR complexity and risk level

**Decision Criteria:**
1. **APPROVE**: All tests pass, no security issues, Claude review is positive or minor concerns only
2. **MANUAL_APPROVAL**: Tests pass but Claude found significant issues requiring human review
3. **REJECT**: Failed tests, security vulnerabilities, or major architectural concerns

**Output Format:**
Provide your decision as a JSON object:
```json
{
  "decision": "APPROVE|MANUAL_APPROVAL|REJECT",
  "reason": "Brief explanation of your decision",
  "critical_issues": ["List any critical issues found"],
  "recommended_action": "auto-merge|manual-review|fix-issues"
}
```

Be thorough but concise. Focus on actionable insights that help maintainers understand the merge decision rationale.