#!/bin/bash

# Generate TODO list for rejected PRs
# Usage: ./generate-todo-list.sh "$REASON" "$CRITICAL_ISSUES"

set -e

REASON="$1"
CRITICAL_ISSUES="$2"
TODO_FILE="/tmp/todo-items.md"

# Clear previous TODO items
> "$TODO_FILE"

echo "📝 Generating TODO list based on rejection reason and critical issues..."

# Function to add TODO item if not already present
add_todo_item() {
    local item="$1"
    if ! grep -Fq "$item" "$TODO_FILE" 2>/dev/null; then
        echo "$item" >> "$TODO_FILE"
    fi
}

# Parse critical issues into individual TODO items
if [ -n "$CRITICAL_ISSUES" ] && [ "$CRITICAL_ISSUES" != "[]" ] && [ "$CRITICAL_ISSUES" != "null" ]; then
    echo "🔍 Processing critical issues..."
    echo "$CRITICAL_ISSUES" | jq -r '.[]?' 2>/dev/null | while read -r issue; do
        if [ -n "$issue" ] && [ "$issue" != "null" ]; then
            add_todo_item "- [ ] **Critical Issue**: $issue"
        fi
    done
fi

# Add specific TODO items based on rejection reason keywords
echo "🔍 Analyzing rejection reason: $REASON"

# Test-related issues
if echo "$REASON" | grep -qi "test\|spec\|coverage"; then
    add_todo_item "- [ ] **Tests**: Fix failing tests and ensure all test suites pass"
    add_todo_item "- [ ] **Test Coverage**: Add missing test cases for new functionality"
fi

# Security-related issues
if echo "$REASON" | grep -qi "security\|vulnerability\|cve"; then
    add_todo_item "- [ ] **Security**: Address security vulnerabilities identified in scans"
    add_todo_item "- [ ] **Dependencies**: Update vulnerable dependencies to secure versions"
fi

# Code review issues
if echo "$REASON" | grep -qi "code.*review\|review.*request\|claude.*review"; then
    add_todo_item "- [ ] **Code Review**: Address feedback from Claude's code review"
    add_todo_item "- [ ] **Code Quality**: Improve code quality according to review recommendations"
fi

# CI/Build issues
if echo "$REASON" | grep -qi "build\|compile\|ci\|check"; then
    add_todo_item "- [ ] **Build**: Fix build errors and compilation issues"
    add_todo_item "- [ ] **CI Checks**: Ensure all CI/CD pipeline checks pass successfully"
fi

# Linting/formatting issues
if echo "$REASON" | grep -qi "lint\|format\|style"; then
    add_todo_item "- [ ] **Code Style**: Fix linting errors and formatting issues"
    add_todo_item "- [ ] **Standards**: Ensure code follows project style guidelines"
fi

# Documentation issues
if echo "$REASON" | grep -qi "documentation\|docs\|readme"; then
    add_todo_item "- [ ] **Documentation**: Update documentation for code changes"
    add_todo_item "- [ ] **README**: Update README if new features were added"
fi

# Performance issues
if echo "$REASON" | grep -qi "performance\|optimization\|slow"; then
    add_todo_item "- [ ] **Performance**: Address performance concerns identified in review"
    add_todo_item "- [ ] **Optimization**: Implement suggested optimizations"
fi

# Always add general improvement items
add_todo_item "- [ ] **CI Checks**: Ensure all CI/CD checks pass successfully"
add_todo_item "- [ ] **Self Review**: Perform thorough self-review of all changes"
add_todo_item "- [ ] **Testing**: Verify changes work as expected in your development environment"

# If no specific items were added, add a general item
if [ ! -s "$TODO_FILE" ]; then
    add_todo_item "- [ ] **General**: Address the issues mentioned in the rejection reason"
    add_todo_item "- [ ] **Review**: Carefully review the feedback provided above"
fi

echo "✅ Generated $(wc -l < "$TODO_FILE") TODO items"
cat "$TODO_FILE"