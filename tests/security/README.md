# GitPlus Security Test Suite

This directory contains comprehensive security tests that verify the fixes implemented to address critical security vulnerabilities identified in the security audit.

## Vulnerabilities Fixed

### 1. **CRITICAL: Command Injection via eval** ❌➡️✅
- **File**: `tests/workflows/polling-logic.test.sh` line 147
- **Issue**: Dangerous `eval "$test_case"` usage allowed arbitrary code execution
- **Fix**: Replaced with safe case statement parsing with input validation
- **Test**: `hook-security.test.sh::test_eval_removal`

### 2. **HIGH: Shell Injection in Git Commands** ❌➡️✅
- **Files**: `src/git/client.ts`, `src/git/platform.ts`, `src/ai/service.ts`
- **Issue**: String interpolation in shell commands enabled injection attacks
- **Fix**: Replaced `execAsync` with `spawn` and proper argument separation
- **Test**: `security-audit.test.ts::Command Injection Prevention`

### 3. **MEDIUM: Environment Variable Validation** ❌➡️✅
- **Files**: `.claude/hooks/pre-ship-workflow.sh`, `.claude/hooks/auto-delegate-agent.sh`
- **Issue**: Missing validation of critical environment variables
- **Fix**: Added comprehensive environment validation with error handling
- **Test**: `hook-security.test.sh::test_environment_validation`

## Test Structure

### TypeScript Security Tests (`security-audit.test.ts`)

```typescript
describe('Security Audit Tests', () => {
  // Command injection prevention
  // Platform security validation
  // AI service security
  // Configuration parsing security
  // Input validation security
});
```

**Key Test Areas:**
- Git command argument validation and sanitization
- Shell metacharacter escaping
- Platform-specific input validation (branch names, usernames, labels)
- AI service spawn usage verification
- Configuration parsing without eval
- Input length and content validation

### Shell Script Security Tests (`hook-security.test.sh`)

**Test Functions:**
- `test_eval_removal()` - Verifies eval vulnerability is fixed
- `test_environment_validation()` - Checks environment variable validation
- `test_file_path_validation()` - Validates file path security
- `test_input_sanitization()` - Verifies input sanitization
- `test_secure_permissions()` - Checks secure file permissions
- `test_json_validation()` - Validates JSON input handling
- `test_resource_limits()` - Verifies resource consumption limits
- `test_no_dangerous_patterns()` - Scans for dangerous code patterns
- `test_configuration_parsing_safety()` - Validates safe config parsing

## Running Security Tests

### Run TypeScript Security Tests
```bash
cd /path/to/gitplus
npm test -- tests/security/security-audit.test.ts
```

### Run Shell Script Security Tests
```bash
cd /path/to/gitplus
./tests/security/hook-security.test.sh
```

### Run All Security Tests
```bash
cd /path/to/gitplus
npm run test:security  # If configured in package.json
```

## Security Measures Implemented

### 1. Command Injection Prevention
- **Input Validation**: All git arguments validated against whitelist patterns
- **Argument Sanitization**: Dangerous characters filtered and rejected
- **Command Whitelist**: Only approved git commands allowed
- **Length Limits**: Maximum argument length enforced (255 chars)
- **Spawn Usage**: Replaced shell interpolation with spawn for argument separation

### 2. Shell Escaping Fixes
- **Git Client**: Implemented `executeGitCommandWithSpawn` using spawn
- **Platform Provider**: Added secure command construction with validation
- **AI Service**: Already used spawn properly, verified security
- **Argument Escaping**: Proper shell argument escaping implemented

### 3. Environment Variable Validation
- **HOME Validation**: Checks existence, directory status, and write permissions
- **PATH Validation**: Ensures PATH is set for command resolution  
- **Tool Availability**: Validates required tools (git, jq) are available
- **Error Handling**: Comprehensive error reporting and graceful failure

### 4. Input Validation Enhancements
- **File Path Validation**: Prevents path traversal attacks (`../`, `//`)
- **Username Validation**: GitHub/GitLab username format validation
- **Branch Name Validation**: Prevents injection via branch names
- **Label Validation**: Sanitizes PR/MR label inputs
- **JSON Validation**: Size limits and structure validation for JSON inputs

### 5. Resource Protection
- **File Processing Limits**: Maximum 100 files processed per operation
- **JSON Size Limits**: 100KB maximum JSON input size
- **Timeout Controls**: 10-30 second timeouts for external operations
- **Memory Protection**: Input length limits prevent buffer overflow

### 6. Secure Configuration
- **Log Permissions**: 600 (user read/write only) for log files
- **Directory Permissions**: 700 (user access only) for sensitive directories
- **Safe Parsing**: Case statements replace dangerous eval usage
- **Numeric Validation**: Range checking for numeric configuration values

## Security Test Coverage

| Vulnerability Type | Test Coverage | Status |
|-------------------|---------------|---------|
| Command Injection | ✅ Comprehensive | Fixed |
| Shell Escaping | ✅ Comprehensive | Fixed |
| Environment Variables | ✅ Comprehensive | Fixed |
| Input Validation | ✅ Comprehensive | Fixed |
| Resource Exhaustion | ✅ Comprehensive | Fixed |
| Path Traversal | ✅ Comprehensive | Fixed |
| Configuration Parsing | ✅ Comprehensive | Fixed |
| Permission Controls | ✅ Comprehensive | Fixed |

## Continuous Security

### Code Review Checklist
- [ ] No `eval` usage with user input
- [ ] No string interpolation in shell commands
- [ ] All user inputs validated and sanitized
- [ ] Environment variables validated before use
- [ ] Resource limits implemented for user operations
- [ ] Secure file permissions set
- [ ] Error handling prevents information disclosure

### Automated Security Scanning
The security test suite should be run:
- On every pull request
- Before releases
- Weekly as part of security maintenance
- After any changes to shell scripts or command execution code

### Security Monitoring
- Monitor log files for security warnings
- Review failed authentication attempts
- Track resource usage patterns
- Audit file access patterns

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. Email security concerns to the maintainers privately
3. Include detailed reproduction steps
4. Provide suggested fixes if possible
5. Allow reasonable time for fixing before public disclosure

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-78: Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [CWE-79: Cross-site Scripting](https://cwe.mitre.org/data/definitions/79.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Bash Security Guidelines](https://mywiki.wooledge.org/BashGuide/Practices#Security_considerations)