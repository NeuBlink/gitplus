#!/usr/bin/env node

/**
 * Unified entry point for GitPlus
 * Routes to MCP server mode (--mcp) or CLI mode (default)
 */

import { createMCPServer } from './mcp/server';
import { MCPTransport } from './types';

/**
 * Checks if MCP server mode is requested by looking for the --mcp flag
 * @returns {boolean} True if --mcp flag is present in command line arguments
 */
function shouldRunAsMCPServer(): boolean {
  const args = process.argv.slice(2);
  return args.includes('--mcp');
}

/**
 * Runs the MCP server using stdio transport
 * Logs to stderr to keep stdout available for MCP communication
 * @throws {Error} If the MCP server fails to start
 */
async function runMCPServer() {
  // MCP servers typically use stdio transport
  const config = {
    transport: 'stdio' as MCPTransport
  };

  try {
    const server = createMCPServer(config);
    
    // Log to stderr (not stdout which is used for MCP communication)
    console.error('Starting gitplus MCP server...');
    
    await server.start();
    
    console.error('✅ Gitplus MCP server started successfully');
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to start gitplus MCP server:', error);
    process.exit(1);
  }
}

/**
 * Runs the CLI interface by dynamically importing the CLI module
 * The CLI module automatically executes when imported due to program.parse()
 * @throws {Error} If the CLI module fails to load or execute
 */
async function runCLI() {
  // The CLI module automatically executes when imported due to program.parse() at the end
  await import('./cli');
}

/**
 * Main entry point that routes to MCP server or CLI mode based on arguments
 * Checks for --mcp flag to determine which mode to run
 * @throws {Error} If either mode fails to start
 */
async function main() {
  try {
    if (shouldRunAsMCPServer()) {
      await runMCPServer();
    } else {
      await runCLI();
    }
  } catch (error) {
    console.error('❌ Failed to start gitplus:', error);
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