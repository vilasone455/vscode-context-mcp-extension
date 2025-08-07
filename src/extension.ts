import * as vscode from 'vscode';
import express from 'express';
import { Request, Response } from 'express';
import * as path from 'path';
import axios from 'axios';
import {  ContextManager } from './models/project-session';
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

let session = new ContextManager();
let webviewProvider: ContextMCPWebviewProvider | null = null;
let currentProjectPath: string | null = null;
let server: any | null = null;
const PORT = 4569;

export function activate(context: vscode.ExtensionContext) {
  console.log('VS Code Context MCP Extension is now active');

  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    currentProjectPath = folders[0].uri.fsPath;
    console.log('Project path set to:', currentProjectPath);
  }

  webviewProvider = new ContextMCPWebviewProvider(context.extensionUri, session);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('contextMCPExplorer', webviewProvider)
  );

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'contextMCP.removeContextFile',
      (id: string) => removeContextFile(session, parseInt(id), webviewProvider)
    )
  );

  shutdownExistingServer().then(() => {
    startServer(context);
  }).catch(err => {
    console.error('Failed to start server:', err);
  });

  context.subscriptions.push(addFileToContextCmd);
  context.subscriptions.push(addSelectionToContextCmd);
  context.subscriptions.push(clearContextCmd);
  context.subscriptions.push(getTerminalContentCmd);
}

async function shutdownExistingServer(): Promise<void> {
  try {
    await axios.post('http://localhost:' + PORT + '/shutdown');
    console.log('Successfully sent shutdown signal to existing server');
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
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
  const app = express();
  app.use(express.json());

  app.get('/project-path', (_req: Request, res: Response) => {
    res.json({ path: currentProjectPath });
  });

  app.get('/current-file', (_req: Request, res: Response) => {
    const activeTabInfo = getActiveEditorInfo();
     let activeTabWithLineNumbers = activeTabInfo;

    if (activeTabInfo && activeTabInfo.content) {
      let content = activeTabInfo.content;
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
  });


  app.get('/open-tabs', (_req: Request, res: Response) => {
    const openTabs = getOpenTabsInfo();
    res.json({ openTabs });
  });

  app.get('/session-context', (_req: Request, res: Response) => {
    const filesWithLineNumbers = getContextFileWithLineNumber(session.context_file_lists);

    const activeTabInfo = getActiveEditorInfo();
    let activeTabWithLineNumbers = activeTabInfo;

    if (activeTabInfo && activeTabInfo.content) {
      let content = activeTabInfo.content;
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
  });


  app.get('/get-file-list-and-clear', (_req: Request, res: Response) => {
    const fileList = [...session.context_file_lists];

    const filesWithLineNumbers = getContextFileWithLineNumber(fileList);
    // Clear the original context files
    session.context_file_lists = [];
    webviewProvider?.refresh();

    // Return the files with line numbers
    res.json({ files: filesWithLineNumbers });
    console.log('File list retrieved with line numbers and cleared');

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
  });

  app.post('/modify-file', async (req: Request, res: Response): Promise<void> => {
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
  });

  // Shutdown endpoint
  app.post('/shutdown', (_req: Request, res: Response) => {
    res.json({ status: 'shutting down' });
    console.log('Received shutdown signal, stopping server');
    server?.close(() => {
      console.log('Server stopped due to shutdown request');
    });
  });

  // Fallback 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).send('Not found');
  });

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

  context.subscriptions.push({
    dispose: () => {
      server?.close();
      console.log('Server closed on extension deactivation');
    }
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

export function deactivate() {
  console.log('VS Code Context MCP Extension deactivated');
}
