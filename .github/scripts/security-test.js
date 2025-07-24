#!/usr/bin/env node

/**
 * Security validation tests for gitplus workflows
 * Tests that injection attempts are properly blocked
 */

const { execSync } = require('child_process');
const ContextCollector = require('./collect-context.js');

class SecurityTester {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  test(description, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${description}`);
      this.testsPassed++;
    } catch (error) {
      console.log(`❌ FAIL: ${description}`);
      console.log(`   Error: ${error.message}`);
      this.testsFailed++;
    }
  }

  testValidation() {
    console.log('🔍 Testing input validation...\n');

    // Set up test environment variables
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GITHUB_PR_NUMBER: '123',
      GITHUB_BASE_SHA: '1234567890abcdef1234567890abcdef12345678',
      GITHUB_HEAD_SHA: 'fedcba0987654321fedcba0987654321fedcba09',
      GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: 'feature/test',
      GITHUB_REPOSITORY: 'owner/repo'
    };

    // Test SHA validation
    this.test('SHA validation blocks injection attempts', () => {
      const collector = new ContextCollector();
      
      // Should throw on malicious SHA
      try {
        collector.validateSHA('abc123; rm -rf /');
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('Invalid SHA hash')) {
          throw error;
        }
      }
      
      // Should accept valid SHA
      collector.validateSHA('1234567890abcdef1234567890abcdef12345678');
    });

    // Test Git ref validation  
    this.test('Git ref validation blocks injection attempts', () => {
      const collector = new ContextCollector();
      
      // Should throw on malicious ref
      try {
        collector.validateGitRef('main; $(rm -rf /)');
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('Invalid Git reference')) {
          throw error;
        }
      }
      
      // Should accept valid ref
      collector.validateGitRef('main');
      collector.validateGitRef('feature/test-branch');
    });

    // Test repository validation
    this.test('Repository validation blocks injection attempts', () => {
      const collector = new ContextCollector();
      
      // Should throw on malicious repository
      try {
        collector.validateRepository('owner/repo; echo "hacked"');
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('Invalid repository format')) {
          throw error;
        }
      }
      
      // Should accept valid repository
      collector.validateRepository('owner/repo');
    });

    // Test PR number validation
    this.test('PR number validation blocks injection attempts', () => {
      const collector = new ContextCollector();
      
      // Should throw on malicious PR number
      try {
        collector.validatePRNumber('123; rm -rf /');
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('Invalid PR number')) {
          throw error;
        }
      }
      
      // Should accept valid PR number
      collector.validatePRNumber('123');
    });

    // Restore original environment
    process.env = originalEnv;
  }

  testSafeExecution() {
    console.log('\n🔍 Testing safe command execution...\n');

    // Set up test environment variables
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GITHUB_PR_NUMBER: '123',
      GITHUB_BASE_SHA: '1234567890abcdef1234567890abcdef12345678',
      GITHUB_HEAD_SHA: 'fedcba0987654321fedcba0987654321fedcba09',
      GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: 'feature/test',
      GITHUB_REPOSITORY: 'owner/repo'
    };

    // Test parameterized commands
    this.test('Parameterized commands block injection', () => {
      const collector = new ContextCollector();
      
      // Should throw on dangerous arguments
      try {
        collector.safeExecSync('git', ['log', '; rm -rf /']);
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('Potentially dangerous argument')) {
          throw error;
        }
      }
    });

    // Test command validation
    this.test('Command validation blocks dangerous patterns', () => {
      const collector = new ContextCollector();
      
      // Should throw on dangerous commands
      try {
        collector.safeExecSync('git log --oneline; rm -rf /');
        throw new Error('Should have thrown');
      } catch (error) {
        if (!error.message.includes('dangerous command pattern')) {
          throw error;
        }
      }
    });

    // Restore original environment
    process.env = originalEnv;
  }

  runAllTests() {
    console.log('🛡️  Security Tests for Gitplus\n');
    console.log('Testing input validation and command injection prevention...\n');

    this.testValidation();
    this.testSafeExecution();

    console.log('\n📊 Test Results:');
    console.log(`   ✅ Passed: ${this.testsPassed}`);
    console.log(`   ❌ Failed: ${this.testsFailed}`);
    console.log(`   📈 Success Rate: ${((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(1)}%`);

    if (this.testsFailed > 0) {
      console.log('\n⚠️  Some security tests failed. Please review the code before deployment.');
      process.exit(1);
    } else {
      console.log('\n✅ All security tests passed!');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new SecurityTester();
  tester.runAllTests();
}

module.exports = SecurityTester;