/**
 * Project integration handlers for the VS Code Context MCP Extension
 * Handles: terminal content and VSCode diagnostics/problems
 */

import { Request, Response } from 'express';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCurrentProjectPath } from '../../server/state';
import { severityToString } from '../../utils/vscode-helpers';
import { getTerminalContent } from '../../commands';

/**
 * Get terminal content - GET /terminal-content
 */
export async function handleTerminalContent(_req: Request, res: Response): Promise<void> {
  const terminalContent = await getTerminalContent();
  if (terminalContent) {
    res.json({ content: terminalContent });
  } else {
    res.json({ error: 'No terminal content available' });
  }
}

/**
 * Get VSCode problems/diagnostics - GET /problems
 */
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
