/**
 * Directory operation handlers for the VS Code Context MCP Extension
 * Handles: create, list, and tree operations for directories
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import minimatch from 'minimatch';
import { getCurrentProjectPath } from '../../server/state';

/**
 * Parse .gitignore file and return patterns
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
 * Create a directory - POST /create-directory
 */
export async function handleCreateDirectory(req: Request, res: Response): Promise<void> {
  const { path: dirPath } = req.body;

  if (!dirPath) {
    res.status(400).json({ error: 'Missing path in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  let resolvedPath: string;
  if (path.isAbsolute(dirPath)) {
    resolvedPath = dirPath;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedPath = path.resolve(projectPath, dirPath);
  }

  try {
    // Create directory recursively
    await fs.promises.mkdir(resolvedPath, { recursive: true });
    
    // Convert absolute paths back to relative paths for consistent response
    const relativePath = path.isAbsolute(dirPath) && projectPath 
      ? path.relative(projectPath, resolvedPath)
      : dirPath;
    
    res.json({
      path: relativePath,
      message: 'Successfully created directory'
    });
  } catch (err: any) {
    console.error(`Error creating directory ${resolvedPath}:`, err);
    if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${resolvedPath}` });
    } else if (err.code === 'ENOSPC') {
      res.status(507).json({ error: `Insufficient storage space: ${resolvedPath}` });
    } else {
      res.status(500).json({ error: `Failed to create directory: ${err.message}` });
    }
  }
}

/**
 * List directory contents - POST /list-directory
 */
export async function handleListDirectory(req: Request, res: Response): Promise<void> {
  const { path: dirPath } = req.body;

  if (!dirPath) {
    res.status(400).json({ error: 'Missing path in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  let resolvedPath: string;
  if (path.isAbsolute(dirPath)) {
    resolvedPath = dirPath;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedPath = path.resolve(projectPath, dirPath);
  }

  try {
    const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
    const listing = entries
      .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
      .join('\n');
    
    // Convert absolute paths back to relative paths for consistent response
    const relativePath = path.isAbsolute(dirPath) && projectPath 
      ? path.relative(projectPath, resolvedPath)
      : dirPath;
    
    res.json({
      path: relativePath,
      listing: listing
    });
  } catch (err: any) {
    console.error(`Error listing directory ${resolvedPath}:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `Directory not found: ${resolvedPath}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${resolvedPath}` });
    } else {
      res.status(500).json({ error: `Failed to list directory: ${err.message}` });
    }
  }
}

/**
 * Get directory tree of current project - POST /directory-tree
 */
export async function handleDirectoryTree(req: Request, res: Response): Promise<void> {
  const { ignoreFolders = [] } = req.body;
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    res.status(400).json({ error: 'No project path available.' });
    return;
  }

  try {
    // Parse .gitignore at project root
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignorePatterns = await parseGitignore(gitignorePath);
    
    // Smart filtering: ignore verbose hidden directories but keep useful ones
    const ignoredHiddenDirs = ['.git', '.DS_Store', '.idea'];
    
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
    
    const directories: string[] = [];
    const files: string[] = [];
    
    async function traverse(currentPath: string, parentGitignorePatterns: string[] = []) {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      
      // Get patterns from parent directories plus any in this directory
      let currentGitignorePatterns = [...parentGitignorePatterns];
      
      // Check for .gitignore in this directory
      const localGitignorePath = path.join(currentPath, '.gitignore');
      const localPatterns = await parseGitignore(localGitignorePath);
      currentGitignorePatterns = [...currentGitignorePatterns, ...localPatterns];

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(projectPath ?? "", entryPath);
        
        // Check if this entry should be excluded by .gitignore patterns
        const shouldExcludeByGitignore = currentGitignorePatterns.some(pattern => {
          return minimatch(relativePath, pattern, { dot: true, matchBase: true });
        });
        
        // Check if this entry should be excluded by ignoreFolders patterns
        const shouldExcludeByIgnoreFolders = ignoreFolderPatterns.some(pattern => {
          return minimatch(relativePath, pattern, { dot: true, matchBase: true }) ||
                 minimatch(entry.name, pattern, { dot: true, matchBase: true });
        });
        
        if (shouldExcludeByGitignore || shouldExcludeByIgnoreFolders) {
          continue;
        }
        
        // Smart filtering: completely skip verbose hidden directories
        if (entry.isDirectory() && ignoredHiddenDirs.includes(entry.name)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Add directory with trailing slash
          directories.push(relativePath + '/');
          // Recursively traverse subdirectories  
          await traverse(entryPath, currentGitignorePatterns);
        } else {
          // Add file with its relative path
          files.push(relativePath);
        }
      }
    }

    await traverse(projectPath, gitignorePatterns);
    
    const result = {
      d: directories.sort(),
      f: files.sort()
    };
    
    res.json(result);
  } catch (err: any) {
    console.error(`Error getting directory tree:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `Project directory not found: ${projectPath}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${projectPath}` });
    } else {
      res.status(500).json({ error: `Failed to get directory tree: ${err.message}` });
    }
  }
}
