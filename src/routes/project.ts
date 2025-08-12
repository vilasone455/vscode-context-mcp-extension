/**
 * Project and file-related route handlers for the VS Code Context MCP Extension
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import  minimatch  from 'minimatch';
import { getCurrentProjectPath, getSession, getWebviewProvider } from '../server/state';
import { getActiveEditorInfo, getOpenTabsInfo, severityToString } from '../utils/vscode-helpers';
import {  getContextFileWithLineNumber } from '../utils/common';
import { getTerminalContent } from '../commands';
import { ApplyEditsRequest } from '../models/ApplyEditsRequest';
import { applyVscodeEdits } from '../utils/edit-helpers';

export function handleProjectPath(_req: Request, res: Response): void {
  res.json({ path: getCurrentProjectPath() });
}

export function handleCurrentFile(_req: Request, res: Response): void {
  const activeTabInfo = getActiveEditorInfo();
  
  if (activeTabInfo ) {
    res.json(activeTabInfo);
  } else {
    res.json({ error: 'No active editor' });
  }
}

export function handleOpenTabs(_req: Request, res: Response): void {
  const openTabs = getOpenTabsInfo();
  res.json({ openTabs });
}

export function handleSessionContext(_req: Request, res: Response): void {
  const session = getSession();
  const webviewProvider = getWebviewProvider();
  const files = session.context_file_lists;
  const projectPath = getCurrentProjectPath();

  const activeTabInfo = getActiveEditorInfo();
  
  // Convert context files to have relative paths
  const filesWithRelativePaths = files.map(file => {
    const relativePath = projectPath && path.isAbsolute(file.fullPath) 
      ? path.relative(projectPath, file.fullPath)
      : file.fullPath;
    
    return {
      ...file,
      fullPath: relativePath
    };
  });

  res.json({
    currentPath: projectPath, // Use "." to represent project root
    files: filesWithRelativePaths,
    activeTab: activeTabInfo,
    openTabs: getOpenTabsInfo()
  });
  session.context_file_lists = [];
  webviewProvider?.refresh();
}

export function handleGetFileListAndClear(_req: Request, res: Response): void {
  const session = getSession();
  const webviewProvider = getWebviewProvider();
  const fileList = [...session.context_file_lists];
  const filesWithLineNumbers = getContextFileWithLineNumber(fileList);
  
  // Clear the original context files
  session.context_file_lists = [];
  webviewProvider?.refresh();

  // Return the files with line numbers
  res.json({ files: filesWithLineNumbers });
  console.log('File list retrieved with line numbers and cleared');
}

export async function handleTerminalContent(_req: Request, res: Response): Promise<void> {
  const terminalContent = await getTerminalContent();
  if (terminalContent) {
    res.json({ content: terminalContent });
  } else {
    res.json({ error: 'No terminal content available' });
  }
}  

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

// =============================================================================
// NEW DIRECTORY AND FILE OPERATION ENDPOINTS
// =============================================================================

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
 * Move/rename file or directory - POST /move-file
 */
export async function handleMoveFile(req: Request, res: Response): Promise<void> {
  const { source, destination } = req.body;

  if (!source || !destination) {
    res.status(400).json({ error: 'Missing source or destination in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  
  let resolvedSource: string;
  if (path.isAbsolute(source)) {
    resolvedSource = source;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedSource = path.resolve(projectPath, source);
  }
  
  let resolvedDestination: string;
  if (path.isAbsolute(destination)) {
    resolvedDestination = destination;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedDestination = path.resolve(projectPath, destination);
  }

  try {
    // Check if source exists
    await fs.promises.access(resolvedSource);
    
    // Check if destination already exists
    try {
      await fs.promises.access(resolvedDestination);
      res.status(409).json({ error: `Destination already exists: ${resolvedDestination}` });
      return;
    } catch {
      // Destination doesn't exist, which is what we want
    }
    
    // Perform the move
    await fs.promises.rename(resolvedSource, resolvedDestination);
    
    // Convert absolute paths back to relative paths for consistent response
    const relativeSource = path.isAbsolute(source) && projectPath 
      ? path.relative(projectPath, resolvedSource)
      : source;
    const relativeDestination = path.isAbsolute(destination) && projectPath 
      ? path.relative(projectPath, resolvedDestination)
      : destination;
    
    res.json({
      source: relativeSource,
      destination: relativeDestination,
      message: 'Successfully moved file/directory'
    });
  } catch (err: any) {
    console.error(`Error moving ${resolvedSource} to ${resolvedDestination}:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `Source not found: ${resolvedSource}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${err.message}` });
    } else if (err.code === 'EXDEV') {
      res.status(400).json({ error: 'Cannot move across different file systems' });
    } else {
      res.status(500).json({ error: `Failed to move file: ${err.message}` });
    }
  }
}

export async function handleReadFile(req: Request, res: Response): Promise<void> {
  const { path: filePath } = req.body;

  if (!filePath) {
    res.status(400).json({ error: 'Missing path in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  let resolvedPath: string;
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedPath = path.resolve(projectPath, filePath);
  }

  try {
    const content = await fs.promises.readFile(resolvedPath, 'utf8');
    // Convert absolute paths back to relative paths for consistent response
    const relativePath = path.isAbsolute(filePath) && projectPath 
      ? path.relative(projectPath, resolvedPath)
      : filePath;
    
    res.json({
      path: relativePath,
      content: content
    });
  } catch (err: any) {
    console.error(`Error reading file ${resolvedPath}:`, err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: `File not found: ${resolvedPath}` });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${resolvedPath}` });
    } else {
      res.status(500).json({ error: `Failed to read file: ${err.message}` });
    }
  }
}

export async function handleWriteFile(req: Request, res: Response): Promise<void> {
  const { path: filePath, content } = req.body;

  if (!filePath) {
    res.status(400).json({ error: 'Missing path in request body.' });
    return;
  }

  if (content === undefined || content === null) {
    res.status(400).json({ error: 'Missing content in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  let resolvedPath: string;
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath;
  } else {
    if (!projectPath) {
      res.status(400).json({ error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedPath = path.resolve(projectPath, filePath);
  }

  try {
    // Ensure the directory exists
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // Write the file
    await fs.promises.writeFile(resolvedPath, content, 'utf8');
    
    // Convert absolute paths back to relative paths for consistent response
    const relativePath = path.isAbsolute(filePath) && projectPath 
      ? path.relative(projectPath, resolvedPath)
      : filePath;
    
    res.json({
      path: relativePath,
      message: 'File written successfully'
    });
  } catch (err: any) {
    console.error(`Error writing file ${resolvedPath}:`, err);
    if (err.code === 'EACCES') {
      res.status(403).json({ error: `Permission denied: ${resolvedPath}` });
    } else if (err.code === 'ENOSPC') {
      res.status(507).json({ error: `Insufficient storage space: ${resolvedPath}` });
    } else {
      res.status(500).json({ error: `Failed to write file: ${err.message}` });
    }
  }
}

export async function handleReadMultipleFiles(req: Request, res: Response): Promise<void> {
  const { paths } = req.body;

  if (!paths || !Array.isArray(paths)) {
    res.status(400).json({ error: 'Missing or invalid paths array in request body.' });
    return;
  }

  const projectPath = getCurrentProjectPath();

  try {
    const results = await Promise.allSettled(
      paths.map(async (filePath: string) => {
        // Resolve relative paths against the current project path
        let resolvedPath: string;
        if (path.isAbsolute(filePath)) {
          resolvedPath = filePath;
        } else {
          if (!projectPath) {
            throw new Error(`No project path available to resolve relative path: ${filePath}`);
          }
          resolvedPath = path.resolve(projectPath, filePath);
        }

        try {
          const content = await fs.promises.readFile(resolvedPath, 'utf8');
          
          // Convert absolute paths back to relative paths for consistent response
          const relativePath = path.isAbsolute(filePath) && projectPath 
            ? path.relative(projectPath, resolvedPath)
            : filePath;
          
          return {
            path: relativePath,
            content: content
          };
        } catch (fileError: any) {
          throw new Error(`Failed to read file ${resolvedPath}: ${fileError.message}`);
        }
      })
    );

    const successfulResults: Array<{ path: string; content: string }> = [];
    const errors: Array<{ path: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        errors.push({
          path: paths[index],
          error: result.reason.message
        });
      }
    });

    if (errors.length > 0) {
      res.status(207).json({ // 207 Multi-Status
        results: successfulResults,
        errors: errors
      });
    } else {
      res.json(successfulResults);
    }
  } catch (err: any) {
    console.error('Error processing multiple files:', err);
    res.status(500).json({ error: `Failed to process files: ${err.message}` });
  }
}

export function handleProblems(_req: Request, res: Response): void {
  const diagnosticCollection = vscode.languages.getDiagnostics();
  const projectPath = getCurrentProjectPath();
  
  const problems = diagnosticCollection.map(([uri, diagnostics]) => {
    // Convert absolute path to relative path
    const absolutePath = uri.fsPath;
    const relativePath = projectPath && path.isAbsolute(absolutePath) 
      ? path.relative(projectPath, absolutePath)
      : absolutePath;
    
    return {
      file: relativePath,
      fileName: path.basename(uri.fsPath),
      problems: diagnostics.map(diag => ({
        message: diag.message,
        severity: severityToString(diag.severity),
        line: diag.range.start.line + 1,
        column: diag.range.start.character + 1,
      }))
    };
  });
  res.json({ problems });
}

export async function handleModifyFile(req: Request, res: Response): Promise<void> {
  const { filePath, edits, shortComment } = req.body as ApplyEditsRequest;

  if (!filePath || !edits) {
    res.status(400).json({ success: false, error: 'Missing filePath or edits in request body.' });
    return;
  }

  // Resolve relative paths against the current project path
  const projectPath = getCurrentProjectPath();
  let resolvedPath: string;
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath;
  } else {
    if (!projectPath) {
      res.status(400).json({ success: false, error: 'No project path available to resolve relative path.' });
      return;
    }
    resolvedPath = path.resolve(projectPath, filePath);
  }

  try {
    console.log(`Received request to modify ${path.basename(resolvedPath)}: ${shortComment || 'No comment'}`);
    const success = await applyVscodeEdits(resolvedPath, edits);
    if (success) {
      // Convert absolute paths back to relative paths for consistent response
      const relativePath = path.isAbsolute(filePath) && projectPath 
        ? path.relative(projectPath, resolvedPath)
        : filePath;
      
      res.json({ 
        success: true, 
        message: `Successfully applied ${edits.length} edits to ${path.basename(resolvedPath)}.`,
        path: relativePath
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to apply edits using VS Code API. The operation was not successful.' });
    }
  } catch (err: any) {
    console.error(`Error applying edits to ${resolvedPath}:`, err);
    res.status(500).json({ success: false, error: `Failed to apply edits: ${err.message}` });
  }
}
export async function handleGetFilesLineCount(req: Request, res: Response): Promise<void> {
  const { paths } = req.body;

  if (!paths || !Array.isArray(paths)) {
    res.status(400).json({ error: 'Missing or invalid paths array in request body.' });
    return;
  }

  const projectPath = getCurrentProjectPath();

  try {
    const results = await Promise.allSettled(
      paths.map(async (filePath: string) => {
        // Resolve relative paths against the current project path
        let resolvedPath: string;
        if (path.isAbsolute(filePath)) {
          resolvedPath = filePath;
        } else {
          if (!projectPath) {
            throw new Error(`No project path available to resolve relative path: ${filePath}`);
          }
          resolvedPath = path.resolve(projectPath, filePath);
        }

        try {
          const content = await fs.promises.readFile(resolvedPath, 'utf8');
          const lines = content.split('\n');
          const totalLines = lines.length;
          
          // Convert absolute paths back to relative paths for consistent response
          const relativePath = path.isAbsolute(filePath) && projectPath 
            ? path.relative(projectPath, resolvedPath)
            : filePath;
          
          return {
            path: relativePath,
            total_line: totalLines
          };
        } catch (fileError: any) {
          throw new Error(`Failed to read file ${resolvedPath}: ${fileError.message}`);
        }
      })
    );

    const successfulResults: Array<{ path: string; total_line: number }> = [];
    const errors: Array<{ path: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        errors.push({
          path: paths[index],
          error: result.reason.message
        });
      }
    });

    if (errors.length > 0) {
      res.status(207).json({ // 207 Multi-Status
        results: successfulResults,
        errors: errors
      });
    } else {
      res.json(successfulResults);
    }
  } catch (err: any) {
    console.error('Error processing files line count:', err);
    res.status(500).json({ error: `Failed to process files: ${err.message}` });
  }
}
