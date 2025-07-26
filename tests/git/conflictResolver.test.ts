import { ConflictResolver } from '../../src/git/conflictResolver';
import { GitClient } from '../../src/git/client';
import { AIService } from '../../src/ai/service';

// Mock the modules
jest.mock('../../src/git/client');
jest.mock('../../src/ai/service');

describe('ConflictResolver', () => {
  let conflictResolver: ConflictResolver;
  let mockGitClient: jest.Mocked<GitClient>;
  let mockAIService: jest.Mocked<AIService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockGitClient = new GitClient() as jest.Mocked<GitClient>;
    mockAIService = new AIService() as jest.Mocked<AIService>;
    
    // Mock AIService constructor to return our mock
    (AIService as jest.MockedClass<typeof AIService>).mockImplementation(() => mockAIService);
    
    // Create conflict resolver instance
    conflictResolver = new ConflictResolver(mockGitClient);
  });

  describe('resolvePRConflicts', () => {
    it('should handle no conflicts scenario', async () => {
      // Mock successful fetch and merge without conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      mockGitClient.merge.mockResolvedValue(undefined);

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.hasConflicts).toBe(false);
      expect(result.resolved).toBe(true);
      expect(result.steps).toContain('🔍 Checking for PR merge conflicts...');
      expect(result.steps).toContain('✅ PR has no conflicts with base branch');
    });

    it('should handle conflicts with successful AI resolution', async () => {
      // Mock successful fetch but merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts', 'file2.ts']);

      // Mock AI availability and successful resolution via gitClient.resolveConflicts
      mockAIService.isAvailable.mockResolvedValue(true);
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: true,
        resolvedFiles: ['file1.ts', 'file2.ts'],
        remainingConflicts: [],
        confidence: 85,
        reasoning: 'Simple merge conflicts in configuration files',
        warnings: ['Manual review recommended for file2.ts']
      });
      
      // Mock successful merge continuation and push
      mockGitClient.continueMerge.mockResolvedValue(undefined);
      mockGitClient.push.mockResolvedValue(undefined);

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.hasConflicts).toBe(true);
      expect(result.resolved).toBe(true); // Fully resolved since success: true
      expect(result.steps).toContain('⚠️ PR has conflicts with main (2 files)');
      expect(result.steps).toContain('✅ AI resolved 2 conflicts (85% confidence)');
    });

    it('should handle edge case: AI service unavailable', async () => {
      // Mock fetch and merge with conflicts  
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict detected');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['critical.ts']);

      // Mock AI service unavailable
      mockAIService.isAvailable.mockResolvedValue(false);

      const result1 = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result1.hasConflicts).toBe(true);
      expect(result1.resolved).toBe(false);
      expect(result1.error).toBe('AI resolution unavailable');
      
      // Reset mocks for second test - now mock 2 files for consistency
      jest.clearAllMocks();
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts', 'file2.ts']);
      mockAIService.isAvailable.mockResolvedValue(true);

      // Mock successful conflict resolution
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: true,
        resolvedFiles: ['file1.ts', 'file2.ts'],
        remainingConflicts: [],
        confidence: 95,
        reasoning: 'Changes are compatible',
        warnings: []
      });

      // Mock successful merge continuation
      mockGitClient.continueMerge.mockResolvedValue(undefined);

      // Mock successful push
      mockGitClient.push.mockResolvedValue(undefined);

      const result2 = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result2.hasConflicts).toBe(true);
      expect(result2.resolved).toBe(true);
      expect(result2.steps).toContain('⚠️ PR has conflicts with main (2 files)');
      expect(result2.steps).toContain('🤖 Attempting AI-powered conflict resolution...');
      expect(result2.steps).toContain('✅ AI resolved 2 conflicts (95% confidence)');
      expect(result2.steps).toContain('✅ Updated PR with resolved conflicts');
    });

    it('should handle conflicts when AI resolution fails', async () => {
      // Mock fetch and merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts']);

      // Mock AI availability
      mockAIService.isAvailable.mockResolvedValue(true);

      // Mock failed conflict resolution
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: false,
        resolvedFiles: [],
        remainingConflicts: ['file1.ts'],
        reasoning: 'Conflicts too complex',
        warnings: []
      });

      // Mock merge in progress and successful abort
      mockGitClient.isMergeInProgress.mockResolvedValue(true);
      mockGitClient.abortMerge.mockResolvedValue(undefined);

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.hasConflicts).toBe(true);
      expect(result.resolved).toBe(false);
      expect(result.error).toBe('Conflicts too complex');
      expect(result.steps).toContain('⚠️ AI couldn\'t resolve conflicts automatically: Conflicts too complex');
    });

    it('should handle AI unavailability', async () => {
      // Mock fetch and merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts']);

      // Mock AI unavailable
      mockAIService.isAvailable.mockResolvedValue(false);

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.hasConflicts).toBe(true);
      expect(result.resolved).toBe(false);
      expect(result.error).toBe('AI resolution unavailable');
      expect(result.steps).toContain('⚠️ AI resolution not available - Claude CLI not found');
    });

    it('should handle abort merge failure gracefully', async () => {
      // Mock fetch and merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts']);

      // Mock AI availability
      mockAIService.isAvailable.mockResolvedValue(true);

      // Mock failed conflict resolution
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: false,
        resolvedFiles: [],
        remainingConflicts: ['file1.ts'],
        reasoning: 'Cannot resolve',
        warnings: []
      });

      // Mock merge in progress but failed abort
      mockGitClient.isMergeInProgress.mockResolvedValue(true);
      mockGitClient.abortMerge.mockRejectedValue(new Error('Abort failed'));

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main', { verbose: true });

      expect(result.hasConflicts).toBe(true);
      expect(result.resolved).toBe(false);
      expect(result.steps).toContain('⚠️ Failed to abort merge: Abort failed');
      expect(result.steps).toContain('💡 Manual cleanup required: git merge --abort');
    });

    it('should include AI warnings in output', async () => {
      // Mock fetch and merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts']);

      // Mock AI availability
      mockAIService.isAvailable.mockResolvedValue(true);

      // Mock successful resolution with warnings
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: true,
        resolvedFiles: ['file1.ts'],
        remainingConflicts: [],
        confidence: 85,
        reasoning: 'Resolved with caution',
        warnings: ['Semantic conflict detected', 'Review changes carefully']
      });

      mockGitClient.continueMerge.mockResolvedValue(undefined);
      mockGitClient.push.mockResolvedValue(undefined);

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.resolved).toBe(true);
      expect(result.steps).toContain('⚠️ AI warnings: Semantic conflict detected, Review changes carefully');
    });

    it('should handle pull failures gracefully', async () => {
      // Mock fetch failure
      mockGitClient.fetch.mockRejectedValue(new Error('Network error'));

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main');

      expect(result.hasConflicts).toBe(false);
      expect(result.resolved).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle unexpected errors with verbose output', async () => {
      // Mock fetch throwing an error
      mockGitClient.fetch.mockRejectedValue(new Error('Unexpected error'));

      const result = await conflictResolver.resolvePRConflicts('feature-branch', 'main', { verbose: true });

      expect(result.hasConflicts).toBe(false);
      expect(result.resolved).toBe(false);
      expect(result.error).toBe('Unexpected error');
      expect(result.steps).toContain('⚠️ Could not check for PR conflicts: Unexpected error');
    });

    it('should use custom strategy when provided', async () => {
      // Mock fetch and merge with conflicts
      mockGitClient.fetch.mockResolvedValue('Fetched successfully');
      const mergeError = new Error('Merge conflict in file1.ts');
      mockGitClient.merge.mockRejectedValue(mergeError);
      mockGitClient.getConflictedFiles.mockResolvedValue(['file1.ts']);

      mockAIService.isAvailable.mockResolvedValue(true);
      mockGitClient.resolveConflicts.mockResolvedValue({
        success: true,
        resolvedFiles: ['file1.ts'],
        remainingConflicts: [],
        confidence: 90,
        warnings: []
      });
      mockGitClient.continueMerge.mockResolvedValue(undefined);
      mockGitClient.push.mockResolvedValue(undefined);

      await conflictResolver.resolvePRConflicts('feature-branch', 'main', { strategy: 'ai-smart' });

      expect(mockGitClient.resolveConflicts).toHaveBeenCalledWith('ai-smart');
    });
  });
});