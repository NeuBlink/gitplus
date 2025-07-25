import { ToolHandler } from '../../src/mcp/toolHandler';

describe('ToolHandler', () => {
  let toolHandler: ToolHandler;

  beforeEach(() => {
    toolHandler = new ToolHandler();
  });

  describe('constructor', () => {
    it('should create a ToolHandler instance', () => {
      expect(toolHandler).toBeDefined();
      expect(toolHandler).toBeInstanceOf(ToolHandler);
    });
  });

  describe('handleToolCall', () => {
    it('should have handleToolCall method', () => {
      expect(typeof toolHandler.handleToolCall).toBe('function');
    });

    it('should return error when repoPath is missing for non-info tools', async () => {
      const result = await toolHandler.handleToolCall('ship', {});
      
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Repository path is required');
    });

    it('should handle info tool without repoPath', async () => {
      const result = await toolHandler.handleToolCall('info', {});
      
      // Should not error on missing repoPath for info tool
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('GitPlus MCP Server Information');
    });

    it('should include version information in info', async () => {
      const result = await toolHandler.handleToolCall('info', {});
      
      expect(result.content[0]?.text).toContain('Version:');
      expect(result.content[0]?.text).toContain('Model Context Protocol (MCP) Server');
    });

    it('should include available tools information in info', async () => {
      const result = await toolHandler.handleToolCall('info', {});
      
      expect(result.content[0]?.text).toContain('Available GitPlus Tools');
      expect(result.content[0]?.text).toContain('ship');
      expect(result.content[0]?.text).toContain('status');
      expect(result.content[0]?.text).toContain('info');
    });
  });
});