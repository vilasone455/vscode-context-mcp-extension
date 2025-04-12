import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getGitignoreFilter } from './utils/gitignore-filter';
import { ProjectSession, ContextFile } from './models/project-session';
import { ProjectSessionWebviewProvider } from './webview/webview-provider';

// Global instances
let session = new ProjectSession();
let webviewProvider: ProjectSessionWebviewProvider | null = null; // Store a reference to the webview provider

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  console.log('Project Session Manager is now active');

  // Register commands for keyboard shortcuts
  let addFileToContextCmd = vscode.commands.registerCommand('projectSession.addFileToContext', () => addFileToContext(context));
  let addSelectionToContextCmd = vscode.commands.registerCommand('projectSession.addSelectionToContext', () => addSelectionToContext(context));
  let clearContextCmd = vscode.commands.registerCommand('projectSession.clearContext', () => clearContext(context));
  
  // Register the WebviewView provider for the sidebar
  webviewProvider = new ProjectSessionWebviewProvider(context.extensionUri, session);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('projectSessionExplorer', webviewProvider)
  );
  
  // Add command to remove a specific context file
  context.subscriptions.push(vscode.commands.registerCommand('projectSession.removeContextFile', (id: string) => {
    removeContextFile(parseInt(id), context);
  }));

  // Update tabs when they change
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateCurrentTab));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(updateOpenTabs));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(updateOpenTabs));

  // Initial update of tabs
  updateOpenTabs();
  updateCurrentTab(vscode.window.activeTextEditor);

  // Add disposables to context
  context.subscriptions.push(addFileToContextCmd);
  context.subscriptions.push(addSelectionToContextCmd);
  context.subscriptions.push(clearContextCmd);
}

// Check if a file already exists in the context
function isFileInContext(fullPath: string, startLine: number, endLine: number, isFullCode: boolean): boolean {
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
async function addFileToContext(context: vscode.ExtensionContext) {
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
  if (isFileInContext(fullPath, 0, document.lineCount - 1, true)) {
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
  updateWebView(context);
}

// Add selected text to context
async function addSelectionToContext(context: vscode.ExtensionContext) {
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
  if (isFileInContext(fullPath, startLine, endLine, false)) {
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
  updateWebView(context);
}

// Remove a specific context file by index
function removeContextFile(index: number, context: vscode.ExtensionContext) {
  if (index >= 0 && index < session.context_file_lists.length) {
    const removed = session.context_file_lists.splice(index, 1)[0];
    vscode.window.showInformationMessage(`Removed ${removed.file_name} from context`);
    
    // Notify the webview to update
    updateWebView(context);
  }
}

// Clear all context files
function clearContext(_context: vscode.ExtensionContext) {
  session.context_file_lists = [];
  vscode.window.showInformationMessage('Context cleared');
  
  // Notify the webview to update
  updateWebView(_context);
}

// Helper function to update the WebView
function updateWebView(_: vscode.ExtensionContext) {
  console.log('Updating webview...');
  if (webviewProvider) {
    console.log('Provider found, sending update');
    webviewProvider.sendContextFilesToWebview();
  } else {
    console.log('No provider found! Cannot update webview.');
  }
}

  // Change updateOpenTabs signature to match expected TextDocument event handler
  function updateOpenTabs(_?: vscode.TextDocument) {
    session.opening_tabs = vscode.workspace.textDocuments
      .filter(doc => !doc.isUntitled)
      .map(doc => doc.fileName.split(/[/\\]/).pop() || '');
  }

// Update the current active tab
function updateCurrentTab(editor: vscode.TextEditor | undefined) {
  if (editor) {
    session.curTab = editor.document.fileName.split(/[/\\]/).pop() || '';
  } else {
    session.curTab = null;
  }
}

// Deactivation function
export function deactivate() {
  // Save session data if needed
  console.log('Project Session Manager deactivated');
}