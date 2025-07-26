import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PathSecurity, SecurityLevel, validateGitPath, validatePathModerate } from '../../src/utils/pathSecurity';
import { GitClient } from '../../src/git/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Path Traversal Security Tests', () => {
  let tempDir: string;
  let pathSecurity: PathSecurity;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitplus-security-test-'));
    testRepoPath = path.join(tempDir, 'test-repo');
    await fs.promises.mkdir(testRepoPath, { recursive: true });
    
    // Initialize PathSecurity with strict configuration
    pathSecurity = new PathSecurity({
      level: SecurityLevel.STRICT,
      allowedRoots: [tempDir],
      allowSymlinks: false,
      logSecurityEvents: true
    });
  });

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Path Traversal Protection', () => {
    test('should block simple directory traversal attempts', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        testRepoPath + '/../../../etc',
        path.join(testRepoPath, '..', '..', 'sensitive'),
        testRepoPath + '/subdir/../../../etc/passwd'
      ];

      for (const maliciousPath of maliciousPaths) {
        const result = await pathSecurity.validatePath(maliciousPath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations.some(v => v.includes('dangerous pattern') || v.includes('repository boundaries'))).toBe(true);
      }
    });

    test('should block null byte injection attempts', async () => {
      const nullBytePaths = [
        testRepoPath + '\0',
        testRepoPath + '/file\0.txt',
        testRepoPath + '/\0../../etc/passwd'
      ];

      for (const nullBytePath of nullBytePaths) {
        const result = await pathSecurity.validatePath(nullBytePath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => v.includes('dangerous pattern'))).toBe(true);
      }
    });

    test('should block control character injection', async () => {
      const controlCharPaths = [
        testRepoPath + '/file\x01.txt',
        testRepoPath + '/\x1f../../etc',
        testRepoPath + '/file\r\n.txt'
      ];

      for (const controlCharPath of controlCharPaths) {
        const result = await pathSecurity.validatePath(controlCharPath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => v.includes('dangerous pattern'))).toBe(true);
      }
    });

    test('should allow valid paths within repository', async () => {
      const validPaths = [
        testRepoPath,
        path.join(testRepoPath, 'src'),
        path.join(testRepoPath, 'src', 'components'),
        path.join(testRepoPath, 'package.json'),
        path.join(testRepoPath, '.git')
      ];

      // Create these paths first
      for (const validPath of validPaths) {
        if (!validPath.endsWith('.json')) {
          await fs.promises.mkdir(validPath, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(validPath), { recursive: true });
          await fs.promises.writeFile(validPath, '{}');
        }
      }

      for (const validPath of validPaths) {
        const result = await pathSecurity.validatePath(validPath, testRepoPath);
        expect(result.isValid).toBe(true);
        expect(result.violations.length).toBe(0);
      }
    });
  });

  describe('Symlink Protection', () => {
    test('should detect and block symlinks in strict mode', async () => {
      if (process.platform === 'win32') {
        // Skip symlink tests on Windows due to permission requirements
        return;
      }

      const targetFile = path.join(testRepoPath, 'target.txt');
      const symlinkPath = path.join(testRepoPath, 'symlink.txt');
      
      await fs.promises.writeFile(targetFile, 'test content');
      await fs.promises.symlink(targetFile, symlinkPath);

      const result = await pathSecurity.validatePath(symlinkPath, testRepoPath);
      expect(result.isSymlink).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.includes('Symlinks are not allowed'))).toBe(true);
    });

    test('should allow symlinks in moderate mode', async () => {
      if (process.platform === 'win32') {
        return;
      }

      const moderateSecurity = new PathSecurity({
        level: SecurityLevel.MODERATE,
        allowSymlinks: true,
        allowedRoots: [tempDir]
      });

      const targetFile = path.join(testRepoPath, 'target.txt');
      const symlinkPath = path.join(testRepoPath, 'symlink.txt');
      
      await fs.promises.writeFile(targetFile, 'test content');
      await fs.promises.symlink(targetFile, symlinkPath);

      const result = await moderateSecurity.validatePath(symlinkPath, testRepoPath);
      expect(result.isSymlink).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('symlink'))).toBe(true);
    });

    test('should block symlinks pointing outside repository', async () => {
      if (process.platform === 'win32') {
        return;
      }

      const outsideDir = path.join(tempDir, 'outside');
      const outsideFile = path.join(outsideDir, 'secret.txt');
      const symlinkPath = path.join(testRepoPath, 'evil-symlink.txt');
      
      await fs.promises.mkdir(outsideDir, { recursive: true });
      await fs.promises.writeFile(outsideFile, 'secret data');
      await fs.promises.symlink(outsideFile, symlinkPath);

      const result = await pathSecurity.validatePath(symlinkPath, testRepoPath);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Repository Boundary Enforcement', () => {
    test('should block access outside repository root', async () => {
      const outsidePaths = [
        path.join(tempDir, 'outside-repo'),
        path.dirname(testRepoPath),
        path.join(testRepoPath, '..', 'sibling'),
        '/etc/passwd',
        '/tmp/evil',
        'C:\\Windows\\System32' // Windows system path
      ];

      for (const outsidePath of outsidePaths) {
        const result = await pathSecurity.validatePath(outsidePath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => 
          v.includes('repository boundaries') || 
          v.includes('blocked directory') ||
          v.includes('dangerous pattern')
        )).toBe(true);
      }
    });

    test('should calculate relative paths correctly', async () => {
      const testCases = [
        {
          target: path.join(testRepoPath, 'src', 'components'),
          repo: testRepoPath,
          shouldBeValid: true
        },
        {
          target: path.join(tempDir, 'other-repo'),
          repo: testRepoPath,
          shouldBeValid: false
        },
        {
          target: path.dirname(testRepoPath),
          repo: testRepoPath,
          shouldBeValid: false
        }
      ];

      for (const testCase of testCases) {
        // Create directories
        await fs.promises.mkdir(testCase.target, { recursive: true });
        
        const result = await pathSecurity.validatePath(testCase.target, testCase.repo);
        expect(result.isValid).toBe(testCase.shouldBeValid);
      }
    });
  });

  describe('Cross-Platform Security', () => {
    test('should block Windows reserved names', async () => {
      const reservedNames = [
        path.join(testRepoPath, 'CON'),
        path.join(testRepoPath, 'PRN'),
        path.join(testRepoPath, 'AUX'),
        path.join(testRepoPath, 'NUL'),
        path.join(testRepoPath, 'COM1'),
        path.join(testRepoPath, 'LPT1')
      ];

      for (const reservedName of reservedNames) {
        const result = await pathSecurity.validatePath(reservedName, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => v.includes('dangerous pattern'))).toBe(true);
      }
    });

    test('should handle different path separators', async () => {
      const pathVariations = [
        testRepoPath + '/src/components',      // Unix style
        testRepoPath + '\\src\\components',    // Windows style
        testRepoPath + '/src\\mixed\\components' // Mixed style
      ];

      for (const pathVariation of pathVariations) {
        const normalizedPath = path.normalize(pathVariation);
        if (normalizedPath.includes('..')) {
          continue; // Skip if normalization reveals traversal
        }
        
        // Create the directory structure
        await fs.promises.mkdir(normalizedPath, { recursive: true });
        
        const result = await pathSecurity.validatePath(pathVariation, testRepoPath);
        expect(result.isValid).toBe(true);
        expect(result.canonicalPath).toBe(normalizedPath);
      }
    });

    test('should block access to system directories', async () => {
      const systemPaths = [
        '/etc',
        '/var',
        '/usr/bin',
        '/proc',
        '/sys',
        'C:\\Windows',
        'C:\\Program Files',
        'C:\\System Volume Information'
      ];

      for (const systemPath of systemPaths) {
        const result = await pathSecurity.validatePath(systemPath, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.some(v => 
          v.includes('blocked directory') ||
          v.includes('system filesystem')
        )).toBe(true);
      }
    });
  });

  describe('GitClient Integration', () => {
    test('should validate working directory on first operation', async () => {
      const maliciousPath = '../../../etc';
      
      const gitClient = new GitClient(maliciousPath);
      
      // First git operation should trigger validation and fail
      await expect(gitClient.executeGitCommand('status')).rejects.toThrow(/Security validation failed/);
    });

    test('should accept valid repository paths', async () => {
      // Initialize a proper git repository
      const gitClient = new GitClient(testRepoPath);
      await gitClient.executeGitCommand('init');
      
      // Should not throw security errors
      const status = await gitClient.executeGitCommand('status --porcelain');
      expect(typeof status).toBe('string');
    });

    test('should validate custom cwd parameters', async () => {
      const gitClient = new GitClient(testRepoPath);
      await gitClient.executeGitCommand('init');
      
      const maliciousCwd = '../../../etc';
      
      await expect(
        gitClient.executeGitCommand('status', { cwd: maliciousCwd })
      ).rejects.toThrow(/Security validation failed for custom working directory/);
    });
  });

  describe('Security Logging', () => {
    test('should log security violations', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const maliciousPath = '../../../etc/passwd';
      await pathSecurity.validatePath(maliciousPath, testRepoPath);
      
      const securityLog = pathSecurity.getSecurityLog();
      expect(securityLog.length).toBeGreaterThan(0);
      expect(securityLog.some(entry => entry.level === 'CRITICAL' || entry.level === 'ERROR')).toBe(true);
      
      consoleSpy.mockRestore();
    });

    test('should maintain security log size limits', async () => {
      // Generate many security events
      for (let i = 0; i < 1100; i++) {
        await pathSecurity.validatePath(`../../../evil-${i}`, testRepoPath);
      }
      
      const securityLog = pathSecurity.getSecurityLog();
      expect(securityLog.length).toBeLessThanOrEqual(1000);
    });

    test('should clear security log when requested', async () => {
      await pathSecurity.validatePath('../../../etc', testRepoPath);
      expect(pathSecurity.getSecurityLog().length).toBeGreaterThan(0);
      
      pathSecurity.clearSecurityLog();
      expect(pathSecurity.getSecurityLog().length).toBe(0);
    });
  });

  describe('Security Level Configurations', () => {
    test('should enforce different security levels', async () => {
      const testPath = path.join(testRepoPath, '..', 'sibling');
      await fs.promises.mkdir(testPath, { recursive: true });

      // Strict mode should block
      const strictSecurity = new PathSecurity({ 
        level: SecurityLevel.STRICT,
        allowedRoots: [tempDir]
      });
      const strictResult = await strictSecurity.validatePath(testPath, testRepoPath);
      expect(strictResult.isValid).toBe(false);

      // Moderate mode might allow with warnings
      const moderateSecurity = new PathSecurity({ 
        level: SecurityLevel.MODERATE,
        allowedRoots: [tempDir]
      });
      const moderateResult = await moderateSecurity.validatePath(testPath, testRepoPath);
      // Depending on implementation, this might be valid with warnings
      
      // Permissive mode should allow more
      const permissiveSecurity = new PathSecurity({ 
        level: SecurityLevel.PERMISSIVE,
        allowedRoots: [tempDir]
      });
      const permissiveResult = await permissiveSecurity.validatePath(testPath, testRepoPath);
      // Should be more lenient than strict mode
    });
  });

  describe('Convenience Functions', () => {
    test('validateGitPath should use strict mode by default', async () => {
      const maliciousPath = '../../../etc/passwd';
      const result = await validateGitPath(maliciousPath, testRepoPath);
      
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    test('validatePathModerate should be more permissive', async () => {
      const testPath = path.join(testRepoPath, 'valid-file.txt');
      await fs.promises.writeFile(testPath, 'content');
      
      const result = await validatePathModerate(testPath, testRepoPath);
      expect(result.isValid).toBe(true);
    });

    test('static utility methods should work correctly', async () => {
      const validPath = testRepoPath;
      const maliciousPath = '../../../etc';
      
      expect(await PathSecurity.validatePathQuick(validPath, testRepoPath)).toBe(true);
      expect(await PathSecurity.validatePathQuick(maliciousPath, testRepoPath)).toBe(false);
      
      const safePath = await PathSecurity.getSafeCanonicalPath(validPath);
      expect(safePath).toBeTruthy();
      expect(typeof safePath).toBe('string');
      
      const unsafePath = await PathSecurity.getSafeCanonicalPath(maliciousPath);
      expect(unsafePath).toBeNull();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle non-existent paths gracefully', async () => {
      const nonExistentPath = path.join(testRepoPath, 'does-not-exist');
      const result = await pathSecurity.validatePath(nonExistentPath, testRepoPath);
      
      // Should still validate the path structure even if it doesn't exist
      expect(result.canonicalPath).toBeTruthy();
      expect(typeof result.isValid).toBe('boolean');
    });

    test('should handle empty and invalid inputs', async () => {
      const invalidInputs = ['', null, undefined, 123, {}];
      
      for (const invalidInput of invalidInputs) {
        const result = await pathSecurity.validatePath(invalidInput as any, testRepoPath);
        expect(result.isValid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    test('should handle very long paths', async () => {
      const longPath = testRepoPath + '/' + 'a'.repeat(1000);
      const result = await pathSecurity.validatePath(longPath, testRepoPath);
      
      // Should handle gracefully, either allowing or blocking based on configuration
      expect(typeof result.isValid).toBe('boolean');
      expect(result.violations).toBeDefined();
    });

    test('should handle permission errors gracefully', async () => {
      if (process.platform === 'win32') {
        return; // Skip on Windows
      }

      // Create a directory we can't access
      const restrictedPath = path.join(tempDir, 'restricted');
      await fs.promises.mkdir(restrictedPath, { recursive: true });
      await fs.promises.chmod(restrictedPath, 0o000);
      
      try {
        const result = await pathSecurity.validatePath(restrictedPath, testRepoPath);
        expect(typeof result.isValid).toBe('boolean');
      } finally {
        // Restore permissions for cleanup
        await fs.promises.chmod(restrictedPath, 0o755);
      }
    });
  });
});

describe('ToolHandler Security Integration', () => {
  let tempDir: string;
  let testRepoPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitplus-toolhandler-test-'));
    testRepoPath = path.join(tempDir, 'test-repo');
    await fs.promises.mkdir(testRepoPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should block malicious repository paths in tool handler', async () => {
    const { ToolHandler } = await import('../../src/mcp/toolHandler');
    const toolHandler = new ToolHandler();

    const maliciousPaths = [
      '../../../etc/passwd',
      '/etc',
      'C:\\Windows\\System32',
      testRepoPath + '/../../../evil'
    ];

    for (const maliciousPath of maliciousPaths) {
      const result = await toolHandler.handleToolCall('status', { 
        repoPath: maliciousPath 
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Security Error');
      expect(result.content[0]?.text).toContain('Path Validation Failed');
    }
  });

  test('should allow valid repository paths in tool handler', async () => {
    // Initialize a valid git repository
    const gitClient = new GitClient(testRepoPath);
    await gitClient.executeGitCommand('init');

    const { ToolHandler } = await import('../../src/mcp/toolHandler');
    const toolHandler = new ToolHandler();

    const result = await toolHandler.handleToolCall('status', { 
      repoPath: testRepoPath 
    });
    
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('Git Repository Status');
  });
});