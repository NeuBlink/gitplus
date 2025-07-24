import { PlatformManager } from '../../src/git/platform';
import { Platform } from '../../src/types';

// Mock the child_process module
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('PlatformManager', () => {
  let platformManager: PlatformManager;

  describe('GitHub Platform', () => {
    beforeEach(() => {
      platformManager = new PlatformManager(Platform.GitHub, 'https://github.com/user/repo.git', '/test/repo');
      jest.clearAllMocks();
    });

    it('should report GitHub CLI capabilities when available', async () => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd: string, options: any, callback: Function) => {
        if (typeof options === 'function') {
          callback = options;
        }
        if (cmd.includes('gh --version')) {
          callback(null, { stdout: 'gh version 2.0.0', stderr: '' });
        }
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(true);
      expect(capabilities.requiresAuth).toBe(true);
    });

    it('should report no capabilities when GitHub CLI unavailable', async () => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd: string, options: any, callback: Function) => {
        if (typeof options === 'function') {
          callback = options;
        }
        callback(new Error('Command not found'));
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(false);
    });
  });

  describe('GitLab Platform', () => {
    beforeEach(() => {
      platformManager = new PlatformManager(Platform.GitLab, 'https://gitlab.com/user/repo.git', '/test/repo');
      jest.clearAllMocks();
    });

    it('should report GitLab CLI capabilities when available', async () => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd: string, options: any, callback: Function) => {
        if (typeof options === 'function') {
          callback = options;
        }
        if (cmd.includes('glab --version')) {
          callback(null, { stdout: 'glab version 1.0.0', stderr: '' });
        }
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(true);
      expect(capabilities.requiresAuth).toBe(true);
    });
  });

  describe('LocalOnly Platform', () => {
    beforeEach(() => {
      platformManager = new PlatformManager(Platform.LocalOnly, '', '/test/repo');
    });

    it('should report no capabilities for local-only repositories', async () => {
      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(false);
      expect(capabilities.canListPRs).toBe(false);
      expect(capabilities.canMergePR).toBe(false);
      expect(capabilities.requiresAuth).toBe(false);
    });
  });
});