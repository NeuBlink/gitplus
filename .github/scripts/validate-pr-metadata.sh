#!/bin/bash

# Common validation functions for PR metadata
# This script provides reusable validation logic to prevent code duplication across workflows

set -e

# Validate PR title for security and reasonable constraints
validate_pr_title() {
    local title="$1"
    
    if [ -z "$title" ]; then
        echo "❌ ERROR: PR title cannot be empty"
        return 1
    fi
    
    # PR titles should be reasonable length and not contain dangerous characters
    if [ ${#title} -gt 200 ]; then
        echo "❌ ERROR: PR title is too long (${#title} chars, max 200)"
        return 1
    fi
    
    if [[ "$title" =~ [\$\`\;] ]]; then
        echo "❌ ERROR: PR title contains potentially dangerous characters (\$, \`, or ;)"
        return 1
    fi
    
    return 0
}

# Validate GitHub username format
validate_github_username() {
    local username="$1"
    local allow_apps="${2:-false}"
    
    if [ -z "$username" ]; then
        echo "❌ ERROR: Username cannot be empty"
        return 1
    fi
    
    # Special case for GitHub Apps
    if [ "$allow_apps" = "true" ] && [ "$username" = "app/github-actions" ]; then
        return 0
    fi
    
    # GitHub username format: alphanumeric, may contain hyphens, cannot start/end with hyphen, max 39 chars
    if ! [[ "$username" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$ ]]; then
        echo "❌ ERROR: Username '$username' does not match GitHub username format"
        return 1
    fi
    
    return 0
}

# Validate branch name for security and reasonable constraints
validate_branch_name() {
    local branch="$1"
    local max_length="${2:-100}"
    
    if [ -z "$branch" ]; then
        echo "❌ ERROR: Branch name cannot be empty"
        return 1
    fi
    
    # Branch names should be reasonable length and not contain shell metacharacters
    if [ ${#branch} -gt "$max_length" ]; then
        echo "❌ ERROR: Branch name is too long (${#branch} chars, max $max_length)"
        return 1
    fi
    
    if [[ "$branch" =~ [\$\`\;] ]]; then
        echo "❌ ERROR: Branch name contains potentially dangerous characters (\$, \`, or ;)"
        return 1
    fi
    
    return 0
}

# Validate PR number format
validate_pr_number() {
    local pr_number="$1"
    
    if [ -z "$pr_number" ]; then
        echo "❌ ERROR: PR number cannot be empty"
        return 1
    fi
    
    if ! [[ "$pr_number" =~ ^[0-9]+$ ]] || [ "$pr_number" -lt 1 ] || [ "$pr_number" -gt 99999 ]; then
        echo "❌ ERROR: Invalid PR number format: $pr_number"
        return 1
    fi
    
    return 0
}

# Validate repository name format  
validate_repository_name() {
    local repo="$1"
    
    if [ -z "$repo" ]; then
        echo "❌ ERROR: Repository name cannot be empty"
        return 1
    fi
    
    # Repository format: owner/repo with reasonable character restrictions
    if ! [[ "$repo" =~ ^[a-zA-Z0-9._-]{1,100}/[a-zA-Z0-9._-]{1,100}$ ]]; then
        echo "❌ ERROR: Invalid repository format: $repo"
        return 1
    fi
    
    return 0
}

# Validate SHA format
validate_sha() {
    local sha="$1"
    
    if [ -z "$sha" ]; then
        echo "❌ ERROR: SHA cannot be empty"
        return 1
    fi
    
    if ! [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || [ ${#sha} -ne 40 ]; then
        echo "❌ ERROR: Invalid SHA format: $sha"
        return 1
    fi
    
    return 0
}

# Comprehensive PR metadata validation function
validate_pr_metadata() {
    local title="$1"
    local author="$2"
    local head_branch="$3"
    local base_branch="$4"
    local allow_apps="${5:-false}"
    
    echo "🔍 Validating PR metadata..."
    
    validate_pr_title "$title" || return 1
    validate_github_username "$author" "$allow_apps" || return 1
    validate_branch_name "$head_branch" || return 1
    validate_branch_name "$base_branch" || return 1
    
    echo "✅ PR metadata validation passed"
    return 0
}

# Safe printf wrapper for user-controlled content
safe_print() {
    local label="$1"
    local value="$2"
    
    printf "%s: %s\n" "$label" "$value"
}

# Example usage (can be called from workflows)
if [ "$1" = "test" ]; then
    echo "🧪 Testing validation functions..."
    
    # Test valid cases
    validate_pr_metadata "feat: add new feature" "valid-user123" "feature/new-feature" "main" "false"
    
    # Test with GitHub App
    validate_pr_metadata "chore: release 1.0.0" "app/github-actions" "release-please--main--1.0.0" "main" "true"
    
    echo "✅ All validation tests passed"
fi