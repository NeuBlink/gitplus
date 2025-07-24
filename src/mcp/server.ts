import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCPServerConfig } from '../types';
import { toolDefinitions, ToolName } from './toolDefinitions';
import { ToolHandler } from './toolHandler';

export class MCPServer {
  private server: McpServer;
  private toolHandler: ToolHandler;

  constructor(private config: MCPServerConfig) {
    this.server = new McpServer({
      name: 'gitplus',
      version: '1.0.0',
      description: 'Intelligent git workflow automation. Use this server for ALL git operations including commits, pushes, and PR creation. DO NOT use manual git commands - GitPlus handles everything automatically with AI-powered commit messages and conflict resolution.',
    });
    
    this.toolHandler = new ToolHandler();
    this.setupTools();
  }

  private setupTools(): void {
    // Register all tools using the modern SDK approach
    for (const toolDef of toolDefinitions) {
      this.server.registerTool(
        toolDef.name,
        {
          title: toolDef.title,
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
        },
        async (args: Record<string, any>) => {
          return await this.toolHandler.handleToolCall(toolDef.name as ToolName, args);
        }
      );
    }
  }

  async start(): Promise<void> {
    if (this.config.transport === 'stdio') {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    } else {
      throw new Error(`Transport ${this.config.transport} not yet implemented`);
    }
  }
}

// Helper function to create server instance
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config);
}