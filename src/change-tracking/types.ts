import * as vscode from 'vscode';

/**
 * Core interface for a pending change that can be approved or rejected
 */
export interface PendingChange {
  id: string;
  filePath: string;
  textEdit: vscode.TextEdit;
  originalText: string;
  description: string;
  timestamp: Date;
}

/**
 * Simple grouping of changes by file
 */
export interface FileChangeSet {
  filePath: string;
  changes: Map<string, PendingChange>;
  originalFileContent: string;
}
