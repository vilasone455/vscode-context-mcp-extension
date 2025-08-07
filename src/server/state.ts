/**
 * Global state management for the VS Code Context MCP Extension
 */

import express from 'express';
import { ContextManager } from '../models/project-session';
import { ContextMCPWebviewProvider } from '../webview/webview-provider';

// Global state variables
export let session = new ContextManager();
export let webviewProvider: ContextMCPWebviewProvider | null = null;
export let currentProjectPath: string | null = null;
export let server: any | null = null;
export let app: express.Express | null = null;

// State setters
export function setWebviewProvider(provider: ContextMCPWebviewProvider): void {
  webviewProvider = provider;
}

export function setCurrentProjectPath(path: string | null): void {
  currentProjectPath = path;
}

export function setServer(serverInstance: any): void {
  server = serverInstance;
}

export function setApp(appInstance: express.Express | null): void {
  app = appInstance;
}

// State getters
export function getSession(): ContextManager {
  return session;
}

export function getWebviewProvider(): ContextMCPWebviewProvider | null {
  return webviewProvider;
}

export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

export function getServer(): any {
  return server;
}

export function getApp(): express.Express | null {
  return app;
}
