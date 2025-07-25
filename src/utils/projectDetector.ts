import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

export enum ProjectType {
  NodeJS = 'nodejs',
  Python = 'python', 
  Rust = 'rust',
  Go = 'go',
  Java = 'java',
  CSharp = 'csharp',
  CPlusPlus = 'cpp',
  Ruby = 'ruby',
  PHP = 'php',
  Swift = 'swift',
  Kotlin = 'kotlin',
  Scala = 'scala',
  TypeScript = 'typescript',
  React = 'react',
  Vue = 'vue',
  Angular = 'angular',
  NextJS = 'nextjs',
  Django = 'django',
  Flask = 'flask',
  Rails = 'rails',
  Docker = 'docker',
  Unity = 'unity',
  Flutter = 'flutter',
  ReactNative = 'react-native',
  Ionic = 'ionic',
  Electron = 'electron',
  Generic = 'generic'
}

export interface ProjectDetectionResult {
  primaryType: ProjectType;
  secondaryTypes: ProjectType[];
  confidence: number;
  files: string[];
  frameworks: string[];
}

export class ProjectDetector {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Detect project type based on files and directory structure
   */
  detectProjectType(): ProjectDetectionResult {
    const detectionResults: Array<{ type: ProjectType; confidence: number; files: string[]; frameworks: string[] }> = [];

    // Check for common project indicators
    const indicators = this.gatherProjectIndicators();

    // Node.js / TypeScript / JavaScript ecosystem
    if (indicators.packageJson) {
      const nodeResult = this.analyzeNodeJSProject(indicators);
      detectionResults.push(nodeResult);
    }

    // Python ecosystem
    if (indicators.pythonFiles || indicators.requirementsTxt || indicators.pipfile || indicators.poetryLock) {
      detectionResults.push(this.analyzePythonProject(indicators));
    }

    // Rust
    if (indicators.cargoToml) {
      detectionResults.push({ type: ProjectType.Rust, confidence: 0.95, files: ['Cargo.toml'], frameworks: [] });
    }

    // Go
    if (indicators.goMod || indicators.goFiles) {
      detectionResults.push({ type: ProjectType.Go, confidence: 0.9, files: indicators.goMod ? ['go.mod'] : ['*.go'], frameworks: [] });
    }

    // Java ecosystem
    if (indicators.pomXml || indicators.buildGradle || indicators.javaFiles) {
      detectionResults.push(this.analyzeJavaProject(indicators));
    }

    // C#
    if (indicators.csprojFiles || indicators.slnFiles) {
      detectionResults.push({ type: ProjectType.CSharp, confidence: 0.9, files: [...indicators.csprojFiles, ...indicators.slnFiles], frameworks: [] });
    }

    // C++
    if (indicators.cppFiles || indicators.cmakeLists) {
      detectionResults.push({ type: ProjectType.CPlusPlus, confidence: 0.8, files: indicators.cmakeLists ? ['CMakeLists.txt'] : ['*.cpp'], frameworks: [] });
    }

    // Ruby / Rails
    if (indicators.gemfile || indicators.rubyFiles) {
      const rubyResult = this.analyzeRubyProject(indicators);
      detectionResults.push(rubyResult);
    }

    // PHP
    if (indicators.composerJson || indicators.phpFiles) {
      detectionResults.push({ type: ProjectType.PHP, confidence: 0.8, files: indicators.composerJson ? ['composer.json'] : ['*.php'], frameworks: [] });
    }

    // Swift
    if (indicators.packageSwift || indicators.swiftFiles) {
      detectionResults.push({ type: ProjectType.Swift, confidence: 0.9, files: indicators.packageSwift ? ['Package.swift'] : ['*.swift'], frameworks: [] });
    }

    // Docker
    if (indicators.dockerfile || indicators.dockerCompose) {
      detectionResults.push({ type: ProjectType.Docker, confidence: 0.7, files: ['Dockerfile'], frameworks: [] });
    }

    // Unity
    if (indicators.unityProject) {
      detectionResults.push({ type: ProjectType.Unity, confidence: 0.95, files: ['ProjectSettings', 'Assets'], frameworks: [] });
    }

    // Flutter
    if (indicators.pubspecYaml && indicators.flutterIndicators) {
      detectionResults.push({ type: ProjectType.Flutter, confidence: 0.9, files: ['pubspec.yaml'], frameworks: ['Flutter'] });
    }

    // Sort by confidence and extract results
    detectionResults.sort((a, b) => b.confidence - a.confidence);

    if (detectionResults.length === 0) {
      return {
        primaryType: ProjectType.Generic,
        secondaryTypes: [],
        confidence: 0.5,
        files: [],
        frameworks: []
      };
    }

    const primary = detectionResults[0]!; // Non-null assertion since we checked length
    const secondary = detectionResults.slice(1, 3).map(r => r.type);

    return {
      primaryType: primary.type,
      secondaryTypes: secondary,
      confidence: primary.confidence,
      files: primary.files,
      frameworks: primary.frameworks
    };
  }

  /**
   * Get common build artifacts and temp files to ignore based on project type
   */
  getBuildArtifacts(projectType: ProjectType): string[] {
    const commonIgnores = [
      '.DS_Store',
      'Thumbs.db',
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '*~',
      '.tmp/',
      'tmp/',
      'temp/',
      '*.log'
    ];

    const typeSpecificIgnores: Record<ProjectType, string[]> = {
      [ProjectType.NodeJS]: [
        'node_modules/',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '.pnpm-debug.log*',
        'dist/',
        'build/',
        '.next/',
        '.nuxt/',
        '.cache/',
        '.parcel-cache/',
        'coverage/',
        '.nyc_output/',
        '*.tsbuildinfo',
        '.eslintcache'
      ],
      [ProjectType.TypeScript]: [
        'node_modules/',
        'dist/',
        'build/',
        '*.tsbuildinfo',
        '*.js.map',
        '.tscache/'
      ],
      [ProjectType.Python]: [
        '__pycache__/',
        '*.py[cod]',
        '*$py.class',
        '*.so',
        '.Python',
        'build/',
        'develop-eggs/',
        'dist/',
        'downloads/',
        'eggs/',
        '.egg-info/',
        'env/',
        'venv/',
        '.venv/',
        '.pytest_cache/',
        '.coverage',
        'htmlcov/',
        '.tox/',
        '.mypy_cache/',
        '.dmypy.json'
      ],
      [ProjectType.Rust]: [
        'target/',
        'Cargo.lock',
        '**/*.rs.bk'
      ],
      [ProjectType.Go]: [
        'bin/',
        'pkg/',
        '*.exe',
        '*.exe~',
        '*.dll',
        '*.so',
        '*.dylib',
        '*.test',
        '*.out',
        'go.work'
      ],
      [ProjectType.Java]: [
        'target/',
        'build/',
        '*.class',
        '*.jar',
        '*.war',
        '*.ear',
        '*.nar',
        'hs_err_pid*',
        '.gradle/',
        '.settings/',
        'bin/',
        '.classpath',
        '.project'
      ],
      [ProjectType.CSharp]: [
        'bin/',
        'obj/',
        '*.user',
        '*.suo',
        '*.cache',
        '.vs/',
        'packages/',
        '*.nupkg',
        '*.snupkg'
      ],
      [ProjectType.CPlusPlus]: [
        'build/',
        '*.o',
        '*.obj',
        '*.exe',
        '*.out',
        '*.app',
        '*.lib',
        '*.a',
        '*.la',
        '*.lo',
        'CMakeCache.txt',
        'CMakeFiles/',
        'cmake_install.cmake'
      ],
      [ProjectType.Ruby]: [
        '.bundle/',
        'vendor/bundle/',
        'vendor/cache/',
        '.byebug_history',
        '.gem',
        '*.gem',
        'log/',
        'tmp/',
        '.sass-cache/',
        'coverage/'
      ],
      [ProjectType.PHP]: [
        'vendor/',
        'composer.lock',
        '.phpunit.result.cache',
        '.php_cs.cache'
      ],
      [ProjectType.Swift]: [
        '.build/',
        'Packages/',
        '*.xcodeproj/',
        '*.xcworkspace/',
        'DerivedData/',
        'build/'
      ],
      [ProjectType.Docker]: [
        '.dockerignore'
      ],
      [ProjectType.Unity]: [
        'Library/',
        'Temp/',
        'Obj/',
        'Build/',
        'Builds/',
        'Logs/',
        'UserSettings/',
        'MemoryCaptures/',
        '*.tmp',
        '*.asset'
      ],
      [ProjectType.Flutter]: [
        '.dart_tool/',
        '.flutter-plugins',
        '.flutter-plugins-dependencies',
        '.packages',
        '.pub-cache/',
        '.pub/',
        'build/',
        'ios/Flutter/Generated.xcconfig',
        'ios/Runner/GeneratedPluginRegistrant.*',
        'android/.gradle/',
        'android/captures/',
        'android/gradle.properties',
        'android/local.properties',
        'android/app/debug',
        'android/app/profile',
        'android/app/release'
      ],
      // Framework-specific
      [ProjectType.React]: ['build/', '.eslintcache', 'coverage/'],
      [ProjectType.Vue]: ['.nuxt/', 'dist/', 'coverage/'],
      [ProjectType.Angular]: ['dist/', '.angular/', 'coverage/'],
      [ProjectType.NextJS]: ['.next/', 'out/', 'coverage/'],
      [ProjectType.Django]: ['*.pyc', '__pycache__/', 'db.sqlite3', 'media/', 'staticfiles/'],
      [ProjectType.Flask]: ['*.pyc', '__pycache__/', 'instance/', '.pytest_cache/'],
      [ProjectType.Rails]: ['log/', 'tmp/', 'storage/', '.byebug_history'],
      [ProjectType.ReactNative]: ['node_modules/', 'ios/build/', 'android/app/build/', 'coverage/'],
      [ProjectType.Ionic]: ['www/', 'platforms/', 'plugins/', 'coverage/'],
      [ProjectType.Electron]: ['dist/', 'out/', 'release/', 'coverage/'],
      [ProjectType.Kotlin]: ['build/', '*.class', '.gradle/'],
      [ProjectType.Scala]: ['target/', 'project/target/', 'project/project/'],
      [ProjectType.Generic]: []
    };

    return [...commonIgnores, ...(typeSpecificIgnores[projectType] || [])];
  }

  /**
   * Gather all project indicators from the repository
   */
  private gatherProjectIndicators() {
    const files = this.getDirectoryFiles();
    
    return {
      // Node.js ecosystem
      packageJson: files.includes('package.json'),
      packageLockJson: files.includes('package-lock.json'),
      yarnLock: files.includes('yarn.lock'),
      pnpmLock: files.includes('pnpm-lock.yaml'),
      nodeModules: files.includes('node_modules'),
      
      // Python ecosystem
      requirementsTxt: files.includes('requirements.txt'),
      pipfile: files.includes('Pipfile'),
      poetryLock: files.includes('poetry.lock'),
      setupPy: files.includes('setup.py'),
      pythonFiles: files.filter(f => f.endsWith('.py')).length > 0,
      
      // Other languages
      cargoToml: files.includes('Cargo.toml'),
      goMod: files.includes('go.mod'),
      goFiles: files.filter(f => f.endsWith('.go')).length > 0,
      pomXml: files.includes('pom.xml'),
      buildGradle: files.includes('build.gradle') || files.includes('build.gradle.kts'),
      javaFiles: files.filter(f => f.endsWith('.java')).length > 0,
      csprojFiles: files.filter(f => f.endsWith('.csproj')),
      slnFiles: files.filter(f => f.endsWith('.sln')),
      cppFiles: files.filter(f => f.endsWith('.cpp') || f.endsWith('.cc') || f.endsWith('.cxx')).length > 0,
      cmakeLists: files.includes('CMakeLists.txt'),
      gemfile: files.includes('Gemfile'),
      rubyFiles: files.filter(f => f.endsWith('.rb')).length > 0,
      composerJson: files.includes('composer.json'),
      phpFiles: files.filter(f => f.endsWith('.php')).length > 0,
      packageSwift: files.includes('Package.swift'),
      swiftFiles: files.filter(f => f.endsWith('.swift')).length > 0,
      
      // Special projects
      dockerfile: files.includes('Dockerfile'),
      dockerCompose: files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
      unityProject: files.includes('ProjectSettings') && files.includes('Assets'),
      pubspecYaml: files.includes('pubspec.yaml'),
      flutterIndicators: files.includes('lib') && files.filter(f => f.endsWith('.dart')).length > 0,
      
      // All files for reference
      allFiles: files
    };
  }

  /**
   * Analyze Node.js project for specific framework detection
   */
  private analyzeNodeJSProject(indicators: any): { type: ProjectType; confidence: number; files: string[]; frameworks: string[] } {
    let confidence = 0.85;
    let primaryType = ProjectType.NodeJS;
    let frameworks: string[] = [];

    if (indicators.packageJson) {
      try {
        const packageJson = JSON.parse(readFileSync(join(this.repoPath, 'package.json'), 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Framework detection
        if (deps.next || deps['@next/core-web-vitals']) {
          primaryType = ProjectType.NextJS;
          frameworks.push('Next.js');
          confidence = 0.95;
        } else if (deps.react || deps['react-dom']) {
          primaryType = ProjectType.React;
          frameworks.push('React');
          confidence = 0.9;
        } else if (deps.vue || deps['@vue/cli-service']) {
          primaryType = ProjectType.Vue;
          frameworks.push('Vue.js');
          confidence = 0.9;
        } else if (deps['@angular/core'] || deps['@angular/cli']) {
          primaryType = ProjectType.Angular;
          frameworks.push('Angular');
          confidence = 0.9;
        } else if (deps.electron) {
          primaryType = ProjectType.Electron;
          frameworks.push('Electron');
          confidence = 0.9;
        } else if (deps['react-native']) {
          primaryType = ProjectType.ReactNative;
          frameworks.push('React Native');
          confidence = 0.9;
        } else if (deps['@ionic/angular'] || deps['@ionic/react'] || deps['@ionic/vue']) {
          primaryType = ProjectType.Ionic;
          frameworks.push('Ionic');
          confidence = 0.9;
        }

        // TypeScript detection
        if (deps.typescript || indicators.allFiles.some((f: string) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
          if (primaryType === ProjectType.NodeJS) {
            primaryType = ProjectType.TypeScript;
          }
          frameworks.push('TypeScript');
        }
      } catch (error) {
        // Invalid package.json, stick with basic Node.js detection
      }
    }

    return {
      type: primaryType,
      confidence,
      files: ['package.json'],
      frameworks
    };
  }

  /**
   * Analyze Python project for framework detection
   */
  private analyzePythonProject(indicators: any): { type: ProjectType; confidence: number; files: string[]; frameworks: string[] } {
    let confidence = 0.8;
    let primaryType = ProjectType.Python;
    let frameworks: string[] = [];
    let files = [];

    if (indicators.requirementsTxt) files.push('requirements.txt');
    if (indicators.pipfile) files.push('Pipfile');
    if (indicators.setupPy) files.push('setup.py');

    // Check for Django
    if (indicators.allFiles.includes('manage.py') || indicators.allFiles.includes('settings.py')) {
      primaryType = ProjectType.Django;
      frameworks.push('Django');
      confidence = 0.9;
    }

    // Check for Flask
    if (indicators.requirementsTxt) {
      try {
        const requirements = readFileSync(join(this.repoPath, 'requirements.txt'), 'utf8');
        if (requirements.includes('Flask')) {
          primaryType = ProjectType.Flask;
          frameworks.push('Flask');
          confidence = 0.85;
        }
      } catch (error) {
        // Ignore read errors
      }
    }

    return { type: primaryType, confidence, files, frameworks };
  }

  /**
   * Analyze Java project
   */
  private analyzeJavaProject(indicators: any): { type: ProjectType; confidence: number; files: string[]; frameworks: string[] } {
    const files = [];
    if (indicators.pomXml) files.push('pom.xml');
    if (indicators.buildGradle) files.push('build.gradle');

    return {
      type: ProjectType.Java,
      confidence: indicators.pomXml || indicators.buildGradle ? 0.9 : 0.7,
      files,
      frameworks: []
    };
  }

  /**
   * Analyze Ruby project
   */
  private analyzeRubyProject(indicators: any): { type: ProjectType; confidence: number; files: string[]; frameworks: string[] } {
    let confidence = 0.8;
    let primaryType = ProjectType.Ruby;
    let frameworks: string[] = [];

    // Check for Rails
    if (indicators.allFiles.includes('config/application.rb') || indicators.allFiles.includes('Rakefile')) {
      primaryType = ProjectType.Rails;
      frameworks.push('Ruby on Rails');
      confidence = 0.9;
    }

    return {
      type: primaryType,
      confidence,
      files: indicators.gemfile ? ['Gemfile'] : ['*.rb'],
      frameworks
    };
  }

  /**
   * Get all files in the repository root
   */
  private getDirectoryFiles(): string[] {
    try {
      return readdirSync(this.repoPath);
    } catch (error) {
      return [];
    }
  }
}