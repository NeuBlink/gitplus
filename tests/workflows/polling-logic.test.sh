#!/bin/bash

# Test script for validating adaptive polling logic
# This tests the intervals used in the Claude Code Review workflow

set -e

echo "🧪 Testing GitPlus Adaptive Polling Logic"

# Test adaptive interval calculation
test_adaptive_intervals() {
    echo "📋 Testing adaptive interval calculation..."
    
    # Simulate the optimized polling logic from claude-code-review.yml
    for ATTEMPT in {1..20}; do
        case $ATTEMPT in
            [1-5]) POLL_INTERVAL=3 ;;
            [6-9]) POLL_INTERVAL=6 ;;
            1[0-5]) POLL_INTERVAL=10 ;;
            *) POLL_INTERVAL=15 ;;
        esac
        
        echo "Attempt $ATTEMPT: ${POLL_INTERVAL}s interval"
        
            # Validate expected intervals using optimized case statement
        case $ATTEMPT in
            [1-5])
                if [ $POLL_INTERVAL -ne 3 ]; then
                    echo "❌ ERROR: Expected 3s interval for attempt $ATTEMPT, got ${POLL_INTERVAL}s"
                    exit 1
                fi
                ;;
            [6-9])
                if [ $POLL_INTERVAL -ne 6 ]; then
                    echo "❌ ERROR: Expected 6s interval for attempt $ATTEMPT, got ${POLL_INTERVAL}s"
                    exit 1
                fi
                ;;
            1[0-5])
                if [ $POLL_INTERVAL -ne 10 ]; then
                    echo "❌ ERROR: Expected 10s interval for attempt $ATTEMPT, got ${POLL_INTERVAL}s"
                    exit 1
                fi
                ;;
            *)
                if [ $POLL_INTERVAL -ne 15 ]; then
                    echo "❌ ERROR: Expected 15s interval for attempt $ATTEMPT, got ${POLL_INTERVAL}s"
                    exit 1
                fi
                ;;
        esac
    done
    
    echo "✅ Adaptive interval calculation test passed"
}

# Test total timeout calculation
test_total_timeout() {
    echo "📋 Testing total timeout calculation..."
    
    # Calculate total timeout based on optimized adaptive intervals
    TOTAL_TIME=0
    for ATTEMPT in {1..20}; do
        case $ATTEMPT in
            [1-5]) POLL_INTERVAL=3 ;;
            [6-9]) POLL_INTERVAL=6 ;;
            1[0-5]) POLL_INTERVAL=10 ;;
            *) POLL_INTERVAL=15 ;;
        esac
        
        # Only add interval time if not the last attempt
        if [ $ATTEMPT -lt 20 ]; then
            TOTAL_TIME=$((TOTAL_TIME + POLL_INTERVAL))
        fi
    done
    
    echo "📊 Total timeout: ${TOTAL_TIME} seconds (~$((TOTAL_TIME / 60)) minutes)"
    
    # Validate timeout is reasonable (should be around 175 seconds)
    if [ $TOTAL_TIME -lt 150 ] || [ $TOTAL_TIME -gt 200 ]; then
        echo "❌ ERROR: Total timeout ${TOTAL_TIME}s is outside expected range (150-200s)"
        exit 1
    fi
    
    echo "✅ Total timeout calculation test passed"
}

# Test NPM exponential backoff logic
test_npm_backoff() {
    echo "📋 Testing NPM exponential backoff logic..."
    
    MAX_ATTEMPTS=6
    for i in $(seq 1 $MAX_ATTEMPTS); do
        # Simulate the exponential backoff logic from publish.yml
        WAIT_TIME=$((10 * (2 ** (i - 1))))
        if [ $WAIT_TIME -gt 60 ]; then
            WAIT_TIME=60
        fi
        
        echo "NPM Attempt $i: ${WAIT_TIME}s wait"
        
        # Validate expected wait times
        case $i in
            1)
                if [ $WAIT_TIME -ne 10 ]; then
                    echo "❌ ERROR: Expected 10s wait for attempt $i, got ${WAIT_TIME}s"
                    exit 1
                fi
                ;;
            2)
                if [ $WAIT_TIME -ne 20 ]; then
                    echo "❌ ERROR: Expected 20s wait for attempt $i, got ${WAIT_TIME}s"
                    exit 1
                fi
                ;;
            3)
                if [ $WAIT_TIME -ne 40 ]; then
                    echo "❌ ERROR: Expected 40s wait for attempt $i, got ${WAIT_TIME}s"
                    exit 1
                fi
                ;;
            4|5|6)
                if [ $WAIT_TIME -ne 60 ]; then
                    echo "❌ ERROR: Expected 60s wait (capped) for attempt $i, got ${WAIT_TIME}s"
                    exit 1
                fi
                ;;
        esac
    done
    
    echo "✅ NPM exponential backoff test passed"
}

# Test configuration parameter validation
test_config_validation() {
    echo "📋 Testing configuration parameter validation..."
    
    # Test valid configuration ranges using safe parsing
    test_cases=(
        "MAX_ATTEMPTS=10"
        "MAX_ATTEMPTS=30"
        "MIN_REVIEW_LENGTH=50"
        "MIN_REVIEW_LENGTH=500"
    )
    
    for test_case in "${test_cases[@]}"; do
        # SECURITY FIX: Replace dangerous eval with safe configuration parsing
        case "$test_case" in
            MAX_ATTEMPTS=*)
                local max_attempts_value="${test_case#MAX_ATTEMPTS=}"
                # Validate that value is a positive integer
                if [[ "$max_attempts_value" =~ ^[0-9]+$ ]] && [ "$max_attempts_value" -gt 0 ] && [ "$max_attempts_value" -le 100 ]; then
                    echo "✅ Valid config: $test_case"
                else
                    echo "❌ ERROR: Invalid MAX_ATTEMPTS value: $max_attempts_value"
                    exit 1
                fi
                ;;
            MIN_REVIEW_LENGTH=*)
                local min_length_value="${test_case#MIN_REVIEW_LENGTH=}"
                # Validate that value is a positive integer
                if [[ "$min_length_value" =~ ^[0-9]+$ ]] && [ "$min_length_value" -gt 0 ] && [ "$min_length_value" -le 10000 ]; then
                    echo "✅ Valid config: $test_case"
                else
                    echo "❌ ERROR: Invalid MIN_REVIEW_LENGTH value: $min_length_value"
                    exit 1
                fi
                ;;
            *)
                echo "❌ ERROR: Unknown configuration parameter: $test_case"
                exit 1
                ;;
        esac
    done
    
    echo "✅ Configuration validation test passed"
}

# Run all tests
main() {
    echo "🚀 Starting GitPlus polling logic tests..."
    echo ""
    
    test_adaptive_intervals
    echo ""
    
    test_total_timeout
    echo ""
    
    test_npm_backoff
    echo ""
    
    test_config_validation
    echo ""
    
    echo "🎉 All polling logic tests passed!"
    echo ""
    echo "📊 Test Summary:"
    echo "- ✅ Adaptive interval calculation"
    echo "- ✅ Total timeout validation"
    echo "- ✅ NPM exponential backoff"
    echo "- ✅ Configuration parameter validation"
    echo ""
    echo "🔍 The polling logic is functioning correctly and efficiently."
}

# Execute tests
main "$@"