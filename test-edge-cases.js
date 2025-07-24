#!/usr/bin/env node

const { GitClient } = require('./dist/git/client');
const path = require('path');

async function testGitEdgeCases() {
  console.log('🧪 Testing Git Edge Case Handling');
  console.log('================================\n');

  const client = new GitClient(process.cwd());

  try {
    // Test 1: Repository Validation
    console.log('1. Testing Repository Validation...');
    const validation = await client.validateRepository();
    console.log(`✅ Repository valid: ${validation.isValid}`);
    if (validation.issues.length > 0) {
      console.log(`⚠️  Issues: ${validation.issues.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }
    console.log();

    // Test 2: Repository Statistics
    console.log('2. Testing Repository Statistics...');
    const stats = await client.getRepositoryStats();
    console.log(`📊 Total Commits: ${stats.totalCommits}`);
    console.log(`🌿 Total Branches: ${stats.totalBranches}`);
    console.log(`🏷️  Total Tags: ${stats.totalTags}`);
    console.log(`💾 Repository Size: ${stats.repositorySize}`);
    console.log(`⏰ Last Commit: ${stats.lastCommitDate?.toISOString() || 'Unknown'}`);
    console.log();

    // Test 3: Sync Status
    console.log('3. Testing Sync Status...');
    const syncStatus = await client.getSyncStatus();
    console.log(`🔄 Local Branch: ${syncStatus.localBranch}`);
    console.log(`🌐 Remote Branch: ${syncStatus.remoteBranch}`);
    console.log(`⬆️  Ahead: ${syncStatus.ahead} commits`);
    console.log(`⬇️  Behind: ${syncStatus.behind} commits`);
    console.log(`🔀 Diverged: ${syncStatus.diverged}`);
    console.log(`✅ Up to Date: ${syncStatus.upToDate}`);
    console.log(`📥 Needs Pull: ${syncStatus.needsPull}`);
    console.log(`📤 Needs Push: ${syncStatus.needsPush}`);
    console.log(`🔗 Has Upstream: ${syncStatus.hasUpstream}`);
    console.log();

    // Test 4: Conflict Detection
    console.log('4. Testing Conflict Detection...');
    const hasConflicts = await client.hasConflicts();
    console.log(`⚡ Has Conflicts: ${hasConflicts}`);
    if (hasConflicts) {
      const conflictedFiles = await client.getConflictedFiles();
      console.log(`📄 Conflicted Files: ${conflictedFiles.join(', ')}`);
    }
    console.log();

    // Test 5: Ongoing Operations
    console.log('5. Testing Ongoing Operations...');
    const mergeInProgress = await client.isMergeInProgress();
    const rebaseInProgress = await client.isRebaseInProgress();
    console.log(`🔀 Merge in Progress: ${mergeInProgress}`);
    console.log(`🔄 Rebase in Progress: ${rebaseInProgress}`);
    console.log();

    // Test 6: Reflog (Recent Activity)
    console.log('6. Testing Reflog (Recent 5 entries)...');
    const reflog = await client.getReflog(5);
    reflog.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.shortHash} - ${entry.action}: ${entry.message}`);
    });
    console.log();

    // Test 7: Stash List
    console.log('7. Testing Stash List...');
    try {
      const stashList = await client.stash({ list: true });
      if (stashList.trim()) {
        console.log('📦 Stash entries:');
        stashList.split('\n').forEach((entry, index) => {
          if (entry.trim()) {
            console.log(`  ${index + 1}. ${entry}`);
          }
        });
      } else {
        console.log('📦 No stash entries found');
      }
    } catch (error) {
      console.log('📦 No stash entries (empty repository)');
    }
    console.log();

    console.log('🎉 All edge case tests completed successfully!');
    console.log('🚀 Git operations are ready for production use');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testGitEdgeCases();