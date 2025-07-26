# GitPlus Repository Corruption Recovery System

## Overview

GitPlus now includes a comprehensive repository corruption recovery system that provides automatic detection, intelligent recovery, and data preservation capabilities. This system protects users from git repository corruption while maintaining the MCP-first architecture philosophy.

## Architecture Components

### 1. Corruption Detection (`src/git/corruptionDetector.ts`)

**Purpose**: Automatically detect various types of git repository corruption
**Features**:
- Object database integrity checks
- Index file validation
- Reference consistency verification  
- Lock file detection
- Incomplete operation identification
- Configuration validation
- Permission and disk space checks

**Detection Types**:
- ✅ **Object Corruption**: Corrupt objects, missing blobs, packfile issues
- ✅ **Index Issues**: Corrupt/missing index files
- ✅ **Reference Problems**: Invalid refs, dangling references
- ✅ **Lock Files**: Stale lock files blocking operations
- ✅ **Incomplete Operations**: Interrupted merges, rebases, cherry-picks
- ✅ **Configuration**: Invalid remotes, corrupt config files
- ✅ **System Issues**: Permission errors, disk space problems

### 2. Recovery Strategies (`src/git/recoveryStrategies.ts`)

**Purpose**: Implement specialized recovery strategies for different corruption types
**Architecture**: Strategy pattern with dedicated handlers for each corruption type

**Available Strategies**:
- **LockFileRecoveryStrategy**: Automatically removes stale lock files
- **IndexRecoveryStrategy**: Rebuilds corrupted index files safely
- **ReferenceRecoveryStrategy**: Repairs and prunes invalid references
- **IncompleteOperationRecoveryStrategy**: Resolves interrupted git operations
- **ConfigurationRecoveryStrategy**: Fixes configuration issues
- **ObjectDatabaseRecoveryStrategy**: Handles object corruption (advanced)

### 3. Backup Manager (`src/git/backupManager.ts`)

**Purpose**: Provide comprehensive backup and restore capabilities
**Features**:
- **Complete Repository Backups**: Full git history, refs, and metadata
- **Working Directory Snapshots**: Include uncommitted changes
- **Point-in-Time Recovery**: Restore to specific backup states
- **Automatic Cleanup**: Manage backup storage with size limits
- **Compression Support**: Reduce storage requirements

**Backup Contents**:
- Git bundles (complete repository history)
- Working directory files (if requested)
- Git metadata (config, refs, hooks)
- Repository state information

### 4. Recovery Coordinator (`src/git/corruptionRecoveryCoordinator.ts`)

**Purpose**: Orchestrate the complete recovery process with intelligent decision-making
**Features**:
- **Recovery Planning**: Generate step-by-step recovery plans
- **Risk Assessment**: Evaluate data loss potential and success probability
- **Session Management**: Track recovery operations and results
- **Progress Monitoring**: Real-time feedback during recovery
- **Recommendation Engine**: Suggest appropriate recovery options

### 5. Error Recovery Guide (`src/git/errorRecoveryGuide.ts`)

**Purpose**: Provide user-friendly guidance for git errors with step-by-step recovery instructions
**Features**:
- **Pattern Recognition**: Identify common git error patterns
- **Recovery Instructions**: Detailed step-by-step guidance
- **Prevention Tips**: Help users avoid future issues
- **Quick Fixes**: Immediate actions for common problems
- **Severity Assessment**: Categorize issues by risk level

### 6. Enhanced GitClient Integration

**Purpose**: Transparent corruption recovery integrated into normal git operations
**Features**:
- **Automatic Monitoring**: Background corruption checks during critical operations
- **Enhanced Error Messages**: User-friendly error messages with recovery guidance
- **Safe Command Execution**: Corruption detection before risky operations
- **Recovery APIs**: Direct access to all recovery capabilities

## Key Features

### 🛡️ **Graceful Degradation**
- Continue operations when possible during minor corruption
- Automatic fallback to safe modes when corruption is detected
- Clear guidance when manual intervention is required

### 🔄 **Automatic Recovery**
- Smart detection of recoverable corruption types
- Automatic resolution of common issues (lock files, incomplete operations)
- Configurable automation levels based on risk tolerance

### 💾 **Data Preservation**
- Automatic backups before risky recovery operations
- Preservation of uncommitted changes during recovery
- Multiple restore points for safe rollback

### 👥 **User Guidance**
- Clear, step-by-step recovery instructions
- Severity-based recommendations
- Prevention tips to avoid future corruption

### ⚡ **Performance Optimized**
- Efficient corruption detection with minimal performance impact
- Cached checks to avoid repeated expensive operations
- Parallel execution of independent recovery tasks

## Usage Examples

### Basic Corruption Detection

```typescript
import { GitClient } from './src/git/client';

const gitClient = new GitClient('/path/to/repository');

// Check for corruption
const result = await gitClient.detectCorruption();
console.log(`Repository integrity: ${result.integrityScore}%`);

if (result.isCorrupted) {
    console.log(`Found ${result.issues.length} issues`);
    result.issues.forEach(issue => {
        console.log(`- ${issue.type}: ${issue.description}`);
    });
}
```

### Automatic Recovery

```typescript
// Recover from corruption with safe defaults
const recovery = await gitClient.recoverFromCorruption({
    maxDataLoss: 'minimal',
    autoRepair: true,
    createBackup: true,
    preserveUncommitted: true
});

if (recovery.success) {
    console.log('Recovery completed successfully');
} else {
    console.log('Manual intervention required:', recovery.message);
}
```

### Manual Backup and Restore

```typescript
// Create backup before risky operation
const backup = await gitClient.createBackup('Before major rebase', {
    includeWorkingDirectory: true,
    compress: true
});

console.log(`Backup created: ${backup.backupId}`);

// Later, restore if needed
const restore = await gitClient.restoreFromBackup(backup.backupId, {
    preserveCurrentChanges: true
});
```

### Enhanced Error Handling

```typescript
try {
    await gitClient.executeGitCommandSafe('rebase main');
} catch (error) {
    if (error.isCorruption) {
        console.log('Corruption detected!');
        console.log('Quick fixes:', error.quickFixes);
        console.log('Full guidance:', error.recoveryGuidance);
    }
}
```

## Corruption Types Handled

| Type | Severity | Auto-Recoverable | Data Loss Risk |
|------|----------|------------------|----------------|
| Stale Lock Files | Low | ✅ Yes | ❌ None |
| Incomplete Merge | Medium | ✅ Yes | ❌ None |
| Incomplete Rebase | Medium | ✅ Yes | ❌ None |
| Corrupt Index | Medium | ✅ Yes | ⚠️ Minimal |
| Invalid References | Medium | ✅ Yes | ⚠️ Minimal |
| Corrupt Objects | High | ❌ No | ⚠️ Moderate |
| Corrupt Packfiles | High | ❌ No | ⚠️ Moderate |
| Permission Issues | Medium | ✅ Yes | ❌ None |
| Disk Full | Critical | ❌ No | ❌ None |

## Recovery Strategies

### Automatic Strategies
- **Lock File Removal**: Instantly remove stale locks
- **Index Rebuilding**: Reconstruct corrupted index files
- **Operation Cleanup**: Complete or abort interrupted operations
- **Reference Pruning**: Clean up invalid references

### Manual Intervention
- **Object Recovery**: Complex object database repair
- **Configuration Restoration**: Fix corrupted git config
- **Filesystem Issues**: Address permission and space problems

### Backup/Restore
- **Point-in-Time Recovery**: Restore from known good state
- **Selective Restoration**: Restore specific files or refs
- **Emergency Fallback**: Complete repository reconstruction

## Testing Coverage

The system includes comprehensive test coverage for:

- ✅ **Unit Tests**: Each component tested in isolation
- ✅ **Integration Tests**: End-to-end recovery workflows
- ✅ **Performance Tests**: Ensure minimal performance impact
- ✅ **Scenario Tests**: Real-world corruption scenarios
- ✅ **Error Handling**: Graceful handling of edge cases

## Integration with GitPlus Architecture

### MCP-First Design
- Maintains GitPlus's simplified 3-tool interface
- Corruption recovery is transparent to MCP users
- Automatic integration with `ship`, `status`, and `info` commands

### AI-Powered Intelligence
- Leverages existing AI service for smart recovery decisions
- Intelligent backup creation timing
- Risk assessment and recommendation generation

### Security-First Approach  
- Respects existing security validation
- Safe command execution with corruption checks
- Minimal privilege requirements for recovery operations

## Future Enhancements

### Planned Features
- **Remote Backup Support**: Cloud-based backup storage
- **Collaborative Recovery**: Team-based corruption resolution
- **Predictive Detection**: AI-powered corruption prediction
- **Recovery Analytics**: Detailed recovery success metrics

### Advanced Capabilities
- **Cross-Platform Optimization**: Platform-specific recovery strategies
- **Large Repository Support**: Optimizations for monorepos
- **Custom Recovery Scripts**: User-defined recovery procedures

## Best Practices

### For Users
1. **Enable Automatic Checks**: Keep corruption monitoring enabled
2. **Regular Backups**: Create backups before major operations
3. **Monitor Disk Space**: Prevent corruption from disk full scenarios
4. **Update Regularly**: Keep git and GitPlus updated

### For Developers
1. **Test Recovery Paths**: Include corruption scenarios in testing
2. **Monitor Performance**: Track corruption check performance impact
3. **Log Recovery Events**: Maintain detailed logs for debugging
4. **Document Custom Strategies**: Document any custom recovery procedures

## Conclusion

The GitPlus Corruption Recovery System provides enterprise-grade repository protection while maintaining the simplicity and intelligence that defines GitPlus. By combining automatic detection, intelligent recovery, and comprehensive data preservation, it ensures that repository corruption never blocks development workflows.

The system's modular architecture allows for easy extension and customization while the comprehensive test suite ensures reliability in production environments. Integration with GitPlus's existing MCP-first design means users benefit from corruption protection without additional complexity in their daily workflows.