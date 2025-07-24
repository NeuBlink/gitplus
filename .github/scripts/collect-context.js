#!/usr/bin/env node

/**
 * Enhanced context collection script for AI merge decision
 * Gathers comprehensive information about PR, CI results, and project state
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ContextCollector {
  constructor() {
    this.contextDir = '.github/context';
    
    // Validate and sanitize all environment variables
    this.prNumber = this.validatePRNumber(process.env.GITHUB_PR_NUMBER);
    this.baseSha = this.validateSHA(process.env.GITHUB_BASE_SHA);
    this.headSha = this.validateSHA(process.env.GITHUB_HEAD_SHA);
    this.baseRef = this.validateGitRef(process.env.GITHUB_BASE_REF);
    this.headRef = this.validateGitRef(process.env.GITHUB_HEAD_REF);
    this.repository = this.validateRepository(process.env.GITHUB_REPOSITORY);
    this.token = process.env.GITHUB_TOKEN; // Token is used in env, not shell commands
  }

  /**
   * Validate and sanitize PR number
   */
  validatePRNumber(prNumber) {
    if (!prNumber || !/^\d+$/.test(prNumber)) {
      throw new Error('Invalid PR number');
    }
    return prNumber;
  }

  /**
   * Validate and sanitize SHA hashes
   */
  validateSHA(sha) {
    if (!sha || !/^[a-f0-9]{40}$/i.test(sha)) {
      throw new Error(`Invalid SHA hash: ${sha}`);
    }
    return sha;
  }

  /**
   * Validate and sanitize Git references
   */
  validateGitRef(ref) {
    if (!ref) {
      throw new Error('Git reference is required');
    }
    // Allow alphanumeric, dash, underscore, slash, and dot
    if (!/^[a-zA-Z0-9\-_./]+$/.test(ref)) {
      throw new Error(`Invalid Git reference: ${ref}`);
    }
    return ref;
  }

  /**
   * Validate and sanitize repository name
   */
  validateRepository(repository) {
    if (!repository) {
      throw new Error('Repository name is required');
    }
    // Format: owner/repo
    if (!/^[a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+$/.test(repository)) {
      throw new Error(`Invalid repository format: ${repository}`);
    }
    return repository;
  }

  /**
   * Execute shell command safely with input validation and parameterized commands
   */
  safeExecSync(command, args = [], options = {}) {
    // Support both old string format and new array format for gradual migration
    if (typeof command === 'string' && args.length === 0) {
      // Legacy string command - perform strict validation
      if (!command || typeof command !== 'string') {
        throw new Error('Invalid command');
      }
      
      // Prevent command injection by checking for dangerous patterns
      const dangerousPatterns = [
        /[;&|`$()]/,  // Command separators and substitution
        /\.\.\//,     // Path traversal
        /^sudo\s/,    // Privilege escalation
        /rm\s+-rf/,   // Dangerous file operations
        />\s*\/dev\/null\s*2>&1/,  // Output redirection (already handled in npm commands)
      ];
      
      // Allow some safe redirections for npm audit
      const allowedRedirections = command.includes('2>/dev/null') && 
        (command.includes('git diff') || command.includes('echo'));
      
      if (!allowedRedirections) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(command)) {
            throw new Error(`Potentially dangerous command pattern detected: ${command}`);
          }
        }
      }
      
      try {
        return execSync(command, {
          encoding: 'utf8',
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB max buffer
          stdio: ['ignore', 'pipe', 'pipe'], // Prevent stdin input
          ...options
        });
      } catch (error) {
        console.warn(`Command failed: ${command}`);
        console.warn(`Error: ${error.message}`);
        throw error;
      }
    } else {
      // New parameterized format - safer
      if (!Array.isArray(args)) {
        throw new Error('Arguments must be an array');
      }
      
      // Validate command name
      if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
        throw new Error(`Invalid command name: ${command}`);
      }
      
      // Validate all arguments
      args.forEach(arg => {
        if (typeof arg !== 'string') {
          throw new Error(`Invalid argument type: ${typeof arg}`);
        }
        // Basic validation - no command injection characters
        if (/[;&|`$()]/.test(arg)) {
          throw new Error(`Potentially dangerous argument: ${arg}`);
        }
      });
      
      const fullCommand = `${command} ${args.join(' ')}`;
      
      try {
        return execSync(fullCommand, {
          encoding: 'utf8',
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB max buffer
          stdio: ['ignore', 'pipe', 'pipe'], // Prevent stdin input
          ...options
        });
      } catch (error) {
        console.warn(`Command failed: ${fullCommand}`);
        console.warn(`Error: ${error.message}`);
        throw error;
      }
    }
  }

  async collectAll() {
    console.log('🔍 Starting comprehensive context collection...');
    
    // Ensure context directory exists
    if (!fs.existsSync(this.contextDir)) {
      fs.mkdirSync(this.contextDir, { recursive: true });
    }

    try {
      await this.collectPRInformation();
      await this.collectCommitAnalysis();
      await this.collectFileChanges();
      await this.collectCIResults();
      await this.collectSecurityContext();
      await this.collectProjectContext();
      await this.collectTestResults();
      await this.analyzeComplexity();
      await this.collectDependencyChanges();
      
      console.log('✅ Context collection completed successfully');
    } catch (error) {
      console.error('❌ Error during context collection:', error.message);
      process.exit(1);
    }
  }

  async collectPRInformation() {
    console.log('📋 Collecting PR information...');
    
    const prInfo = {
      number: this.prNumber,
      baseBranch: this.baseRef,
      headBranch: this.headRef,
      baseSha: this.baseSha,
      headSha: this.headSha,
      repository: this.repository,
      collectedAt: new Date().toISOString()
    };

    // Get PR details via GitHub API if available
    if (this.token) {
      try {
        const prData = this.safeExecSync('gh', ['api', `repos/${this.repository}/pulls/${this.prNumber}`], {
          env: { ...process.env, GH_TOKEN: this.token }
        });
        
        const pr = JSON.parse(prData);
        prInfo.title = pr.title;
        prInfo.body = pr.body;
        prInfo.author = pr.user.login;
        prInfo.authorAssociation = pr.author_association;
        prInfo.changedFiles = pr.changed_files;
        prInfo.additions = pr.additions;
        prInfo.deletions = pr.deletions;
        prInfo.reviewComments = pr.review_comments;
        prInfo.comments = pr.comments;
        prInfo.draft = pr.draft;
        prInfo.mergeable = pr.mergeable;
        prInfo.mergeableState = pr.mergeable_state;
        prInfo.labels = pr.labels.map(l => l.name);
      } catch (error) {
        console.warn('⚠️ Could not fetch PR details via API:', error.message);
      }
    }

    this.writeContextFile('pr-info.json', JSON.stringify(prInfo, null, 2));
    
    // Also create a human-readable version
    let readable = `=== PULL REQUEST INFORMATION ===\n`;
    readable += `PR #${prInfo.number}: ${prInfo.title || 'No title'}\n`;
    readable += `Author: ${prInfo.author || 'Unknown'} (${prInfo.authorAssociation || 'Unknown'})\n`;
    readable += `Branch: ${prInfo.headBranch} → ${prInfo.baseBranch}\n`;
    readable += `Files: ${prInfo.changedFiles || 'Unknown'} changed, +${prInfo.additions || 0}/-${prInfo.deletions || 0}\n`;
    readable += `Status: ${prInfo.draft ? 'Draft' : 'Ready'}, Mergeable: ${prInfo.mergeable}\n`;
    readable += `Labels: ${prInfo.labels ? prInfo.labels.join(', ') : 'None'}\n\n`;
    
    if (prInfo.body) {
      readable += `=== DESCRIPTION ===\n${prInfo.body}\n\n`;
    }

    this.writeContextFile('pr-info.txt', readable);
  }

  async collectCommitAnalysis() {
    console.log('📝 Analyzing commits...');
    
    try {
      // Get commit list using validated SHAs
      const commits = this.safeExecSync('git', ['log', '--oneline', `${this.baseSha}..${this.headSha}`]);
      
      // Get detailed commit info using validated SHAs
      const commitDetails = this.safeExecSync('git', ['log', '--format=%H|%an|%ae|%ad|%s|%b', '--date=iso', `${this.baseSha}..${this.headSha}`]);
      
      // Analyze commit messages for conventional commits
      const conventionalCommits = this.analyzeConventionalCommits(commits);
      
      let analysis = `=== COMMIT ANALYSIS ===\n`;
      analysis += `Total commits: ${commits.split('\n').filter(line => line.trim()).length}\n\n`;
      
      analysis += `=== COMMITS ===\n${commits}\n`;
      analysis += `=== DETAILED COMMITS ===\n${commitDetails}\n`;
      analysis += `=== CONVENTIONAL COMMITS ANALYSIS ===\n${conventionalCommits}\n`;
      
      this.writeContextFile('commits.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not analyze commits:', error.message);
      this.writeContextFile('commits.txt', 'Error collecting commit information\n');
    }
  }

  analyzeConventionalCommits(commits) {
    const lines = commits.split('\n').filter(line => line.trim());
    const types = {
      feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, 
      test: 0, chore: 0, perf: 0, ci: 0, build: 0, revert: 0
    };
    
    let conventionalCount = 0;
    let breakingChanges = 0;
    
    lines.forEach(line => {
      const match = line.match(/^\w+ (.+)$/);
      if (match) {
        const message = match[1];
        const typeMatch = message.match(/^(\w+)(\(.+\))?(!?):/);
        if (typeMatch) {
          conventionalCount++;
          const type = typeMatch[1];
          const hasBreaking = typeMatch[3] === '!';
          
          if (types.hasOwnProperty(type)) {
            types[type]++;
          }
          if (hasBreaking) {
            breakingChanges++;
          }
        }
      }
    });
    
    let analysis = `Conventional commits: ${conventionalCount}/${lines.length}\n`;
    analysis += `Breaking changes: ${breakingChanges}\n`;
    analysis += `Commit types:\n`;
    Object.entries(types).forEach(([type, count]) => {
      if (count > 0) {
        analysis += `  ${type}: ${count}\n`;
      }
    });
    
    return analysis;
  }

  async collectFileChanges() {
    console.log('📁 Analyzing file changes...');
    
    try {
      // Get file change status using validated SHAs
      const fileStatus = this.safeExecSync('git', ['diff', '--name-status', `${this.baseSha}..${this.headSha}`]);
      
      // Get diff statistics using validated SHAs
      const diffStats = this.safeExecSync('git', ['diff', '--stat', `${this.baseSha}..${this.headSha}`]);
      
      // Analyze file types using validated SHAs
      const changedFiles = this.safeExecSync('git', ['diff', '--name-only', `${this.baseSha}..${this.headSha}`]);
      const fileTypes = this.analyzeFileTypes(changedFiles);
      
      // Check for critical file changes
      const criticalChanges = this.analyzeCriticalFiles(changedFiles);
      
      let analysis = `=== FILE CHANGES ANALYSIS ===\n\n`;
      analysis += `=== CHANGED FILES ===\n${fileStatus}\n`;
      analysis += `=== DIFF STATISTICS ===\n${diffStats}\n`;
      analysis += `=== FILE TYPE ANALYSIS ===\n${fileTypes}\n`;
      analysis += `=== CRITICAL FILES ANALYSIS ===\n${criticalChanges}\n`;
      
      this.writeContextFile('file-changes.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not analyze file changes:', error.message);
      this.writeContextFile('file-changes.txt', 'Error analyzing file changes\n');
    }
  }

  analyzeFileTypes(changedFiles) {
    const files = changedFiles.split('\n').filter(f => f.trim());
    const typeCount = {};
    
    files.forEach(file => {
      const ext = path.extname(file) || 'no-extension';
      typeCount[ext] = (typeCount[ext] || 0) + 1;
    });
    
    let analysis = `Total files changed: ${files.length}\n`;
    Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ext, count]) => {
        analysis += `${ext}: ${count} files\n`;
      });
    
    return analysis;
  }

  analyzeCriticalFiles(changedFiles) {
    const files = changedFiles.split('\n').filter(f => f.trim());
    const criticalPatterns = [
      { pattern: /package\.json$/, type: 'Dependencies' },
      { pattern: /package-lock\.json$/, type: 'Lock file' },
      { pattern: /tsconfig\.json$/, type: 'TypeScript config' },
      { pattern: /\.github\/workflows\//, type: 'GitHub Actions' },
      { pattern: /src\/index\.(ts|js)$/, type: 'Main entry point' },
      { pattern: /README\.md$/, type: 'Documentation' },
      { pattern: /CHANGELOG\.md$/, type: 'Changelog' },
      { pattern: /\.env/, type: 'Environment config' },
      { pattern: /docker/i, type: 'Docker config' },
      { pattern: /test|spec/i, type: 'Tests' }
    ];
    
    let analysis = '';
    criticalPatterns.forEach(({ pattern, type }) => {
      const matches = files.filter(file => pattern.test(file));
      if (matches.length > 0) {
        analysis += `${type}: ${matches.length} files\n`;
        matches.forEach(file => analysis += `  - ${file}\n`);
      }
    });
    
    return analysis || 'No critical files changed\n';
  }

  async collectCIResults() {
    console.log('🔧 Collecting CI results...');
    
    if (!this.token) {
      this.writeContextFile('ci-results.txt', 'GitHub token not available for CI results\n');
      return;
    }
    
    try {
      // Get check runs for the head SHA
      const checkRuns = this.safeExecSync('gh', ['api', `repos/${this.repository}/commits/${this.headSha}/check-runs`], {
        env: { ...process.env, GH_TOKEN: this.token }
      });
      
      const data = JSON.parse(checkRuns);
      
      let analysis = `=== CI CHECK RESULTS ===\n`;
      analysis += `Total checks: ${data.total_count}\n\n`;
      
      data.check_runs.forEach(check => {
        analysis += `Check: ${check.name}\n`;
        analysis += `  Status: ${check.status}\n`;
        analysis += `  Conclusion: ${check.conclusion || 'N/A'}\n`;
        analysis += `  Started: ${check.started_at}\n`;
        analysis += `  Completed: ${check.completed_at || 'N/A'}\n`;
        if (check.output && check.output.summary) {
          analysis += `  Summary: ${check.output.summary.substring(0, 200)}...\n`;
        }
        analysis += '\n';
      });
      
      // Now collect Claude Code review data
      await this.collectClaudeReview();
      
      this.writeContextFile('ci-results.txt', analysis);
      this.writeContextFile('ci-results.json', JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not collect CI results:', error.message);
      this.writeContextFile('ci-results.txt', `Error collecting CI results: ${error.message}\n`);
    }
  }

  async collectClaudeReview() {
    console.log('🤖 Collecting Claude Code review...');
    
    try {
      // Get PR review comments from Claude
      const reviews = this.safeExecSync('gh', ['api', `repos/${this.repository}/pulls/${this.prNumber}/reviews`], {
        env: { ...process.env, GH_TOKEN: this.token }
      });
      
      const reviewData = JSON.parse(reviews);
      const claudeReviews = reviewData.filter(review => 
        review.user.login.includes('claude') || 
        review.user.login.includes('github-actions')
      );
      
      this.writeContextFile('claude-review.json', JSON.stringify(claudeReviews, null, 2));
      
      // Get issue comments from Claude
      const comments = this.safeExecSync('gh', ['api', `repos/${this.repository}/issues/${this.prNumber}/comments`], {
        env: { ...process.env, GH_TOKEN: this.token }
      });
      
      const commentData = JSON.parse(comments);
      const claudeComments = commentData.filter(comment => 
        comment.user.login.includes('claude') || 
        comment.user.login.includes('github-actions')
      );
      
      this.writeContextFile('claude-comments.json', JSON.stringify(claudeComments, null, 2));
      
      // Analyze Claude review sentiment
      let reviewAnalysis = `=== CLAUDE CODE REVIEW ANALYSIS ===\n\n`;
      
      if (claudeReviews.length > 0) {
        reviewAnalysis += `Claude reviews found: ${claudeReviews.length}\n\n`;
        
        claudeReviews.forEach((review, index) => {
          reviewAnalysis += `Review ${index + 1}:\n`;
          reviewAnalysis += `  State: ${review.state}\n`;
          reviewAnalysis += `  Submitted: ${review.submitted_at}\n`;
          
          if (review.body) {
            // Analyze sentiment
            const body = review.body.toLowerCase();
            let sentiment = 'neutral';
            
            if (body.includes('not recommend') || body.includes('should not') || 
                body.includes('blocking') || body.includes('critical issue') ||
                body.includes('❌') || body.includes('🚫')) {
              sentiment = 'negative';
            } else if (body.includes('looks good') || body.includes('approved') || 
                      body.includes('ready') || body.includes('✅') || 
                      body.includes('well done')) {
              sentiment = 'positive';
            }
            
            reviewAnalysis += `  Sentiment: ${sentiment}\n`;
            reviewAnalysis += `  Body preview: ${review.body.substring(0, 200)}...\n`;
          }
          reviewAnalysis += '\n';
        });
      } else {
        reviewAnalysis += `No Claude Code reviews found\n\n`;
      }
      
      if (claudeComments.length > 0) {
        reviewAnalysis += `Claude comments found: ${claudeComments.length}\n`;
        claudeComments.forEach((comment, index) => {
          reviewAnalysis += `Comment ${index + 1}: ${comment.body.substring(0, 100)}...\n`;
        });
      }
      
      this.writeContextFile('claude-review-analysis.txt', reviewAnalysis);
      
    } catch (error) {
      console.warn('⚠️ Could not collect Claude review:', error.message);
      this.writeContextFile('claude-review.json', '[]');
      this.writeContextFile('claude-comments.json', '[]');
      this.writeContextFile('claude-review-analysis.txt', `Error collecting Claude review: ${error.message}\n`);
    }
  }

  async collectSecurityContext() {
    console.log('🔒 Analyzing security context...');
    
    try {
      let analysis = `=== SECURITY ANALYSIS ===\n\n`;
      
      // Check for potential secrets in diff
      const diff = this.safeExecSync('git', ['diff', `${this.baseSha}..${this.headSha}`]);
      const secretPatterns = [
        /api[_-]?key/i,
        /password/i,
        /secret/i,
        /token/i,
        /auth/i,
        /private[_-]?key/i,
        /[0-9a-f]{32,}/i // Hex strings that might be keys
      ];
      
      let potentialSecrets = [];
      secretPatterns.forEach(pattern => {
        const matches = diff.match(new RegExp(`^\\+.*${pattern.source}`, 'gim'));
        if (matches) {
          potentialSecrets.push(...matches);
        }
      });
      
      if (potentialSecrets.length > 0) {
        analysis += `⚠️ POTENTIAL SECRETS DETECTED:\n`;
        potentialSecrets.slice(0, 5).forEach(match => {
          analysis += `  ${match.substring(0, 100)}...\n`;
        });
        analysis += '\n';
      } else {
        analysis += `✅ No obvious secrets detected in diff\n\n`;
      }
      
      // Check for dependency vulnerabilities
      if (fs.existsSync('package.json')) {
        try {
          const auditResult = this.safeExecSync('npm audit --json');
          const audit = JSON.parse(auditResult);
          
          analysis += `=== DEPENDENCY SECURITY ===\n`;
          analysis += `Vulnerabilities: ${audit.metadata.vulnerabilities.total}\n`;
          analysis += `  Critical: ${audit.metadata.vulnerabilities.critical}\n`;
          analysis += `  High: ${audit.metadata.vulnerabilities.high}\n`;
          analysis += `  Moderate: ${audit.metadata.vulnerabilities.moderate}\n`;
          analysis += `  Low: ${audit.metadata.vulnerabilities.low}\n\n`;
        } catch (error) {
          analysis += `Could not run security audit: ${error.message}\n\n`;
        }
      }
      
      this.writeContextFile('security-analysis.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not perform security analysis:', error.message);
      this.writeContextFile('security-analysis.txt', `Error in security analysis: ${error.message}\n`);
    }
  }

  async collectProjectContext() {
    console.log('📦 Collecting project context...');
    
    try {
      let context = `=== PROJECT CONTEXT ===\n\n`;
      
      // Package.json analysis
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        context += `Package: ${pkg.name} v${pkg.version}\n`;
        context += `Description: ${pkg.description || 'No description'}\n`;
        context += `License: ${pkg.license || 'No license'}\n`;
        context += `Dependencies: ${Object.keys(pkg.dependencies || {}).length}\n`;
        context += `Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).length}\n\n`;
      }
      
      // Git tags/releases
      try {
        const tags = this.safeExecSync('git tag --sort=-version:refname').split('\n').slice(0, 5);
        context += `Recent tags: ${tags.filter(t => t.trim()).join(', ')}\n\n`;
      } catch (error) {
        context += `No git tags found\n\n`;
      }
      
      // Repository stats
      try {
        const contributors = this.safeExecSync('git shortlog -sn').split('\n').length - 1;
        const totalCommits = this.safeExecSync('git rev-list --count HEAD').trim();
        context += `Contributors: ${contributors}\n`;
        context += `Total commits: ${totalCommits}\n\n`;
      } catch (error) {
        context += `Could not get repository stats\n\n`;
      }
      
      this.writeContextFile('project-context.txt', context);
    } catch (error) {
      console.warn('⚠️ Could not collect project context:', error.message);
      this.writeContextFile('project-context.txt', `Error collecting project context: ${error.message}\n`);
    }
  }

  async collectTestResults() {
    console.log('🧪 Analyzing test context...');
    
    let analysis = `=== TEST ANALYSIS ===\n\n`;
    
    try {
      // Look for test files in the changes
      const changedFiles = this.safeExecSync('git', ['diff', '--name-only', `${this.baseSha}..${this.headSha}`]);
      const testFiles = changedFiles.split('\n').filter(file => 
        /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(file) || 
        /test|spec|__tests__/.test(file)
      );
      
      analysis += `Test files changed: ${testFiles.length}\n`;
      testFiles.forEach(file => analysis += `  - ${file}\n`);
      analysis += '\n';
      
      // Check if package.json has test scripts
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const testScripts = Object.keys(pkg.scripts || {}).filter(script => 
          script.includes('test') || script.includes('jest') || script.includes('mocha')
        );
        
        analysis += `Available test scripts: ${testScripts.join(', ')}\n`;
      }
      
      // Look for coverage information
      if (fs.existsSync('coverage/lcov.info')) {
        analysis += `Coverage report found\n`;
      }
      
      if (fs.existsSync('jest.config.js') || fs.existsSync('jest.config.json')) {
        analysis += `Jest configuration found\n`;
      }
      
      this.writeContextFile('test-analysis.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not analyze tests:', error.message);
      this.writeContextFile('test-analysis.txt', `Error analyzing tests: ${error.message}\n`);
    }
  }

  async analyzeComplexity() {
    console.log('📊 Analyzing code complexity...');
    
    try {
      const changedFiles = this.safeExecSync('git', ['diff', '--name-only', `${this.baseSha}..${this.headSha}`])
        .split('\n')
        .filter(file => file.trim() && /\.(ts|js|tsx|jsx)$/.test(file));
      
      let analysis = `=== COMPLEXITY ANALYSIS ===\n\n`;
      analysis += `Code files changed: ${changedFiles.length}\n\n`;
      
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;
      
      changedFiles.forEach(file => {
        try {
          const diff = this.safeExecSync('git', ['diff', `${this.baseSha}..${this.headSha}`, '--', file]);
          const added = (diff.match(/^\+[^+]/gm) || []).length;
          const removed = (diff.match(/^-[^-]/gm) || []).length;
          
          totalLinesAdded += added;
          totalLinesRemoved += removed;
          
          if (added > 50 || removed > 50) {
            analysis += `${file}: +${added}/-${removed} (significant change)\n`;
          }
        } catch (error) {
          // File might have been renamed or deleted
        }
      });
      
      analysis += `\nTotal lines: +${totalLinesAdded}/-${totalLinesRemoved}\n`;
      
      if (totalLinesAdded > 500) {
        analysis += `⚠️ Large addition - consider breaking into smaller PRs\n`;
      }
      
      if (totalLinesRemoved > 500) {
        analysis += `⚠️ Large deletion - ensure no functionality is lost\n`;
      }
      
      this.writeContextFile('complexity-analysis.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not analyze complexity:', error.message);
      this.writeContextFile('complexity-analysis.txt', `Error analyzing complexity: ${error.message}\n`);
    }
  }

  async collectDependencyChanges() {
    console.log('📦 Analyzing dependency changes...');
    
    try {
      let analysis = `=== DEPENDENCY CHANGES ===\n\n`;
      
      // Check if package.json changed  
      let packageDiff;
      try {
        packageDiff = this.safeExecSync('git', ['diff', `${this.baseSha}..${this.headSha}`, '--', 'package.json']);
      } catch (error) {
        packageDiff = 'No package.json changes';
      }
      
      if (packageDiff.includes('No package.json changes')) {
        analysis += `No dependency changes detected\n`;
      } else {
        analysis += `Package.json changes:\n${packageDiff}\n\n`;
        
        // Analyze specific dependency changes
        const addedDeps = packageDiff.match(/^\+\s*"[^"]+"\s*:/gm) || [];
        const removedDeps = packageDiff.match(/^-\s*"[^"]+"\s*:/gm) || [];
        const modifiedDeps = packageDiff.match(/^[\+\-]\s*"[^"]+"\s*:\s*"[^"]+"/gm) || [];
        
        analysis += `Dependencies added: ${addedDeps.length}\n`;
        analysis += `Dependencies removed: ${removedDeps.length}\n`;
        analysis += `Dependencies modified: ${modifiedDeps.length / 2}\n\n`; // Divided by 2 because each change shows both old and new
        
        if (addedDeps.length > 0) {
          analysis += `Added dependencies:\n`;
          addedDeps.forEach(dep => analysis += `  ${dep.trim()}\n`);
          analysis += '\n';
        }
        
        if (removedDeps.length > 0) {
          analysis += `Removed dependencies:\n`;
          removedDeps.forEach(dep => analysis += `  ${dep.trim()}\n`);
          analysis += '\n';
        }
      }
      
      // Check package-lock.json changes
      try {
        const lockDiff = this.safeExecSync('git', ['diff', '--stat', `${this.baseSha}..${this.headSha}`, '--', 'package-lock.json']);
        if (lockDiff.trim()) {
          analysis += `Package-lock.json changed:\n${lockDiff}\n`;
        }
      } catch (error) {
        // No package-lock changes or file doesn't exist
      }
      
      this.writeContextFile('dependency-changes.txt', analysis);
    } catch (error) {
      console.warn('⚠️ Could not analyze dependencies:', error.message);
      this.writeContextFile('dependency-changes.txt', `Error analyzing dependencies: ${error.message}\n`);
    }
  }

  /**
   * Write context file safely with path validation
   */
  writeContextFile(filename, content) {
    // Validate filename to prevent path traversal
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename');
    }
    
    // Only allow alphanumeric, dash, underscore, and dot
    if (!/^[a-zA-Z0-9\-_.]+$/.test(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }
    
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error(`Path traversal attempted in filename: ${filename}`);
    }
    
    try {
      const filepath = path.join(this.contextDir, filename);
      
      // Ensure the filepath is within the context directory
      const resolvedPath = path.resolve(filepath);
      const resolvedContextDir = path.resolve(this.contextDir);
      
      if (!resolvedPath.startsWith(resolvedContextDir)) {
        throw new Error(`File path outside context directory: ${filepath}`);
      }
      
      fs.writeFileSync(filepath, content);
      console.log(`  ✅ Created ${filename}`);
    } catch (error) {
      console.error(`  ❌ Failed to write ${filename}: ${error.message}`);
      throw error;
    }
  }
}

// Run the context collector
if (require.main === module) {
  const collector = new ContextCollector();
  collector.collectAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ContextCollector;