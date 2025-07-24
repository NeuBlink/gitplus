import { GitClient } from '../../src/git/client';
import { Platform } from '../../src/types';

// Mock the child_process module
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('GitClient', () => {
  let gitClient: GitClient;

  beforeEach(() => {
    gitClient = new GitClient();
    jest.clearAllMocks();
  });

  describe('GitClient functionality', () => {
    it('should be instantiable', () => {
      expect(gitClient).toBeInstanceOf(GitClient);
    });

    it('should have required methods', () => {
      expect(typeof gitClient.isGitRepository).toBe('function');
      expect(typeof gitClient.getStatus).toBe('function');
      expect(typeof gitClient.getCurrentBranch).toBe('function');
      expect(typeof gitClient.getRemoteURL).toBe('function');
    });
  });

  describe('detectPlatform', () => {
    it('should detect GitHub from github.com URL', () => {
      // Access private method for testing
      const platform = (gitClient as any).detectPlatform('https://github.com/user/repo.git');
      expect(platform).toBe(Platform.GitHub);
    });

    it('should detect GitLab from gitlab.com URL', () => {
      const platform = (gitClient as any).detectPlatform('https://gitlab.com/user/repo.git');
      expect(platform).toBe(Platform.GitLab);
    });

    it('should default to LocalOnly for unknown URLs', () => {
      const platform = (gitClient as any).detectPlatform('https://example.com/user/repo.git');
      expect(platform).toBe(Platform.LocalOnly);
    });

    it('should default to LocalOnly for empty URL', () => {
      const platform = (gitClient as any).detectPlatform('');
      expect(platform).toBe(Platform.LocalOnly);
    });
  });
});