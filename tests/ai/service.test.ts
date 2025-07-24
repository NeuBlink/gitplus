import { AIService } from '../../src/ai/service';

// Mock the child_process module
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
}));

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
    jest.clearAllMocks();
  });

  describe('executeClaudeCommand', () => {
    it('should successfully parse Claude CLI response', async () => {
      const { spawn } = require('child_process');
      const mockChild = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify({
                type: 'result',
                subtype: 'success',
                is_error: false,
                result: 'feat: add new feature'
              }));
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      };

      spawn.mockReturnValue(mockChild);

      const result = await (aiService as any).executeClaudeCommand('test prompt', 'sonnet');
      
      expect(result.success).toBe(true);
      expect(result.content).toContain('feat: add new feature');
    });

    it('should handle Claude CLI errors gracefully', async () => {
      const { spawn } = require('child_process');
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Command not found'));
          }
        })
      };

      spawn.mockReturnValue(mockChild);

      const result = await (aiService as any).executeClaudeCommand('test prompt', 'sonnet');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });
  });

  describe('generateComprehensiveAnalysis', () => {
    it('should have the correct method signature', () => {
      expect(typeof aiService.generateComprehensiveAnalysis).toBe('function');
      
      // Test that it accepts the expected context structure
      const context = {
        diff: 'test diff',
        filesChanged: ['test.js'],
        status: { staged: ['test.js'], unstaged: [], untracked: [] },
        branch: 'main'
      };
      
      // Should not throw when called with valid context
      expect(() => {
        aiService.generateComprehensiveAnalysis(context);
      }).not.toThrow();
    });
  });
});