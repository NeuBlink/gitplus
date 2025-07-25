import { toolDefinitions } from '../../src/mcp/toolDefinitions';

describe('MCP Tool Definitions', () => {
  it('should have all required tools defined', () => {
    const expectedTools = ['ship', 'status', 'info'];
    
    const actualTools = toolDefinitions.map(tool => tool.name);
    
    expectedTools.forEach(tool => {
      expect(actualTools).toContain(tool);
    });
  });

  it('should have valid descriptions for core tools', () => {
    const shipTool = toolDefinitions.find(tool => tool.name === 'ship');
    expect(shipTool).toBeDefined();
    expect(shipTool?.description.toLowerCase()).toContain('complete git workflow');

    const statusTool = toolDefinitions.find(tool => tool.name === 'status');
    expect(statusTool).toBeDefined();
    expect(statusTool?.description.toLowerCase()).toContain('status');

    const infoTool = toolDefinitions.find(tool => tool.name === 'info');
    expect(infoTool).toBeDefined();
    expect(infoTool?.description.toLowerCase()).toContain('information');
  });

  it('should have inputSchema defined for all tools', () => {
    toolDefinitions.forEach(tool => {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    });
  });
});