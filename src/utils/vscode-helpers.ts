/**
 * VS Code utility functions for the VS Code Context MCP Extension
 */

import * as vscode from 'vscode';
import { EditorInfo, TabInfo } from '../types';

export function getActiveEditorInfo(): EditorInfo | null {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    return {
      fileName: document.fileName,
      languageId: document.languageId,
      lineCount: document.lineCount,
      uri: document.uri.toString(),
      isDirty: document.isDirty,
      isUntitled: document.isUntitled,
      content: document.getText()
    };
  }
  return null;
}

export function getOpenTabsInfo(): TabInfo[] {
  return vscode.workspace.textDocuments.map(document => {
    const isActiveDocument = vscode.window.activeTextEditor?.document === document;

    return {
      fileName: document.fileName,
      languageId: document.languageId,
      uri: document.uri.toString(),
      isActive: isActiveDocument, // now always boolean
      isDirty: document.isDirty,
      isUntitled: document.isUntitled
    };
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
