/**
 * Project context handlers for the VS Code Context MCP Extension
 * Handles: project path, current file, open tabs, session context, and file list management
 */

import { Request, Response } from 'express';
import * as path from 'path';
import { getCurrentProjectPath, getSession, getWebviewProvider } from '../../server/state';
import { getActiveEditorInfo, getOpenTabsInfo } from '../../utils/vscode-helpers';
import { getContextFileWithLineNumber } from '../../utils/common';

/**
 * Get current project path - GET /project-path
 */
export function handleProjectPath(_req: Request, res: Response): void {
  res.json({ path: getCurrentProjectPath() });
}

/**
 * Get current active file - GET /current-file
 */
export function handleCurrentFile(_req: Request, res: Response): void {
  const activeTabInfo = getActiveEditorInfo();
  
  if (activeTabInfo ) {
    res.json(activeTabInfo);
  } else {
    res.json({ error: 'No active editor' });
  }
}

/**
 * Get open tabs - GET /open-tabs
 */
export function handleOpenTabs(_req: Request, res: Response): void {
  const openTabs = getOpenTabsInfo();
  res.json({ openTabs });
}

/**
 * Get session context including files, active tab, etc. - GET /session-context
 */
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

/**
 * Get file list with line numbers and clear session - GET /get-file-list-and-clear
 */
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
