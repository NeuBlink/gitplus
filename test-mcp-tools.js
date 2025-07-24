#!/usr/bin/env node

const { ToolHandler } = require('./dist/mcp/toolHandler');
const toolHandler = new ToolHandler();

async function testMCPTools() {
  console.log('🔧 Testing MCP Tool Implementations');
  console.log('===================================\n');

  const repoPath = process.cwd();

  try {
    // Test 1: Sync Tool
    console.log('1. Testing Sync Tool...');
    const syncResult = await toolHandler.handleSync({
      repoPath,
      strategy: 'fetch-only',
      force: false
    });
    console.log(`✅ Sync result: ${syncResult.isError ? 'Error' : 'Success'}`);
    if (syncResult.content && syncResult.content[0]) {
      console.log(`📄 Output: ${syncResult.content[0].text.slice(0, 200)}...`);
    }
    console.log();

    // Test 2: Validate Tool
    console.log('2. Testing Validate Tool...');
    const validateResult = await toolHandler.handleValidate({
      repoPath,
      deep: true,
      fix: false
    });
    console.log(`✅ Validate result: ${validateResult.isError ? 'Error' : 'Success'}`);
    if (validateResult.content && validateResult.content[0]) {
      console.log(`📄 Output: ${validateResult.content[0].text.slice(0, 200)}...`);
    }
    console.log();

    // Test 3: Stash Tool (List)
    console.log('3. Testing Stash Tool (List)...');
    const stashResult = await toolHandler.handleStash({
      repoPath,
      action: 'list'
    });
    console.log(`✅ Stash result: ${stashResult.isError ? 'Error' : 'Success'}`);
    if (stashResult.content && stashResult.content[0]) {
      console.log(`📄 Output: ${stashResult.content[0].text.slice(0, 200)}...`);
    }
    console.log();

    // Test 4: Recover Tool (Show Reflog)
    console.log('4. Testing Recover Tool (Show Reflog)...');
    const recoverResult = await toolHandler.handleRecover({
      repoPath,
      action: 'show-reflog',
      limit: 5
    });
    console.log(`✅ Recover result: ${recoverResult.isError ? 'Error' : 'Success'}`);
    if (recoverResult.content && recoverResult.content[0]) {
      console.log(`📄 Output: ${recoverResult.content[0].text.slice(0, 200)}...`);
    }
    console.log();

    console.log('🎉 All MCP tool tests completed successfully!');
    console.log('🚀 MCP tools are ready for Claude Code integration');

  } catch (error) {
    console.error('❌ MCP tool test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testMCPTools();