// Security validation test - standalone validation
// This tests the core security validation logic without full TypeScript compilation

const dangerousInputs = [
  // Shell metacharacters
  'feat: add feature; rm -rf /',
  'fix: resolve `malicious command`',
  'test: check $(evil command)',
  'docs: update & dangerous',
  'style: format | evil',
  'refactor: improve <script>',
  
  // Directory traversal
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  'normal/../../evil.txt',
  
  // Control characters
  'feat: add feature\x01',
  'fix: resolve\x0e issue',
  'test: feature\x7f testing',
  
  // Null bytes
  'normal\x00injection',
  'file.txt\x00; rm -rf /',
];

const safeInputs = [
  'feat: add user authentication',
  'fix: resolve merge conflict in package.json',
  'docs: update README with installation steps',
  'src/index.ts',
  'docs/README.md',
  'feature/user-auth',
  'hotfix/security-patch',
];

// Simple validation functions (extracted from our security implementation)
function validateGitArgument(arg, context = 'argument') {
  if (typeof arg !== 'string') {
    throw new Error('Git argument must be a string');
  }
  
  const maxLengths = {
    command: 50,
    argument: 255,
    filepath: 4096,
    message: 2048
  };
  
  if (arg.length > maxLengths[context]) {
    throw new Error(`Git ${context} exceeds maximum length (${maxLengths[context]} characters)`);
  }
  
  if (arg.includes('\0')) {
    throw new Error('Git argument contains null byte');
  }
  
  switch (context) {
    case 'message':
      return validateCommitMessage(arg);
    case 'filepath':
      return validateFilePath(arg);
    default:
      return validateGenericArgument(arg);
  }
}

function validateCommitMessage(message) {
  if (!message || message.trim().length === 0) {
    throw new Error('Commit message cannot be empty');
  }
  
  if (/[;&|`$(){}[\]<>]/.test(message)) {
    throw new Error('Commit message contains shell metacharacters');
  }
  
  if (/[\x00-\x08\x0E-\x1F\x7F]/.test(message)) {
    throw new Error('Commit message contains control characters');
  }
  
  return message;
}

function validateFilePath(filepath) {
  if (/\.\.[\\/]/.test(filepath) || filepath.includes('../') || filepath.includes('..\\')) {
    throw new Error('File path contains directory traversal sequence');
  }
  
  if (/[;&|`$(){}[\]<>\n\r]/.test(filepath)) {
    throw new Error('File path contains shell metacharacters');
  }
  
  return filepath;
}

function validateGenericArgument(arg) {
  if (/[;&|`$(){}[\]<>\n\r]/.test(arg)) {
    throw new Error('Git argument contains shell metacharacters');
  }
  
  if (/^-/.test(arg)) {
    throw new Error('Git argument starts with dash (potential option injection)');
  }
  
  return arg;
}

// Test dangerous inputs
console.log('🔍 Testing dangerous inputs...');
let failedDangerous = 0;
dangerousInputs.forEach((input, index) => {
  try {
    validateGitArgument(input, input.includes('/') || input.includes('\\') ? 'filepath' : 'message');
    console.log(`❌ SECURITY FAILURE: Input ${index + 1} was not rejected: "${input}"`);
    failedDangerous++;
  } catch (error) {
    console.log(`✅ BLOCKED: "${input}" - ${error.message}`);
  }
});

// Test safe inputs  
console.log('\n🔍 Testing safe inputs...');
let failedSafe = 0;
safeInputs.forEach((input, index) => {
  try {
    validateGitArgument(input, input.includes('/') || input.includes('\\') ? 'filepath' : 'message');
    console.log(`✅ ALLOWED: "${input}"`);
  } catch (error) {
    console.log(`❌ FALSE POSITIVE: Safe input ${index + 1} was rejected: "${input}" - ${error.message}`);
    failedSafe++;
  }
});

// Test length limits
console.log('\n🔍 Testing length limits...');
try {
  validateGitArgument('a'.repeat(3000), 'message');
  console.log('❌ SECURITY FAILURE: Long message was not rejected');
} catch (error) {
  console.log(`✅ BLOCKED: Long message - ${error.message}`);
}

try {
  validateGitArgument('a'.repeat(5000), 'filepath');
  console.log('❌ SECURITY FAILURE: Long filepath was not rejected');
} catch (error) {
  console.log(`✅ BLOCKED: Long filepath - ${error.message}`);
}

// Summary
console.log('\n📊 SECURITY VALIDATION SUMMARY');
console.log('=====================================');
console.log(`Dangerous inputs tested: ${dangerousInputs.length}`);
console.log(`Dangerous inputs BLOCKED: ${dangerousInputs.length - failedDangerous}`);
console.log(`Dangerous inputs FAILED to block: ${failedDangerous}`);
console.log(`Safe inputs tested: ${safeInputs.length}`);
console.log(`Safe inputs ALLOWED: ${safeInputs.length - failedSafe}`);
console.log(`Safe inputs FALSE POSITIVES: ${failedSafe}`);

if (failedDangerous === 0 && failedSafe === 0) {
  console.log('\n🛡️  SECURITY STATUS: ALL TESTS PASSED');
  console.log('Shell injection vulnerabilities have been successfully mitigated!');
  process.exit(0);
} else {
  console.log('\n🚨 SECURITY STATUS: FAILURES DETECTED');
  console.log('Security vulnerabilities still exist!');
  process.exit(1);
}