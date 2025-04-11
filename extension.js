const vscode = require('vscode');

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

// Extension activation
function activate(context) {
  console.log('Project Session Manager is now active');

  // Register commands for keyboard shortcuts
  let addFileToContextCmd = vscode.commands.registerCommand('projectSession.addFileToContext', addFileToContext);
  let addSelectionToContextCmd = vscode.commands.registerCommand('projectSession.addSelectionToContext', addSelectionToContext);
  let clearContextCmd = vscode.commands.registerCommand('projectSession.clearContext', clearContext);
  
  // Register the TreeDataProvider for the sidebar
  const projectSessionProvider = new ProjectSessionProvider();
  vscode.window.registerTreeDataProvider('projectSessionExplorer', projectSessionProvider);
  
  // Add welcome message that shows up when there are no context files

  // Refresh command
  context.subscriptions.push(vscode.commands.registerCommand('projectSessionExplorer.refresh', () => {
    projectSessionProvider.refresh();
  }));

  // Add command to remove a specific context file
  context.subscriptions.push(vscode.commands.registerCommand('projectSession.removeContextFile', (id) => {
    removeContextFile(parseInt(id));
    projectSessionProvider.refresh();
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
async function addFileToContext() {
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
  
  // Refresh the sidebar
  vscode.commands.executeCommand('projectSessionExplorer.refresh');
}

// Add selected text to context
async function addSelectionToContext() {
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
  
  // Refresh the sidebar
  vscode.commands.executeCommand('projectSessionExplorer.refresh');
}

// Remove a specific context file by index
function removeContextFile(index) {
  if (index >= 0 && index < session.context_file_lists.length) {
    const removed = session.context_file_lists.splice(index, 1)[0];
    vscode.window.showInformationMessage(`Removed ${removed.file_name} from context`);
  }
}

// Clear all context files
function clearContext() {
  session.context_file_lists = [];
  vscode.window.showInformationMessage('Context cleared');
  
  // Refresh the sidebar
  vscode.commands.executeCommand('projectSessionExplorer.refresh');
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

// TreeDataProvider for the sidebar view
class ProjectSessionProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // First add a "Clear All" button if there are context files
      const items = [];
      
      if (session.context_file_lists.length > 0) {
        const clearAllItem = new vscode.TreeItem("Clear All Context Files", vscode.TreeItemCollapsibleState.None);
        clearAllItem.command = {
          command: 'projectSession.clearContext',
          title: 'Clear All Context Files'
        };
        clearAllItem.iconPath = new vscode.ThemeIcon("clear-all");
        clearAllItem.contextValue = 'clearAll';
        items.push(clearAllItem);
      }
      
      // Then add all the context files
      const contextFileItems = session.context_file_lists.map((contextFile, index) => {
        const label = `${contextFile.file_name} ${contextFile.fullCode ? '(Full)' : `(Lines ${contextFile.start_line + 1}-${contextFile.end_line + 1})`}`;
        const treeItem = new vscode.TreeItem(label);
        
        treeItem.command = {
          command: 'vscode.open',
          arguments: [vscode.Uri.file(contextFile.fullPath), {
            selection: new vscode.Range(
              new vscode.Position(contextFile.start_line, 0),
              new vscode.Position(contextFile.end_line, 0)
            )
          }],
          title: 'Open File'
        };
        
        treeItem.contextValue = 'contextFile';
        treeItem.id = index.toString();
        treeItem.tooltip = contextFile.content.slice(0, 200) + (contextFile.content.length > 200 ? '...' : '');
        
        // Add a delete button/icon
        treeItem.iconPath = new vscode.ThemeIcon("close");
        
        return treeItem;
      });
      
      return [...items, ...contextFileItems];
    }
    
    return [];
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