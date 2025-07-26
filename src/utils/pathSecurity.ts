import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const stat = promisify(fs.stat);
const lstat = promisify(fs.lstat);
const realpath = promisify(fs.realpath);

/**
 * Security levels for path validation
 */
export enum SecurityLevel {
  STRICT = 'strict',     // Maximum security - only allow within repository bounds
  MODERATE = 'moderate', // Allow git operations but prevent system access
  PERMISSIVE = 'permissive' // Basic validation only
}

/**
 * Security configuration for path validation
 */
export interface PathSecurityConfig {
  level: SecurityLevel;
  allowedRoots: string[];
  blockedPaths: string[];
  allowSymlinks: boolean;
  maxDepth: number;
  logSecurityEvents: boolean;
}

/**
 * Default security configuration
 */
const DEFAULT_CONFIG: PathSecurityConfig = {
  level: SecurityLevel.STRICT,
  allowedRoots: [],
  blockedPaths: [
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/sys',
    '/proc',
    '/dev',
    '/tmp',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\System Volume Information'
  ],
  allowSymlinks: false,
  maxDepth: 50,
  logSecurityEvents: true
};

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  isValid: boolean;
  canonicalPath: string;
  violations: string[];
  warnings: string[];
  isSymlink: boolean;
  actualTarget?: string;
}

/**
 * Comprehensive path security utility for preventing directory traversal attacks
 * 
 * This utility provides:
 * - Path canonicalization and validation
 * - Symlink traversal prevention
 * - Repository boundary enforcement
 * - Cross-platform security validation
 * - Security logging and monitoring
 */
export class PathSecurity {
  private config: PathSecurityConfig;
  private securityLog: Array<{ timestamp: Date; level: string; message: string; path: string }> = [];

  constructor(config: Partial<PathSecurityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate and secure a path for git operations
   * 
   * @param inputPath - The path to validate
   * @param repositoryRoot - Optional repository root for boundary enforcement
   * @returns Promise resolving to validation result
   */
  async validatePath(inputPath: string, repositoryRoot?: string): Promise<SecurityValidationResult> {
    const result: SecurityValidationResult = {
      isValid: false,
      canonicalPath: '',
      violations: [],
      warnings: [],
      isSymlink: false
    };

    try {
      // 1. Basic input validation
      if (!inputPath || typeof inputPath !== 'string') {
        result.violations.push('Path must be a non-empty string');
        this.logSecurityEvent('ERROR', 'Invalid path input', inputPath);
        return result;
      }

      // 2. Check for dangerous characters and patterns
      const dangerousPatterns = this.getDangerousPatterns();
      for (const pattern of dangerousPatterns) {
        if (pattern.test(inputPath)) {
          result.violations.push(`Path contains dangerous pattern: ${pattern.source}`);
          this.logSecurityEvent('CRITICAL', 'Dangerous pattern detected', inputPath);
        }
      }

      // 3. Normalize and canonicalize the path
      const normalizedPath = path.normalize(inputPath);
      let canonicalPath: string;
      
      try {
        // Check if path exists first
        await stat(normalizedPath);
        canonicalPath = await realpath(normalizedPath);
      } catch (error) {
        // If path doesn't exist, use path.resolve for canonicalization
        canonicalPath = path.resolve(normalizedPath);
      }

      result.canonicalPath = canonicalPath;

      // 4. Check for symlinks if not allowed
      if (!this.config.allowSymlinks) {
        try {
          const stats = await lstat(normalizedPath);
          if (stats.isSymbolicLink()) {
            result.isSymlink = true;
            result.actualTarget = canonicalPath;
            
            if (this.config.level === SecurityLevel.STRICT) {
              result.violations.push('Symlinks are not allowed in strict mode');
              this.logSecurityEvent('WARNING', 'Symlink access attempt', inputPath);
            } else {
              result.warnings.push('Path is a symlink');
            }
          }
        } catch {
          // Path doesn't exist, continue with validation
        }
      }

      // 5. Check path depth
      const pathDepth = this.getPathDepth(canonicalPath);
      if (pathDepth > this.config.maxDepth) {
        result.violations.push(`Path depth (${pathDepth}) exceeds maximum allowed (${this.config.maxDepth})`);
        this.logSecurityEvent('WARNING', 'Excessive path depth', inputPath);
      }

      // 6. Check against blocked paths
      for (const blockedPath of this.config.blockedPaths) {
        if (this.isWithinPath(canonicalPath, blockedPath)) {
          result.violations.push(`Path is within blocked directory: ${blockedPath}`);
          this.logSecurityEvent('CRITICAL', 'Blocked path access attempt', inputPath);
        }
      }

      // 7. Repository boundary enforcement
      if (repositoryRoot) {
        const repoCanonical = await this.getCanonicalPath(repositoryRoot);
        if (!this.isWithinRepository(canonicalPath, repoCanonical)) {
          if (this.config.level === SecurityLevel.STRICT) {
            result.violations.push('Path is outside repository boundaries');
            this.logSecurityEvent('WARNING', 'Repository boundary violation', inputPath);
          } else {
            result.warnings.push('Path is outside repository boundaries');
          }
        }
      }

      // 8. Cross-platform specific validations
      this.validateCrossPlatform(canonicalPath, result);

      // 9. Final validation based on security level
      result.isValid = this.isPathValidForLevel(result);

      if (result.isValid) {
        this.logSecurityEvent('INFO', 'Path validation passed', inputPath);
      } else {
        this.logSecurityEvent('ERROR', 'Path validation failed', inputPath);
      }

      return result;

    } catch (error) {
      result.violations.push(`Path validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.logSecurityEvent('ERROR', 'Validation exception', inputPath);
      return result;
    }
  }

  /**
   * Get dangerous patterns for path validation
   */
  private getDangerousPatterns(): RegExp[] {
    return [
      /\.\./,                     // Directory traversal
      /[<>:"|*?]/,               // Windows invalid characters
      /[\x00-\x1f]/,             // Control characters
      /^-/,                      // Arguments starting with dash
      /[;&|`$(){}[\]]/,          // Shell metacharacters
      /\\\.\.\\|\/\.\.\//,       // Explicit traversal patterns
      /\0/,                      // Null bytes
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
      /\s+(rm|del|format|config|init)\s*$/i,     // Dangerous commands
    ];
  }

  /**
   * Cross-platform specific validations
   */
  private validateCrossPlatform(canonicalPath: string, result: SecurityValidationResult): void {
    const platform = process.platform;

    if (platform === 'win32') {
      // Windows-specific validations
      if (canonicalPath.includes('$Recycle.Bin')) {
        result.warnings.push('Path accesses Windows Recycle Bin');
      }
      
      if (/^[A-Z]:\\$/.test(canonicalPath)) {
        result.violations.push('Direct access to drive root is not allowed');
      }

      // Check for UNC paths
      if (canonicalPath.startsWith('\\\\')) {
        result.warnings.push('UNC path detected');
      }
    } else {
      // Unix-like systems
      if (canonicalPath.startsWith('/proc/') || canonicalPath.startsWith('/sys/')) {
        result.violations.push('Access to system filesystem is not allowed');
      }

      if (canonicalPath.includes('/.ssh/') || canonicalPath.includes('/.gnupg/')) {
        result.violations.push('Access to sensitive user directories is not allowed');
      }
    }

    // Common validations
    if (canonicalPath.includes('/node_modules/') && this.config.level === SecurityLevel.STRICT) {
      result.warnings.push('Path accesses node_modules directory');
    }
  }

  /**
   * Check if path is within repository boundaries
   */
  private isWithinRepository(targetPath: string, repositoryRoot: string): boolean {
    const relativePath = path.relative(repositoryRoot, targetPath);
    return !relativePath.startsWith('..');
  }

  /**
   * Check if path is within another path
   */
  private isWithinPath(targetPath: string, parentPath: string): boolean {
    const relativePath = path.relative(parentPath, targetPath);
    return !relativePath.startsWith('..');
  }

  /**
   * Get canonical path safely
   */
  private async getCanonicalPath(inputPath: string): Promise<string> {
    try {
      await stat(inputPath);
      return await realpath(inputPath);
    } catch {
      return path.resolve(inputPath);
    }
  }

  /**
   * Calculate path depth
   */
  private getPathDepth(pathString: string): number {
    return path.normalize(pathString).split(path.sep).filter(segment => segment !== '').length;
  }

  /**
   * Determine if path is valid based on security level
   */
  private isPathValidForLevel(result: SecurityValidationResult): boolean {
    switch (this.config.level) {
      case SecurityLevel.STRICT:
        return result.violations.length === 0;
      case SecurityLevel.MODERATE:
        return result.violations.filter(v => !v.includes('repository boundaries')).length === 0;
      case SecurityLevel.PERMISSIVE:
        return result.violations.filter(v => 
          v.includes('dangerous pattern') || 
          v.includes('blocked directory') ||
          v.includes('system filesystem')
        ).length === 0;
      default:
        return false;
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(level: string, message: string, pathAttempt: string): void {
    if (!this.config.logSecurityEvents) return;

    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      path: pathAttempt
    };

    this.securityLog.push(logEntry);

    // In production, this should integrate with proper logging infrastructure
    if (process.env['GITPLUS_DEBUG'] === 'true' || level === 'CRITICAL') {
      console.log(`[PathSecurity:${level}] ${message}: ${pathAttempt}`);
    }

    // Keep log size manageable
    if (this.securityLog.length > 1000) {
      this.securityLog = this.securityLog.slice(-500);
    }
  }

  /**
   * Get security log entries
   */
  getSecurityLog(): Array<{ timestamp: Date; level: string; message: string; path: string }> {
    return [...this.securityLog];
  }

  /**
   * Clear security log
   */
  clearSecurityLog(): void {
    this.securityLog = [];
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<PathSecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logSecurityEvent('INFO', 'Security configuration updated', JSON.stringify(newConfig));
  }

  /**
   * Static utility method for quick path validation
   */
  static async validatePathQuick(inputPath: string, repositoryRoot?: string): Promise<boolean> {
    const security = new PathSecurity();
    const result = await security.validatePath(inputPath, repositoryRoot);
    return result.isValid;
  }

  /**
   * Static utility method for getting safe canonical path
   */
  static async getSafeCanonicalPath(inputPath: string): Promise<string | null> {
    const security = new PathSecurity();
    const result = await security.validatePath(inputPath);
    return result.isValid ? result.canonicalPath : null;
  }
}

/**
 * Convenience function for path validation in git operations
 */
export async function validateGitPath(inputPath: string, repositoryRoot?: string): Promise<SecurityValidationResult> {
  const security = new PathSecurity({
    level: SecurityLevel.STRICT,
    allowSymlinks: false,
    logSecurityEvents: true
  });
  
  return await security.validatePath(inputPath, repositoryRoot);
}

/**
 * Convenience function for less strict path validation
 */
export async function validatePathModerate(inputPath: string, repositoryRoot?: string): Promise<SecurityValidationResult> {
  const security = new PathSecurity({
    level: SecurityLevel.MODERATE,
    allowSymlinks: true,
    logSecurityEvents: true
  });
  
  return await security.validatePath(inputPath, repositoryRoot);
}