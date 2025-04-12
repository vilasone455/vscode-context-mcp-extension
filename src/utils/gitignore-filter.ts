import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import minimatch = require('minimatch');

interface GitignorePattern {
  basePath: string;
  pattern: string;
}

/**
 * GitignoreFilter - Utility to parse and match paths against gitignore patterns
 */
class GitignoreFilter {
  private patterns: GitignorePattern[];
  private workspaceFolders: readonly vscode.WorkspaceFolder[];

  constructor() {
    this.patterns = [];
    this.workspaceFolders = [];
  }

  /**
   * Initialize the filter with workspace folders and load all .gitignore files
   * @param workspaceFolders The VS Code workspace folders
   */
  async initialize(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
    this.workspaceFolders = workspaceFolders || [];
    this.patterns = [];
    
    // Get additional exclude patterns from VS Code settings
    const config = vscode.workspace.getConfiguration('projectSession.search');
    const extraExcludePatterns = config.get<string[]>('excludePatterns') || [];
    
    // Add global exclude patterns
    for (const pattern of extraExcludePatterns) {
      this.patterns.push({
        basePath: '', // Global pattern
        pattern: pattern
      });
    }
    
    // Process each workspace folder
    for (const folder of this.workspaceFolders) {
      await this._loadGitignorePatterns(folder.uri.fsPath);
    }

    console.log(`Loaded ${this.patterns.length} gitignore patterns (including ${extraExcludePatterns.length} from settings)`);
  }

  /**
   * Load gitignore patterns from a workspace folder
   * @param folderPath Path to the workspace folder
   */
  private async _loadGitignorePatterns(folderPath: string): Promise<void> {
    try {
      const gitignorePath = path.join(folderPath, '.gitignore');
      
      // Check if .gitignore exists
      let gitignoreExists = false;
      try {
        await fs.promises.access(gitignorePath, fs.constants.R_OK);
        gitignoreExists = true;
      } catch (err) {
        // File doesn't exist or can't be read, which is fine
        console.log(`No .gitignore found at ${gitignorePath}`);
      }
      
      if (gitignoreExists) {
        const content = await fs.promises.readFile(gitignorePath, 'utf8');
        const lines = content.split(/\r?\n/);
        
        for (let line of lines) {
          // Skip comments and empty lines
          line = line.trim();
          if (line && !line.startsWith('#')) {
            console.log(`Adding gitignore pattern: '${line}' from ${folderPath}`);
            // Store pattern with the folder path for context
            this.patterns.push({
              basePath: folderPath,
              pattern: line
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading gitignore patterns:', err);
    }
  }

  /**
   * Check if a file should be excluded based on gitignore patterns
   * @param filePath The full path of the file to check
   * @returns True if the file should be excluded
   */
  public shouldExclude(filePath: string): boolean {
    // If no patterns, don't exclude anything
    if (this.patterns.length === 0) {
      return false;
    }
    
    // Find the workspace folder this file belongs to
    let workspaceFolder: string | null = null;
    for (const folder of this.workspaceFolders) {
      if (filePath.startsWith(folder.uri.fsPath)) {
        workspaceFolder = folder.uri.fsPath;
        break;
      }
    }
    
    if (!workspaceFolder) {
      return false; // Not in any workspace folder
    }
    
    // Get relative path to the workspace folder
    const relativePath = path.relative(workspaceFolder, filePath).replace(/\\/g, '/');
    
    // Direct check for simple directory patterns from gitignore
    for (const { pattern } of this.patterns) {
      // Check for simple directory patterns like "resources/"
      if (pattern.endsWith('/')) {
        const dirPath = pattern.slice(0, -1);
        // Check if the relative path starts with this directory or contains it with slashes
        if (relativePath === dirPath || 
            relativePath.startsWith(`${dirPath}/`) || 
            relativePath.includes(`/${dirPath}/`)) {
          console.log(`File ${relativePath} excluded by directory pattern: ${pattern}`);
          return true;
        }
      }
    }
    
    // Check each pattern for more complex matching
    for (const { basePath, pattern } of this.patterns) {
      // For global patterns (from settings) or patterns from the file's workspace
      if (basePath === '' || filePath.startsWith(basePath)) {
        // Handle patterns with and without slashes
        let patternToCheck = pattern;
        
        // Handle negation patterns (those starting with !)
        let isNegated = false;
        if (pattern.startsWith('!')) {
          isNegated = true;
          patternToCheck = pattern.slice(1);
        }
        
        // Handle directory patterns (those ending with /)
        let isDirectoryPattern = false;
        if (patternToCheck.endsWith('/')) {
          isDirectoryPattern = true;
          patternToCheck = patternToCheck.slice(0, -1);
        }
        
        // Check if this is just a simple "node_modules" style pattern
        if (!patternToCheck.includes('/')) {
          patternToCheck = `**/${patternToCheck}`;
          if (isDirectoryPattern) {
            patternToCheck += '/**';
          }
        } else if (patternToCheck.startsWith('/')) {
          // Handle patterns that start with / (relative to repo root)
          patternToCheck = patternToCheck.slice(1);
        }
        
        try {
          // Use minimatch to check pattern
          const matches = minimatch(relativePath, patternToCheck, { dot: true });
          
          if (matches && !isNegated) {
            console.log(`File ${relativePath} excluded by pattern: ${patternToCheck}`);
            return true; // File matches exclusion pattern
          } else if (matches && isNegated) {
            return false; // File matches negation pattern, explicitly included
          }
        } catch (error) {
          console.error(`Error matching pattern ${patternToCheck}:`, error);
        }
      }
    }
    
    return false;
  }

  /**
   * Filter an array of file URIs to exclude gitignored files
   * @param uris Array of file URIs
   * @returns Filtered array
   */
  public filterUris(uris: vscode.Uri[]): vscode.Uri[] {
    if (!uris || !uris.length) return [];
    
    return uris.filter(uri => !this.shouldExclude(uri.fsPath));
  }

  /**
   * Simple check if a path contains a gitignored directory
   * @param filePath File path to check
   * @returns True if path contains a gitignored segment
   */
  public containsGitIgnoredSegment(filePath: string): boolean {
    // Get common ignored directories from settings if available
    const config = vscode.workspace.getConfiguration('projectSession.search');
    const configuredPatterns = config.get<string[]>('excludePatterns') || [];
    
    // Extract directory names from patterns and add common ones
    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
    
    // Add any simple directory patterns from config or gitignore
    for (const pattern of configuredPatterns) {
      // Extract directory name from patterns like '**/dir/**' or 'dir/**'
      const match = pattern.match(/(?:\*\*\/)?([\w.-]+)(?:\/\*\*)?/);
      if (match && match[1]) {
        ignoredDirs.add(match[1]);
      }
    }
    
    // Add patterns from gitignore
    for (const { pattern } of this.patterns) {
      // Get directory name from 'dir/' pattern
      if (pattern.endsWith('/')) {
        const dirName = pattern.slice(0, -1);
        ignoredDirs.add(dirName);
      }
    }
    
    // Convert path separators to forward slashes for consistency
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check if path contains any ignored directories
    for (const dir of ignoredDirs) {
      // Match /dir/ pattern to avoid partial matches
      const dirPattern = new RegExp(`\\/${dir}\\/`, 'i');
      if (dirPattern.test(normalizedPath)) {
        // Also check if it's in a resources/ directory
        if (normalizedPath.includes('/resources/')) {
          console.log(`File ${normalizedPath} is in resources/ directory, should be excluded`);
          return true;
        }
        console.log(`File ${normalizedPath} contains ignored segment: ${dir}`);
        return true;
      }
    }
    
    // Special check for resources/ directory
    if (normalizedPath.includes('/resources/')) {
      console.log(`File ${normalizedPath} is in resources/ directory (special check), should be excluded`);
      return true;
    }
    
    return false;
  }
}

// Singleton instance
let gitignoreFilter: GitignoreFilter | null = null;

/**
 * Get the gitignore filter instance, initializing it if needed
 * @param workspaceFolders The VS Code workspace folders
 * @returns The gitignore filter
 */
export async function getGitignoreFilter(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<GitignoreFilter> {
  if (!gitignoreFilter) {
    gitignoreFilter = new GitignoreFilter();
    await gitignoreFilter.initialize(workspaceFolders);
  }
  return gitignoreFilter;
}