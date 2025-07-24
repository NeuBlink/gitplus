#!/usr/bin/env node

import { createMCPServer } from './mcp/server';
import { MCPTransport } from './types';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const transportIndex = args.indexOf('--transport');
  
  let transport: MCPTransport = 'stdio'; // Default to stdio
  
  if (transportIndex !== -1 && args[transportIndex + 1]) {
    const transportArg = args[transportIndex + 1];
    if (transportArg === 'stdio' || transportArg === 'http') {
      transport = transportArg;
    }
  }

  const config = {
    transport,
    port: transport === 'http' ? 3000 : undefined,
    host: transport === 'http' ? 'localhost' : undefined,
  };

  try {
    const server = createMCPServer(config);
    
    // Log to stderr (not stdout which is used for MCP communication)
    console.error(`Starting gitplus MCP server with ${transport} transport...`);
    
    await server.start();
    
    console.error('✅ Gitplus MCP server started successfully');
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to start gitplus MCP server:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown - only exit on explicit signals
process.on('SIGINT', () => {
  console.error('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  main();
}