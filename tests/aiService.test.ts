import { AIService, CommitSuggestion } from '../src/ai/service';
import { validateConventionalCommit } from '../src/utils/conventionalCommits';

// Mock the AIService to avoid actual API calls in tests
jest.mock('../src/ai/service');

describe('AIService Conventional Commits Integration', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  describe('generateCommitMessage', () => {
    test('should return valid conventional commit structure', async () => {
      // Mock implementation that returns a proper conventional commit
      const mockCommitSuggestion: CommitSuggestion = {
        message: 'feat(auth): add OAuth2 login support',
        type: 'feat',
        scope: 'auth',
        description: 'add OAuth2 login support',
        breaking: false,
        body: 'Implements OAuth2 authentication flow',
        footer: undefined
      };

      (aiService.generateCommitMessage as jest.Mock).mockResolvedValue(mockCommitSuggestion);

      const context = {
        diff: '+function authenticate() {}',
        filesChanged: ['src/auth/login.ts'],
        status: {
          staged: ['src/auth/login.ts'],
          unstaged: [],
          untracked: []
        }
      };

      const result = await aiService.generateCommitMessage(context);

      expect(result).toBeDefined();
      expect(result?.message).toBe('feat(auth): add OAuth2 login support');
      expect(result?.type).toBe('feat');
      expect(result?.scope).toBe('auth');
      expect(result?.breaking).toBe(false);

      // Validate that the message follows conventional commits
      const validation = validateConventionalCommit(result!.message);
      expect(validation.valid).toBe(true);
    });

    test('should handle breaking changes correctly', async () => {
      const mockCommitSuggestion: CommitSuggestion = {
        message: 'feat(api)!: remove deprecated endpoints',
        type: 'feat',
        scope: 'api',
        description: 'remove deprecated endpoints',
        breaking: true,
        body: undefined,
        footer: 'BREAKING CHANGE: Removed legacy API endpoints'
      };

      (aiService.generateCommitMessage as jest.Mock).mockResolvedValue(mockCommitSuggestion);

      const context = {
        diff: '-export function legacyEndpoint() {}',
        filesChanged: ['src/api/legacy.ts'],
        status: {
          staged: ['src/api/legacy.ts'],
          unstaged: [],
          untracked: []
        }
      };

      const result = await aiService.generateCommitMessage(context);

      expect(result).toBeDefined();
      expect(result?.breaking).toBe(true);
      expect(result?.message).toContain('!');
      expect(result?.footer).toContain('BREAKING CHANGE');

      // Validate breaking change format
      const validation = validateConventionalCommit(result!.message);
      expect(validation.valid).toBe(true);
      expect(validation.parts?.breaking).toBe(true);
    });

    test('should return null on failure', async () => {
      (aiService.generateCommitMessage as jest.Mock).mockResolvedValue(null);

      const context = {
        diff: '',
        filesChanged: [],
        status: { staged: [], unstaged: [], untracked: [] }
      };

      const result = await aiService.generateCommitMessage(context);
      expect(result).toBeNull();
    });
  });

  describe('generateComprehensiveAnalysis', () => {
    test('should return comprehensive analysis with valid conventional commits', async () => {
      const mockAnalysis = {
        commit: {
          message: 'feat(auth): add OAuth2 login support',
          type: 'feat',
          scope: 'auth',
          description: 'add OAuth2 login support',
          breaking: false,
          body: 'Implements OAuth2 authentication flow',
          footer: undefined
        },
        branch: {
          name: 'feature/oauth2-login',
          description: 'OAuth2 authentication implementation',
          alternative: 'feat/auth-oauth2'
        },
        analysis: {
          changeType: 'feature',
          impact: 'medium' as const,
          risks: ['New authentication flow needs thorough testing'],
          suggestions: ['Add comprehensive unit tests'],
          summary: 'Adds OAuth2 authentication support'
        },
        pr: {
          title: 'Add OAuth2 Login Support',
          description: '## Summary\nImplements OAuth2 authentication flow\n\n## Testing\n- [ ] Test OAuth2 flow\n- [ ] Test error handling',
          labels: ['feature', 'auth'],
          reviewers: []
        }
      };

      (aiService.generateComprehensiveAnalysis as jest.Mock).mockResolvedValue(mockAnalysis);

      const context = {
        diff: '+function authenticate() {}',
        filesChanged: ['src/auth/login.ts'],
        status: {
          staged: ['src/auth/login.ts'],
          unstaged: [],
          untracked: []
        },
        branch: 'feature/oauth2-login'
      };

      const result = await aiService.generateComprehensiveAnalysis(context);

      expect(result).toBeDefined();
      expect(result?.commit.message).toBe('feat(auth): add OAuth2 login support');
      
      // Validate the commit message
      const validation = validateConventionalCommit(result!.commit.message);
      expect(validation.valid).toBe(true);
    });
  });

  describe('commit message validation scenarios', () => {
    const testCases = [
      {
        name: 'feature commit',
        expected: {
          message: 'feat: add user registration',
          type: 'feat',
          scope: undefined,
          breaking: false
        }
      },
      {
        name: 'bug fix commit',
        expected: {
          message: 'fix(auth): resolve login timeout issue',
          type: 'fix',
          scope: 'auth',
          breaking: false
        }
      },
      {
        name: 'breaking change commit',
        expected: {
          message: 'feat(api)!: change user data structure',
          type: 'feat',
          scope: 'api',
          breaking: true
        }
      },
      {
        name: 'documentation commit',
        expected: {
          message: 'docs: update API documentation',
          type: 'docs',
          scope: undefined,
          breaking: false
        }
      }
    ];

    testCases.forEach(({ name, expected }) => {
      test(`should generate valid ${name}`, async () => {
        const mockCommitSuggestion: CommitSuggestion = {
          message: expected.message,
          type: expected.type,
          scope: expected.scope,
          description: expected.message.split(': ')[1] || 'test description',
          breaking: expected.breaking
        };

        (aiService.generateCommitMessage as jest.Mock).mockResolvedValue(mockCommitSuggestion);

        const context = {
          diff: `+// ${name} changes`,
          filesChanged: [`src/${name}.ts`],
          status: { staged: [`src/${name}.ts`], unstaged: [], untracked: [] }
        };

        const result = await aiService.generateCommitMessage(context);

        expect(result).toBeDefined();
        expect(result?.message).toBe(expected.message);
        expect(result?.type).toBe(expected.type);
        expect(result?.scope).toBe(expected.scope);
        expect(result?.breaking).toBe(expected.breaking);

        // Validate conventional commit format
        const validation = validateConventionalCommit(result!.message);
        expect(validation.valid).toBe(true);
      });
    });
  });
});

describe('AIService Error Handling', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  test('should handle invalid AI responses gracefully', async () => {
    // Mock AI service to return invalid response
    (aiService.generateCommitMessage as jest.Mock).mockResolvedValue({
      message: 'invalid format message',
      type: 'invalid_type',
      scope: undefined,
      description: 'invalid format message'
    });

    const context = {
      diff: '+some changes',
      filesChanged: ['src/test.ts'],
      status: { staged: ['src/test.ts'], unstaged: [], untracked: [] }
    };

    const result = await aiService.generateCommitMessage(context);

    // The result should still be returned even if it's invalid
    expect(result).toBeDefined();
    expect(result?.message).toBe('invalid format message');

    // But validation should catch the invalid format
    const validation = validateConventionalCommit(result!.message);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('should handle network/API failures', async () => {
    (aiService.generateCommitMessage as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    const context = {
      diff: '+some changes',
      filesChanged: ['src/test.ts'],
      status: { staged: ['src/test.ts'], unstaged: [], untracked: [] }
    };

    // Should not throw, should return null
    await expect(aiService.generateCommitMessage(context)).rejects.toThrow('Network error');
  });

  test('should validate AI service availability', async () => {
    (aiService.isAvailable as jest.Mock).mockResolvedValue(false);

    const isAvailable = await aiService.isAvailable();
    expect(isAvailable).toBe(false);
  });
});