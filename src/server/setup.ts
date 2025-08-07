/**
 * Server setup and initialization for the VS Code Context MCP Extension
 */

import express from 'express';
import axios from 'axios';
import * as vscode from 'vscode';
import { PORT } from './config';
import { setApp, setServer } from './state';
import {
  handleProjectPath,
  handleCurrentFile,
  handleOpenTabs,
  handleSessionContext,
  handleGetFileListAndClear,
  handleTerminalContent,
  handleProblems,
  handleModifyFile,
  handleGetFilesLineCount,
  handleTestSymbolCount,
  handleSearchSymbols,
  handleGetSymbolDefinition,
  handleShutdown,
  handleNotFound
} from '../routes';

export function initializeExpressApp(): express.Express {
  const expressApp = express();
  expressApp.use(express.json());
  return expressApp;
}

export async function shutdownExistingServer(): Promise<void> {
  try {
    await axios.post('http://localhost:' + PORT + '/shutdown');
    console.log('Successfully sent shutdown signal to existing server');
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.log('No existing server detected or unable to communicate with it');
  }
}

export function setupRoutes(app: express.Express): void {
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
  // File line count
  app.post('/get-files-line-count', handleGetFilesLineCount);
  
  // Symbol and testing endpoints
  app.get('/test-symbol-count', handleTestSymbolCount);
  app.post('/search-symbols', handleSearchSymbols);
  app.post('/get-symbol-definition', handleGetSymbolDefinition);
  
  // System endpoints
  app.post('/shutdown', handleShutdown);
  app.use(handleNotFound);
}

export function startServer(context: vscode.ExtensionContext): void {
  // Initialize the Express app
  const app = initializeExpressApp();
  setApp(app);
  
  // Setup all routes
  setupRoutes(app);

  // Start the server
  const server = app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      vscode.window.showErrorMessage(`Failed to start server: Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });

  setServer(server);

  // Register cleanup on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      server?.close();
      console.log('Server closed on extension deactivation');
    }
  });
}
