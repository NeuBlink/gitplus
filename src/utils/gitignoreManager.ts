import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ProjectType, ProjectDetector } from './projectDetector';

export interface GitignoreUpdateResult {
  updated: boolean;
  created: boolean;
  newPatterns: string[];
  existingPatterns: string[];
  finalContent: string;
}

export class GitignoreManager {
  private repoPath: string;
  private gitignorePath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.gitignorePath = join(repoPath, '.gitignore');
  }

  /**
   * Update or create .gitignore based on detected project type
   */
  updateGitignore(projectType: ProjectType, secondaryTypes: ProjectType[] = []): GitignoreUpdateResult {
    const detector = new ProjectDetector(this.repoPath);
    
    // Get patterns for primary and secondary project types
    const primaryPatterns = detector.getBuildArtifacts(projectType);
    const secondaryPatterns = secondaryTypes.flatMap(type => detector.getBuildArtifacts(type));
    const allNewPatterns = [...new Set([...primaryPatterns, ...secondaryPatterns])];

    // Read existing .gitignore if it exists
    const existingPatterns = this.getExistingPatterns();
    
    // Determine what patterns to add
    const patternsToAdd = allNewPatterns.filter(pattern => 
      !this.patternExists(pattern, existingPatterns)
    );

    if (patternsToAdd.length === 0 && existingPatterns.length > 0) {
      return {
        updated: false,
        created: false,
        newPatterns: [],
        existingPatterns,
        finalContent: existingPatterns.join('\n')
      };
    }

    // Generate new .gitignore content
    const finalContent = this.generateGitignoreContent(
      existingPatterns,
      patternsToAdd,
      projectType,
      secondaryTypes
    );

    // Write the updated .gitignore
    writeFileSync(this.gitignorePath, finalContent, 'utf8');

    return {
      updated: existingPatterns.length > 0,
      created: existingPatterns.length === 0,
      newPatterns: patternsToAdd,
      existingPatterns,
      finalContent
    };
  }

  /**
   * Check if .gitignore needs updating based on project type
   */
  needsUpdate(projectType: ProjectType, secondaryTypes: ProjectType[] = []): boolean {
    const detector = new ProjectDetector(this.repoPath);
    const requiredPatterns = [
      ...detector.getBuildArtifacts(projectType),
      ...secondaryTypes.flatMap(type => detector.getBuildArtifacts(type))
    ];

    const existingPatterns = this.getExistingPatterns();

    // Check if any required patterns are missing
    return requiredPatterns.some(pattern => 
      !this.patternExists(pattern, existingPatterns)
    );
  }

  /**
   * Get patterns that should be ignored for smart staging
   */
  getIgnorePatternsForStaging(projectType: ProjectType, secondaryTypes: ProjectType[] = []): string[] {
    const detector = new ProjectDetector(this.repoPath);
    const buildArtifacts = [
      ...detector.getBuildArtifacts(projectType),
      ...secondaryTypes.flatMap(type => detector.getBuildArtifacts(type))
    ];

    // Add existing .gitignore patterns
    const existingPatterns = this.getExistingPatterns();
    
    return [...new Set([...buildArtifacts, ...existingPatterns])];
  }

  /**
   * Read existing .gitignore patterns
   */
  private getExistingPatterns(): string[] {
    if (!existsSync(this.gitignorePath)) {
      return [];
    }

    try {
      const content = readFileSync(this.gitignorePath, 'utf8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if a pattern already exists in the gitignore patterns
   */
  private patternExists(pattern: string, existingPatterns: string[]): boolean {
    // Normalize patterns for comparison
    const normalizedPattern = pattern.replace(/\/$/, '').replace(/^\.\//g, '');
    
    return existingPatterns.some(existing => {
      const normalizedExisting = existing.replace(/\/$/, '').replace(/^\.\//g, '');
      
      // Exact match
      if (normalizedPattern === normalizedExisting) return true;
      
      // Check if pattern is covered by existing wildcard patterns
      if (existing.includes('*') || existing.includes('**')) {
        const regex = this.patternToRegex(existing);
        return regex.test(normalizedPattern);
      }
      
      // Check if existing pattern is more specific than new pattern
      if (pattern.includes('*') || pattern.includes('**')) {
        const regex = this.patternToRegex(pattern);
        return regex.test(normalizedExisting);
      }

      return false;
    });
  }

  /**
   * Convert gitignore pattern to regex for matching
   */
  private patternToRegex(pattern: string): RegExp {
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\\\*\\\*/g, '.*') // ** matches any path
      .replace(/\\\*/g, '[^/]*') // * matches anything except /
      .replace(/\\\?/g, '[^/]'); // ? matches single char except /

    // Handle directory patterns
    if (pattern.endsWith('/')) {
      regexPattern = '^' + regexPattern + '.*';
    } else {
      regexPattern = '^' + regexPattern + '$';
    }

    return new RegExp(regexPattern);
  }

  /**
   * Generate complete .gitignore content with proper organization
   */
  private generateGitignoreContent(
    existingPatterns: string[],
    newPatterns: string[],
    projectType: ProjectType,
    secondaryTypes: ProjectType[]
  ): string {
    const sections: string[] = [];

    // Keep existing content if any
    if (existingPatterns.length > 0) {
      sections.push('# Existing patterns');
      sections.push(...existingPatterns);
      sections.push('');
    }

    // Add new patterns with project type headers
    if (newPatterns.length > 0) {
      sections.push(`# Auto-generated for ${this.getProjectTypeName(projectType)} project`);
      
      if (secondaryTypes.length > 0) {
        sections.push(`# Additional types: ${secondaryTypes.map(t => this.getProjectTypeName(t)).join(', ')}`);
      }
      
      sections.push(`# Generated by GitPlus on ${new Date().toISOString().split('T')[0]}`);
      sections.push('# You can modify these patterns as needed');
      sections.push('');

      // Group patterns by category for better organization
      const categorized = this.categorizePatterns(newPatterns);
      
      if (categorized.common.length > 0) {
        sections.push('# Common system files');
        sections.push(...categorized.common);
        sections.push('');
      }

      if (categorized.dependencies.length > 0) {
        sections.push('# Dependencies and packages');
        sections.push(...categorized.dependencies);
        sections.push('');
      }

      if (categorized.build.length > 0) {
        sections.push('# Build outputs and artifacts');
        sections.push(...categorized.build);
        sections.push('');
      }

      if (categorized.cache.length > 0) {
        sections.push('# Cache and temporary files');
        sections.push(...categorized.cache);
        sections.push('');
      }

      if (categorized.logs.length > 0) {
        sections.push('# Logs and debug files');
        sections.push(...categorized.logs);
        sections.push('');
      }

      if (categorized.ide.length > 0) {
        sections.push('# IDE and editor files');
        sections.push(...categorized.ide);
        sections.push('');
      }

      if (categorized.other.length > 0) {
        sections.push('# Other generated files');
        sections.push(...categorized.other);
      }
    }

    return sections.join('\n').trim() + '\n';
  }

  /**
   * Get human-readable project type name
   */
  private getProjectTypeName(projectType: ProjectType): string {
    const names: Record<ProjectType, string> = {
      [ProjectType.NodeJS]: 'Node.js',
      [ProjectType.TypeScript]: 'TypeScript',
      [ProjectType.Python]: 'Python',
      [ProjectType.Rust]: 'Rust',
      [ProjectType.Go]: 'Go',
      [ProjectType.Java]: 'Java',
      [ProjectType.CSharp]: 'C#',
      [ProjectType.CPlusPlus]: 'C++',
      [ProjectType.Ruby]: 'Ruby',
      [ProjectType.PHP]: 'PHP',
      [ProjectType.Swift]: 'Swift',
      [ProjectType.Kotlin]: 'Kotlin',
      [ProjectType.Scala]: 'Scala',
      [ProjectType.React]: 'React',
      [ProjectType.Vue]: 'Vue.js',
      [ProjectType.Angular]: 'Angular',
      [ProjectType.NextJS]: 'Next.js',
      [ProjectType.Django]: 'Django',
      [ProjectType.Flask]: 'Flask',
      [ProjectType.Rails]: 'Ruby on Rails',
      [ProjectType.Docker]: 'Docker',
      [ProjectType.Unity]: 'Unity',
      [ProjectType.Flutter]: 'Flutter',
      [ProjectType.ReactNative]: 'React Native',
      [ProjectType.Ionic]: 'Ionic',
      [ProjectType.Electron]: 'Electron',
      [ProjectType.Generic]: 'Generic'
    };

    return names[projectType] || 'Unknown';
  }

  /**
   * Categorize patterns for better .gitignore organization
   */
  private categorizePatterns(patterns: string[]): {
    common: string[];
    dependencies: string[];
    build: string[];
    cache: string[];
    logs: string[];
    ide: string[];
    other: string[];
  } {
    const categories = {
      common: [] as string[],
      dependencies: [] as string[],
      build: [] as string[],
      cache: [] as string[],
      logs: [] as string[],
      ide: [] as string[],
      other: [] as string[]
    };

    for (const pattern of patterns) {
      const lower = pattern.toLowerCase();

      if (lower.includes('.ds_store') || lower.includes('thumbs.db') || lower.includes('*~')) {
        categories.common.push(pattern);
      } else if (lower.includes('node_modules') || lower.includes('vendor') || lower.includes('packages') || lower.includes('.bundle')) {
        categories.dependencies.push(pattern);
      } else if (lower.includes('build') || lower.includes('dist') || lower.includes('target') || lower.includes('bin') || lower.includes('obj')) {
        categories.build.push(pattern);
      } else if (lower.includes('cache') || lower.includes('.tmp') || lower.includes('temp')) {
        categories.cache.push(pattern);
      } else if (lower.includes('.log') || lower.includes('debug') || lower.includes('error')) {
        categories.logs.push(pattern);
      } else if (lower.includes('.vscode') || lower.includes('.idea') || lower.includes('*.swp') || lower.includes('*.swo')) {
        categories.ide.push(pattern);
      } else {
        categories.other.push(pattern);
      }
    }

    return categories;
  }
}