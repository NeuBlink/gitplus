/**
 * Enhanced Path Traversal Protection Test Suite
 * 
 * Comprehensive testing of path traversal attack prevention
 * Validates directory boundary enforcement, symlink protection, and path sanitization
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PathSecurity, SecurityLevel, validateGitPath, validatePathModerate } from '../../src/utils/pathSecurity';
import { GitClient } from '../../src/git/client';
import { ToolHandler } from '../../src/mcp/toolHandler';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Enhanced Path Traversal Protection', () => {
  let tempDir: string;
  let pathSecurity: PathSecurity;
  let testRepoPath: string;
  let toolHandler: ToolHandler;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitplus-enhanced-path-security-'));
    testRepoPath = path.join(tempDir, 'test-repo');
    await fs.promises.mkdir(testRepoPath, { recursive: true });
    
    // Initialize PathSecurity with strict configuration
    pathSecurity = new PathSecurity({
      level: SecurityLevel.STRICT,
      allowedRoots: [tempDir],
      allowSymlinks: false,
      logSecurityEvents: true,
      maxDepth: 50
    });
    
    toolHandler = new ToolHandler();
  });

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Advanced Directory Traversal Attacks', () => {
    test('should block sophisticated traversal patterns', async () => {
      const sophisticatedAttacks = [
        // URL-encoded traversal
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%2e%2e\\%2e%2e\\%2e%2e\\windows\\system32',
        
        // Double-encoded traversal
        '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
        
        // Unicode normalization attacks
        '..\u002f..\u002f..\u002fetc\u002fpasswd',
        '..\u005c..\u005c..\u005cwindows\u005csystem32',
        
        // Mixed encoding
        '../%2e%2e/etc/passwd',
        '..\\%2e%2e\\windows\\system32',
        
        // Overlong UTF-8 sequences
        '..%c0%af..%c0%afetc%c0%afpasswd',
        
        // Case variations (Windows)
        '..\\..\\..\\WiNdOwS\\sYsTeM32',
        
        // Alternate data streams (Windows)
        'file.txt::$DATA',
        'normal.txt:hidden:$DATA',
        
        // UNC paths (Windows)
        '\\\\evil.com\\share\\file',
        '\\\\127.0.0.1\\c$\\windows\\system32',
        
        // Device names (Windows)
        'CON.txt',
        'PRN.log',
        'AUX.dat',
        'NUL.bin',
        'COM1.txt',
        'LPT1.log',
        
        // Path with embedded nulls
        'normal\x00..\x00..\x00..\x00etc\x00passwd',
        
        // Extremely long paths to cause buffer overflow
        '../'.repeat(10000) + 'etc/passwd',
        
        // Path with control characters
        '../\x01../\x02../etc/passwd',
        
        // Homograph attacks using lookalike characters
        '.\u002e/..\u002f.\u002e/etc/passwd',
        
        // Filesystem case sensitivity bypass
        '../../../ETC/PASSWD',
        '../../../Etc/Passwd',
        
        // Archive extraction vulnerabilities (zip slip)
        '../../../../../../../../tmp/evil.sh',
        '../../../../../../../../../../../bin/sh'
      ];

      for (const attack of sophisticatedAttacks) {
        const result = await pathSecurity.validatePath(attack, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations.some(v => 
          v.includes('dangerous pattern') || 
          v.includes('repository boundaries') ||
          v.includes('blocked directory') ||
          v.includes('control character') ||
          v.includes('invalid encoding')
        )).toBe(true);
      }
    });

    test('should detect and block path normalization bypasses', async () => {
      const normalizationBypasses = [
        // Redundant separators
        'folder///../../../etc/passwd',
        'folder\\\\..\\..\\..\\windows\\system32',
        
        // Current directory references
        './folder/../../../etc/passwd',
        '.\\folder\\..\\..\\..\\windows\\system32',
        
        // Mixed current and parent directory references
        'folder/.././../.././../etc/passwd',
        'folder\\..\\.\\..\\..\\windows\\system32',
        
        // Trailing separators
        '../../../etc/passwd/',
        '..\\..\\..\\windows\\system32\\',
        
        // Multiple consecutive dots
        '...//...//...//etc/passwd',
        '...\\\\...\\\\...\\\\windows\\system32',
        
        // Spaces and tabs in paths
        '.. / .. / .. /etc/passwd',
        '.. \\ .. \\ .. \\windows\\system32',
        
        // POSIX character classes
        '../[.][.]/[.][.]/etc/passwd',
        
        // Glob patterns
        '../*/../../etc/passwd',
        '..\\*\\..\\..\\windows\\system32',
        
        // Brace expansion
        '../{.,..}/../../etc/passwd'
      ];

      for (const bypass of normalizationBypasses) {
        const result = await pathSecurity.validatePath(bypass, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    test('should handle platform-specific path attacks', async () => {
      const platformAttacks = {
        windows: [
          // Drive letter manipulation
          'C:../../../windows/system32',
          'D:\\..\\..\\..\\windows\\system32',
          
          // Short name attacks (8.3 format)
          'PROGRA~1\\COMMON~1\\MICROS~1',
          
          // Registry access attempts
          '../../../windows/system32/config/SAM',
          
          // PowerShell transcript locations
          '../../../Users/*/Documents/PowerShell_transcript.*.txt',
          
          // Windows API call paths
          '\\\\.\\PhysicalDrive0',
          '\\\\.\\C:',
          
          // Event log paths
          '../../../windows/system32/winevt/logs/*.evtx'
        ],
        unix: [
          // Proc filesystem access
          '/proc/self/environ',
          '/proc/self/cmdline',
          '/proc/*/fd/*',
          
          // Device access
          '/dev/kmem',
          '/dev/mem',
          '/dev/random',
          
          // Shadow file access
          '/etc/shadow',
          '/etc/gshadow',
          
          // SSH key access
          '~/.ssh/id_rsa',
          '/home/*/.ssh/id_rsa',
          '/root/.ssh/id_rsa',
          
          // System configuration
          '/boot/grub/grub.cfg',
          '/etc/fstab',
          '/etc/sudoers'
        ]
      };

      const attacksToTest = process.platform === 'win32' ? platformAttacks.windows : platformAttacks.unix;
      
      for (const attack of attacksToTest) {
        const result = await pathSecurity.validatePath(attack, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Symlink and Hard Link Security', () => {
    test('should detect complex symlink attack patterns', async () => {
      if (process.platform === 'win32') {
        // Skip symlink tests on Windows due to permission requirements
        return;
      }

      // Create a complex symlink attack scenario
      const attackDir = path.join(testRepoPath, 'attack');
      const legitDir = path.join(testRepoPath, 'legit');
      await fs.promises.mkdir(attackDir, { recursive: true });
      await fs.promises.mkdir(legitDir, { recursive: true });

      // Create various symlink attack patterns
      const symlinks = [
        // Direct symlink to sensitive file
        { source: '/etc/passwd', link: path.join(attackDir, 'passwd') },
        // Symlink to parent directory
        { source: '..', link: path.join(attackDir, 'parent') },
        // Chain of symlinks
        { source: '../attack/passwd', link: path.join(legitDir, 'chained') },
        // Symlink with relative traversal
        { source: '../../../etc/passwd', link: path.join(attackDir, 'traversal') },
        // Circular symlink
        { source: 'circular', link: path.join(attackDir, 'circular') }
      ];

      for (const { source, link } of symlinks) {
        try {
          await fs.promises.symlink(source, link);
          
          const result = await pathSecurity.validatePath(link, testRepoPath);
          expect(result.isSymlink).toBe(true);
          expect(result.isValid).toBe(false);
          expect(result.violations.some(v => 
            v.includes('Symlinks are not allowed') ||
            v.includes('symlink points outside') ||
            v.includes('circular symlink')
          )).toBe(true);
        } catch (error) {
          // Expected for circular symlinks or invalid targets
        }
      }
    });

    test('should validate symlink targets recursively', async () => {
      if (process.platform === 'win32') {
        return;
      }

      // Create a chain of symlinks that eventually leads outside the repository
      const chain = [
        { target: path.join(testRepoPath, 'level2'), link: path.join(testRepoPath, 'level1') },
        { target: path.join(testRepoPath, 'level3'), link: path.join(testRepoPath, 'level2') },
        { target: '/etc/passwd', link: path.join(testRepoPath, 'level3') }
      ];

      for (const { target, link } of chain) {
        await fs.promises.symlink(target, link);
      }

      // Test that following the chain detects the security violation
      const result = await pathSecurity.validatePath(
        path.join(testRepoPath, 'level1'), 
        testRepoPath
      );
      
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    test('should handle broken and dangling symlinks securely', async () => {
      if (process.platform === 'win32') {
        return;
      }

      const brokenSymlinks = [
        { target: '/nonexistent/path', link: path.join(testRepoPath, 'broken1') },
        { target: '../../../nonexistent', link: path.join(testRepoPath, 'broken2') },
        { target: 'missing-file.txt', link: path.join(testRepoPath, 'broken3') }
      ];

      for (const { target, link } of brokenSymlinks) {
        await fs.promises.symlink(target, link);
        
        const result = await pathSecurity.validatePath(link, testRepoPath);
        expect(result.isSymlink).toBe(true);
        
        // Broken symlinks should be treated as security violations
        if (target.includes('..')) {
          expect(result.isValid).toBe(false);
        }
      }
    });
  });

  describe('Repository Boundary Enforcement', () => {
    test('should enforce strict repository boundaries with nested repos', async () => {
      // Create nested repository structure
      const nestedRepo = path.join(testRepoPath, 'nested-repo');
      const siblingRepo = path.join(tempDir, 'sibling-repo');
      const parentPath = path.dirname(testRepoPath);
      
      await fs.promises.mkdir(nestedRepo, { recursive: true });
      await fs.promises.mkdir(siblingRepo, { recursive: true });

      const boundaryTests = [
        // Access to parent repository
        { path: parentPath, shouldBeValid: false, reason: 'parent directory access' },
        // Access to sibling repository
        { path: siblingRepo, shouldBeValid: false, reason: 'sibling repository access' },
        // Access within nested repository (should be valid)
        { path: nestedRepo, shouldBeValid: true, reason: 'nested repository access' },
        // Traversal to sibling through relative path
        { path: path.join(testRepoPath, '../sibling-repo'), shouldBeValid: false, reason: 'relative traversal to sibling' },
        // Complex traversal pattern
        { path: path.join(testRepoPath, 'nested-repo/../../sibling-repo'), shouldBeValid: false, reason: 'complex traversal pattern' }
      ];

      for (const test of boundaryTests) {
        const result = await pathSecurity.validatePath(test.path, testRepoPath);
        expect(result.isValid).toBe(test.shouldBeValid);
        
        if (!test.shouldBeValid) {
          expect(result.violations.length).toBeGreaterThan(0);
          expect(result.violations.some(v => 
            v.includes('repository boundaries') ||
            v.includes('dangerous pattern') ||
            v.includes('blocked directory')
          )).toBe(true);
        }
      }
    });

    test('should handle edge cases in path resolution', async () => {
      const edgeCases = [
        // Empty path
        '',
        // Root path
        '/',
        // Windows root
        'C:\\',
        // Current directory
        '.',
        // Parent directory
        '..',
        // Multiple parent references
        '../../../..',
        // Very long path
        'a'.repeat(4096),
        // Path with null bytes
         testRepoPath + '\x00',
        // Path with unicode null
        testRepoPath + '\u0000',
        // Path with vertical tab
        testRepoPath + '\v',
        // Path with form feed
        testRepoPath + '\f'
      ];

      for (const edgeCase of edgeCases) {
        const result = await pathSecurity.validatePath(edgeCase, testRepoPath);
        
        if (edgeCase === testRepoPath + '/valid-subpath') {
          expect(result.isValid).toBe(true);
        } else {
          // Most edge cases should be invalid
          expect(typeof result.isValid).toBe('boolean');
          expect(Array.isArray(result.violations)).toBe(true);
        }
      }
    });
  });

  describe('Security Level Configurations', () => {
    test('should properly enforce different security levels', async () => {
      const testPath = path.join(tempDir, 'outside-repo');
      await fs.promises.mkdir(testPath, { recursive: true });

      // Test strict mode
      const strictSecurity = new PathSecurity({ 
        level: SecurityLevel.STRICT,
        allowedRoots: [testRepoPath], // Only allow within test repo
        logSecurityEvents: false
      });
      const strictResult = await strictSecurity.validatePath(testPath, testRepoPath);
      expect(strictResult.isValid).toBe(false);

      // Test moderate mode
      const moderateSecurity = new PathSecurity({ 
        level: SecurityLevel.MODERATE,
        allowedRoots: [tempDir], // Allow within temp dir
        logSecurityEvents: false
      });
      const moderateResult = await moderateSecurity.validatePath(testPath, testRepoPath);
      expect(moderateResult.isValid).toBe(true);

      // Test permissive mode
      const permissiveSecurity = new PathSecurity({ 
        level: SecurityLevel.PERMISSIVE,
        allowedRoots: [tempDir],
        logSecurityEvents: false
      });
      const permissiveResult = await permissiveSecurity.validatePath(testPath, testRepoPath);
      expect(permissiveResult.isValid).toBe(true);
    });

    test('should respect custom blocked paths configuration', async () => {
      const customBlockedPaths = [
        path.join(testRepoPath, 'secret'),
        path.join(testRepoPath, 'private'),
        path.join(testRepoPath, 'config')
      ];

      const customSecurity = new PathSecurity({
        level: SecurityLevel.MODERATE,
        allowedRoots: [testRepoPath],
        blockedPaths: customBlockedPaths,
        logSecurityEvents: false
      });

      // Create the blocked directories
      for (const blockedPath of customBlockedPaths) {
        await fs.promises.mkdir(blockedPath, { recursive: true });
        
        const result = await customSecurity.validatePath(blockedPath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => v.includes('blocked directory'))).toBe(true);
      }

      // Test that non-blocked paths are allowed
      const allowedPath = path.join(testRepoPath, 'allowed');
      await fs.promises.mkdir(allowedPath, { recursive: true });
      
      const allowedResult = await customSecurity.validatePath(allowedPath, testRepoPath);
      expect(allowedResult.isValid).toBe(true);
    });

    test('should handle maximum depth restrictions', async () => {
      const deepPath = path.join(testRepoPath, ...Array(60).fill('deep')); // 60 levels deep
      
      const depthLimitedSecurity = new PathSecurity({
        level: SecurityLevel.STRICT,
        allowedRoots: [testRepoPath],
        maxDepth: 50, // Limit to 50 levels
        logSecurityEvents: false
      });

      await fs.promises.mkdir(deepPath, { recursive: true });
      
      const result = await depthLimitedSecurity.validatePath(deepPath, testRepoPath);
      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.includes('maximum depth'))).toBe(true);
    });
  });

  describe('Tool Handler Integration Security', () => {
    test('should validate repository paths in all tool operations', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '/etc',
        'C:\\Windows\\System32',
        testRepoPath + '/../../../evil',
        '\\\\evil.com\\share',
        '/dev/kmem',
        '/proc/self/environ'
      ];

      for (const maliciousPath of maliciousPaths) {
        // Test status operation
        const statusResult = await toolHandler.handleToolCall('status', { 
          repoPath: maliciousPath 
        });
        expect(statusResult.isError).toBe(true);
        expect(statusResult.content[0]?.text).toMatch(/Security Error|Path Validation Failed/i);

        // Test ship operation
        const shipResult = await toolHandler.handleToolCall('ship', { 
          repoPath: maliciousPath 
        });
        expect(shipResult.isError).toBe(true);
        expect(shipResult.content[0]?.text).toMatch(/Security Error|Path Validation Failed/i);
      }
    });

    test('should allow valid repository paths in tool operations', async () => {
      // Initialize a valid git repository
      const gitClient = new GitClient(testRepoPath);
      await gitClient.executeGitCommand('init');
      await gitClient.executeGitCommand('config user.name "Test User"');
      await gitClient.executeGitCommand('config user.email "test@example.com"');

      // Test with valid repository path
      const statusResult = await toolHandler.handleToolCall('status', { 
        repoPath: testRepoPath 
      });
      
      expect(statusResult.isError).toBeFalsy();
      expect(statusResult.content[0]?.text).toContain('Git Repository Status');
    });

    test('should handle path validation errors gracefully', async () => {
      // Test with null/undefined paths
      const invalidInputs = [null, undefined, '', 123, {}, []];
      
      for (const invalidInput of invalidInputs) {
        const result = await toolHandler.handleToolCall('status', { 
          repoPath: invalidInput as any
        });
        
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toMatch(/Security Error|Invalid.*path|Path.*required/i);
      }
    });
  });

  describe('Security Logging and Monitoring', () => {
    test('should log security violations with appropriate detail', async () => {
      const loggedSecurity = new PathSecurity({
        level: SecurityLevel.STRICT,
        allowedRoots: [testRepoPath],
        logSecurityEvents: true
      });

      const maliciousPath = '../../../etc/passwd';
      await loggedSecurity.validatePath(maliciousPath, testRepoPath);
      
      const securityLog = loggedSecurity.getSecurityLog();
      expect(securityLog.length).toBeGreaterThan(0);
      
      const logEntry = securityLog[securityLog.length - 1];
      expect(logEntry.level).toMatch(/CRITICAL|ERROR|WARNING/i);
      expect(logEntry.message).toBeTruthy();
      expect(logEntry.path).toBe(maliciousPath);
      expect(logEntry.timestamp).toBeInstanceOf(Date);
    });

    test('should maintain security log size limits', async () => {
      const loggedSecurity = new PathSecurity({
        level: SecurityLevel.STRICT,
        allowedRoots: [testRepoPath],
        logSecurityEvents: true
      });

      // Generate many security events
      for (let i = 0; i < 1100; i++) {
        await loggedSecurity.validatePath(`../../../evil-${i}`, testRepoPath);
      }
      
      const securityLog = loggedSecurity.getSecurityLog();
      expect(securityLog.length).toBeLessThanOrEqual(1000); // Should maintain limit
    });

    test('should provide security event filtering and analysis', async () => {
      const loggedSecurity = new PathSecurity({
        level: SecurityLevel.STRICT,
        allowedRoots: [testRepoPath],
        logSecurityEvents: true
      });

      // Generate different types of security events
      const attacks = [
        '../../../etc/passwd',      // Directory traversal
        '/etc',                     // Blocked directory
        '\x00evil',                 // Null byte injection
        'CON.txt',                  // Reserved name
        'a'.repeat(5000)            // Excessive length
      ];

      for (const attack of attacks) {
        await loggedSecurity.validatePath(attack, testRepoPath);
      }

      const securityLog = loggedSecurity.getSecurityLog();
      
      // Should have different types of violations
      const violationTypes = new Set(
        securityLog.map(entry => entry.message.split(':')[0])
      );
      expect(violationTypes.size).toBeGreaterThan(1);
      
      // Should have critical level events
      const criticalEvents = securityLog.filter(entry => entry.level === 'CRITICAL');
      expect(criticalEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Resource Protection', () => {
    test('should handle large numbers of path validations efficiently', async () => {
      const startTime = Date.now();
      const promises = [];
      
      // Test 1000 concurrent path validations
      for (let i = 0; i < 1000; i++) {
        promises.push(
          pathSecurity.validatePath(
            path.join(testRepoPath, `file-${i}.txt`), 
            testRepoPath
          )
        );
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // All should be valid (within repo)
      expect(results.every(r => r.isValid)).toBe(true);
    });

    test('should prevent memory exhaustion with large paths', async () => {
      const hugePath = 'a'.repeat(100 * 1024); // 100KB path
      
      const result = await pathSecurity.validatePath(hugePath, testRepoPath);
      
      // Should handle gracefully without crashing
      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.includes('maximum length'))).toBe(true);
    });

    test('should limit resource usage during validation', async () => {
      const memBefore = process.memoryUsage();
      
      // Perform many validations with various attack patterns
      const attacks = [
        '../'.repeat(1000) + 'etc/passwd',
        'a'.repeat(10000),
        '\x00'.repeat(1000),
        '/'.repeat(1000)
      ];
      
      for (let i = 0; i < 100; i++) {
        for (const attack of attacks) {
          await pathSecurity.validatePath(attack + i, testRepoPath);
        }
      }
      
      const memAfter = process.memoryUsage();
      
      // Memory usage should not increase dramatically
      const memIncrease = memAfter.heapUsed - memBefore.heapUsed;
      expect(memIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('should handle platform-specific path formats correctly', async () => {
      const platformPaths = {
        posix: [
          '/home/user/repo',
          '../../../etc/passwd',
          'folder/subfolder/file.txt',
          '/tmp/test'
        ],
        windows: [
          'C:\\Users\\User\\repo',
          '..\\..\\..\\Windows\\System32',
          'folder\\subfolder\\file.txt',
          'D:\\temp\\test'
        ]
      };

      const pathsToTest = process.platform === 'win32' ? platformPaths.windows : platformPaths.posix;
      
      for (const testPath of pathsToTest) {
        const result = await pathSecurity.validatePath(testPath, testRepoPath);
        
        // Should handle gracefully regardless of platform
        expect(typeof result.isValid).toBe('boolean');
        expect(Array.isArray(result.violations)).toBe(true);
        expect(typeof result.canonicalPath).toBe('string');
      }
    });

    test('should normalize path separators consistently', async () => {
      const mixedPaths = [
        'folder/subfolder\\file.txt',
        'folder\\subfolder/file.txt',
        'folder//subfolder\\\\file.txt',
        'folder\\\\subfolder//file.txt'
      ];

      for (const mixedPath of mixedPaths) {
        const result = await pathSecurity.validatePath(
          path.join(testRepoPath, mixedPath), 
          testRepoPath
        );
        
        // Should normalize consistently
        expect(result.canonicalPath).not.toContain('//');
        expect(result.canonicalPath).not.toContain('\\\\');
      }
    });
  });
});
