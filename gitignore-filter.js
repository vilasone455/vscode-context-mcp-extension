const path = require('path');
const fs = require('fs');
const vscode = require('vscode');
const minimatch = require('minimatch');

/**
 * GitignoreFilter - Utility to parse and match paths against gitignore patterns
 */
class GitignoreFilter {
  constructor() {
    this.patterns = [];
    this.workspaceFolders = [];
  }

  /**
   * Initialize the filter with workspace folders and load all .gitignore files
   * @param {vscode.WorkspaceFolder[]} workspaceFolders The VS Code workspace folders
   */
  async initialize(workspaceFolders) {
    this.workspaceFolders = workspaceFolders || [];
    this.patterns = [];
    
    // Get additional exclude patterns from VS Code settings
    const config = vscode.workspace.getConfiguration('projectSession.search');
    const extraExcludePatterns = config.get('excludePatterns') || [];
    
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
   * @param {string} folderPath Path to the workspace folder
   */
  async _loadGitignorePatterns(folderPath) {
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
        const lines = content.split(/\\r?\\n/);
        
        for (let line of lines) {
          // Skip comments and empty lines
          line = line.trim();
          if (line && !line.startsWith('#')) {
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
   * @param {string} filePath The full path of the file to check
   * @returns {boolean} True if the file should be excluded
   */
  shouldExclude(filePath) {
    // If no patterns, don't exclude anything
    if (this.patterns.length === 0) {
      return false;
    }
    
    // Find the workspace folder this file belongs to
    let workspaceFolder = null;
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
    const relativePath = path.relative(workspaceFolder, filePath);
    
    // Check each pattern
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
        
        // For global patterns, we use the full pattern
        // For workspace-specific patterns, use minimatch with the relative path
        const pathToMatch = basePath === '' ? relativePath : relativePath;
        
        // Use minimatch to check pattern
        const matches = minimatch(pathToMatch, patternToCheck, { dot: true });
        
        if (matches && !isNegated) {
          return true; // File matches exclusion pattern
        } else if (matches && isNegated) {
          return false; // File matches negation pattern, explicitly included
        }
      }
    }
    
    return false;
  }

  /**
   * Filter an array of file URIs to exclude gitignored files
   * @param {vscode.Uri[]} uris Array of file URIs
   * @returns {vscode.Uri[]} Filtered array
   */
  filterUris(uris) {
    if (!uris || !uris.length) return [];
    
    return uris.filter(uri => !this.shouldExclude(uri.fsPath));
  }

  /**
   * Simple check if a path contains a gitignored directory
   * @param {string} filePath File path to check
   * @returns {boolean} True if path contains a gitignored segment
   */
  containsGitIgnoredSegment(filePath) {
    // Get common ignored directories from settings if available
    const config = vscode.workspace.getConfiguration('projectSession.search');
    const configuredPatterns = config.get('excludePatterns') || [];
    
    // Extract directory names from patterns and add common ones
    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
    
    // Add any simple directory patterns from config
    for (const pattern of configuredPatterns) {
      // Extract directory name from patterns like '**/dir/**' or 'dir/**'
      const match = pattern.match(/(?:\*\*\/)?([\w.-]+)(?:\/\*\*)?/);
      if (match && match[1]) {
        ignoredDirs.add(match[1]);
      }
    }
    
    // Convert path separators to forward slashes for consistency
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check if path contains any ignored directories
    return Array.from(ignoredDirs).some(dir => {
      // Match /dir/ pattern to avoid partial matches
      const dirPattern = new RegExp(`\\/${dir}\\/`, 'i');
      return dirPattern.test(normalizedPath);
    });
  }
}

// Singleton instance
let gitignoreFilter = null;

/**
 * Get the gitignore filter instance, initializing it if needed
 * @param {vscode.WorkspaceFolder[]} workspaceFolders The VS Code workspace folders
 * @returns {Promise<GitignoreFilter>} The gitignore filter
 */
async function getGitignoreFilter(workspaceFolders) {
  if (!gitignoreFilter) {
    gitignoreFilter = new GitignoreFilter();
    await gitignoreFilter.initialize(workspaceFolders);
  }
  return gitignoreFilter;
}

module.exports = {
  getGitignoreFilter
};
