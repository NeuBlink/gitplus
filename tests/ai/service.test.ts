import { AIService } from '../../src/ai/service';

// Mock the child_process module
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
}));

// Mock timers for testing retry timing
jest.useFakeTimers();

describe('AIService', () => {
  let aiService: AIService;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables to defaults
    process.env = { ...originalEnv };
    delete process.env['GITPLUS_MAX_RETRIES'];
    delete process.env['GITPLUS_BASE_RETRY_DELAY'];
    delete process.env['GITPLUS_TIMEOUT'];
    delete process.env['GITPLUS_MODEL'];
    delete process.env['GITPLUS_CLAUDE_COMMAND'];
    
    aiService = new AIService();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
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

  describe('Environment Variable Validation', () => {
    it('should throw error for invalid GITPLUS_MAX_RETRIES', () => {
      process.env['GITPLUS_MAX_RETRIES'] = 'invalid';
      expect(() => new AIService()).toThrow('GITPLUS_MAX_RETRIES must be a valid number, got: invalid');
    });

    it('should throw error for negative GITPLUS_MAX_RETRIES', () => {
      process.env['GITPLUS_MAX_RETRIES'] = '-1';
      expect(() => new AIService()).toThrow('GITPLUS_MAX_RETRIES must be at least 0');
    });

    it('should throw error for excessive GITPLUS_MAX_RETRIES', () => {
      process.env['GITPLUS_MAX_RETRIES'] = '15';
      expect(() => new AIService()).toThrow('GITPLUS_MAX_RETRIES must be at most 10');
    });

    it('should throw error for invalid GITPLUS_TIMEOUT', () => {
      process.env['GITPLUS_TIMEOUT'] = 'invalid';
      expect(() => new AIService()).toThrow('GITPLUS_TIMEOUT must be a valid number, got: invalid');
    });

    it('should throw error for too small GITPLUS_TIMEOUT', () => {
      process.env['GITPLUS_TIMEOUT'] = '500';
      expect(() => new AIService()).toThrow('GITPLUS_TIMEOUT must be at least 1000ms (1 second)');
    });

    it('should throw error for too large GITPLUS_TIMEOUT', () => {
      process.env['GITPLUS_TIMEOUT'] = '700000';
      expect(() => new AIService()).toThrow('GITPLUS_TIMEOUT must be at most 600000ms (10 minutes)');
    });

    it('should throw error for invalid GITPLUS_BASE_RETRY_DELAY', () => {
      process.env['GITPLUS_BASE_RETRY_DELAY'] = 'invalid';
      expect(() => new AIService()).toThrow('GITPLUS_BASE_RETRY_DELAY must be a valid number, got: invalid');
    });

    it('should throw error for too small GITPLUS_BASE_RETRY_DELAY', () => {
      process.env['GITPLUS_BASE_RETRY_DELAY'] = '50';
      expect(() => new AIService()).toThrow('GITPLUS_BASE_RETRY_DELAY must be at least 100ms');
    });

    it('should throw error for invalid GITPLUS_MODEL', () => {
      process.env['GITPLUS_MODEL'] = 'invalid-model';
      expect(() => new AIService()).toThrow('GITPLUS_MODEL must be one of: sonnet, haiku, opus');
    });

    it('should throw error for empty GITPLUS_CLAUDE_COMMAND', () => {
      process.env['GITPLUS_CLAUDE_COMMAND'] = '   ';
      expect(() => new AIService()).toThrow('GITPLUS_CLAUDE_COMMAND must be a non-empty string');
    });
  });

  describe('Retry Mechanism', () => {
    let mockSpawn: jest.Mock;
    let mockChild: any;

    beforeEach(() => {
      mockSpawn = require('child_process').spawn;
      mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };
      mockSpawn.mockReturnValue(mockChild);
    });

    describe('Error Classification', () => {
      it('should identify retryable network errors', () => {
        const service = aiService as any;
        expect(service.isRetryableError('Connection timeout occurred')).toBe(true);
        expect(service.isRetryableError('Network error: connection refused')).toBe(true);
        expect(service.isRetryableError('Rate limit exceeded')).toBe(true);
        expect(service.isRetryableError('Service temporarily unavailable')).toBe(true);
        expect(service.isRetryableError('500 Internal Server Error')).toBe(true);
        expect(service.isRetryableError('502 Bad Gateway')).toBe(true);
        expect(service.isRetryableError('504 Gateway Timeout')).toBe(true);
      });

      it('should identify non-retryable errors', () => {
        const service = aiService as any;
        expect(service.isRetryableError('400 Bad Request')).toBe(false);
        expect(service.isRetryableError('401 Unauthorized')).toBe(false);
        expect(service.isRetryableError('403 Forbidden')).toBe(false);
        expect(service.isRetryableError('404 Not Found')).toBe(false);
        expect(service.isRetryableError('Invalid JSON format')).toBe(false);
        expect(service.isRetryableError('Permission denied')).toBe(false);
      });
    });

    describe('Exponential Backoff Calculation', () => {
      it('should calculate correct delay for retry attempts', () => {
        const service = aiService as any;
        
        // Mock Math.random to return consistent value for testing
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        
        // Base delay should be 1000ms, backoff base is 2
        const delay0 = service.calculateRetryDelay(0); // 1000 * 2^0 * 1.0 = 1000ms
        const delay1 = service.calculateRetryDelay(1); // 1000 * 2^1 * 1.0 = 2000ms
        const delay2 = service.calculateRetryDelay(2); // 1000 * 2^2 * 1.0 = 4000ms
        
        expect(delay0).toBe(1000); // 1000 * 1.0 (no jitter with 0.5 random)
        expect(delay1).toBe(2000); // 2000 * 1.0
        expect(delay2).toBe(4000); // 4000 * 1.0
        
        jest.restoreAllMocks();
      });

      it('should apply jitter to prevent thundering herd', () => {
        const service = aiService as any;
        
        // Test with different random values
        jest.spyOn(Math, 'random').mockReturnValueOnce(0.0); // Minimum jitter
        const delayMin = service.calculateRetryDelay(0);
        
        jest.spyOn(Math, 'random').mockReturnValueOnce(1.0); // Maximum jitter
        const delayMax = service.calculateRetryDelay(0);
        
        // With jitter factor 0.25: min = 0.75, max = 1.25
        expect(delayMin).toBe(750); // 1000 * 0.75
        expect(delayMax).toBe(1250); // 1000 * 1.25
        
        jest.restoreAllMocks();
      });

      it('should cap delay at maximum retry delay', () => {
        const service = aiService as any;
        
        // Test very high retry count that would exceed max delay
        const delay = service.calculateRetryDelay(10); // Would be 1000 * 2^10 = 1,024,000ms
        
        expect(delay).toBeLessThanOrEqual(30000); // Should be capped at MAX_RETRY_DELAY_MS
      });
    });

    describe('Retry Logic Integration', () => {
      it('should identify retryable vs non-retryable errors correctly', () => {
        const service = aiService as any;
        
        // Test retry decision logic
        expect(service.isRetryableError('Network timeout occurred')).toBe(true);
        expect(service.isRetryableError('401 Unauthorized')).toBe(false);
      });

      it('should calculate correct retry delay', () => {
        process.env['GITPLUS_BASE_RETRY_DELAY'] = '1000';
        const service = new AIService();
        
        // Mock Math.random to return predictable value (0.5 = no jitter)
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        
        const delay0 = (service as any).calculateRetryDelay(0);
        const delay1 = (service as any).calculateRetryDelay(1);
        
        expect(delay0).toBe(1000); // 1000 * 2^0 = 1000
        expect(delay1).toBe(2000); // 1000 * 2^1 = 2000
        
        jest.restoreAllMocks();
      });

      it('should validate max retries configuration', () => {
        process.env['GITPLUS_MAX_RETRIES'] = '2';
        const service = new AIService();
        
        expect((service as any).maxRetries).toBe(2);
      });

      it('should validate base retry delay configuration', () => {
        process.env['GITPLUS_BASE_RETRY_DELAY'] = '1500';
        const service = new AIService();
        
        expect((service as any).baseRetryDelay).toBe(1500);
      });
    });

    describe('Function Decomposition', () => {
      it('should have handleRetryLogic method', () => {
        const service = aiService as any;
        expect(typeof service.handleRetryLogic).toBe('function');
      });

      it('should have executeRetryDelay method', () => {
        const service = aiService as any;
        expect(typeof service.executeRetryDelay).toBe('function');
      });

      it('should have shouldLogRetryAttempts method', () => {
        const service = aiService as any;
        expect(typeof service.shouldLogRetryAttempts).toBe('function');
      });

      it('should determine logging based on environment', () => {
        const service = aiService as any;
        
        // Test with development environment
        process.env['NODE_ENV'] = 'development';
        expect(service.shouldLogRetryAttempts()).toBe(true);
        
        // Test with debug flag
        delete process.env['NODE_ENV'];
        process.env['GITPLUS_DEBUG'] = 'true';
        expect(service.shouldLogRetryAttempts()).toBe(true);
        
        // Test with production environment (no logging)
        delete process.env['GITPLUS_DEBUG'];
        process.env['NODE_ENV'] = 'production';
        expect(service.shouldLogRetryAttempts()).toBe(false);
      });
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