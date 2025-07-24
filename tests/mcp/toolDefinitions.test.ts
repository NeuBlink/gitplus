import { toolDefinitions } from '../../src/mcp/toolDefinitions';

describe('MCP Tool Definitions', () => {
  it('should have all required tools defined', () => {
    const expectedTools = ['ship', 'commit', 'analyze', 'suggest', 'pr_draft', 'status', 'merge_local'];
    
    const actualTools = toolDefinitions.map(tool => tool.name);
    
    expectedTools.forEach(tool => {
      expect(actualTools).toContain(tool);
    });
  });

  it('should have valid descriptions for core tools', () => {
    const shipTool = toolDefinitions.find(tool => tool.name === 'ship');
    expect(shipTool).toBeDefined();
    expect(shipTool?.description.toLowerCase()).toContain('complete git workflow');

    const commitTool = toolDefinitions.find(tool => tool.name === 'commit');
    expect(commitTool).toBeDefined();
    expect(commitTool?.description.toLowerCase()).toContain('commit');

    const prTool = toolDefinitions.find(tool => tool.name === 'pr_draft');
    expect(prTool).toBeDefined();
    expect(prTool?.description.toLowerCase()).toContain('pull request');
  });

  it('should have inputSchema defined for all tools', () => {
    toolDefinitions.forEach(tool => {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    });
  });
});