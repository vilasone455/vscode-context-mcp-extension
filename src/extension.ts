/**
 * Main extension entry point for the VS Code Context MCP Extension
 * Refactored for better organization and maintainability
 */

import * as vscode from 'vscode';
import * as path from 'path';
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
import { ChangeTracker, ChangeDecorator } from './change-tracking';
import { createVscodeTextEdits } from './utils/edit-helpers';
import { ApplyEditsRequest } from './models/ApplyEditsRequest';

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
    dispose: () => {
      changeDecorator.dispose();
    }
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

  // Test command with multiple test case scenarios
  const testDiffCmd = vscode.commands.registerCommand(
    'mcp.testDiff',
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = activeEditor.document;
      const fileName = path.basename(document.uri.fsPath);

      // Define test case scenarios
      const testCases = [
        {
          label: '🔧 Simple: Replace first line',
          detail: 'Basic test - replaces the first line with a console.log',
          id: 'simple'
        },
        {
          label: '🏗️ Complex: Animal.js 3-chunk modification',
          detail: 'Advanced test - modify eat(), add sleep(), remove getInfo()',
          id: 'animal-complex',
          fileCheck: 'animal.js'
        },
    
      ];

      // Filter test cases based on current file
      const availableTestCases = testCases.filter(testCase => {
        if (testCase.fileCheck) {
          return fileName.toLowerCase().includes(testCase.fileCheck.toLowerCase());
        }
        return true;
      });

      if (availableTestCases.length === 0) {
        vscode.window.showErrorMessage('No test cases available for this file type');
        return;
      }

      // Show test case selection
      const selectedTestCase = await vscode.window.showQuickPick(availableTestCases, {
        placeHolder: 'Select a test case to demonstrate diff highlighting',
        canPickMany: false
      });

      if (!selectedTestCase) {
        return;
      }

      try {
        let changes: any[] = [];

        switch (selectedTestCase.id) {
          case 'simple':
            changes = await createSimpleTestCase(document, changeTracker);
            break;
          case 'animal-complex':
            changes = await createAnimalComplexTestCase(document, changeTracker);
            break;
        }

        if (changes.length > 0) {
          const workspaceEdit = new vscode.WorkspaceEdit();
          let changeList = changes.map(change => change.textEdit);
          workspaceEdit.set(document.uri, changeList);
          const success = await vscode.workspace.applyEdit(workspaceEdit);
          if (success) {
            await document.save();
          }

          await changeDecorator.showDecorations(activeEditor, changes);

          vscode.window.showInformationMessage(
            `✨ Created ${selectedTestCase.label} with ${changes.flat().length} changes! Use "MCP: Show Pending Changes" to manage them.`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create test case: ${error}`);
      }
    }
  );

  // Helper functions for different test cases
  async function createSimpleTestCase(document: vscode.TextDocument, tracker: ChangeTracker) {
    // using ApplyEditsRequest 
    const inputs: ApplyEditsRequest = {
      "filePath": document.uri.fsPath,
      "shortComment": "Simple: Replace first line",
      "edits": [
        {
          "action_type": "insert-before",
          "match_type": "line",
          "atLine": 1,
          "newText": "console.log('Hello World with Diff!');"
        }
      ]
    };

    const vscodeEdits = await createVscodeTextEdits(document, inputs.edits);



    return await tracker.addChanges(
      document.uri.fsPath,
      vscodeEdits,
      'Simple: Replace first line'
    );
  }

  async function createAnimalComplexTestCase(document: vscode.TextDocument, tracker: ChangeTracker) {
    try {
      // Use VSCode's Symbol Provider for accurate symbol finding (like edit-core.ts)

      let inputs: ApplyEditsRequest = {
        "filePath": document.uri.fsPath,
        "shortComment": "Rewrite eat method, add sleep method, remove getInfo method",
        "edits": [
          {
            "action_type": "delete",
            "match_type": "symbol",
            "symbolName": "getInfo",
            "symbolKind": "Method"
          },
          {
            "action_type": "replace",
            "match_type": "symbol",
            "symbolName": "eat",
            "symbolKind": "Method",
            "newText": "    eat(food) {\n        if (food === this.favoriteFood) {\n            console.log(`${this.name} loves eating ${food}!`);\n            this.hunger = Math.max(0, this.hunger - 40);\n        } else {\n            console.log(`${this.name} is eating ${food} but prefers ${this.favoriteFood}`);\n            this.hunger = Math.max(0, this.hunger - 20);\n        }\n        return this.hunger;\n    }"
          },
          {
            "action_type": "insert-after",
            "match_type": "symbol",
            "symbolName": "eat",
            "symbolKind": "Method",
            "newText": "\n    sleep(hours) {\n        console.log(`${this.name} is sleeping for ${hours} hours`);\n        this.hunger = Math.min(100, this.hunger + (hours * 5));\n        return `${this.name} woke up feeling refreshed!`;\n    }"
          }
        ]
      }

      const vscodeEdits = await createVscodeTextEdits(document, inputs.edits);

      return await tracker.addChanges(
        document.uri.fsPath,
        vscodeEdits,
        'Complex case'
      );


    } catch (error) {
      console.error('Error in createAnimalComplexTestCase:', error);
      vscode.window.showErrorMessage(`Symbol-based editing failed: ${error}. File structure may have changed.`);
      return [];
    }
  }


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
        label: `${change.description}`,
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

  // vs code message show 
  vscode.window.showInformationMessage('VS Code Context MCP Extension is now active');

  // Initialize workspace and webview
  initializeWorkspace();
  initializeWebviewProvider(context);

  // Initialize change tracking

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
