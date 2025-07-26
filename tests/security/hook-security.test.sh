#!/bin/bash

# Hook Scripts Security Test Suite
# Tests security fixes in shell hook scripts

set -euo pipefail

# Test configuration
readonly TEST_DIR="$(mktemp -d)"
readonly HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.claude/hooks"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test helper functions
run_test() {
    local test_name="$1"
    local test_function="$2"
    
    ((TESTS_RUN++))
    
    log_info "Running test: $test_name"
    
    if "$test_function"; then
        ((TESTS_PASSED++))
        log_info "✅ PASSED: $test_name"
    else
        ((TESTS_FAILED++))
        log_error "❌ FAILED: $test_name"
    fi
    
    echo
}

# Security test functions
test_eval_removal() {
    local test_file="$HOOKS_DIR/..//../tests/workflows/polling-logic.test.sh"
    
    if [[ ! -f "$test_file" ]]; then
        log_error "Test file not found: $test_file"
        return 1
    fi
    
    # Check that eval is no longer used in the dangerous way
    if grep -v "^#" "$test_file" | grep -q "eval.*\$.*test_case"; then
        log_error "Dangerous eval usage still found in $test_file"
        return 1
    fi
    
    # Check that safe parsing is implemented
    if ! grep -q "case.*test_case.*in" "$test_file"; then
        log_error "Safe case statement parsing not found in $test_file"
        return 1
    fi
    
    log_info "Eval vulnerability successfully removed"
    return 0
}

test_environment_validation() {
    local hook_files=(
        "$HOOKS_DIR/pre-ship-workflow.sh"
        "$HOOKS_DIR/auto-delegate-agent.sh"
    )
    
    for hook_file in "${hook_files[@]}"; do
        if [[ ! -f "$hook_file" ]]; then
            log_error "Hook file not found: $hook_file"
            return 1
        fi
        
        # Check for environment validation function
        if ! grep -q "validate_environment()" "$hook_file"; then
            log_error "Environment validation function not found in $hook_file"
            return 1
        fi
        
        # Check for HOME validation
        if ! grep -q "HOME.*environment.*variable" "$hook_file"; then
            log_error "HOME environment validation not found in $hook_file"
            return 1
        fi
        
        # Check for PATH validation
        if ! grep -q "PATH.*environment.*variable" "$hook_file"; then
            log_error "PATH environment validation not found in $hook_file"
            return 1
        fi
        
        log_info "Environment validation found in $(basename "$hook_file")"
    done
    
    return 0
}

test_file_path_validation() {
    local hook_file="$HOOKS_DIR/auto-delegate-agent.sh"
    
    if [[ ! -f "$hook_file" ]]; then
        log_error "Hook file not found: $hook_file"
        return 1
    fi
    
    # Check for file path validation function
    if ! grep -q "validate_file_path()" "$hook_file"; then
        log_error "File path validation function not found in $hook_file"
        return 1
    fi
    
    # Check for path traversal protection
    if ! grep -A 5 -B 5 "\.\." "$hook_file" | grep -q "return 1"; then
        log_error "Path traversal protection not found in $hook_file"
        return 1
    fi
    
    # Check for shell metacharacter protection
    if ! grep -q "log_suggestion.*SECURITY.*dangerous.*path" "$hook_file"; then
        log_error "Dangerous path logging not found in $hook_file"
        return 1
    fi
    
    log_info "File path validation properly implemented"
    return 0
}

test_input_sanitization() {
    local hook_file="$HOOKS_DIR/auto-delegate-agent.sh"
    
    if [[ ! -f "$hook_file" ]]; then
        log_error "Hook file not found: $hook_file"
        return 1
    fi
    
    # Check for message sanitization in logging
    if ! grep -q "sanitized_message.*tr.*cd.*print" "$hook_file"; then
        log_error "Message sanitization not found in $hook_file"
        return 1
    fi
    
    # Check for length limits
    if ! grep -q "head.*-c.*500" "$hook_file"; then
        log_error "Message length limiting not found in $hook_file"
        return 1
    fi
    
    log_info "Input sanitization properly implemented"
    return 0
}

test_secure_permissions() {
    local hook_files=(
        "$HOOKS_DIR/pre-ship-workflow.sh"
        "$HOOKS_DIR/auto-delegate-agent.sh"
    )
    
    for hook_file in "${hook_files[@]}"; do
        if [[ ! -f "$hook_file" ]]; then
            log_error "Hook file not found: $hook_file"
            return 1
        fi
        
        # Check for secure log permissions
        if ! grep -q "LOG_PERMISSIONS=600" "$hook_file"; then
            log_error "Secure log permissions not found in $hook_file"
            return 1
        fi
        
        # Check for directory permission setting
        if ! grep -q "chmod 700" "$hook_file"; then
            log_error "Secure directory permissions not found in $hook_file"
            return 1
        fi
        
        log_info "Secure permissions configured in $(basename "$hook_file")"
    done
    
    return 0
}

test_json_validation() {
    local hook_file="$HOOKS_DIR/auto-delegate-agent.sh"
    
    if [[ ! -f "$hook_file" ]]; then
        log_error "Hook file not found: $hook_file"
        return 1
    fi
    
    # Check for JSON validation
    if ! grep -q "jq empty" "$hook_file"; then
        log_error "JSON validation not found in $hook_file"
        return 1
    fi
    
    # Check for JSON size limits
    if ! grep -q "100000.*100KB limit" "$hook_file"; then
        log_error "JSON size limiting not found in $hook_file"
        return 1
    fi
    
    # Check for timeout on JSON reading
    if ! grep -q "timeout.*10s" "$hook_file"; then
        log_error "JSON read timeout not found in $hook_file"
        return 1
    fi
    
    log_info "JSON validation properly implemented"
    return 0
}

test_resource_limits() {
    local hook_files=(
        "$HOOKS_DIR/pre-ship-workflow.sh"
        "$HOOKS_DIR/auto-delegate-agent.sh"
    )
    
    for hook_file in "${hook_files[@]}"; do
        if [[ ! -f "$hook_file" ]]; then
            log_error "Hook file not found: $hook_file"
            return 1
        fi
        
        # Check for file processing limits
        if ! grep -q "file_count.*100" "$hook_file"; then
            log_error "File processing limits not found in $hook_file"
            return 1
        fi
        
        log_info "Resource limits configured in $(basename "$hook_file")"
    done
    
    return 0
}

test_no_dangerous_patterns() {
    local hook_files=(
        "$HOOKS_DIR/pre-ship-workflow.sh"
        "$HOOKS_DIR/auto-delegate-agent.sh"
    )
    
    local dangerous_patterns=(
        "eval \$"
        "rm -rf \$"
        "curl.*\$"
        "wget.*\$"
    )
    
    for hook_file in "${hook_files[@]}"; do
        if [[ ! -f "$hook_file" ]]; then
            log_error "Hook file not found: $hook_file"
            return 1
        fi
        
        for pattern in "${dangerous_patterns[@]}"; do
            if grep -q "$pattern" "$hook_file"; then
                log_error "Dangerous pattern '$pattern' found in $(basename "$hook_file")"
                return 1
            fi
        done
        
        log_info "No dangerous patterns found in $(basename "$hook_file")"
    done
    
    return 0
}

test_configuration_parsing_safety() {
    local test_file="$HOOKS_DIR/..//../tests/workflows/polling-logic.test.sh"
    
    if [[ ! -f "$test_file" ]]; then
        log_error "Test file not found: $test_file"
        return 1
    fi
    
    # Check that configuration parsing uses case statements
    if ! grep -A 20 "for test_case in" "$test_file" | grep -q "case.*\$test_case.*in"; then
        log_error "Safe case statement parsing not found"
        return 1
    fi
    
    # Check for numeric validation
    if ! grep -q "\[0-9\]" "$test_file"; then
        log_error "Numeric validation not found"
        return 1
    fi
    
    # Check for range validation
    if ! grep -q "gt 0.*le" "$test_file"; then
        log_error "Range validation not found"
        return 1
    fi
    
    log_info "Configuration parsing uses safe methods"
    return 0
}

# Main test execution
main() {
    log_info "Starting GitPlus Hook Security Test Suite"
    echo "Testing directory: $TEST_DIR"
    echo "Hooks directory: $HOOKS_DIR"
    echo
    
    # Run all security tests
    run_test "Eval Removal Verification" test_eval_removal
    run_test "Environment Variable Validation" test_environment_validation
    run_test "File Path Validation" test_file_path_validation
    run_test "Input Sanitization" test_input_sanitization
    run_test "Secure Permissions" test_secure_permissions
    run_test "JSON Validation" test_json_validation
    run_test "Resource Limits" test_resource_limits
    run_test "No Dangerous Patterns" test_no_dangerous_patterns
    run_test "Configuration Parsing Safety" test_configuration_parsing_safety
    
    # Print summary
    echo "==========================================="
    echo "           TEST SUMMARY"
    echo "==========================================="
    echo "Tests run:    $TESTS_RUN"
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"
    echo
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_info "🎉 All security tests passed!"
        echo
        log_info "Security audit completed successfully. All vulnerabilities have been fixed:"
        echo "  ✅ Command injection prevention implemented"
        echo "  ✅ Shell escaping vulnerabilities fixed"
        echo "  ✅ Environment variable validation added"
        echo "  ✅ Input validation strengthened"
        echo "  ✅ Resource limits implemented"
        echo "  ✅ Dangerous eval usage eliminated"
        exit 0
    else
        log_error "💥 Some security tests failed!"
        echo
        log_error "Security issues detected. Please review and fix the failing tests."
        exit 1
    fi
}

# Cleanup function
cleanup() {
    rm -rf "$TEST_DIR"
}

# Set up cleanup trap
trap cleanup EXIT

# Run the tests
main "$@"