import * as vscode from 'vscode';
import { ContextManager } from '../models/project-session';

// Update the list of open tabs
export function updateOpenTabs(session: ContextManager, _?: vscode.TextDocument) {
  session.opening_tabs = vscode.workspace.textDocuments
    .filter(doc => !doc.isUntitled)
    .map(doc => doc.fileName.split(/[/\\]/).pop() || '');
}

// Update the current active tab
export function updateCurrentTab(session: ContextManager, editor: vscode.TextEditor | undefined) {
  if (editor) {
    session.curTab = editor.document.fileName.split(/[/\\]/).pop() || '';
  } else {
    session.curTab = null;
  }
}
