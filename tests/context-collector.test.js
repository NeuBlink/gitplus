#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Mock the ContextCollector class for testing
class ContextCollectorTest {
  constructor() {
    this.contextDir = '.github/test-context';
  }

  // Test input validation methods
  testValidatePRNumber() {
    const tests = [
      { input: '123', expected: '123', shouldPass: true },
      { input: '0', expected: '0', shouldPass: true },
      { input: 'abc', expected: null, shouldPass: false },
      { input: '123abc', expected: null, shouldPass: false },
      { input: '', expected: null, shouldPass: false },
      { input: null, expected: null, shouldPass: false },
      { input: undefined, expected: null, shouldPass: false },
      { input: '12.3', expected: null, shouldPass: false },
      { input: '-123', expected: null, shouldPass: false },
    ];

    console.log('Testing PR number validation...');
    tests.forEach(test => {
      try {
        const result = this.validatePRNumber(test.input);
        if (test.shouldPass && result === test.expected) {
          console.log(`✓ validatePRNumber('${test.input}') = '${result}'`);
        } else if (!test.shouldPass) {
          console.log(`✗ validatePRNumber('${test.input}') should have thrown`);
        }
      } catch (e) {
        if (!test.shouldPass) {
          console.log(`✓ validatePRNumber('${test.input}') correctly threw: ${e.message}`);
        } else {
          console.log(`✗ validatePRNumber('${test.input}') unexpectedly threw: ${e.message}`);
        }
      }
    });
  }

  testValidateSHA() {
    const tests = [
      { input: 'a'.repeat(40), expected: 'a'.repeat(40), shouldPass: true },
      { input: '1234567890abcdef1234567890abcdef12345678', expected: '1234567890abcdef1234567890abcdef12345678', shouldPass: true },
      { input: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12', expected: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12', shouldPass: true },
      { input: 'short', expected: null, shouldPass: false },
      { input: 'a'.repeat(41), expected: null, shouldPass: false },
      { input: 'z'.repeat(40), expected: null, shouldPass: false },
      { input: '', expected: null, shouldPass: false },
      { input: null, expected: null, shouldPass: false },
    ];

    console.log('\nTesting SHA validation...');
    tests.forEach(test => {
      try {
        const result = this.validateSHA(test.input);
        if (test.shouldPass && result === test.expected) {
          console.log(`✓ validateSHA('${test.input?.substring(0, 10)}...') = '${result?.substring(0, 10)}...'`);
        } else if (!test.shouldPass) {
          console.log(`✗ validateSHA('${test.input}') should have thrown`);
        }
      } catch (e) {
        if (!test.shouldPass) {
          console.log(`✓ validateSHA('${test.input?.substring(0, 10) || test.input}') correctly threw: ${e.message}`);
        } else {
          console.log(`✗ validateSHA('${test.input}') unexpectedly threw: ${e.message}`);
        }
      }
    });
  }

  testValidateGitRef() {
    const tests = [
      { input: 'main', expected: 'main', shouldPass: true },
      { input: 'feature/my-feature', expected: 'feature/my-feature', shouldPass: true },
      { input: 'feature-123', expected: 'feature-123', shouldPass: true },
      { input: 'release/v1.2.3', expected: 'release/v1.2.3', shouldPass: true },
      { input: 'my_branch', expected: 'my_branch', shouldPass: true },
      { input: 'feature branch', expected: null, shouldPass: false },
      { input: 'feature@branch', expected: null, shouldPass: false },
      { input: 'feature#branch', expected: null, shouldPass: false },
      { input: '', expected: null, shouldPass: false },
      { input: null, expected: null, shouldPass: false },
    ];

    console.log('\nTesting Git reference validation...');
    tests.forEach(test => {
      try {
        const result = this.validateGitRef(test.input);
        if (test.shouldPass && result === test.expected) {
          console.log(`✓ validateGitRef('${test.input}') = '${result}'`);
        } else if (!test.shouldPass) {
          console.log(`✗ validateGitRef('${test.input}') should have thrown`);
        }
      } catch (e) {
        if (!test.shouldPass) {
          console.log(`✓ validateGitRef('${test.input}') correctly threw: ${e.message}`);
        } else {
          console.log(`✗ validateGitRef('${test.input}') unexpectedly threw: ${e.message}`);
        }
      }
    });
  }

  testValidateRepository() {
    const tests = [
      { input: 'owner/repo', expected: 'owner/repo', shouldPass: true },
      { input: 'my-org/my-repo', expected: 'my-org/my-repo', shouldPass: true },
      { input: 'org123/repo456', expected: 'org123/repo456', shouldPass: true },
      { input: 'under_score/dot.repo', expected: 'under_score/dot.repo', shouldPass: true },
      { input: 'noSlash', expected: null, shouldPass: false },
      { input: 'too/many/slashes', expected: null, shouldPass: false },
      { input: 'owner/repo/extra', expected: null, shouldPass: false },
      { input: '', expected: null, shouldPass: false },
      { input: null, expected: null, shouldPass: false },
    ];

    console.log('\nTesting repository name validation...');
    tests.forEach(test => {
      try {
        const result = this.validateRepository(test.input);
        if (test.shouldPass && result === test.expected) {
          console.log(`✓ validateRepository('${test.input}') = '${result}'`);
        } else if (!test.shouldPass) {
          console.log(`✗ validateRepository('${test.input}') should have thrown`);
        }
      } catch (e) {
        if (!test.shouldPass) {
          console.log(`✓ validateRepository('${test.input}') correctly threw: ${e.message}`);
        } else {
          console.log(`✗ validateRepository('${test.input}') unexpectedly threw: ${e.message}`);
        }
      }
    });
  }

  testSafeExecSync() {
    const tests = [
      { 
        command: 'echo', 
        args: ['hello', 'world'], 
        shouldPass: true,
        description: 'Simple echo command'
      },
      {
        command: 'git',
        args: ['--version'],
        shouldPass: true,
        description: 'Git version command'
      },
      {
        command: '/usr/bin/echo',
        args: ['test'],
        shouldPass: true,
        description: 'Full path command'
      },
      {
        command: 'rm -rf /',
        args: [],
        shouldPass: false,
        description: 'Command with spaces (injection attempt)'
      },
      {
        command: 'echo',
        args: ['test; rm -rf /'],
        shouldPass: true,
        description: 'Argument with semicolon (should be safe)'
      },
      {
        command: 'echo',
        args: ['$(whoami)'],
        shouldPass: true,
        description: 'Argument with command substitution (should be safe)'
      },
    ];

    console.log('\nTesting safe command execution...');
    tests.forEach(test => {
      try {
        const result = this.safeExecSync(test.command, test.args);
        if (test.shouldPass) {
          console.log(`✓ safeExecSync('${test.command}', ${JSON.stringify(test.args)}) - ${test.description}`);
        } else {
          console.log(`✗ safeExecSync('${test.command}', ${JSON.stringify(test.args)}) should have thrown - ${test.description}`);
        }
      } catch (e) {
        if (!test.shouldPass) {
          console.log(`✓ safeExecSync('${test.command}', ${JSON.stringify(test.args)}) correctly threw - ${test.description}`);
        } else {
          console.log(`✗ safeExecSync('${test.command}', ${JSON.stringify(test.args)}) unexpectedly threw: ${e.message} - ${test.description}`);
        }
      }
    });
  }

  // Copy validation methods from actual implementation
  validatePRNumber(prNumber) {
    if (!prNumber || !/^\d+$/.test(prNumber)) {
      throw new Error('Invalid PR number');
    }
    return prNumber;
  }

  validateSHA(sha) {
    if (!sha || !/^[a-f0-9]{40}$/i.test(sha)) {
      throw new Error(`Invalid SHA hash: ${sha}`);
    }
    return sha;
  }

  validateGitRef(ref) {
    if (!ref) {
      throw new Error('Git reference is required');
    }
    if (!/^[a-zA-Z0-9\-_./]+$/.test(ref)) {
      throw new Error(`Invalid Git reference: ${ref}`);
    }
    return ref;
  }

  validateRepository(repository) {
    if (!repository) {
      throw new Error('Repository name is required');
    }
    if (!/^[a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+$/.test(repository)) {
      throw new Error(`Invalid repository format: ${repository}`);
    }
    return repository;
  }

  safeExecSync(command, args = [], options = {}) {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }
    
    if (!Array.isArray(args)) {
      throw new Error('Arguments must be an array');
    }
    
    // Validate command name (allow slash for full paths like /usr/bin/git)
    if (!/^[a-zA-Z0-9_\-/]+$/.test(command)) {
      throw new Error(`Invalid command name: ${command}`);
    }
    
    // Validate all arguments are strings
    args.forEach((arg, index) => {
      if (typeof arg !== 'string') {
        throw new Error(`Invalid argument type at index ${index}: ${typeof arg}`);
      }
    });
    
    try {
      return execFileSync(command, args, {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
      });
    } catch (error) {
      throw error;
    }
  }
}

// Run tests
console.log('=== ContextCollector Security Tests ===\n');
const tester = new ContextCollectorTest();
tester.testValidatePRNumber();
tester.testValidateSHA();
tester.testValidateGitRef();
tester.testValidateRepository();
tester.testSafeExecSync();

console.log('\n=== All tests completed ===');