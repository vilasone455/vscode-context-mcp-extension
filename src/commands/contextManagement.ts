import * as vscode from 'vscode';
import { ProjectSession, ContextFile } from '../models/project-session';
import { ProjectSessionWebviewProvider } from '../webview/webview-provider';

// Check if a file already exists in the context
export function isFileInContext(session: ProjectSession, fullPath: string, startLine: number, endLine: number, isFullCode: boolean): boolean {
  return session.context_file_lists.some(contextFile => {
    // For full code files, just check the path
    if (isFullCode && contextFile.fullCode) {
      return contextFile.fullPath === fullPath;
    }
    
    // For selections, check for overlapping ranges in the same file
    if (!isFullCode && contextFile.fullPath === fullPath) {
      // Check if the ranges overlap
      return (
        (startLine <= contextFile.end_line && endLine >= contextFile.start_line) ||
        (contextFile.start_line <= endLine && contextFile.end_line >= startLine)
      );
    }
    
    return false;
  });
}

// Add current file to context
export async function addFileToContext(session: ProjectSession, _: vscode.ExtensionContext, webviewProvider: ProjectSessionWebviewProvider | null) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No file is currently open');
    return;
  }

  const document = editor.document;
  const fileName = document.fileName.split(/[/\\]/).pop() || '';
  const fullPath = document.fileName;
  const content = document.getText();

  console.log(`Adding file to context: ${fileName}`);

  // Check if this file is already in the context
  if (isFileInContext(session, fullPath, 0, document.lineCount - 1, true)) {
    vscode.window.showWarningMessage(`${fileName} is already in the context`);
    return;
  }

  const contextFile = new ContextFile(
    fileName,
    fullPath,
    content,
    0,
    document.lineCount - 1,
    true
  );

  session.context_file_lists.push(contextFile);
  vscode.window.showInformationMessage(`Added ${fileName} to context`);
  
  console.log(`Current context files: ${session.context_file_lists.length}`);
  
  // Notify the webview to update
  updateWebView(webviewProvider);
}

// Add selected text to context
export async function addSelectionToContext(session: ProjectSession, _: vscode.ExtensionContext, webviewProvider: ProjectSessionWebviewProvider | null) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No file is currently open');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('No text selected');
    return;
  }

  const document = editor.document;
  const fileName = document.fileName.split(/[/\\]/).pop() || '';
  const fullPath = document.fileName;
  const content = document.getText(selection);
  const startLine = selection.start.line;
  const endLine = selection.end.line;

  // Check if this selection is already in the context
  if (isFileInContext(session, fullPath, startLine, endLine, false)) {
    vscode.window.showWarningMessage(`This selection from ${fileName} is already in the context`);
    return;
  }

  const contextFile = new ContextFile(
    fileName,
    fullPath,
    content,
    startLine,
    endLine,
    false
  );

  session.context_file_lists.push(contextFile);
  vscode.window.showInformationMessage(`Added selection from ${fileName} to context`);
  
  // Notify the webview to update
  updateWebView(webviewProvider);
}

// Remove a specific context file by index
export function removeContextFile(session: ProjectSession, index: number, webviewProvider: ProjectSessionWebviewProvider | null) {
  if (index >= 0 && index < session.context_file_lists.length) {
    const removed = session.context_file_lists.splice(index, 1)[0];
    vscode.window.showInformationMessage(`Removed ${removed.file_name} from context`);
    
    // Notify the webview to update
    updateWebView(webviewProvider);
  }
}

// Clear all context files
export function clearContext(session: ProjectSession, webviewProvider: ProjectSessionWebviewProvider | null) {
  session.context_file_lists = [];
  vscode.window.showInformationMessage('Context cleared');
  
  // Notify the webview to update
  updateWebView(webviewProvider);
}

// Helper function to update the WebView
export function updateWebView(webviewProvider: ProjectSessionWebviewProvider | null) {
  console.log('Updating webview...');
  if (webviewProvider) {
    console.log('Provider found, sending update');
    webviewProvider.sendContextFilesToWebview();
  } else {
    console.log('No provider found! Cannot update webview.');
  }
}
