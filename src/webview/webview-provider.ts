import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectSession, ContextFile, ContextFileWithId } from '../models/project-session';
import { getGitignoreFilter } from '../utils/gitignore-filter';
import { getTerminalContent, clearContext, removeContextFile, addFileToContextByPath } from '../commands';

// Interface for search results
interface FileSearchResult {
  fileName: string;
  fullPath: string;
}

// Interface for file open request
interface FileOpenRequest {
  path: string;
  startLine: number;
  endLine: number;
}

// WebView Provider class for the sidebar
export class ProjectSessionWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _session: ProjectSession;

  constructor(extensionUri: vscode.Uri, session: ProjectSession) {
    this._extensionUri = extensionUri;
    this._session = session;
  }

  // This is called when the view is first created
  resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    console.log('Webview view resolved');
    this._view = webviewView;

    try {
      // Set up the webview options
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this._extensionUri]
      };

      // Set initial HTML content
      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      // Handle messages from the webview
      webviewView.webview.onDidReceiveMessage(message => {
        try {
          console.log('Received message from webview:', message.type);
          switch (message.type) {
            case 'getContextFiles':
              this.sendContextFilesToWebview();
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
            case 'getTerminalContent':
              this._getTerminalContent();
              break;
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error handling message:', error);
          vscode.window.showErrorMessage(`Error in Project Session Manager: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      // Send initial context files with slight delay to ensure webview is ready
      setTimeout(() => {
        this.sendContextFilesToWebview();
      }, 500);
    } catch (error) {
      console.error('Error initializing webview:', error);
      vscode.window.showErrorMessage(`Failed to initialize Project Session Manager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Update the webview with the current context files
  public sendContextFilesToWebview() {
    try {
      if (this._view && this._view.webview) {
        const filesWithIds: ContextFileWithId[] = this._session.context_file_lists.map((file, index) => {
          return { ...file, id: index };
        });
        
        console.log(`Sending ${filesWithIds.length} files to webview`);
        
        this._view.webview.postMessage({
          type: 'updateContextFiles',
          payload: filesWithIds
        }).then(() => {
          console.log('Context files message sent successfully');
        }, (err: unknown) => {
          console.error('Failed to send context files to webview:', err);
        });
      } else {
        console.log('Cannot update webview: view is undefined or webview is not ready');
      }
    } catch (error) {
      console.error('Error sending context files to webview:', error);
      vscode.window.showErrorMessage(`Error updating Project Session Manager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Clear all context files
  private _clearContext() {
    clearContext(this._session, this);
  }

  // Remove a specific context file
  private _removeContextFile(index: number) {
    removeContextFile(this._session, index, this);
  }



  private async _getTerminalContent() {
    await getTerminalContent();
  }

  // Search workspace files by name/path
  private async _searchWorkspaceFiles(query: string) {
    if (!query || query.trim() === '') {
      if (this._view) {
        this._view.webview.postMessage({
          type: 'fileSearchResults',
          payload: []
        });
      }
      return;
    }

    try {
      // Get all files in workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return;
      }

      // Get or initialize the gitignore filter
      const gitignoreFilter = await getGitignoreFilter(workspaceFolders);

      // Use VS Code's built-in file search
      const results = await vscode.workspace.findFiles('**/*');
      console.log(`Found ${results.length} files before filtering`);
      
      // Filter and limit results
      const filteredResults: FileSearchResult[] = results
        .filter(uri => {
          const fileName = path.basename(uri.fsPath);
          const filePath = uri.fsPath;

          // First check if file matches search query
          const matchesQuery = fileName.toLowerCase().includes(query.toLowerCase()) || 
                          filePath.toLowerCase().includes(query.toLowerCase());
          
          if (!matchesQuery) {
            return false;
          }

          // Check for resources/ directory explicitly
          if (filePath.includes('resources')) {
            console.log(`Found file in resources directory: ${filePath}`);
            return false;
          }

          // Then check if file should be excluded based on gitignore
          const shouldExclude = gitignoreFilter.shouldExclude(filePath);
          if (shouldExclude) {
            console.log(`Excluding file based on gitignore: ${filePath}`);
            return false;
          }

          // Also do a simple check for common ignored directories
          const isInCommonIgnoredDir = gitignoreFilter.containsGitIgnoredSegment(filePath);
          if (isInCommonIgnoredDir) {
            console.log(`Excluding file based on common ignored directory: ${filePath}`);
            return false;
          }

          return true;
        })
        .slice(0, 10) // Limit to 10 results
        .map(uri => ({
          fileName: path.basename(uri.fsPath),
          fullPath: uri.fsPath
        }));

      console.log(`Search results for "${query}": ${filteredResults.length} files (after gitignore filtering)`);

      // Send results back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: 'fileSearchResults',
          payload: filteredResults
        });
      }
    } catch (error) {
      console.error('Error searching files:', error);
      // Send empty results in case of error
      if (this._view) {
        this._view.webview.postMessage({
          type: 'fileSearchResults',
          payload: []
        });
      }
    }
  }

  // Add a file to context from path
  private async _addFileToContext(payload: FileSearchResult) {
    await addFileToContextByPath(this._session, payload, this);
  }

  // Open a file at specific lines
  private _openFile(payload: FileOpenRequest) {
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
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist', 'bundle.js'));
    
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
                text-align: center;
                padding: 20px 12px;
                background-color: var(--vscode-editor-background);
                border-radius: 4px;
                margin: 10px;
            }
            
            .context-files-container {
                flex: 1;
                overflow: auto;
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
            
            .file-search-item.selected {
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
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