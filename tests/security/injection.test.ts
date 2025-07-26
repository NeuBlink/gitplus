import { GitClient } from '../../src/git/client';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { spawn } from 'child_process';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('Security - Shell Injection Prevention', () => {
  let gitClient: GitClient;
  let mockProcess: any;

  beforeEach(() => {
    gitClient = new GitClient('/tmp/test-repo');
    
    // Mock process for spawn
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
    };
    
    mockSpawn.mockReturnValue(mockProcess as any);
    
    // Setup default successful response
    mockProcess.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10);
      }
    });
  });

  describe('Input Validation', () => {
    test('should reject commit messages with shell metacharacters', async () => {
      const dangerousMessages = [
        'fix: something; rm -rf /',
        'feat: add $(malicious command)',
        'test: feature & evil command',
        'docs: update | rm -rf .',
        'style: format `dangerous code`',
        'refactor: improve <script>alert(1)</script>',
      ];

      for (const message of dangerousMessages) {
        await expect(gitClient.commit(message)).rejects.toThrow(
          /shell metacharacters|dangerous characters/i
        );
      }
    });

    test('should reject file paths with directory traversal', async () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'normal/../../evil.txt',
        '/etc/shadow',
        '$(pwd)/../evil.sh',
      ];

      for (const path of dangerousPaths) {
        await expect(gitClient.add([path])).rejects.toThrow(
          /directory traversal|shell metacharacters|outside working directory/i
        );
      }
    });

    test('should reject branch names with injection patterns', async () => {
      const dangerousBranches = [
        'feature; rm -rf /',
        'hotfix && evil_command',
        'branch-$(malicious)',
        'fix|dangerous',
        'feature`backdoor`',
      ];

      for (const branch of dangerousBranches) {
        await expect(gitClient.createBranch(branch)).rejects.toThrow(
          /shell metacharacters|dangerous characters/i
        );
      }
    });

    test('should validate stash message input', async () => {
      const dangerousStashMessages = [
        'WIP; rm -rf /',
        'temp work $(evil)',
        'progress & danger',
        'stash | malicious',
      ];

      for (const message of dangerousStashMessages) {
        await expect(gitClient.stash({ message })).rejects.toThrow(
          /shell metacharacters|dangerous characters/i
        );
      }
    });

    test('should reject null bytes in arguments', async () => {
      const nullByteInputs = [
        'normal\x00injection',
        'file.txt\x00; rm -rf /',
        'branch\x00evil',
      ];

      for (const input of nullByteInputs) {
        await expect(gitClient.commit(input)).rejects.toThrow(/null byte/i);
        await expect(gitClient.add([input])).rejects.toThrow(/null byte/i);
        await expect(gitClient.createBranch(input)).rejects.toThrow(/null byte/i);
      }
    });

    test('should enforce argument length limits', async () => {
      const longMessage = 'a'.repeat(3000); // Exceeds 2048 char limit
      const longFilePath = 'a'.repeat(5000); // Exceeds 4096 char limit
      const longBranch = 'a'.repeat(300); // Exceeds 255 char limit

      await expect(gitClient.commit(longMessage)).rejects.toThrow(/maximum length/i);
      await expect(gitClient.add([longFilePath])).rejects.toThrow(/maximum length/i);
      await expect(gitClient.createBranch(longBranch)).rejects.toThrow(/maximum length/i);
    });
  });

  describe('Command Execution Security', () => {
    test('should reject non-whitelisted git commands', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'config core.editor "evil script"',
        'format-patch --stdout',
        'daemon --base-path=/',
        'upload-pack',
      ];

      for (const command of dangerousCommands) {
        await expect(gitClient.executeGitCommand(command)).rejects.toThrow(
          /command not allowed/i
        );
      }
    });

    test('should use spawn with argument arrays, not shell execution', async () => {
      // Test that spawn is called with proper argument separation
      await gitClient.commit('feat: secure commit').catch(() => {}); // Ignore errors for this test

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'feat: secure commit'],
        expect.any(Object)
      );
    });

    test('should properly escape file paths in spawn calls', async () => {
      const fileWithSpaces = 'file with spaces.txt';
      await gitClient.add([fileWithSpaces]).catch(() => {});

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['add', fileWithSpaces], // Should be separate argument, not concatenated string
        expect.any(Object)
      );
    });

    test('should validate stash index ranges', async () => {
      const invalidIndices = [-1, 1000, 1.5, NaN, Infinity];

      for (const index of invalidIndices) {
        await expect(gitClient.stash({ pop: true, stashIndex: index })).rejects.toThrow(
          /invalid stash index/i
        );
      }
    });

    test('should validate diff context lines', async () => {
      const invalidContextLines = [-1, 101, 1.5, NaN, Infinity];

      for (const contextLines of invalidContextLines) {
        await expect(gitClient.getDiff({ contextLines })).rejects.toThrow(
          /invalid context lines/i
        );
      }
    });

    test('should validate commit history limits', async () => {
      const invalidLimits = [0, 1001, -1, 1.5, NaN, Infinity];

      for (const limit of invalidLimits) {
        await expect(gitClient.getCommitHistory(limit)).rejects.toThrow(
          /invalid commit history limit/i
        );
      }
    });
  });

  describe('Argument Injection Prevention', () => {
    test('should prevent argument injection via dash prefixes', async () => {
      const dashArguments = [
        '--help',
        '-rf',
        '--exec=evil',
        '-m malicious',
      ];

      for (const arg of dashArguments) {
        await expect(gitClient.add([arg])).rejects.toThrow(
          /starts with dash|option injection/i
        );
      }
    });

    test('should handle complex injection attempts', async () => {
      const complexInjections = [
        "normal'; rm -rf /; echo 'done",
        'file.txt"; malicious_command; echo "',
        "path$(rm -rf /)path",
        'name&& dangerous_command',
        "input`evil command`suffix",
      ];

      for (const injection of complexInjections) {
        await expect(gitClient.add([injection])).rejects.toThrow();
        await expect(gitClient.commit(injection)).rejects.toThrow();
        await expect(gitClient.createBranch(injection)).rejects.toThrow();
      }
    });
  });

  describe('Safe Operations', () => {
    test('should allow legitimate commit messages', async () => {
      const safeMessages = [
        'feat: add user authentication',
        'fix: resolve merge conflict in package.json',
        'docs: update README with installation steps',
        'test: add unit tests for validation logic',
        'refactor: improve error handling',
      ];

      for (const message of safeMessages) {
        await expect(gitClient.commit(message)).resolves.not.toThrow();
      }
    });

    test('should allow legitimate file paths', async () => {
      const safePaths = [
        'src/index.ts',
        'docs/README.md',
        'tests/unit/security.test.ts',
        'package.json',
        '.gitignore',
        'folder/subfolder/file.txt',
      ];

      for (const path of safePaths) {
        await expect(gitClient.add([path])).resolves.not.toThrow();
      }
    });

    test('should allow legitimate branch names', async () => {
      const safeBranches = [
        'feature/user-auth',
        'hotfix/security-patch',
        'release/v1.2.3',
        'bugfix/login-issue',
        'feature-123',
        'main',
        'develop',
      ];

      for (const branch of safeBranches) {
        await expect(gitClient.createBranch(branch)).resolves.not.toThrow();
      }
    });
  });

  describe('Timeout and Resource Protection', () => {
    test('should enforce command timeouts', async () => {
      // Mock a long-running process
      const longRunningProcess = {
        ...mockProcess,
        on: jest.fn(),
        kill: jest.fn(),
      };

      mockSpawn.mockReturnValueOnce(longRunningProcess as any);

      // Don't call the close callback to simulate timeout
      longRunningProcess.on.mockImplementation((event: string, callback: Function) => {
        // Don't call callback for 'close' event to simulate hanging
      });

      const promise = gitClient.commit('test: timeout');

      // Should timeout after 30 seconds (mocked)
      await expect(promise).rejects.toThrow(/timed out/i);
    });

    test('should limit batch operation sizes', async () => {
      // Test with reasonable batch size
      const manyFiles = Array.from({ length: 100 }, (_, i) => `file${i}.txt`);
      await expect(gitClient.add(manyFiles)).resolves.not.toThrow();

      // Ensure batching is used (multiple spawn calls for large file sets)
      expect(mockSpawn).toHaveBeenCalledTimes(2); // 100 files / 50 batch size = 2 calls
    });
  });
});