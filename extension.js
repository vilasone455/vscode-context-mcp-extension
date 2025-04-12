const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// Data model for the session
class ProjectSession {
  constructor() {
    this.opening_tabs = [];
    this.curTab = null;
    this.context_file_lists = [];
  }
}

// Class to represent a context file as requested
class ContextFile {
  constructor(file_name, fullPath, content, start_line, end_line, fullCode) {
    this.file_name = file_name;
    this.fullPath = fullPath;
    this.content = content;
    this.start_line = start_line;
    this.end_line = end_line;
    this.fullCode = fullCode;
  }
}

// Global session instance
let session = new ProjectSession();

// WebView Provider class for the sidebar
class ProjectSessionWebviewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this._view = undefined;
    this._onDidChangeTreeData = new vscode.EventEmitter();
  }

  // This is called when the view is first created
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;

    // Set up the webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    // Set initial HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.type) {
        case 'getContextFiles':
          this._sendContextFilesToWebview();
          break;
        case 'clearContext':
          this._clearContext();
          break;
        case 'removeContextFile':
          this._removeContextFile(message.payload);
          break;
        case 'openFile':
          this._openFile(message.payload);
          break;
      }
    });

    // Send initial context files
    this._sendContextFilesToWebview();
  }

  // Update the webview with the current context files
  _sendContextFilesToWebview() {
    if (this._view) {
      const filesWithIds = session.context_file_lists.map((file, index) => {
        return { ...file, id: index };
      });
      
      this._view.webview.postMessage({
        type: 'updateContextFiles',
        payload: filesWithIds
      });
    }
  }

  // Clear all context files
  _clearContext() {
    session.context_file_lists = [];
    vscode.window.showInformationMessage('Context cleared');
    this._sendContextFilesToWebview();
  }

  // Remove a specific context file
  _removeContextFile(index) {
    if (index >= 0 && index < session.context_file_lists.length) {
      const removed = session.context_file_lists.splice(index, 1)[0];
      vscode.window.showInformationMessage(`Removed ${removed.file_name} from context`);
      this._sendContextFilesToWebview();
    }
  }

  // Open a file at specific lines
  _openFile(payload) {
    const filePath = payload.path;
    const startLine = payload.startLine;
    const endLine = payload.endLine;
    
    vscode.workspace.openTextDocument(filePath).then(document => {
      vscode.window.showTextDocument(document).then(editor => {
        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, 0)
        );
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range);
      });
    });
  }

  // Create HTML content for the webview
  _getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'bundle.js'));
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Session Manager</title>
        <style>
            body {
                padding: 0;
                margin: 0;
                color: var(--vscode-foreground);
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-editor-background);
                font-size: var(--vscode-font-size);
            }
            
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 2px;
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
            }
            
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            
            input {
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 4px 8px;
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                width: 100%;
                box-sizing: border-box;
            }
            
            .context-file {
                padding: 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
                cursor: pointer;
            }
            
            .context-file:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .context-file-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: var(--vscode-font-size);
            }
            
            .context-file-content {
                max-height: 150px;
                overflow: auto;
                margin-top: 8px;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                background-color: var(--vscode-editor-background);
                padding: 4px;
                border-radius: 2px;
                white-space: pre;
            }
            
            .empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                text-align: center;
                padding: 0 12px;
            }
            
            .toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                background-color: var(--vscode-sideBar-background);
                border-bottom: 1px solid var(--vscode-panel-border);
                position: sticky;
                top: 0;
            }
            
            .file-title {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
                margin-right: 4px;
            }
            
            .file-actions {
                display: flex;
                gap: 4px;
            }
            
            .search-container {
                padding: 4px 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
        </style>
    </head>
    <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

// Extension activation
function activate(context) {
  console.log('Project Session Manager is now active');

  // Register commands for keyboard shortcuts
  let addFileToContextCmd = vscode.commands.registerCommand('projectSession.addFileToContext', () => addFileToContext(context));
  let addSelectionToContextCmd = vscode.commands.registerCommand('projectSession.addSelectionToContext', () => addSelectionToContext(context));
  let clearContextCmd = vscode.commands.registerCommand('projectSession.clearContext', () => clearContext(context));
  
  // Register the WebviewView provider for the sidebar
  const provider = new ProjectSessionWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('projectSessionExplorer', provider)
  );
  
  // Add command to remove a specific context file
  context.subscriptions.push(vscode.commands.registerCommand('projectSession.removeContextFile', (id) => {
    removeContextFile(parseInt(id), context);
  }));

  // Update tabs when they change
  vscode.window.onDidChangeActiveTextEditor(updateCurrentTab);
  vscode.workspace.onDidOpenTextDocument(updateOpenTabs);
  vscode.workspace.onDidCloseTextDocument(updateOpenTabs);

  // Initial update of tabs
  updateOpenTabs();
  updateCurrentTab(vscode.window.activeTextEditor);

  // Add disposables to context
  context.subscriptions.push(addFileToContextCmd);
  context.subscriptions.push(addSelectionToContextCmd);
  context.subscriptions.push(clearContextCmd);
}

// Check if a file already exists in the context
function isFileInContext(fullPath, startLine, endLine, isFullCode) {
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
async function addFileToContext(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No file is currently open');
    return;
  }

  const document = editor.document;
  const fileName = document.fileName.split(/[/\\]/).pop();
  const fullPath = document.fileName;
  const content = document.getText();

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
  
  // Notify the webview to update
  updateWebView(context);
}

// Add selected text to context
async function addSelectionToContext(context) {
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
  const fileName = document.fileName.split(/[/\\]/).pop();
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
function removeContextFile(index, context) {
  if (index >= 0 && index < session.context_file_lists.length) {
    const removed = session.context_file_lists.splice(index, 1)[0];
    vscode.window.showInformationMessage(`Removed ${removed.file_name} from context`);
    
    // Notify the webview to update
    updateWebView(context);
  }
}

// Clear all context files
function clearContext(context) {
  session.context_file_lists = [];
  vscode.window.showInformationMessage('Context cleared');
  
  // Notify the webview to update
  updateWebView(context);
}

// Helper function to update the WebView
function updateWebView(context) {
  const webViewProvider = vscode.window.registeredWebviewViewProviders?.get('projectSessionExplorer');
  if (webViewProvider) {
    webViewProvider._sendContextFilesToWebview();
  }
}

// Update the list of open tabs
function updateOpenTabs() {
  session.opening_tabs = vscode.workspace.textDocuments
    .filter(doc => !doc.isUntitled)
    .map(doc => doc.fileName.split(/[/\\]/).pop());
}

// Update the current active tab
function updateCurrentTab(editor) {
  if (editor) {
    session.curTab = editor.document.fileName.split(/[/\\]/).pop();
  } else {
    session.curTab = null;
  }
}

// Deactivation function
function deactivate() {
  // Save session data if needed
  console.log('Project Session Manager deactivated');
}

// Export activation and deactivation functions
module.exports = {
  activate,
  deactivate
};