import * as vscode from 'vscode';
import { ProjectSession } from './models/project-session';
import { ProjectSessionWebviewProvider } from './webview/webview-provider';
import { 
  getTerminalContent,
  addFileToContext,
  addSelectionToContext,
  removeContextFile,
  clearContext,
  updateOpenTabs,
  updateCurrentTab
} from './commands';

// Global instances
let session = new ProjectSession();
let webviewProvider: ProjectSessionWebviewProvider | null = null; // Store a reference to the webview provider

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  console.log('Project Session Manager is now active');

  // Create the webview provider
  webviewProvider = new ProjectSessionWebviewProvider(context.extensionUri, session);
  
  // Register the WebviewView provider for the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('projectSessionExplorer', webviewProvider)
  );

  // Register commands for keyboard shortcuts
  let getTerminalContentCmd = vscode.commands.registerCommand(
    'projectSession.getTerminalContent', 
    () => getTerminalContent()
  );

  let addFileToContextCmd = vscode.commands.registerCommand(
    'projectSession.addFileToContext', 
    () => addFileToContext(session, context, webviewProvider)
  );
  
  let addSelectionToContextCmd = vscode.commands.registerCommand(
    'projectSession.addSelectionToContext', 
    () => addSelectionToContext(session, context, webviewProvider)
  );
  
  let clearContextCmd = vscode.commands.registerCommand(
    'projectSession.clearContext', 
    () => clearContext(session, webviewProvider)
  );
  
  // Add command to remove a specific context file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'projectSession.removeContextFile', 
      (id: string) => removeContextFile(session, parseInt(id), webviewProvider)
    )
  );

  // Update tabs when they change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => updateCurrentTab(session, editor)
    )
  );
  
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(
      (doc) => updateOpenTabs(session, doc)
    )
  );
  
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(
      (doc) => updateOpenTabs(session, doc)
    )
  );

  // Initial update of tabs
  updateOpenTabs(session);
  updateCurrentTab(session, vscode.window.activeTextEditor);

  // Add disposables to context
  context.subscriptions.push(addFileToContextCmd);
  context.subscriptions.push(addSelectionToContextCmd);
  context.subscriptions.push(clearContextCmd);
  context.subscriptions.push(getTerminalContentCmd);
}

// Deactivation function
export function deactivate() {
  // Save session data if needed
  console.log('Project Session Manager deactivated');
}
