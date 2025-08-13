/**
 * VS Code utility functions for the VS Code Context MCP Extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getCurrentProjectPath } from '../server/state';

interface TabInfo{
  file_name: string;
  line_count: number;
}

export function getActiveEditorInfo(): TabInfo | null {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    const projectPath = getCurrentProjectPath();
    if (projectPath && path.isAbsolute(document.fileName)) {
      return {file_name : path.relative(projectPath, document.fileName) , line_count : document.lineCount};
    }
    return {file_name : document.fileName, line_count : document.lineCount};
  }
  return null;
}

export function getOpenTabsInfo(): TabInfo[] {
  const projectPath = getCurrentProjectPath();
  return vscode.workspace.textDocuments.map(document => {
    if (projectPath && path.isAbsolute(document.fileName)) {
      return { file_name: path.relative(projectPath, document.fileName), line_count: document.lineCount };
    }
    return { file_name: document.fileName, line_count: document.lineCount };
  });
}

export function severityToString(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'Error';
    case vscode.DiagnosticSeverity.Warning:
      return 'Warning';
    case vscode.DiagnosticSeverity.Information:
      return 'Information';
    case vscode.DiagnosticSeverity.Hint:
      return 'Hint';
    default:
      return 'Unknown';
  }
}
