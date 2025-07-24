# AI Merge Decision Analysis Template

This template provides a structured framework for the AI merge decider to evaluate pull requests consistently.

## Evaluation Framework

### Branch-Specific Criteria

#### Main Branch (Production)
- **Quality Threshold**: 85/100 minimum
- **Requirements**:
  - All CI checks must pass
  - Security audits clean
  - Breaking changes properly documented
  - Comprehensive test coverage
  - Code review approved
  - Documentation updated

#### Develop Branch (Integration)
- **Quality Threshold**: 80/100 minimum
- **Requirements**:
  - All tests pass
  - No critical security issues
  - Feature complete and functional
  - Basic documentation present

#### Release Branches
- **Quality Threshold**: 75/100 minimum
- **Requirements**:
  - Bug fixes and polish only
  - No new features
  - Regression testing passed
  - Release notes updated

### Scoring Matrix

#### 1. CI/CD Health (30 points)
- **Excellent (26-30)**: All checks pass, comprehensive coverage
- **Good (21-25)**: Most checks pass, minor issues
- **Fair (16-20)**: Some failures, but not critical
- **Poor (0-15)**: Critical failures, security issues

**Evaluation Criteria:**
- Test suite completion and results
- Security audit status
- Build success across platforms
- Code coverage metrics
- Performance benchmarks

#### 2. Code Quality (25 points)
- **Excellent (22-25)**: Clean, maintainable, follows conventions
- **Good (18-21)**: Good quality with minor issues
- **Fair (14-17)**: Acceptable but needs improvement
- **Poor (0-13)**: Poor quality, major issues

**Evaluation Criteria:**
- Code style consistency
- Error handling patterns
- Architecture adherence
- Performance considerations
- Maintainability factors

#### 3. Change Impact (20 points)
- **Excellent (18-20)**: Well-scoped, minimal risk
- **Good (15-17)**: Reasonable scope, manageable risk
- **Fair (12-14)**: Large but justified changes
- **Poor (0-11)**: Excessive scope, high risk

**Evaluation Criteria:**
- Change scope appropriateness
- Breaking change handling
- Dependency update safety
- Backward compatibility
- Risk assessment

#### 4. Documentation & Process (15 points)
- **Excellent (14-15)**: Complete docs and perfect process
- **Good (11-13)**: Good docs and process compliance
- **Fair (8-10)**: Basic requirements met
- **Poor (0-7)**: Missing docs or poor process

**Evaluation Criteria:**
- Commit message quality
- PR description completeness
- Code documentation
- CHANGELOG updates
- Process compliance

#### 5. Security & Stability (10 points)
- **Excellent (9-10)**: No security concerns, stable
- **Good (7-8)**: Minor concerns, mostly stable
- **Fair (5-6)**: Some concerns, needs attention
- **Poor (0-4)**: Security issues, unstable

**Evaluation Criteria:**
- Security vulnerability scan
- Secrets exposure check
- Dependency security
- Stability assessment
- Production readiness

## Decision Output Template

```markdown
## 🤖 AI Merge Decision: [PASS/FAIL]

**Target Branch:** {branch_name}
**Overall Score:** {score}/100
**Evaluation Date:** {timestamp}

### ✅ Strengths
- {positive_aspect_1}  
- {positive_aspect_2}
- {positive_aspect_3}

### ⚠️ Issues Found
- **{severity}**: {issue_description}
- **{severity}**: {issue_description}

### 🔧 Required Actions (if FAIL)
1. {specific_action_1}
2. {specific_action_2}
3. {specific_action_3}

### 📋 Detailed Analysis

**CI/CD Health ({ci_score}/30):** {ci_analysis}

**Code Quality ({quality_score}/25):** {quality_analysis}

**Change Impact ({impact_score}/20):** {impact_analysis}

**Documentation ({docs_score}/15):** {docs_analysis}

**Security ({security_score}/10):** {security_analysis}

### 💡 Recommendations
- {recommendation_1}
- {recommendation_2}
- {recommendation_3}

### 📊 Context Summary
- **Files Changed:** {files_changed}
- **Lines Added/Removed:** +{additions}/-{deletions}
- **Commits:** {commit_count}
- **Author:** {author} ({author_association})
- **CI Status:** {ci_status}

---
*Decision made by Claude AI • Target: {branch_name} • PR #{pr_number}*
```

## Special Considerations

### First-Time Contributors
- Provide more detailed explanations
- Be encouraging while maintaining standards
- Offer specific learning resources
- Consider lower scoring thresholds for educational PRs

### Emergency Hotfixes
- Fast-track evaluation for critical fixes
- Focus on security and stability
- Allow documentation to be updated post-merge
- Require immediate follow-up PR for any shortcuts

### Breaking Changes
- Require explicit justification
- Verify version bump appropriateness
- Check migration guide availability
- Ensure deprecation notices are in place

### Dependency Updates
- Analyze security implications
- Check for breaking changes in updates
- Verify compatibility with existing code
- Review changelog and release notes

## Context Analysis Guidelines

### File Change Patterns
- **Configuration files**: Higher scrutiny for CI/deployment configs
- **Core modules**: Require extensive testing and review
- **Test files**: Ensure coverage is maintained or improved
- **Documentation**: Verify accuracy and completeness

### Commit Message Analysis
- Conventional commit compliance
- Clear and descriptive messages
- Proper scope and type usage
- Breaking change indicators

### PR Description Quality
- Problem statement clarity
- Solution approach explanation
- Testing methodology
- Impact assessment

## Risk Assessment Framework

### Low Risk Changes
- Documentation updates
- Test additions
- Minor bug fixes
- Code style improvements

### Medium Risk Changes
- New features
- Refactoring existing code
- Dependency updates
- Configuration changes

### High Risk Changes
- Breaking API changes
- Major architectural changes
- Security-related modifications
- Database schema changes

## Integration Points

### CI System Integration
- Wait for all required checks
- Parse check results and logs
- Identify specific failure causes
- Suggest remediation steps

### Code Review Integration
- Consider human reviewer feedback
- Integrate with existing review comments
- Respect reviewer decisions
- Provide supplementary analysis

### Release Process Integration
- Different criteria for release branches
- Version bump validation
- Release note requirements
- Deployment readiness checks