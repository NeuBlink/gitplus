import { PlatformManager } from '../../src/git/platform';
import { Platform } from '../../src/types';
import { EventEmitter } from 'events';

// Mock the child_process module  
jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn(),
}));

const { spawn: mockSpawn } = require('child_process');

// Helper to create a mock child process
function createMockChildProcess(stdout: string = '', stderr: string = '', exitCode: number = 0, shouldError: boolean = false) {
  const mockChild = new EventEmitter();
  (mockChild as any).stdout = new EventEmitter();
  (mockChild as any).stderr = new EventEmitter();
  (mockChild as any).kill = jest.fn();

  // Simulate async behavior
  setTimeout(() => {
    if (shouldError) {
      mockChild.emit('error', new Error('Command not found'));
    } else {
      if (stdout) {
        (mockChild as any).stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        (mockChild as any).stderr.emit('data', Buffer.from(stderr));
      }
      mockChild.emit('close', exitCode);
    }
  }, 10);

  return mockChild;
}

describe('PlatformManager', () => {
  let platformManager: PlatformManager;

  describe('GitHub Platform', () => {
    beforeEach(() => {
      platformManager = new PlatformManager(Platform.GitHub, 'https://github.com/user/repo.git', '/test/repo');
      jest.clearAllMocks();
      mockSpawn.mockClear();
    });

    it('should report GitHub CLI capabilities when available', async () => {
      mockSpawn.mockImplementation((executable: string, args: string[]) => {
        if (executable === 'gh' && args.includes('--version')) {
          return createMockChildProcess('gh version 2.0.0', '', 0);
        } else if (executable === 'gh' && args.includes('auth') && args.includes('status')) {
          // Mock successful authentication - gh auth status outputs to stderr
          return createMockChildProcess('', 'Logged in to github.com as user', 0);
        }
        return createMockChildProcess('', '', 1, true);
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(true);
      expect(capabilities.requiresAuth).toBe(true);
    }, 15000);

    it('should report no capabilities when GitHub CLI unavailable', async () => {
      mockSpawn.mockImplementation(() => {
        return createMockChildProcess('', '', 1, true);
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(false);
    });
  });

  describe('GitLab Platform', () => {
    beforeEach(() => {
      platformManager = new PlatformManager(Platform.GitLab, 'https://gitlab.com/user/repo.git', '/test/repo');
      jest.clearAllMocks();
      mockSpawn.mockClear();
    });

    it('should report GitLab CLI capabilities when available', async () => {
      mockSpawn.mockImplementation((executable: string, args: string[]) => {
        if (executable === 'glab' && args.includes('--version')) {
          return createMockChildProcess('glab version 1.0.0', '', 0);
        } else if (executable === 'glab' && args.includes('auth') && args.includes('status')) {
          // Mock successful authentication - glab auth status outputs to stderr
          return createMockChildProcess('', 'You are currently logged in as user. Your access token is active.', 0);
        }
        return createMockChildProcess('', '', 1, true);
      });

      const capabilities = await platformManager.getCapabilities();
      
      expect(capabilities.canCreatePR).toBe(true);
      expect(capabilities.requiresAuth).toBe(true);
    }, 15000);
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