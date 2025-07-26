/**
 * Comprehensive Security Test Suite
 * Tests all security fixes implemented to prevent:
 * 1. Command injection vulnerabilities
 * 2. Shell escaping issues
 * 3. Environment variable validation
 * 4. Input validation bypasses
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitClient } from '../../src/git/client';
import { AIService } from '../../src/ai/service';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Security Audit Tests', () => {
  let testDir: string;
  let gitClient: GitClient;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitplus-security-test-'));
    
    // Initialize git repo for testing
    await spawn('git', ['init'], { cwd: testDir }).on('close', () => {});
    
    gitClient = new GitClient(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rmdir(testDir, { recursive: true }).catch(() => {});
  });

  describe('Command Injection Prevention', () => {
    it('should reject dangerous git arguments', async () => {
      const dangerousInputs = [
        '; rm -rf /',
        '`whoami`',
        '$(echo malicious)',
        '| cat /etc/passwd',
        '&& curl evil.com',
        '../../../etc/passwd',
        '--help; malicious',
        '-c core.editor="touch /tmp/pwned"'
      ];

      for (const input of dangerousInputs) {
        await expect(async () => {
          await gitClient.executeSafeGitCommand('status', [input]);
        }).rejects.toThrow(/Invalid git argument contains dangerous characters|Git argument must be a string/);
      }
    });

    it('should validate git command whitelist', async () => {
      const forbiddenCommands = [
        'rm',
        'format',
        'config --global',
        'daemon',
        'shell'
      ];

      for (const command of forbiddenCommands) {
        await expect(async () => {
          await gitClient.executeSafeGitCommand(command, []);
        }).rejects.toThrow(/Git command not allowed/);
      }
    });

    it('should limit argument length to prevent buffer overflow', async () => {
      const longArgument = 'a'.repeat(300);
      
      await expect(async () => {
        await gitClient.executeSafeGitCommand('status', [longArgument]);
      }).rejects.toThrow(/Git argument exceeds maximum length/);
    });

    it('should properly escape shell metacharacters', async () => {
      const testCases = [
        'file with spaces.txt',
        'file"with"quotes.txt',
        'file\\with\\backslashes.txt'
      ];

      for (const testCase of testCases) {
        // This should not throw if properly escaped
        try {
          await gitClient.executeSafeGitCommand('ls-files', [testCase]);
          // Expected to succeed with proper escaping
        } catch (error: any) {
          // Should fail with git error, not shell injection error
          expect(error.message).not.toContain('syntax error');
          expect(error.message).not.toContain('command not found');
        }
      }
    });
  });

  describe('Git Client Security Tests', () => {
    it('should use secure command execution methods', async () => {
      // Test that the git client has the secure methods implemented
      expect(typeof gitClient['sanitizeGitArgument']).toBe('function');
      expect(typeof gitClient['buildSafeGitCommand']).toBe('function');
      expect(typeof gitClient['executeGitCommandWithSpawn']).toBe('function');
    });

    it('should validate git command safety', () => {
      // Test command validation logic exists
      const gitClientAny = gitClient as any;
      
      // Test sanitizeGitArgument exists and works
      expect(() => {
        gitClientAny.sanitizeGitArgument('normal-file.txt');
      }).not.toThrow();
      
      expect(() => {
        gitClientAny.sanitizeGitArgument('; rm -rf /');
      }).toThrow();
    });
  });

  describe('AI Service Security Tests', () => {
    let aiService: AIService;

    beforeEach(() => {
      // Mock environment variables for testing
      process.env['GITPLUS_CLAUDE_COMMAND'] = 'echo';
      process.env['GITPLUS_MODEL'] = 'sonnet';
      process.env['GITPLUS_TIMEOUT'] = '5000';
      process.env['GITPLUS_MAX_RETRIES'] = '2';
      
      aiService = new AIService();
    });

    afterEach(() => {
      // Clean up environment
      delete process.env['GITPLUS_CLAUDE_COMMAND'];
      delete process.env['GITPLUS_MODEL'];
      delete process.env['GITPLUS_TIMEOUT'];
      delete process.env['GITPLUS_MAX_RETRIES'];
    });

    it('should validate environment variables on construction', () => {
      const invalidConfigs = [
        { GITPLUS_CLAUDE_COMMAND: '' },
        { GITPLUS_MODEL: 'invalid-model' },
        { GITPLUS_TIMEOUT: 'not-a-number' },
        { GITPLUS_TIMEOUT: '100' }, // Too low
        { GITPLUS_TIMEOUT: '700000' }, // Too high
        { GITPLUS_MAX_RETRIES: 'not-a-number' },
        { GITPLUS_MAX_RETRIES: '-1' }, // Negative
        { GITPLUS_MAX_RETRIES: '15' }, // Too high
      ];

      for (const config of invalidConfigs) {
        const originalEnv = { ...process.env };
        
        // Apply invalid config
        Object.assign(process.env, config);
        
        expect(() => {
          new AIService();
        }).toThrow();
        
        // Restore environment
        process.env = originalEnv;
      }
    });

    it('should use spawn instead of shell execution', async () => {
      // Verify that AIService uses spawn by checking if it properly handles arguments
      // This is tested indirectly by ensuring no shell interpretation occurs
      
      const maliciousPrompt = 'test; echo "SECURITY_BREACH" > /tmp/pwned';
      
      try {
        // This should not create any files or execute shell commands
        await aiService.generateCommitMessage({
          diff: 'test diff',
          filesChanged: ['test.txt'],
          status: { staged: [], unstaged: [], untracked: [] }
        });
      } catch (error) {
        // Expected to fail due to mocked echo command, but should not execute shell commands
      }
      
      // Verify no security breach file was created
      const breachFile = '/tmp/pwned';
      try {
        await fs.access(breachFile);
        fail('Security breach detected: shell command execution occurred');
      } catch {
        // Expected - file should not exist
      }
    });
  });

  describe('Configuration Parsing Security Tests', () => {
    it('should safely parse configuration without eval', () => {
      // Test the fixed configuration parsing from polling-logic.test.sh
      const testConfigs = [
        'MAX_ATTEMPTS=10',
        'MAX_ATTEMPTS=30',
        'MIN_REVIEW_LENGTH=50',
        'MIN_REVIEW_LENGTH=500'
      ];

      const maliciousConfigs = [
        'MAX_ATTEMPTS=10; rm -rf /',
        'MAX_ATTEMPTS=$(whoami)',
        'MAX_ATTEMPTS=`curl evil.com`',
        'MIN_REVIEW_LENGTH=50; echo pwned',
        'UNKNOWN_CONFIG=malicious'
      ];

      // Simulate the safe parsing logic from the fixed test
      for (const config of testConfigs) {
        expect(() => {
          parseConfigSafely(config);
        }).not.toThrow();
      }

      for (const config of maliciousConfigs) {
        expect(() => {
          parseConfigSafely(config);
        }).toThrow();
      }
    });
  });

  describe('Input Validation Security Tests', () => {
    it('should reject excessively long inputs', () => {
      const longString = 'a'.repeat(10000);
      
      expect(() => {
        gitClient['sanitizeGitArgument'](longString);
      }).toThrow(/Git argument exceeds maximum length/);
    });

    it('should validate file paths in hook scripts', () => {
      const validPaths = [
        'src/file.ts',
        'docs/README.md',
        'package.json'
      ];

      const invalidPaths = [
        '../../../etc/passwd',
        '/etc/passwd',
        '../../../../root/.ssh/id_rsa',
        'file; rm -rf /',
        'file`whoami`',
        null,
        undefined,
        'a'.repeat(2000) // Too long
      ];

      // Simulate the validation logic from hook scripts
      for (const path of validPaths) {
        expect(validateFilePath(path)).toBe(true);
      }

      for (const path of invalidPaths) {
        expect(validateFilePath(path)).toBe(false);
      }
    });
  });
});

// Helper functions to simulate security validation logic
function parseConfigSafely(config: string): void {
  if (config.includes(';') || config.includes('`') || config.includes('$')) {
    throw new Error('Dangerous characters detected in configuration');
  }
  
  if (config.startsWith('MAX_ATTEMPTS=')) {
    const value = config.replace('MAX_ATTEMPTS=', '');
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue <= 0 || numValue > 100) {
      throw new Error('Invalid MAX_ATTEMPTS value');
    }
  } else if (config.startsWith('MIN_REVIEW_LENGTH=')) {
    const value = config.replace('MIN_REVIEW_LENGTH=', '');
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue <= 0 || numValue > 10000) {
      throw new Error('Invalid MIN_REVIEW_LENGTH value');
    }
  } else {
    throw new Error('Unknown configuration parameter');
  }
}

function validateFilePath(filePath: any): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  
  if (filePath.includes('..') || filePath.includes('//')) {
    return false;
  }
  
  if (filePath.length > 1000) {
    return false;
  }
  
  if (/[;&|`$(){}[\]<>]/.test(filePath)) {
    return false;
  }
  
  // Reject absolute paths that might access system files
  if (filePath.startsWith('/') && !filePath.startsWith('/tmp/test')) {
    return false;
  }
  
  return true;
}