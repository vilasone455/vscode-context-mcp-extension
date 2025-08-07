/**
 * Project and file-related route handlers for the VS Code Context MCP Extension
 */

import { Request, Response } from 'express';import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCurrentProjectPath, getSession, getWebviewProvider } from '../server/state';
import { getActiveEditorInfo, getOpenTabsInfo, severityToString } from '../utils/vscode-helpers';
import { formatWithLineNumbers, getContextFileWithLineNumber } from '../utils/common';
import { getTerminalContent } from '../commands';
import { ApplyEditsRequest } from '../models/ApplyEditsRequest';
import { applyVscodeEdits } from '../utils/edit-helpers';

export function handleProjectPath(_req: Request, res: Response): void {
  res.json({ path: getCurrentProjectPath() });
}

export function handleCurrentFile(_req: Request, res: Response): void {
  const activeTabInfo = getActiveEditorInfo();
  let activeTabWithLineNumbers = activeTabInfo;

  if (activeTabInfo && activeTabInfo.content) {
    const content = activeTabInfo.content;
    const newContent = formatWithLineNumbers(content);

    activeTabWithLineNumbers = {
      ...activeTabInfo,
      content: newContent
    };
  }

  if (activeTabWithLineNumbers) {
    res.json(activeTabWithLineNumbers);
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
  const filesWithLineNumbers = getContextFileWithLineNumber(session.context_file_lists);

  const activeTabInfo = getActiveEditorInfo();
  let activeTabWithLineNumbers = activeTabInfo;

  if (activeTabInfo && activeTabInfo.content) {
    const content = activeTabInfo.content;
    const newContent = formatWithLineNumbers(content);

    activeTabWithLineNumbers = {
      ...activeTabInfo,
      content: newContent
    };
  }

  res.json({
    currentPath: getCurrentProjectPath(),
    files: filesWithLineNumbers,
    activeTab: activeTabWithLineNumbers,
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

export function handleProblems(_req: Request, res: Response): void {
  const diagnosticCollection = vscode.languages.getDiagnostics();
  const problems = diagnosticCollection.map(([uri, diagnostics]) => ({
    file: uri.toString(),
    fileName: path.basename(uri.fsPath),
    problems: diagnostics.map(diag => ({
      message: diag.message,
      severity: severityToString(diag.severity),
      line: diag.range.start.line + 1,
      column: diag.range.start.character + 1,
    }))
  }));
  res.json({ problems });
}

export async function handleModifyFile(req: Request, res: Response): Promise<void> {
  const { filePath, edits, shortComment } = req.body as ApplyEditsRequest;

  if (!filePath || !edits) {
    res.status(400).json({ success: false, error: 'Missing filePath or edits in request body.' });
    return;
  }

  if (!path.isAbsolute(filePath)) {
    res.status(400).json({ success: false, error: 'File path must be an absolute path.' });
    return;
  }

  try {
    console.log(`Received request to modify ${path.basename(filePath)}: ${shortComment || 'No comment'}`);
    const success = await applyVscodeEdits(filePath, edits);
    if (success) {
      res.json({ success: true, message: `Successfully applied ${edits.length} edits to ${path.basename(filePath)}.` });
    } else {
      res.status(500).json({ success: false, error: 'Failed to apply edits using VS Code API. The operation was not successful.' });
    }
  } catch (err: any) {
    console.error(`Error applying edits to ${filePath}:`, err);
    res.status(500).json({ success: false, error: `Failed to apply edits: ${err.message}` });
  }
}
export async function handleGetFilesLineCount(req: Request, res: Response): Promise<void> {
  const { paths } = req.body;

  if (!paths || !Array.isArray(paths)) {
    res.status(400).json({ error: 'Missing or invalid paths array in request body.' });
    return;
  }

  try {
    const results = await Promise.allSettled(
      paths.map(async (filePath: string) => {
        if (!path.isAbsolute(filePath)) {
          throw new Error(`File path must be an absolute path: ${filePath}`);
        }

        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          const totalLines = lines.length;
          
          return {
            path: filePath,
            total_line: totalLines
          };
        } catch (fileError: any) {
          throw new Error(`Failed to read file ${filePath}: ${fileError.message}`);
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
