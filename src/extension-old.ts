import * as vscode from 'vscode';
import express from 'express';
import { Request, Response } from 'express';
import * as path from 'path';
import axios from 'axios';
import { ContextManager } from './models/project-session';
import { ContextMCPWebviewProvider } from './webview/webview-provider';
import {
  getTerminalContent,
  addFileToContext,
  addSelectionToContext,
  removeContextFile,
  clearContext,
} from './commands';
import { formatWithLineNumbers, getContextFileWithLineNumber } from './utils/common';
import { ApplyEditsRequest } from './models/ApplyEditsRequest';
import { applyVscodeEdits } from './utils/edit-helpers';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

interface SymbolSearchResult {
  name: string;
  kind: string;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  containerName?: string;
}

interface SymbolDefinitionResult {
  name: string;
  kind: string;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  documentation?: string;
  detail?: string;
  context: string;
}

interface EditorInfo {
  fileName: string;
  languageId: string;
  lineCount: number;
  uri: string;
  isDirty: boolean;
  isUntitled: boolean;
  content: string;
}

interface TabInfo {
  fileName: string;
  languageId: string;
  uri: string;
  isActive: boolean;
  isDirty: boolean;
  isUntitled: boolean;
}

// =============================================================================
// CONSTANTS AND GLOBAL STATE
// =============================================================================

const PORT = 4569;

let session = new ContextManager();
let webviewProvider: ContextMCPWebviewProvider | null = null;
let currentProjectPath: string | null = null;
let server: any | null = null;
let app: express.Express | null = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getActiveEditorInfo(): EditorInfo | null {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    return {
      fileName: document.fileName,
      languageId: document.languageId,
      lineCount: document.lineCount,
      uri: document.uri.toString(),
      isDirty: document.isDirty,
      isUntitled: document.isUntitled,
      content: document.getText()
    };
  }
  return null;
}

function getOpenTabsInfo(): TabInfo[] {
  return vscode.workspace.textDocuments.map(document => {
    const isActiveDocument = vscode.window.activeTextEditor?.document === document;

    return {
      fileName: document.fileName,
      languageId: document.languageId,
      uri: document.uri.toString(),
      isActive: isActiveDocument, // now always boolean
      isDirty: document.isDirty,
      isUntitled: document.isUntitled
    };
  });
}

function severityToString(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'Error';
    case vscode.DiagnosticSeverity.Warning:
      return 'Warning';
    case vscode.DiagnosticSeverity.Information:
      return 'Information';
    case vscode.DiagnosticSeverity.Hint:
      return 'Hint';
    default:
      return 'Unknown';
  }
}

function initializeExpressApp(): express.Express {
  const expressApp = express();
  expressApp.use(express.json());
  return expressApp;
}

// =============================================================================
// ROUTE HANDLER FUNCTIONS
// =============================================================================

function handleProjectPath(_req: Request, res: Response): void {
  res.json({ path: currentProjectPath });
}

function handleCurrentFile(_req: Request, res: Response): void {
  const activeTabInfo = getActiveEditorInfo();
  let activeTabWithLineNumbers = activeTabInfo;

  if (activeTabInfo && activeTabInfo.content) {
    const content = activeTabInfo.content;
    const newContent = formatWithLineNumbers(content);

    activeTabWithLineNumbers = {
      ...activeTabInfo,
      content: newContent
    };
  }

  if (activeTabWithLineNumbers) {
    res.json(activeTabWithLineNumbers);
  } else {
    res.json({ error: 'No active editor' });
  }
}

function handleOpenTabs(_req: Request, res: Response): void {
  const openTabs = getOpenTabsInfo();
  res.json({ openTabs });
}

function handleSessionContext(_req: Request, res: Response): void {
  const filesWithLineNumbers = getContextFileWithLineNumber(session.context_file_lists);

  const activeTabInfo = getActiveEditorInfo();
  let activeTabWithLineNumbers = activeTabInfo;

  if (activeTabInfo && activeTabInfo.content) {
    const content = activeTabInfo.content;
    const newContent = formatWithLineNumbers(content);

    activeTabWithLineNumbers = {
      ...activeTabInfo,
      content: newContent
    };
  }

  res.json({
    currentPath: currentProjectPath,
    files: filesWithLineNumbers,
    activeTab: activeTabWithLineNumbers,
    openTabs: getOpenTabsInfo()
  });
  session.context_file_lists = [];
  webviewProvider?.refresh();
}

function handleGetFileListAndClear(_req: Request, res: Response): void {
  const fileList = [...session.context_file_lists];
  const filesWithLineNumbers = getContextFileWithLineNumber(fileList);
  
  // Clear the original context files
  session.context_file_lists = [];
  webviewProvider?.refresh();

  // Return the files with line numbers
  res.json({ files: filesWithLineNumbers });
  console.log('File list retrieved with line numbers and cleared');
}

async function handleTerminalContent(_req: Request, res: Response): Promise<void> {
  const terminalContent = await getTerminalContent();
  if (terminalContent) {
    res.json({ content: terminalContent });
  } else {
    res.json({ error: 'No terminal content available' });
  }
}

function handleProblems(_req: Request, res: Response): void {
  const diagnosticCollection = vscode.languages.getDiagnostics();
  const problems = diagnosticCollection.map(([uri, diagnostics]) => ({
    file: uri.toString(),
    fileName: path.basename(uri.fsPath),
    problems: diagnostics.map(diag => ({
      message: diag.message,
      severity: severityToString(diag.severity),
      line: diag.range.start.line + 1,
      column: diag.range.start.character + 1,
    }))
  }));
  res.json({ problems });
}

async function handleModifyFile(req: Request, res: Response): Promise<void> {
  const { filePath, edits, shortComment } = req.body as ApplyEditsRequest;

  if (!filePath || !edits) {
    res.status(400).json({ success: false, error: 'Missing filePath or edits in request body.' });
    return;
  }

  if (!path.isAbsolute(filePath)) {
    res.status(400).json({ success: false, error: 'File path must be an absolute path.' });
    return;
  }

  try {
    console.log(`Received request to modify ${path.basename(filePath)}: ${shortComment || 'No comment'}`);
    const success = await applyVscodeEdits(filePath, edits);
    if (success) {
      res.json({ success: true, message: `Successfully applied ${edits.length} edits to ${path.basename(filePath)}.` });
    } else {
      res.status(500).json({ success: false, error: 'Failed to apply edits using VS Code API. The operation was not successful.' });
    }
  } catch (err: any) {
    console.error(`Error applying edits to ${filePath}:`, err);
    res.status(500).json({ success: false, error: `Failed to apply edits: ${err.message}` });
  }
}

async function handleTestSymbolCount(_req: Request, res: Response): Promise<void> {
  try {
    // Get the current extension.ts file path
    const extensionFilePath = __filename;
    const uri = vscode.Uri.file(extensionFilePath);
    
    // Get document symbols for the current file
    const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    
    if (!documentSymbols) {
      res.json({ success: false, error: 'No symbols found' });
      return;
    }
    
    // Count symbols recursively
    const countSymbols = (symbols: vscode.DocumentSymbol[]): number => {
      let count = 0;
      for (const symbol of symbols) {
        count += 1; // Count this symbol
        count += countSymbols(symbol.children); // Count nested symbols
      }
      return count;
    };
    
    const totalSymbols = countSymbols(documentSymbols);
    
    // Create detailed breakdown
    const symbolBreakdown = documentSymbols.map(symbol => ({
      name: symbol.name,
      kind: vscode.SymbolKind[symbol.kind],
      range: {
        start: { line: symbol.range.start.line, character: symbol.range.start.character },
        end: { line: symbol.range.end.line, character: symbol.range.end.character }
      },
      childCount: symbol.children.length,
      children: symbol.children.map(child => ({
        name: child.name,
        kind: vscode.SymbolKind[child.kind]
      }))
    }));
    
    res.json({
      success: true,
      file: 'extension.ts',
      totalSymbols: totalSymbols,
      topLevelSymbols: documentSymbols.length,
      symbolBreakdown: symbolBreakdown
    });
    
  } catch (error) {
    console.error('Error counting symbols:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

async function handleSearchSymbols(req: Request, res: Response): Promise<void> {
  try {
    const { query, maxResults = 10 } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: 'Query parameter is required and must be a string' 
      });
      return;
    }

    if (maxResults && (typeof maxResults !== 'number' || maxResults < 1 || maxResults > 100)) {
      res.status(400).json({ 
        success: false, 
        error: 'maxResults must be a number between 1 and 100' 
      });
      return;
    }

    // Use VSCode's built-in workspace symbol search
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query
    );

    if (!symbols) {
      res.json({ success: true, query: query, results: [], count: 0 });
      return;
    }

    // Convert VSCode symbols to our API format and limit results
    const results: SymbolSearchResult[] = symbols.slice(0, maxResults).map(symbol => ({
      name: symbol.name,
      kind: vscode.SymbolKind[symbol.kind],
      location: {
        uri: symbol.location.uri.toString(),
        range: {
          start: {
            line: symbol.location.range.start.line,
            character: symbol.location.range.start.character
          },
          end: {
            line: symbol.location.range.end.line,
            character: symbol.location.range.end.character
          }
        }
      },
      containerName: symbol.containerName
    }));

    res.json({
      success: true,
      query: query,
      results: results,
      count: results.length
    });
  } catch (error) {
    console.error('Error in search-symbols:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

async function handleGetSymbolDefinition(req: Request, res: Response): Promise<void> {
  try {
    const { path: filePath, line, symbol } = req.body;

    // Validate input parameters
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: 'path parameter is required and must be a string' 
      });
      return;
    }

    if (!line || typeof line !== 'number' || line < 1) {
      res.status(400).json({ 
        success: false, 
        error: 'line parameter is required and must be a positive number' 
      });
      return;
    }

    if (!symbol || typeof symbol !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: 'symbol parameter is required and must be a string' 
      });
      return;
    }

    // Convert file path to URI
    const uri = vscode.Uri.file(filePath);
    
    // Create position (VSCode uses 0-based line numbers)
    const position = new vscode.Position(line - 1, 0);

    // Try to find the exact position of the symbol in the line
    const document = await vscode.workspace.openTextDocument(uri);
    const lineText = document.lineAt(position.line).text;
    const symbolIndex = lineText.indexOf(symbol);
    
    if (symbolIndex === -1) {
      res.status(404).json({
        success: false,
        error: `Symbol '${symbol}' not found at line ${line} in ${filePath}`
      });
      return;
    }

    const exactPosition = new vscode.Position(position.line, symbolIndex);

    // Use VSCode's definition provider
    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      uri,
      exactPosition
    );

    if (!definitions || definitions.length === 0) {
      res.status(404).json({
        success: false,
        error: `No definition found for symbol '${symbol}' at ${filePath}:${line}`
      });
      return;
    }

    // Get the first definition (usually the most relevant)
    const definition = definitions[0];
    const defDocument = await vscode.workspace.openTextDocument(definition.uri);
    
    // Get hover information for additional context
    const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      definition.uri,
      definition.range.start
    );

    // Extract context around the symbol (5 lines before and after)
    const startLine = Math.max(0, definition.range.start.line - 2);
    const endLine = Math.min(defDocument.lineCount - 1, definition.range.end.line + 2);
    const contextRange = new vscode.Range(startLine, 0, endLine, 0);
    const context = defDocument.getText(contextRange);

    // Get document symbols to find the symbol kind
    const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      definition.uri
    );

    let symbolKind = 'Unknown';
    if (documentSymbols) {
      const findSymbol = (symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
        for (const symbolInfo of symbols) {
          if (symbolInfo.range.contains(definition.range.start) && symbolInfo.name === symbol) {
            return symbolInfo;
          }
          // Check nested symbols
          const nested = findSymbol(symbolInfo.children);
          if (nested) return nested;
        }
        return null;
      };

      const foundSymbol = findSymbol(documentSymbols);
      if (foundSymbol) {
        symbolKind = vscode.SymbolKind[foundSymbol.kind];
      }
    }

    const result: SymbolDefinitionResult = {
      name: symbol,
      kind: symbolKind,
      location: {
        uri: definition.uri.toString(),
        range: {
          start: {
            line: definition.range.start.line,
            character: definition.range.start.character
          },
          end: {
            line: definition.range.end.line,
            character: definition.range.end.character
          }
        }
      },
      context: context,
      documentation: hoverInfo?.length ? 
        hoverInfo.map(h => h.contents.map(c => typeof c === 'string' ? c : c.value).join('\n')).join('\n') : 
        undefined
    };

    res.json({
      success: true,
      definition: result
    });
  } catch (error) {
    console.error('Error in get-symbol-definition:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

function handleShutdown(_req: Request, res: Response): void {
  res.json({ status: 'shutting down' });
  console.log('Received shutdown signal, stopping server');
  server?.close(() => {
    console.log('Server stopped due to shutdown request');
  });
}

function handleNotFound(_req: Request, res: Response): void {
  res.status(404).send('Not found');
}

// =============================================================================
// SERVER SETUP FUNCTIONS
// =============================================================================

async function shutdownExistingServer(): Promise<void> {
  try {
    await axios.post('http://localhost:' + PORT + '/shutdown');
    console.log('Successfully sent shutdown signal to existing server');
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.log('No existing server detected or unable to communicate with it');
  }
}

function setupRoutes(app: express.Express): void {
  // Basic endpoints
  app.get('/project-path', handleProjectPath);
  app.get('/current-file', handleCurrentFile);
  app.get('/open-tabs', handleOpenTabs);
  app.get('/session-context', handleSessionContext);
  app.get('/get-file-list-and-clear', handleGetFileListAndClear);
  app.get('/terminal-content', handleTerminalContent);
  app.get('/problems', handleProblems);
  
  // File modification
  app.post('/modify-file', handleModifyFile);
  
  // Symbol and testing endpoints
  app.get('/test-symbol-count', handleTestSymbolCount);
  app.post('/search-symbols', handleSearchSymbols);
  app.post('/get-symbol-definition', handleGetSymbolDefinition);
  
  // System endpoints
  app.post('/shutdown', handleShutdown);
  app.use(handleNotFound);
}

function startServer(context: vscode.ExtensionContext): void {
  // Initialize the Express app
  app = initializeExpressApp();
  
  // Setup all routes
  setupRoutes(app);

  // Start the server
  server = app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      vscode.window.showErrorMessage(`Failed to start server: Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });

  // Register cleanup on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      server?.close();
      console.log('Server closed on extension deactivation');
    }
  });
}

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
    () => addFileToContext(session, context, webviewProvider)
  );

  const addSelectionToContextCmd = vscode.commands.registerCommand(
    'contextMCP.addSelectionToContext',
    () => addSelectionToContext(session, context, webviewProvider)
  );

  const clearContextCmd = vscode.commands.registerCommand(
    'contextMCP.clearContext',
    () => clearContext(session, webviewProvider)
  );

  const removeContextFileCmd = vscode.commands.registerCommand(
    'contextMCP.removeContextFile',
    (id: string) => removeContextFile(session, parseInt(id), webviewProvider)
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
    currentProjectPath = folders[0].uri.fsPath;
    console.log('Project path set to:', currentProjectPath);
  }
}

function initializeWebviewProvider(context: vscode.ExtensionContext): void {
  webviewProvider = new ContextMCPWebviewProvider(context.extensionUri, session);
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
  if (app) {
    app = null;
  }
}