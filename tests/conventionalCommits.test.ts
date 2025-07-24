import {
  validateConventionalCommit,
  formatConventionalCommit,
  detectBreakingChanges,
  suggestScope,
  detectCommitType,
  suggestImprovements,
  COMMIT_TYPES
} from '../src/utils/conventionalCommits';

describe('Conventional Commits Validation', () => {
  describe('validateConventionalCommit', () => {
    test('valid conventional commit messages', () => {
      const validMessages = [
        'feat: add user authentication',
        'fix: resolve login issue',
        'docs: update README',
        'style: fix indentation',
        'refactor: extract utility function',
        'test: add unit tests for auth',
        'chore: update dependencies',
        'feat(auth): add OAuth2 support',
        'fix(api): handle null responses',
        'feat!: breaking change to API',
        'feat(auth)!: remove legacy endpoints'
      ];

      validMessages.forEach(message => {
        const result = validateConventionalCommit(message);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('invalid conventional commit messages', () => {
      const invalidMessages = [
        '', // empty
        'invalid message', // no type
        'feat add feature', // missing colon
        'invalid: message', // invalid type
        'feat(): empty scope', // empty scope
        'feat: ', // empty description
      ];

      invalidMessages.forEach(message => {
        const result = validateConventionalCommit(message);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    test('breaking change detection', () => {
      const breakingMessages = [
        'feat!: breaking change',
        'feat(api)!: breaking API change',
        'fix!: breaking fix'
      ];

      breakingMessages.forEach(message => {
        const result = validateConventionalCommit(message);
        expect(result.valid).toBe(true);
        expect(result.parts?.breaking).toBe(true);
      });
    });

    test('scope validation warnings', () => {
      const messagesWithScopeIssues = [
        'feat(My Scope): message with spaces in scope',
        'feat(UPPERCASE): uppercase scope'
      ];

      messagesWithScopeIssues.forEach(message => {
        const result = validateConventionalCommit(message);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    test('description validation warnings', () => {
      const messagesWithDescriptionIssues = [
        'feat: This is a very long description that exceeds fifty characters and should trigger a warning',
        'feat: Description with period.',
        'feat: Added a feature', // past tense
        'feat: Adds a feature'   // present tense
      ];

      messagesWithDescriptionIssues.forEach(message => {
        const result = validateConventionalCommit(message);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe('formatConventionalCommit', () => {
    test('format basic commit', () => {
      const parts = {
        type: 'feat' as const,
        description: 'add user authentication',
        breaking: false
      };

      const result = formatConventionalCommit(parts);
      expect(result).toBe('feat: add user authentication');
    });

    test('format commit with scope', () => {
      const parts = {
        type: 'fix' as const,
        scope: 'auth',
        description: 'resolve login issue',
        breaking: false
      };

      const result = formatConventionalCommit(parts);
      expect(result).toBe('fix(auth): resolve login issue');
    });

    test('format breaking change commit', () => {
      const parts = {
        type: 'feat' as const,
        scope: 'api',
        description: 'remove legacy endpoints',
        breaking: true
      };

      const result = formatConventionalCommit(parts);
      expect(result).toBe('feat(api)!: remove legacy endpoints');
    });

    test('format commit with body and footer', () => {
      const parts = {
        type: 'feat' as const,
        description: 'add new feature',
        breaking: false,
        body: 'This is a detailed explanation of the feature.',
        footer: 'Closes #123'
      };

      const result = formatConventionalCommit(parts);
      expect(result).toBe('feat: add new feature\n\nThis is a detailed explanation of the feature.\n\nCloses #123');
    });
  });

  describe('detectBreakingChanges', () => {
    test('detect breaking changes in diff', () => {
      const breakingDiffs = [
        '-export function oldFunction() {}', // removed export
        '-export class OldClass {}', // removed class
        'BREAKING CHANGE: removed API endpoint', // explicit breaking change
        'version: "2.0.0"' // major version bump
      ];

      breakingDiffs.forEach(diff => {
        const result = detectBreakingChanges(diff, ['src/api.ts']);
        expect(result).toBe(true);
      });
    });

    test('detect non-breaking changes', () => {
      const nonBreakingDiffs = [
        '+export function newFunction() {}', // added export
        'fix: minor bug fix',
        'version: "1.2.3"' // minor/patch version
      ];

      nonBreakingDiffs.forEach(diff => {
        const result = detectBreakingChanges(diff, ['src/api.ts']);
        expect(result).toBe(false);
      });
    });
  });

  describe('suggestScope', () => {
    test('suggest scope from file paths', () => {
      const testCases = [
        { files: ['src/components/Button.tsx'], expected: 'components' },
        { files: ['src/api/users.ts'], expected: 'api' },
        { files: ['src/auth/login.ts'], expected: 'auth' },
        { files: ['docs/README.md'], expected: 'docs' },
        { files: ['src/utils/helpers.ts'], expected: 'utils' },
        { files: ['package.json'], expected: 'deps' },
        { files: ['webpack.config.js'], expected: 'build' },
        { files: ['.github/workflows/ci.yml'], expected: 'ci' },
        { files: ['src/components/Button.test.tsx'], expected: 'test' },
      ];

      testCases.forEach(({ files, expected }) => {
        const result = suggestScope(files);
        expect(result).toBe(expected);
      });
    });

    test('suggest most common scope for multiple files', () => {
      const files = [
        'src/components/Button.tsx',
        'src/components/Input.tsx',
        'src/utils/helpers.ts'
      ];

      const result = suggestScope(files);
      expect(result).toBe('components'); // Most common
    });

    test('return undefined for unrecognized files', () => {
      const files = ['random-file.xyz'];
      const result = suggestScope(files);
      expect(result).toBeUndefined();
    });
  });

  describe('detectCommitType', () => {
    test('detect test files', () => {
      const testFiles = [
        ['src/auth.test.ts'],
        ['src/__tests__/auth.js'],
        ['tests/auth.spec.ts']
      ];

      testFiles.forEach(files => {
        const result = detectCommitType(files, '');
        expect(result).toBe('test');
      });
    });

    test('detect documentation files', () => {
      const docFiles = [
        ['README.md'],
        ['docs/api.md'],
        ['CHANGELOG.txt']
      ];

      docFiles.forEach(files => {
        const result = detectCommitType(files, '');
        expect(result).toBe('docs');
      });
    });

    test('detect build files', () => {
      const buildFiles = [
        ['package.json'],
        ['webpack.config.js'],
        ['tsconfig.json'],
        ['babel.config.js']
      ];

      buildFiles.forEach(files => {
        const result = detectCommitType(files, '');
        expect(result).toBe('build');
      });
    });

    test('detect CI files', () => {
      const ciFiles = [
        ['.github/workflows/ci.yml'],
        ['.gitlab-ci.yml'],
        ['ci.yaml']
      ];

      ciFiles.forEach(files => {
        const result = detectCommitType(files, '');
        expect(result).toBe('ci');
      });
    });

    test('detect features from diff', () => {
      const featureDiff = '+function newFeature() {}';
      const result = detectCommitType(['src/api.ts'], featureDiff);
      expect(result).toBe('feat');
    });

    test('detect fixes from diff', () => {
      const fixDiff = 'fix the bug in authentication';
      const result = detectCommitType(['src/auth.ts'], fixDiff);
      expect(result).toBe('fix');
    });

    test('detect performance improvements', () => {
      const perfDiff = 'optimize performance by caching';
      const result = detectCommitType(['src/cache.ts'], perfDiff);
      expect(result).toBe('perf');
    });

    test('default to chore for unrecognized changes', () => {
      const result = detectCommitType(['unknown.file'], 'random changes');
      expect(result).toBe('chore');
    });
  });

  describe('suggestImprovements', () => {
    test('suggest improvements for invalid messages', () => {
      const invalidMessage = 'invalid message format';
      const suggestions = suggestImprovements(invalidMessage);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('conventional commit format'))).toBe(true);
    });

    test('suggest improvements for WIP commits', () => {
      const wipMessage = 'feat: WIP work in progress';
      const suggestions = suggestImprovements(wipMessage);
      expect(suggestions.some(s => s.includes('WIP'))).toBe(true);
    });

    test('suggest improvements for vague messages', () => {
      const vagueMessage = 'chore: minor updates';
      const suggestions = suggestImprovements(vagueMessage);
      expect(suggestions.some(s => s.includes('vague'))).toBe(true);
    });
  });

  describe('COMMIT_TYPES', () => {
    test('all commit types have descriptions', () => {
      const types = Object.keys(COMMIT_TYPES);
      expect(types.length).toBeGreaterThan(0);
      
      types.forEach(type => {
        expect(COMMIT_TYPES[type as keyof typeof COMMIT_TYPES]).toBeTruthy();
        expect(typeof COMMIT_TYPES[type as keyof typeof COMMIT_TYPES]).toBe('string');
      });
    });

    test('commit types match expected conventional commit types', () => {
      const expectedTypes = [
        'feat', 'fix', 'docs', 'style', 'refactor', 
        'perf', 'test', 'build', 'ci', 'chore'
      ];
      
      expectedTypes.forEach(type => {
        expect(COMMIT_TYPES).toHaveProperty(type);
      });
    });
  });
});

describe('Integration Tests', () => {
  describe('end-to-end commit message workflow', () => {
    test('validate and format complete workflow', () => {
      // Start with a basic commit
      const parts = {
        type: 'feat' as const,
        scope: 'auth',
        description: 'add OAuth2 login support',
        breaking: false,
        body: 'Implements OAuth2 authentication flow with Google and GitHub providers.',
        footer: 'Closes #123'
      };

      // Format the commit
      const formatted = formatConventionalCommit(parts);
      expect(formatted).toBe(
        'feat(auth): add OAuth2 login support\n\n' +
        'Implements OAuth2 authentication flow with Google and GitHub providers.\n\n' +
        'Closes #123'
      );

      // Validate the formatted commit
      const validation = validateConventionalCommit(formatted.split('\n')[0] || formatted);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.parts?.type).toBe('feat');
      expect(validation.parts?.scope).toBe('auth');
      expect(validation.parts?.breaking).toBe(false);
    });

    test('breaking change workflow', () => {
      const parts = {
        type: 'feat' as const,
        scope: 'api',
        description: 'remove deprecated endpoints',
        breaking: true,
        footer: 'BREAKING CHANGE: Removed /api/v1/legacy endpoints'
      };

      const formatted = formatConventionalCommit(parts);
      expect(formatted).toContain('feat(api)!: remove deprecated endpoints');

      const validation = validateConventionalCommit(formatted.split('\n')[0] || formatted);
      expect(validation.valid).toBe(true);
      expect(validation.parts?.breaking).toBe(true);
    });
  });

  describe('realistic file change scenarios', () => {
    test('new feature development', () => {
      const files = [
        'src/components/LoginForm.tsx',
        'src/hooks/useAuth.ts',
        'src/api/auth.ts'
      ];
      const diff = '+function authenticate() { /* new auth logic */ }';

      const type = detectCommitType(files, diff);
      const scope = suggestScope(files);
      const breaking = detectBreakingChanges(diff, files);

      expect(type).toBe('feat');
      expect(scope).toBe('components'); // Most common
      expect(breaking).toBe(false);
    });

    test('bug fix scenario', () => {
      const files = ['src/utils/validation.ts'];
      const diff = 'fix validation error in email regex';

      const type = detectCommitType(files, diff);
      const scope = suggestScope(files);

      expect(type).toBe('fix');
      expect(scope).toBe('utils');
    });

    test('documentation update', () => {
      const files = ['README.md', 'docs/api.md'];
      const diff = '+## New API Documentation';

      const type = detectCommitType(files, diff);
      const scope = suggestScope(files);

      expect(type).toBe('docs');
      expect(scope).toBe('docs');
    });

    test('build configuration changes', () => {
      const files = ['package.json', 'webpack.config.js'];
      const diff = '+  "new-dependency": "^1.0.0"';

      const type = detectCommitType(files, diff);
      const scope = suggestScope(files);

      expect(type).toBe('build');
      expect(scope).toBe('deps'); // package.json is matched first
    });
  });
});