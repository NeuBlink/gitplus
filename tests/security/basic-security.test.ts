import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { PathSecurity, SecurityLevel, validateGitPath } from '../../src/utils/pathSecurity';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Basic Path Security Tests', () => {
  let tempDir: string;
  let testRepoPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitplus-basic-security-'));
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

  test('should block basic directory traversal', async () => {
    const pathSecurity = new PathSecurity();
    const maliciousPath = '../../../etc/passwd';
    
    const result = await pathSecurity.validatePath(maliciousPath, testRepoPath);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test('should allow valid repository paths', async () => {
    const pathSecurity = new PathSecurity({
      allowedRoots: [tempDir]
    });
    
    const result = await pathSecurity.validatePath(testRepoPath, testRepoPath);
    
    expect(result.isValid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test('validateGitPath convenience function should work', async () => {
    const maliciousPath = '../../../etc';
    const result = await validateGitPath(maliciousPath, testRepoPath);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('dangerous pattern'))).toBe(true);
  });

  test('should detect null byte injection', async () => {
    const pathSecurity = new PathSecurity();
    const nullBytePath = testRepoPath + '\0';
    
    const result = await pathSecurity.validatePath(nullBytePath, testRepoPath);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.includes('dangerous pattern'))).toBe(true);
  });

  test('should block access to system directories', async () => {
    const pathSecurity = new PathSecurity();
    const systemPaths = ['/etc', '/var', 'C:\\Windows'];
    
    for (const systemPath of systemPaths) {
      const result = await pathSecurity.validatePath(systemPath, testRepoPath);
      expect(result.isValid).toBe(false);
    }
  });

  test('should handle different security levels', async () => {
    const strictSecurity = new PathSecurity({ level: SecurityLevel.STRICT });
    const moderateSecurity = new PathSecurity({ level: SecurityLevel.MODERATE });
    
    const testPath = path.join(testRepoPath, '..', 'sibling');
    await fs.promises.mkdir(testPath, { recursive: true });

    const strictResult = await strictSecurity.validatePath(testPath, testRepoPath);
    const moderateResult = await moderateSecurity.validatePath(testPath, testRepoPath);
    
    // Strict mode should be more restrictive
    expect(strictResult.isValid).toBe(false);
    // Both should have some form of validation
    expect(typeof moderateResult.isValid).toBe('boolean');
  });

  test('should maintain security log', async () => {
    const pathSecurity = new PathSecurity({ logSecurityEvents: true });
    
    await pathSecurity.validatePath('../../../etc', testRepoPath);
    
    const log = pathSecurity.getSecurityLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toHaveProperty('timestamp');
    expect(log[0]).toHaveProperty('level');
    expect(log[0]).toHaveProperty('message');
  });
});