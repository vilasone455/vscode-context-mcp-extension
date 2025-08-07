/**
 * Main extension entry point for the VS Code Context MCP Extension
 * Refactored for better organization and maintainability
 */

import * as vscode from 'vscode';
import { ContextMCPWebviewProvider } from './webview/webview-provider';
import { setWebviewProvider, setCurrentProjectPath, setApp } from './server/state';
import { shutdownExistingServer, startServer } from './server/setup';
import {
  getTerminalContent,
  addFileToContext,
  addSelectionToContext,
  removeContextFile,
  clearContext,
} from './commands';
import { getSession, getWebviewProvider } from './server/state';

// =============================================================================
// EXTENSION LIFECYCLE FUNCTIONS
// =============================================================================

function registerCommands(context: vscode.ExtensionContext): void {
  const getTerminalContentCmd = vscode.commands.registerCommand(
    'contextMCP.getTerminalContent',
    () => getTerminalContent()
  );

  const addFileToContextCmd = vscode.commands.registerCommand(
    'contextMCP.addFileToContext',
    () => addFileToContext(getSession(), context, getWebviewProvider())
  );

  const addSelectionToContextCmd = vscode.commands.registerCommand(
    'contextMCP.addSelectionToContext',
    () => addSelectionToContext(getSession(), context, getWebviewProvider())
  );

  const clearContextCmd = vscode.commands.registerCommand(
    'contextMCP.clearContext',
    () => clearContext(getSession(), getWebviewProvider())
  );

  const removeContextFileCmd = vscode.commands.registerCommand(
    'contextMCP.removeContextFile',
    (id: string) => removeContextFile(getSession(), parseInt(id), getWebviewProvider())
  );

  // Register all commands with the extension context
  context.subscriptions.push(
    getTerminalContentCmd,
    addFileToContextCmd,
    addSelectionToContextCmd,
    clearContextCmd,
    removeContextFileCmd
  );
}

function initializeWorkspace(): void {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    setCurrentProjectPath(folders[0].uri.fsPath);
    console.log('Project path set to:', folders[0].uri.fsPath);
  }
}

function initializeWebviewProvider(context: vscode.ExtensionContext): void {
  const webviewProvider = new ContextMCPWebviewProvider(context.extensionUri, getSession());
  setWebviewProvider(webviewProvider);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('contextMCPExplorer', webviewProvider)
  );
}

// =============================================================================
// MAIN EXTENSION ENTRY POINTS
// =============================================================================

export function activate(context: vscode.ExtensionContext): void {
  console.log('VS Code Context MCP Extension is now active');

  // Initialize workspace and webview
  initializeWorkspace();
  initializeWebviewProvider(context);
  
  // Register all commands
  registerCommands(context);

  // Start the server
  shutdownExistingServer().then(() => {
    startServer(context);
  }).catch(err => {
    console.error('Failed to start server:', err);
  });
}

export function deactivate(): void {
  console.log('VS Code Context MCP Extension deactivated');
  
  // Clean up the app reference
  setApp(null);
}
