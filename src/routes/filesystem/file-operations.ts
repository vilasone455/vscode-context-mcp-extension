/**
 * File operation handlers for the VS Code Context MCP Extension
 * Handles: read, write, modify, move, and line counting operations
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCurrentProjectPath } from '../../server/state';
import { ApplyEditsRequest } from '../../models/ApplyEditsRequest';
import { createVscodeTextEdits } from '../../utils/edit-helpers';
import { ChangeTracker } from '../../change-tracking';


/**
 * Read file contents - POST /read-file
 */
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

/**
 * Write file contents - POST /write-file
 */
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
      message: 'File written successfully (pending approval)'
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

/**
 * Read multiple files - POST /read-multiple-files
 */
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

/**
 * Get line count for multiple files - POST /get-files-line-count
 */
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

/**
 * Modify file using VSCode edits - POST /modify-file
 */
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
    console.log(`Received ssssssss request to modify ${path.basename(resolvedPath)}: ${shortComment || 'No comment'}`);
    
    const uri = vscode.Uri.file(resolvedPath);
    const document = await vscode.workspace.openTextDocument(uri);
    const vscodeEdits = await createVscodeTextEdits(document, edits);
    
    if (vscodeEdits.length === 0) {
      console.log('No edits to apply.');
      res.json({ 
        success: true, 
        message: 'No edits to apply.',
        path: path.isAbsolute(filePath) && projectPath ? path.relative(projectPath, resolvedPath) : filePath
      });
      return;
    }

    // add pending change to change tracker
    let changeTracker = new ChangeTracker();
    const pendingChanges = await changeTracker.addChanges(resolvedPath, vscodeEdits, shortComment || 'No comment');
    
    // Apply the edits
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(uri, vscodeEdits);
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    
    if (success) {
      await document.save();
      
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


