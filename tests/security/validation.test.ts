import { GitClient } from '../../src/git/client';
import { describe, test, expect, beforeEach } from '@jest/globals';

describe('Security - Input Validation Edge Cases', () => {
  let gitClient: GitClient;

  beforeEach(() => {
    gitClient = new GitClient('/tmp/test-repo');
  });

  describe('Edge Case Validations', () => {
    test('should handle unicode and special characters safely', async () => {
      const unicodeInputs = [
        'feat: add 🚀 rocket feature',
        'fix: résoudre problème français',
        'docs: 中文文档更新',
        'test: тест с русскими символами',
      ];

      // These should be allowed (safe unicode)
      for (const input of unicodeInputs) {
        await expect(gitClient.commit(input)).resolves.not.toThrow();
      }
    });

    test('should reject control characters in inputs', async () => {
      const controlCharInputs = [
        'feat: add feature\x01',
        'fix: resolve\x0e issue',
        'test: feature\x7f testing',
        'docs: update\x1b documentation',
      ];

      for (const input of controlCharInputs) {
        await expect(gitClient.commit(input)).rejects.toThrow(/control characters/i);
      }
    });

    test('should validate empty and whitespace-only inputs', async () => {
      const emptyInputs = ['', '   ', '\t\t', '\n\n', '   \t  \n  '];

      for (const input of emptyInputs) {
        await expect(gitClient.commit(input)).rejects.toThrow(/empty|cannot be empty/i);
      }
    });

    test('should handle path traversal variations', async () => {
      const traversalPaths = [
        'normal/../../../etc/passwd',
        'file\\..\\..\\windows\\system32',
        'folder/./../../secret.txt',
        '..\\folder\\..\\..\\evil.bat',
        'good/path/../../../../../root/',
      ];

      for (const path of traversalPaths) {
        await expect(gitClient.add([path])).rejects.toThrow(
          /directory traversal|outside working directory/i
        );
      }
    });

    test('should prevent various encoding bypass attempts', async () => {
      const encodingBypass = [
        'normal%2E%2E%2Fetc%2Fpasswd', // URL encoded ../
        'file\\u002E\\u002E\\u002Froot', // Unicode encoded ../
        'path\x2E\x2E\x2Fsecret', // Hex encoded ../
      ];

      for (const path of encodingBypass) {
        await expect(gitClient.add([path])).rejects.toThrow();
      }
    });

    test('should validate git reference names', async () => {
      const invalidRefs = [
        'refs/../../../evil',
        'heads/master;evil',
        'origin/main$(malicious)',
        'tags/v1.0.0|danger',
      ];

      for (const ref of invalidRefs) {
        await expect(gitClient.checkout(ref)).rejects.toThrow();
      }
    });

    test('should handle type confusion attacks', async () => {
      const nonStringInputs = [
        123 as any,
        { toString: () => 'evil; rm -rf /' } as any,
        ['array', 'injection'] as any,
        null as any,
        undefined as any,
        true as any,
      ];

      for (const input of nonStringInputs) {
        await expect(gitClient.commit(input)).rejects.toThrow(/must be a string/i);
      }
    });

    test('should prevent prototype pollution attempts', async () => {
      const pollutionAttempts = [
        '__proto__.polluted',
        'constructor.prototype.evil',
        'Object.prototype.injected',
      ];

      for (const attempt of pollutionAttempts) {
        await expect(gitClient.add([attempt])).rejects.toThrow();
      }
    });

    test('should handle malformed git command combinations', async () => {
      const malformedCommands = [
        'add;rm -rf /',
        'commit --amend;evil',
        'push --force;malicious',
        'branch -D;dangerous',
      ];

      for (const command of malformedCommands) {
        await expect(gitClient.executeGitCommand(command)).rejects.toThrow(
          /shell metacharacters|command not allowed/i
        );
      }
    });

    test('should validate numerical inputs properly', async () => {
      // Test stash indices
      const badIndices = [
        '1; rm -rf /',
        '$(evil)',
        '1 && malicious',
        '1|danger',
      ];

      for (const index of badIndices) {
        await expect(gitClient.stash({ 
          pop: true, 
          stashIndex: parseInt(index) // Should fail validation even if parseInt succeeds
        })).rejects.toThrow();
      }
    });

    test('should prevent command chaining through options', async () => {
      const chainedOptions = [
        '--message="test"; rm -rf /',
        '--author="evil$(malicious)"',
        '--date="2023-01-01; evil"',
      ];

      // These should not reach the command level due to validation
      for (const option of chainedOptions) {
        await expect(gitClient.commit(option)).rejects.toThrow();
      }
    });

    test('should handle binary and non-UTF8 data', async () => {
      const binaryData = [
        Buffer.from([0x00, 0x01, 0x02, 0xFF]).toString('binary'),
        '\xFF\xFE\x00\x00invalid utf8',
        String.fromCharCode(0xD800), // Invalid unicode surrogate
      ];

      for (const data of binaryData) {
        await expect(gitClient.commit(data)).rejects.toThrow();
      }
    });

    test('should validate file glob patterns safely', async () => {
      const dangerousGlobs = [
        '../../../*',
        '$(find / -name "*.key")',
        '*; rm -rf /',
        '*.txt && evil',
      ];

      for (const glob of dangerousGlobs) {
        await expect(gitClient.add([glob])).rejects.toThrow();
      }
    });

    test('should prevent injection through git hooks simulation', async () => {
      const hookSimulation = [
        '.git/hooks/pre-commit',
        '.git/config',
        '.git/../../../etc/passwd',
        '../.git/hooks/post-receive',
      ];

      for (const hook of hookSimulation) {
        await expect(gitClient.add([hook])).rejects.toThrow();
      }
    });

    test('should validate remote URLs safely', async () => {
      // Note: These tests would apply if we had remote URL validation
      const dangerousUrls = [
        'git://malicious.com/repo;evil',
        'https://evil.com/repo$(injection)',
        'ssh://user@host/repo|danger',
      ];

      // For future implementation when remote URL validation is added
      // Currently focusing on argument validation
    });

    test('should handle extremely long inputs gracefully', async () => {
      const veryLongInput = 'a'.repeat(10000);
      
      await expect(gitClient.commit(veryLongInput)).rejects.toThrow(/maximum length/i);
      await expect(gitClient.add([veryLongInput])).rejects.toThrow(/maximum length/i);
      await expect(gitClient.createBranch(veryLongInput)).rejects.toThrow(/maximum length/i);
    });

    test('should prevent injection through concatenated arguments', async () => {
      const concatenatedArgs = [
        'file1.txt file2.txt; rm -rf /',
        'normal.txt" ; malicious ; echo "',
        'file1.txt $(evil_command) file2.txt',
      ];

      for (const args of concatenatedArgs) {
        await expect(gitClient.add([args])).rejects.toThrow();
      }
    });
  });

  describe('Resource Protection', () => {
    test('should limit recursive operations', async () => {
      // Test that we don't allow patterns that could cause infinite recursion
      const recursivePatterns = [
        '**/**/infinite',
        '*/*/*/*/*/*/*/*/*/*/*/*/*', // Very deep nesting
        Array(1000).fill('*').join('/'), // Extremely deep path
      ];

      for (const pattern of recursivePatterns) {
        await expect(gitClient.add([pattern])).rejects.toThrow();
      }
    });

    test('should prevent memory exhaustion through large inputs', async () => {
      // Test arrays with many items
      const manyItems = Array(10000).fill('file.txt');
      
      // Should handle gracefully without memory issues
      await expect(gitClient.add(manyItems)).resolves.not.toThrow();
      
      // But should validate each item
      const manyDangerousItems = Array(100).fill('../../../evil.txt');
      await expect(gitClient.add(manyDangerousItems)).rejects.toThrow();
    });
  });

  describe('Platform-Specific Security', () => {
    test('should handle Windows-specific injection patterns', async () => {
      const windowsInjection = [
        'file.txt & del /f /q C:\\*',
        'normal.txt | format C:',
        'path\\..\\..\\..\\Windows\\System32',
        'file.txt && shutdown /s /t 0',
      ];

      for (const injection of windowsInjection) {
        await expect(gitClient.add([injection])).rejects.toThrow();
      }
    });

    test('should handle Unix-specific injection patterns', async () => {
      const unixInjection = [
        'file.txt; rm -rf /',
        'normal.txt | sudo rm -rf /',
        'path/../../../etc/shadow',
        'file.txt && chmod 777 /',
      ];

      for (const injection of unixInjection) {
        await expect(gitClient.add([injection])).rejects.toThrow();
      }
    });
  });
});