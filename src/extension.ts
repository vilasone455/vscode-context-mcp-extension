import * as vscode from 'vscode';
import express from 'express';
import { Request, Response } from 'express';
import * as path from 'path';
import axios from 'axios';
import swaggerJsdoc from 'swagger-jsdoc'; // 💥 Swagger JSON support
import { ContextManager } from './models/project-session';
import { ContextMCPWebviewProvider } from './webview/webview-provider';
import {
  getTerminalContent,
  addFileToContext,
  addSelectionToContext,
  removeContextFile,
  clearContext,
} from './commands';

import * as fs from 'fs/promises'; // Use fs/promises for async file operations
let session = new ContextManager();
let webviewProvider: ContextMCPWebviewProvider | null = null;
let currentProjectPath: string | null = null;
let server: any | null = null;
const PORT = 4569;

// 🔧 OpenAPI generator config
const swaggerOptions = {
  definition: {
    openapi: '3.1.0',   // ← match swagger-jsdoc expectations
    info: {
      title: 'Context MCP API',
      version: '1.0.0',
      description: 'OpenAPI JSON for VSCode Context MCP Extension',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      schemas: {}       // ← must be an object, even if empty
    }
  },
  apis: [path.join(__dirname, '**/*.js')],  // ← absolute glob to your compiled code
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

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

  /**
   * @openapi
   * /project-path:
   *   get:
   *     operationId: getProjectPath
   *     summary: Get the current project path
   *     responses:
   *       200:
   *         description: The path of the current project
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required:
   *                 - path
   *               properties:
   *                 path:
   *                   type: string
   *                   description: Absolute filesystem path of the open VSCode workspace folder
   */
  app.get('/project-path', (_req: Request, res: Response) => {
    res.json({ path: currentProjectPath });
  });

  /**
   * @openapi
   * /current-file:
   *   get:
   *     operationId: getCurrentFile
   *     summary: Get info on the active editor file
   *     responses:
   *       200:
   *         description: Details of the currently active editor or an error if none
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   required:
   *                     - fileName
   *                     - languageId
   *                     - lineCount
   *                     - uri
   *                     - isDirty
   *                     - isUntitled
   *                     - content
   *                   properties:
   *                     fileName:
   *                       type: string
   *                     languageId:
   *                       type: string
   *                     lineCount:
   *                       type: integer
   *                     uri:
   *                       type: string
   *                       format: uri
   *                     isDirty:
   *                       type: boolean
   *                     isUntitled:
   *                       type: boolean
   *                     content:
   *                       type: string
   *                 - type: object
   *                   required:
   *                     - error
   *                   properties:
   *                     error:
   *                       type: string
   *                       example: No active editor
   */
  app.get('/current-file', (_req: Request, res: Response) => {
    const activeFile = getActiveEditorInfo();
    if (activeFile) {
      res.json(activeFile);
    } else {
      res.json({ error: 'No active editor' });
    }
  });

  /**
   * @openapi
   * /open-tabs:
   *   get:
   *     operationId: listOpenTabs
   *     summary: List all open text documents in the workspace
   *     responses:
   *       200:
   *         description: Array of open editor tabs with metadata
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required:
   *                 - openTabs
   *               properties:
   *                 openTabs:
   *                   type: array
   *                   items:
   *                     type: object
   *                     required:
   *                       - fileName
   *                       - languageId
   *                       - uri
   *                       - isActive
   *                       - isDirty
   *                       - isUntitled
   *                     properties:
   *                       fileName:
   *                         type: string
   *                       languageId:
   *                         type: string
   *                       uri:
   *                         type: string
   *                         format: uri
   *                       isActive:
   *                         type: boolean
   *                       isDirty:
   *                         type: boolean
   *                       isUntitled:
   *                         type: boolean
   */
  app.get('/open-tabs', (_req: Request, res: Response) => {
    const openTabs = getOpenTabsInfo();
    res.json({ openTabs });
  });

  app.get('/session-context', (_req: Request, res: Response) => {
    res.json({
      currentPath: currentProjectPath,
      files: session.context_file_lists,
      activeTab: getActiveEditorInfo(),
      openTabs: getOpenTabsInfo()
    });
    session.context_file_lists = [];
    webviewProvider?.refresh();
  });


  app.get('/get-file-list-and-clear', (_req: Request, res: Response) => {
    const fileList = [...session.context_file_lists];
    session.context_file_lists = [];
    webviewProvider?.refresh();
    res.json({ files: fileList });
    console.log('File list retrieved and cleared');
  });

  /**
   * @openapi
   * /terminal-content:
   *   get:
   *     operationId: getTerminalContent
   *     summary: Fetch the latest terminal output
   *     responses:
   *       200:
   *         description: Raw terminal buffer or an error
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   required:
   *                     - content
   *                   properties:
   *                     content:
   *                       type: string
   *                 - type: object
   *                   required:
   *                     - error
   *                   properties:
   *                     error:
   *                       type: string
   *                       example: No terminal content available
   */
  app.get('/terminal-content', async (_req: Request, res: Response) => {
    const terminalContent = await getTerminalContent();
    if (terminalContent) {
      res.json({ content: terminalContent });
    } else {
      res.json({ error: 'No terminal content available' });
    }
  });

  /**
   * @openapi
   * /problems:
   *   get:
   *     operationId: listProblems
   *     summary: List current VSCode diagnostics/problems in workspace
   *     responses:
   *       200:
   *         description: Array of file-level diagnostics with message, severity, and location
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 problems:
   *                   type: array
   *                   items:
   *                     type: object
   *                     required:
   *                       - file
   *                       - fileName
   *                       - problems
   *                     properties:
   *                       file:
   *                         type: string
   *                       fileName:
   *                         type: string
   *                       problems:
   *                         type: array
   *                         items:
   *                           type: object
   *                           required:
   *                             - message
   *                             - severity
   *                             - line
   *                             - column
   *                           properties:
   *                             message:
   *                               type: string
   *                             severity:
   *                               type: string
   *                               enum: [Error, Warning, Information, Hint]
   *                             line:
   *                               type: integer
   *                             column:
   *                               type: integer
   */
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

  /**
 * @openapi
 * /file:
 *   get:
 *     operationId: getFile
 *     summary: Get the raw text of a file by relative path
 *     parameters:
 *       - in: query
 *         name: relativePath
 *         required: true
 *         schema:
 *           type: string
 *         description: Relative path of the file to retrieve
 *     responses:
 *       200:
 *         description: File content returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - relativePath
 *                 - content
 *               properties:
 *                 relativePath:
 *                   type: string
 *                 content:
 *                   type: string
 *       400:
 *         description: Missing relativePath parameter
 *       500:
 *         description: Server error reading the file
 */
  app.get('/file', async (req: Request, res: Response): Promise<void> => {
    const rel = req.query.relativePath as string;
    if (!rel) {
      // note: no `return res.…()`, just call and then `return;`
      res.status(400).json({ error: 'relativePath query parameter is required' });
      return;
    }

    try {
      const full = path.resolve(currentProjectPath || '.', rel);
      const content = await fs.readFile(full, 'utf8');
      res.json({ relativePath: rel, content });
      // once you call res.json, you don’t return its result
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });



  /**
 * @openapi
 * /file:
 *   post:
 *     operationId: createFile
 *     summary: Create a new file with the given content
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - relativePath
 *               - content
 *             properties:
 *               relativePath:
 *                 type: string
 *                 description: Relative path where the file will be created
 *               content:
 *                 type: string
 *                 description: The file’s content
 *     responses:
 *       201:
 *         description: File created successfully
 *       400:
 *         description: Missing required fields in body
 *       500:
 *         description: Server error creating file
 */
  app.post(
    '/file',
    async (req: Request, res: Response): Promise<void> => {
      const { relativePath, content } = req.body;
      if (!relativePath || content === undefined) {
        res
          .status(400)
          .json({ error: 'Both relativePath and content are required in the body' });
        return;
      }
      try {
        const full = path.resolve(currentProjectPath || '.', relativePath);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content, 'utf8');
        res.status(201).json({ message: 'File created', relativePath });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * @openapi
   * /file:
   *   put:
   *     operationId: updateFile
   *     summary: Overwrite an existing file’s content
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - relativePath
   *               - newContent
   *             properties:
   *               relativePath:
   *                 type: string
   *                 description: Relative path of the file to update
   *               newContent:
   *                 type: string
   *                 description: New content to write into the file
   *     responses:
   *       200:
   *         description: File updated successfully
   *       400:
   *         description: Missing required fields in body
   *       500:
   *         description: Server error updating file
   */
  app.put(
    '/file',
    async (req: Request, res: Response): Promise<void> => {
      const { relativePath, newContent } = req.body;
      if (!relativePath || newContent === undefined) {
        res
          .status(400)
          .json({ error: 'Both relativePath and newContent are required in the body' });
        return;
      }
      try {
        const full = path.resolve(currentProjectPath || '.', relativePath);
        await fs.access(full);
        await fs.writeFile(full, newContent, 'utf8');
        res.json({ message: 'File updated', relativePath });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * @openapi
   * /move-file:
   *   post:
   *     operationId: moveFile
   *     summary: Move or rename a file
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - from
   *               - to
   *             properties:
   *               from:
   *                 type: string
   *                 description: Current relative path of the file
   *               to:
   *                 type: string
   *                 description: New relative path for the file
   *     responses:
   *       200:
   *         description: File moved successfully
   *       400:
   *         description: Missing required fields in body
   *       500:
   *         description: Server error moving file
   */
  app.post(
    '/move-file',
    async (req: Request, res: Response): Promise<void> => {
      const { from, to } = req.body;
      if (!from || !to) {
        res.status(400).json({ error: 'from and to are required in the body' });
        return;
      }
      try {
        const src = path.resolve(currentProjectPath || '.', from);
        const dest = path.resolve(currentProjectPath || '.', to);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(src, dest);
        res.json({ message: 'File moved', from, to });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Serve OpenAPI JSON
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
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
    console.log('Docs available at /openapi.json');
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
