import * as vscode from 'vscode';
import express from 'express';
import { Request, Response } from 'express'; // Added proper Express types
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

// Global instances
let session = new ContextManager();
let webviewProvider: ContextMCPWebviewProvider | null = null;
let currentProjectPath: string | null = null;
let server: any | null = null;
const PORT = 4569;

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  console.log('VS Code Context MCP Extension is now active');

  // Set project path
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    currentProjectPath = folders[0].uri.fsPath;
    console.log('Project path set to:', currentProjectPath);
  }

  // Initialize VS Code Context MCP
  webviewProvider = new ContextMCPWebviewProvider(context.extensionUri, session);
  
  // Register the WebviewView provider for the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('contextMCPExplorer', webviewProvider)
  );

  // Register commands for keyboard shortcuts
  let getTerminalContentCmd = vscode.commands.registerCommand(
    'contextMCP.getTerminalContent', 
    () => getTerminalContent()
  );

  let addFileToContextCmd = vscode.commands.registerCommand(
    'contextMCP.addFileToContext', 
    () => addFileToContext(session, context, webviewProvider)
  );
  
  let addSelectionToContextCmd = vscode.commands.registerCommand(
    'contextMCP.addSelectionToContext', 
    () => addSelectionToContext(session, context, webviewProvider)
  );
  
  let clearContextCmd = vscode.commands.registerCommand(
    'contextMCP.clearContext', 
    () => clearContext(session, webviewProvider)
  );
  
  // Add command to remove a specific context file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'contextMCP.removeContextFile', 
      (id: string) => removeContextFile(session, parseInt(id), webviewProvider)
    )
  );
  
  // Start HTTP server functionality
  // Try to shut down any existing server before starting a new one
  shutdownExistingServer().then(() => {
    startServer(context);
  }).catch(err => {
    console.error('Failed to start server:', err);
  });

  // Add disposables to context
  context.subscriptions.push(addFileToContextCmd);
  context.subscriptions.push(addSelectionToContextCmd);
  context.subscriptions.push(clearContextCmd);
  context.subscriptions.push(getTerminalContentCmd);
}

async function shutdownExistingServer(): Promise<void> {
  try {
    // Attempt to send a shutdown signal to any existing server
    await axios.post('http://localhost:' + PORT + '/shutdown');
    console.log('Successfully sent shutdown signal to existing server');
    // Wait a moment for the server to fully shut down
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    // If we can't connect, there's no server running, which is fine
    console.log('No existing server detected or unable to communicate with it');
  }
}

function getActiveEditorInfo() {
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

// Reusable function to get open tabs
function getOpenTabsInfo() {
  return vscode.workspace.textDocuments.map(document => {
    const isActiveDocument = vscode.window.activeTextEditor && 
                           vscode.window.activeTextEditor.document === document;
    
    return {
      fileName: document.fileName,
      languageId: document.languageId,
      uri: document.uri.toString(),
      isActive: isActiveDocument,
      isDirty: document.isDirty,
      isUntitled: document.isUntitled
    };
  });
}

function startServer(context: vscode.ExtensionContext) {
  // Create the Express app
  const app = express();
  app.use(express.json());

  app.get('/project-path', (_req: Request, res: Response) => {
    res.json({ path: currentProjectPath });
  });

  app.get('/current-file', (_req: Request, res: Response) => {
    const activeFile = getActiveEditorInfo();
    if (activeFile) {
      res.json(activeFile);
    } else {
      res.json({ error: 'No active editor' });
    }
  });
  
  app.get('/open-tabs', (_req: Request, res: Response) => {
    const openTabs = getOpenTabsInfo();
    res.json({ openTabs });
  });
  
  app.get('/session-context', (_req: Request, res: Response) => {

    res.json({
      currentPath : currentProjectPath,
      files: session.context_file_lists, 
      activeTab: getActiveEditorInfo(),
      openTabs: getOpenTabsInfo() 
    });
    session.context_file_lists = [];

    if (webviewProvider) {
      webviewProvider.refresh();
    }


  });

  app.get('/get-file-list-and-clear', (_req: Request, res: Response) => {
    // Save a copy of the current file list
    const fileList = [...session.context_file_lists];
    
    // Clear the file list
    session.context_file_lists = [];
    
    // Update the webview if available
    if (webviewProvider) {
      webviewProvider.refresh();
    }
    
    // Return the file list that was just cleared
    res.json({ files: fileList });
    
    console.log('File list retrieved and cleared');
  });

  app.get('/terminal-content', async (_req: Request, res: Response) => {
    const terminalContent = await getTerminalContent();
    if (terminalContent) {
      res.json({ content: terminalContent });
    } else {
      res.json({ error: 'No terminal content available' });
    }
  });
  

  app.get('/problems', (_req: Request, res: Response) => {
    const diagnosticCollection = vscode.languages.getDiagnostics();
    
    const problems = diagnosticCollection.map(([uri, diagnostics]) => {
      return {
        file: uri.toString(),
        fileName: path.basename(uri.fsPath),
        problems: diagnostics.map(diag => {
          return {
            message: diag.message,
            severity: severityToString(diag.severity),
            line: diag.range.start.line + 1,
            column: diag.range.start.character + 1,
          };
        })
      };
    });
    
    res.json({ problems });
  });


  // Shutdown endpoint
  app.post('/shutdown', (_req: Request, res: Response) => {
    res.json({ status: 'shutting down' });
    console.log('Received shutdown signal, stopping server');
    
    // Close the server gracefully after sending the response
    if (server) {
      server.close(() => {
        console.log('Server stopped due to shutdown request');
      });
    }
  });

  // Handle 404s
  app.use((_req: Request, res: Response) => {
    res.status(404).send('Not found');
  });

  // Start the server
  server = app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log(`- GET http://localhost:${PORT}/project-path`);
    console.log(`- GET http://localhost:${PORT}/current-file`);
    console.log(`- GET http://localhost:${PORT}/open-tabs`);
    console.log(`- GET http://localhost:${PORT}/problems`);
    console.log(`- GET http://localhost:${PORT}/session-context`);
    console.log(`- GET http://localhost:${PORT}/get-file-list-and-clear`);
    console.log(`- POST http://localhost:${PORT}/shutdown`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Shutdown mechanism might have failed.`);
      vscode.window.showErrorMessage(`Failed to start server: Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });

  context.subscriptions.push({
    dispose: () => {
      if (server) {
        server.close();
        console.log('Server closed on extension deactivation');
      }
    }
  });
}

// Helper function to convert diagnostic severity to string
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

// Deactivation function
export function deactivate() {
  // Save session data if needed
  console.log('VS Code Context MCP Extension deactivated');
}