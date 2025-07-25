import { z } from 'zod';

/**
 * GitPlus MCP Tool Definitions
 * 
 * This file defines the 3 essential MCP tools that GitPlus exposes to Claude.
 * The intentionally simplified interface provides maximum automation with minimal
 * decision-making overhead.
 * 
 * Architecture Decision: Only 3 tools instead of 14+ CLI commands
 * - Reduces complexity and decision paralysis
 * - Each tool provides complete workflows rather than partial operations
 * - AI handles all intelligent decision-making within each tool
 */
export const toolDefinitions = [
  {
    name: 'ship',
    title: 'Ship Changes',
    description: 'Complete git workflow: analyze changes, commit with AI-generated message, push, and create PR',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      draft: z.boolean().optional().describe('Create PR as draft'),
      dryRun: z.boolean().optional().describe('Show what would be done without executing')
    },
  },
  {
    name: 'status',
    title: 'Git Status',
    description: 'Get current repository status including branch info, changes, and platform details',
    inputSchema: {
      repoPath: z.string().describe('Full absolute path to the git repository'),
      verbose: z.boolean().optional().describe('Include detailed status information')
    },
  },
  {
    name: 'info',
    title: 'GitPlus MCP Info',
    description: 'Get comprehensive information about GitPlus MCP server capabilities, tools, and usage',
    inputSchema: {
      repoPath: z.string().optional().describe('Full absolute path to the git repository (optional - provides repo-specific info if given)')
    },
  },
] as const;

export type ToolName = typeof toolDefinitions[number]['name'];

// Infer types from the inputSchema for type safety
export type ShipToolInput = z.infer<z.ZodObject<typeof toolDefinitions[0]['inputSchema']>>;
export type StatusToolInput = z.infer<z.ZodObject<typeof toolDefinitions[1]['inputSchema']>>;
export type InfoToolInput = z.infer<z.ZodObject<typeof toolDefinitions[2]['inputSchema']>>;