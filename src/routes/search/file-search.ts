/**
 * File search handlers for the VS Code Context MCP Extension
 * Handles: searching for files and searching within file content
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import minimatch from 'minimatch';
import { getCurrentProjectPath } from '../../server/state';

/**
 * Parse .gitignore file and return patterns
 * Note: This is duplicated from directory-operations.ts - should be moved to shared utils
 */
async function parseGitignore(gitignorePath: string): Promise<string[]> {
  try {
    const content = await fs.promises.readFile(gitignorePath, 'utf-8');
    
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        // Convert .gitignore patterns to minimatch patterns
        if (pattern.startsWith('!')) {
          // Negated patterns not supported in this simple implementation
          return '';
        }
        // Handle directory-specific patterns (ending with /)
        if (pattern.endsWith('/')) {
          return `**/${pattern}**`;
        }
        return `**/${pattern}`;
      })
      .filter(Boolean);
  } catch (error) {
    // If .gitignore doesn't exist or can't be read, return empty array
    return [];
  }
}

/**
 * Search files in current project - POST /search-files
 */
export async function handleSearchFiles(req: Request, res: Response): Promise<void> {
  const { pattern, excludePatterns = [], ignoreFolders = [] } = req.body;
  
  if (!pattern) {
    res.status(400).json({ error: 'Missing pattern in request body.' });
    return;
  }
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    res.status(400).json({ error: 'No project path available.' });
    return;
  }

  try {
    const results: string[] = [];
    
    // Parse .gitignore at project root
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignorePatterns = await parseGitignore(gitignorePath);
    
    // Convert ignoreFolders to patterns for matching
    const ignoreFolderPatterns : string[] = ignoreFolders.map((folder: string) => {
      const normalizedFolder = folder.replace(/\\/g, '/');
      const cleanFolder = normalizedFolder.startsWith('./') ? normalizedFolder.slice(2) : normalizedFolder;
      
      if (!cleanFolder.includes('*') && !cleanFolder.includes('?')) {
        const baseName = cleanFolder.endsWith('/') ? cleanFolder.slice(0, -1) : cleanFolder;
        return baseName;
      }
      return cleanFolder;
    });
    
    // Cache for .gitignore patterns found in subdirectories
    const gitignoreCache = new Map<string, string[]>();
    gitignoreCache.set(projectPath, gitignorePatterns);

    async function search(currentPath: string, parentGitignorePatterns: string[] = []) {
      // Get patterns from parent directories plus any in this directory
      let currentGitignorePatterns = [...parentGitignorePatterns];
      
      // Check for .gitignore in this directory if not already cached
      if (!gitignoreCache.has(currentPath)) {
        const localGitignorePath = path.join(currentPath, '.gitignore');
        const localPatterns = await parseGitignore(localGitignorePath);
        gitignoreCache.set(currentPath, localPatterns);
        currentGitignorePatterns = [...currentGitignorePatterns, ...localPatterns];
      } else {
        const cachedPatterns = gitignoreCache.get(currentPath) || [];
        currentGitignorePatterns = [...currentGitignorePatterns, ...cachedPatterns];
      }
      
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(projectPath ?? "", fullPath);
        
        // Check if this entry should be excluded by ignoreFolders patterns
        const shouldExcludeByIgnoreFolders = ignoreFolderPatterns.some(pattern => {
          return minimatch(relativePath, pattern, { dot: true, matchBase: true }) ||
                 minimatch(entry.name, pattern, { dot: true, matchBase: true });
        });
        
        if (shouldExcludeByIgnoreFolders) {
          continue;
        }
        
        // Convert user patterns to the right format
        const formattedUserPatterns = excludePatterns.map((pattern: string) => 
          pattern.includes('*') ? pattern : `**/${pattern}/**`
        );

        // Check against all exclude patterns (user-provided + all .gitignore files)
        const shouldExclude = [...formattedUserPatterns, ...currentGitignorePatterns].some(pattern => {
          return minimatch(relativePath, pattern, { dot: true, matchBase: true });
        });

        if (shouldExclude) {
          continue;
        }

        // Check if the entry name matches the search pattern (case-insensitive)
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(relativePath);
        }

        if (entry.isDirectory()) {
          await search(fullPath, currentGitignorePatterns);
        }
      }
    }

    await search(projectPath, gitignorePatterns);
    
    const resultText = results.length > 0 ? results.join('\n') : 'No matches found';
    res.json({ results: resultText });
  } catch (err: any) {
    console.error(`Error searching files:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `Project directory not found: ${projectPath}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${projectPath}` });
    } else {
      res.status(500).json({ error: `Failed to search files: ${err.message}` });
    }
  }
}

/**
 * Search within a file for text patterns or regular expressions - POST /search-file-content
 */
export async function handleSearchFileContent(req: Request, res: Response): Promise<void> {
  const { 
    path: filePath, 
    pattern, 
    type = 'text', 
    caseSensitive = false, 
    contextLines = 2, 
    maxMatches = 100,
    wholeWord = false,
    multiline = false
  } = req.body;
  
  if (!filePath) {
    res.status(400).json({ error: 'Missing path in request body.' });
    return;
  }
  
  if (!pattern) {
    res.status(400).json({ error: 'Missing pattern in request body.' });
    return;
  }
  
  // Validate contextLines
  const validContextLines = Math.max(0, Math.min(contextLines, 10));
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    res.status(400).json({ error: 'No project path available.' });
    return;
  }

  // Calculate relative path for consistent error reporting
  const resolvedPath = path.resolve(projectPath, filePath);
  const relativePath = path.relative(projectPath, resolvedPath);
  
  // Security check: ensure file is within project directory
  if (relativePath.startsWith('..')) {
    res.status(403).json({ error: `Access denied: File is outside project directory` });
    return;
  }
  
  try {

    // Check if file exists and is readable
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) {
      res.status(400).json({ error: `Path is not a file: ${relativePath}` });
      return;
    }

    const content = await fs.promises.readFile(resolvedPath, 'utf8');
    const lines = content.split('\n');
    
    let searchRegex: RegExp;
    
    if (type === 'regex') {
      try {
        const flags = (caseSensitive ? '' : 'i') + (multiline ? 'm' : '') + 'g';
        searchRegex = new RegExp(pattern, flags);
      } catch (err: any) {
        res.status(400).json({ error: `Invalid regex pattern: ${err.message}` });
        return;
      }
    } else {
      // Escape special regex characters for text search
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundary = wholeWord ? '\\b' : '';
      const flags = caseSensitive ? 'g' : 'gi';
      searchRegex = new RegExp(`${wordBoundary}${escapedPattern}${wordBoundary}`, flags);
    }

    interface Match {
      lineNumber: number;
      columnNumber: number;
      content: string;
      context: Array<{ lineNumber: number; content: string; isMatch: boolean }>;
    }

    const matches: Match[] = [];
    let totalMatches = 0;

    for (let lineIndex = 0; lineIndex < lines.length && totalMatches < maxMatches; lineIndex++) {
      const line = lines[lineIndex];
      let match: RegExpExecArray | null;
      
      // Reset regex lastIndex for each line
      searchRegex.lastIndex = 0;
      
      while ((match = searchRegex.exec(line)) !== null && totalMatches < maxMatches) {
        const context: Array<{ lineNumber: number; content: string; isMatch: boolean }> = [];
        
        // Add context lines before
        for (let i = Math.max(0, lineIndex - validContextLines); i < lineIndex; i++) {
          context.push({
            lineNumber: i + 1,
            content: lines[i],
            isMatch: false
          });
        }
        
        // Add the matching line
        context.push({
          lineNumber: lineIndex + 1,
          content: line,
          isMatch: true
        });
        
        // Add context lines after
        for (let i = lineIndex + 1; i <= Math.min(lines.length - 1, lineIndex + validContextLines); i++) {
          context.push({
            lineNumber: i + 1,
            content: lines[i],
            isMatch: false
          });
        }
        
        matches.push({
          lineNumber: lineIndex + 1,
          columnNumber: match.index + 1,
          content: line,
          context
        });
        
        totalMatches++;
        
        // For non-global regex, break to avoid infinite loop
        if (!searchRegex.global) {
          break;
        }
      }
    }
    
    res.json({ 
      matches: matches.length,
      data: matches
    });
    
  } catch (err: any) {
    console.error(`Error searching file content:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `File not found: ${relativePath}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${relativePath}` });
    } else {
      res.status(500).json({ error: `Failed to search file content: ${err.message}` });
    }
  }
}
