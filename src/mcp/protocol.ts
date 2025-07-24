// MCP Protocol types and definitions

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: MCPError;
  id: string | number;
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// MCP Error codes
export const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_ERROR: -32000,
} as const;

// Tool definitions
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPInputSchema;
}

export interface MCPInputSchema {
  type: 'object';
  properties?: Record<string, MCPProperty>;
  required?: string[];
}

export interface MCPProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPProperty;
}

// Tool call types
export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolCallResult {
  content: MCPContentItem[];
  isError?: boolean;
}

export interface MCPContentItem {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

// Standard method types
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: MCPClientInfo;
}

export interface MCPClientCapabilities {
  experimental?: Record<string, any>;
  sampling?: Record<string, any>;
}

export interface MCPClientInfo {
  name: string;
  version: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
}

export interface MCPServerCapabilities {
  tools?: MCPToolsCapability;
  resources?: MCPResourcesCapability;
  prompts?: MCPPromptsCapability;
  experimental?: Record<string, any>;
}

export interface MCPToolsCapability {
  listChanged?: boolean;
}

export interface MCPResourcesCapability {
  subscribe?: boolean;
  listChanged?: boolean;
}

export interface MCPPromptsCapability {
  listChanged?: boolean;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

// Helper functions
export function createMCPResponse(id: string | number, result?: any): MCPResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function createMCPError(id: string | number, code: number, message: string, data?: any): MCPResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

export function createMCPNotification(method: string, params?: any): MCPNotification {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

export function createMCPToolResult(text: string, isError = false): MCPToolCallResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError,
  };
}