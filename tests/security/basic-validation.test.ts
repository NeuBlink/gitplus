import { GitClient } from '../../src/git/client';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock child_process spawn to avoid actual git calls during testing
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10);
      }
    }),
    kill: jest.fn(),
  })),
}));

describe('Security - Basic Input Validation', () => {
  let gitClient: GitClient;

  beforeEach(() => {
    gitClient = new GitClient('/tmp/test-repo');
  });

  describe('Shell Injection Prevention', () => {
    test('should reject commit messages with semicolons', async () => {
      await expect(gitClient.commit('feat: add feature; rm -rf /')).rejects.toThrow();
    });

    test('should reject commit messages with backticks', async () => {
      await expect(gitClient.commit('fix: resolve `malicious command`')).rejects.toThrow();
    });

    test('should reject commit messages with dollar signs', async () => {
      await expect(gitClient.commit('test: check $(evil command)')).rejects.toThrow();
    });

    test('should reject file paths with directory traversal', async () => {
      await expect(gitClient.add(['../../../etc/passwd'])).rejects.toThrow();
    });

    test('should reject branch names with pipes', async () => {
      await expect(gitClient.createBranch('feature | dangerous')).rejects.toThrow();
    });

    test('should reject stash messages with ampersands', async () => {
      await expect(gitClient.stash({ message: 'work & evil command' })).rejects.toThrow();
    });
  });

  describe('Valid Inputs', () => {
    test('should accept normal commit messages', async () => {
      await expect(gitClient.commit('feat: add user authentication')).resolves.not.toThrow();
    });

    test('should accept normal file paths', async () => {
      await expect(gitClient.add(['src/index.ts'])).resolves.not.toThrow();
    });

    test('should accept normal branch names', async () => {
      await expect(gitClient.createBranch('feature/user-auth')).resolves.not.toThrow();
    });

    test('should accept normal stash messages', async () => {
      await expect(gitClient.stash({ message: 'WIP: working on feature' })).resolves.not.toThrow();
    });
  });

  describe('Length Validation', () => {
    test('should reject extremely long commit messages', async () => {
      const longMessage = 'a'.repeat(3000);
      await expect(gitClient.commit(longMessage)).rejects.toThrow(/maximum length/i);
    });

    test('should reject extremely long file paths', async () => {
      const longPath = 'a'.repeat(5000);
      await expect(gitClient.add([longPath])).rejects.toThrow(/maximum length/i);
    });

    test('should reject extremely long branch names', async () => {
      const longBranch = 'a'.repeat(300);
      await expect(gitClient.createBranch(longBranch)).rejects.toThrow(/maximum length/i);
    });
  });

  describe('Type Validation', () => {
    test('should reject non-string commit messages', async () => {
      await expect(gitClient.commit(123 as any)).rejects.toThrow(/must be a string/i);
      await expect(gitClient.commit(null as any)).rejects.toThrow(/must be a string/i);
      await expect(gitClient.commit(undefined as any)).rejects.toThrow(/must be a string/i);
    });

    test('should reject empty commit messages', async () => {
      await expect(gitClient.commit('')).rejects.toThrow(/empty/i);
      await expect(gitClient.commit('   ')).rejects.toThrow(/empty/i);
    });
  });

  describe('Command Whitelisting', () => {
    test('should reject dangerous git commands', async () => {
      await expect(gitClient.executeGitCommand('rm -rf /')).rejects.toThrow(/command not allowed/i);
      await expect(gitClient.executeGitCommand('config core.editor "evil"')).rejects.toThrow(/command not allowed/i);
      await expect(gitClient.executeGitCommand('daemon --base-path=/')).rejects.toThrow(/command not allowed/i);
    });

    test('should allow safe git commands', async () => {
      await expect(gitClient.executeGitCommand('status')).resolves.not.toThrow();
      await expect(gitClient.executeGitCommand('log --oneline')).resolves.not.toThrow();
      await expect(gitClient.executeGitCommand('diff --cached')).resolves.not.toThrow();
    });
  });
});