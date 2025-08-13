/**
 * Main extension entry point for the VS Code Context MCP Extension
 * Refactored for better organization and maintainability
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ContextMCPWebviewProvider } from './webview/webview-provider';
import { setWebviewProvider, setCurrentProjectPath, setApp, setExtensionContext } from './server/state';
import { shutdownExistingServer, startServer } from './server/setup';
import {
  getTerminalContent,
  addFileToContext,
  addSelectionToContext,
  removeContextFile,
  clearContext,
} from './commands';
import { getSession, getWebviewProvider } from './server/state';
import { ChangeTracker, ChangeDecorator } from './change-tracking';

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

  // Basic change tracking commands
  const changeTracker = new ChangeTracker();
  const changeDecorator = new ChangeDecorator(changeTracker);
  
  context.subscriptions.push({
    dispose: () => changeDecorator.dispose()
  });
  
  const acceptChangeCmd = vscode.commands.registerCommand(
    'mcp.acceptChange',
    async (changeId: string) => {
      const success = await changeTracker.approveChange(changeId);
      if (success) {
        vscode.window.showInformationMessage('Change accepted ✓');
      }
    }
  );

  const rejectChangeCmd = vscode.commands.registerCommand(
    'mcp.rejectChange',
    async (changeId: string) => {
      const success = await changeTracker.rejectChange(changeId);
      if (success) {
        vscode.window.showInformationMessage('Change rejected and reverted ❌');
      }
    }
  );

  // Test command to demonstrate diff-based approve/reject
  const testDiffCmd = vscode.commands.registerCommand(
    'mcp.testDiff',
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      // Create a test change
      const document = activeEditor.document;
      const range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, document.lineAt(0).text.length)
      );
      
      const textEdit = new vscode.TextEdit(range, 'console.log("Hello World with Diff!");');
      
      try {
        const changes = await changeTracker.addChanges(
          document.uri.fsPath,
          [textEdit],
          'Test diff highlighting'
        );
        
        await changeDecorator.showDecorations(activeEditor, changes);
        
        vscode.window.showInformationMessage(
          `✨ Created test change with diff highlighting! Use Accept/Reject commands.`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create test change: ${error}`);
      }
    }
  );

  // Command to show all pending changes
  const showChangesCmd = vscode.commands.registerCommand(
    'mcp.showChanges',
    () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const changes = changeTracker.getPendingChanges(activeEditor.document.uri.fsPath);
      
      if (changes.length === 0) {
        vscode.window.showInformationMessage('No pending changes for this file');
        return;
      }

      const changeItems = changes.map(change => ({
        label: `${change.changeType}: ${change.description}`,
        detail: `ID: ${change.id} | Original: "${change.originalText}" | New: "${change.textEdit.newText}"`,
        changeId: change.id
      }));

      vscode.window.showQuickPick(changeItems, {
        placeHolder: 'Select a change to approve/reject',
        canPickMany: false
      }).then(selected => {
        if (selected) {
          vscode.window.showInformationMessage(
            `Selected change: ${selected.label}`,
            'Approve ✅', 'Reject ❌'
          ).then(action => {
            if (action === 'Approve ✅') {
              vscode.commands.executeCommand('mcp.acceptChange', selected.changeId);
            } else if (action === 'Reject ❌') {
              vscode.commands.executeCommand('mcp.rejectChange', selected.changeId);
            }
          });
        }
      });
    }
  );

  // Register all commands with the extension context
  context.subscriptions.push(
    getTerminalContentCmd,
    addFileToContextCmd,
    addSelectionToContextCmd,
    clearContextCmd,
    removeContextFileCmd,
    acceptChangeCmd,
    rejectChangeCmd,
    testDiffCmd,
    showChangesCmd
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
  console.log('--- EXTENSION ACTIVATING ---'); // <-- ADD THIS
  console.log('VS Code Context MCP Extension is now active');

  // Set extension context in global state
  setExtensionContext(context);

  // vs code message show 
  vscode.window.showInformationMessage('VS Code Context MCP Extension is now active');

  // Initialize workspace and webview
  initializeWorkspace();
  initializeWebviewProvider(context);

  // Initialize change tracking
  const changeTracker = new ChangeTracker();

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

  setApp(null);
}
