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
    this.prNumber = process.env.GITHUB_PR_NUMBER;
    this.baseSha = process.env.GITHUB_BASE_SHA;
    this.headSha = process.env.GITHUB_HEAD_SHA;
    this.baseRef = process.env.GITHUB_BASE_REF;
    this.headRef = process.env.GITHUB_HEAD_REF;
    this.repository = process.env.GITHUB_REPOSITORY;
    this.token = process.env.GITHUB_TOKEN;
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
        const prData = execSync(`gh api repos/${this.repository}/pulls/${this.prNumber}`, {
          env: { ...process.env, GH_TOKEN: this.token }
        }).toString();
        
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
      // Get commit list
      const commits = execSync(`git log --oneline ${this.baseSha}..${this.headSha}`).toString();
      
      // Get detailed commit info
      const commitDetails = execSync(`git log --format="%H|%an|%ae|%ad|%s|%b" --date=iso ${this.baseSha}..${this.headSha}`).toString();
      
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
      // Get file change status
      const fileStatus = execSync(`git diff --name-status ${this.baseSha}..${this.headSha}`).toString();
      
      // Get diff statistics
      const diffStats = execSync(`git diff --stat ${this.baseSha}..${this.headSha}`).toString();
      
      // Analyze file types
      const changedFiles = execSync(`git diff --name-only ${this.baseSha}..${this.headSha}`).toString();
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
      const checkRuns = execSync(`gh api repos/${this.repository}/commits/${this.headSha}/check-runs`, {
        env: { ...process.env, GH_TOKEN: this.token }
      }).toString();
      
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
      const reviewsCmd = `gh api repos/${this.repository}/pulls/${this.prNumber}/reviews`;
      const reviews = execSync(reviewsCmd, {
        env: { ...process.env, GH_TOKEN: this.token }
      }).toString();
      
      const reviewData = JSON.parse(reviews);
      const claudeReviews = reviewData.filter(review => 
        review.user.login.includes('claude') || 
        review.user.login.includes('github-actions')
      );
      
      this.writeContextFile('claude-review.json', JSON.stringify(claudeReviews, null, 2));
      
      // Get issue comments from Claude
      const commentsCmd = `gh api repos/${this.repository}/issues/${this.prNumber}/comments`;
      const comments = execSync(commentsCmd, {
        env: { ...process.env, GH_TOKEN: this.token }
      }).toString();
      
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
      const diff = execSync(`git diff ${this.baseSha}..${this.headSha}`).toString();
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
          const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
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
        const tags = execSync('git tag --sort=-version:refname').toString().split('\n').slice(0, 5);
        context += `Recent tags: ${tags.filter(t => t.trim()).join(', ')}\n\n`;
      } catch (error) {
        context += `No git tags found\n\n`;
      }
      
      // Repository stats
      try {
        const contributors = execSync('git shortlog -sn').toString().split('\n').length - 1;
        const totalCommits = execSync('git rev-list --count HEAD').toString().trim();
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
      const changedFiles = execSync(`git diff --name-only ${this.baseSha}..${this.headSha}`).toString();
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
      const changedFiles = execSync(`git diff --name-only ${this.baseSha}..${this.headSha}`).toString()
        .split('\n')
        .filter(file => file.trim() && /\.(ts|js|tsx|jsx)$/.test(file));
      
      let analysis = `=== COMPLEXITY ANALYSIS ===\n\n`;
      analysis += `Code files changed: ${changedFiles.length}\n\n`;
      
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;
      
      changedFiles.forEach(file => {
        try {
          const diff = execSync(`git diff ${this.baseSha}..${this.headSha} -- "${file}"`).toString();
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
      const packageDiff = execSync(`git diff ${this.baseSha}..${this.headSha} -- package.json 2>/dev/null || echo "No package.json changes"`).toString();
      
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
        const lockDiff = execSync(`git diff --stat ${this.baseSha}..${this.headSha} -- package-lock.json`).toString();
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

  writeContextFile(filename, content) {
    const filepath = path.join(this.contextDir, filename);
    fs.writeFileSync(filepath, content);
    console.log(`  ✅ Created ${filename}`);
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