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
    console.log('Webview view resolved');
    this._view = webviewView;

    try {
      // Set up the webview options
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this.extensionUri]
      };

      // Set initial HTML content
      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      // Handle messages from the webview
      webviewView.webview.onDidReceiveMessage(message => {
        try {
          console.log('Received message from webview:', message.type);
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
            case 'searchWorkspaceFiles':
              this._searchWorkspaceFiles(message.payload);
              break;
            case 'addFileToContext':
              this._addFileToContext(message.payload);
              break;
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error handling message:', error);
          vscode.window.showErrorMessage(`Error in Project Session Manager: ${error.message}`);
        }
      });

      // Send initial context files with slight delay to ensure webview is ready
      setTimeout(() => {
        this._sendContextFilesToWebview();
      }, 500);
    } catch (error) {
      console.error('Error initializing webview:', error);
      vscode.window.showErrorMessage(`Failed to initialize Project Session Manager: ${error.message}`);
    }
  }

  // Update the webview with the current context files
  _sendContextFilesToWebview() {
    try {
      if (this._view && this._view.webview) {
        const filesWithIds = session.context_file_lists.map((file, index) => {
          return { ...file, id: index };
        });
        
        console.log(`Sending ${filesWithIds.length} files to webview`);
        
        this._view.webview.postMessage({
          type: 'updateContextFiles',
          payload: filesWithIds
        }).then(() => {
          console.log('Context files message sent successfully');
        }).catch(err => {
          console.error('Failed to send context files to webview:', err);
        });
      } else {
        console.log('Cannot update webview: view is undefined or webview is not ready');
      }
    } catch (error) {
      console.error('Error sending context files to webview:', error);
      vscode.window.showErrorMessage(`Error updating Project Session Manager: ${error.message}`);
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

  // Search workspace files by name/path
  async _searchWorkspaceFiles(query) {
    if (!query || query.trim() === '') {
      this._view.webview.postMessage({
        type: 'fileSearchResults',
        payload: []
      });
      return;
    }

    try {
      // Get all files in workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return;
      }

      // Use VS Code's built-in file search
      const results = await vscode.workspace.findFiles('**/*');
      
      // Filter and limit results
      const filteredResults = results
        .filter(uri => {
          const fileName = path.basename(uri.fsPath);
          const filePath = uri.fsPath;
          return fileName.toLowerCase().includes(query.toLowerCase()) || 
                 filePath.toLowerCase().includes(query.toLowerCase());
        })
        .slice(0, 10) // Limit to 10 results
        .map(uri => ({
          fileName: path.basename(uri.fsPath),
          fullPath: uri.fsPath
        }));

      // Send results back to webview
      this._view.webview.postMessage({
        type: 'fileSearchResults',
        payload: filteredResults
      });
    } catch (error) {
      console.error('Error searching files:', error);
    }
  }

  // Add a file to context from path
  async _addFileToContext(payload) {
    try {
      const filePath = payload.fullPath;
      const fileName = path.basename(filePath);
      
      // Check if already in context
      const alreadyExists = session.context_file_lists.some(file => 
        file.fullPath === filePath && file.fullCode
      );
      
      if (alreadyExists) {
        vscode.window.showInformationMessage(`${fileName} is already in the context`);
        return;
      }
      
      // Read the file content
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();
      
      // Add to context
      const contextFile = new ContextFile(
        fileName,
        filePath,
        content,
        0,
        document.lineCount - 1,
        true
      );
      
      session.context_file_lists.push(contextFile);
      vscode.window.showInformationMessage(`Added ${fileName} to context`);
      
      // Update the webview
      this._sendContextFilesToWebview();
    } catch (error) {
      console.error('Error adding file to context:', error);
      vscode.window.showErrorMessage(`Error adding file to context: ${error.message}`);
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
                position: relative;
            }
            
            .file-search-container {
                position: relative;
                width: 100%;
            }
            
            .file-search-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                z-index: 1000;
                background-color: var(--vscode-dropdown-background);
                border: 1px solid var(--vscode-dropdown-border);
                max-height: 200px;
                overflow-y: auto;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }
            
            .file-search-item {
                padding: 6px 8px;
                cursor: pointer;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .file-search-item:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .file-name {
                font-weight: bold;
                margin-bottom: 2px;
            }
            
            .file-path {
                font-size: 90%;
                color: var(--vscode-descriptionForeground);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .search-loading {
                padding: 8px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
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
  console.log('Updating webview...');
  const provider = vscode.window.registeredWebviewViewProviders?.get('projectSessionExplorer');
  if (provider) {
    console.log('Provider found, sending update');
    provider._sendContextFilesToWebview();
  } else {
    console.log('No provider found! Cannot update webview.');
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