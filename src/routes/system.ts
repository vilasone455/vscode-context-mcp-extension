/**
 * System route handlers for the VS Code Context MCP Extension
 */

import { Request, Response } from 'express';
import { getServer } from '../server/state';

export function handleShutdown(_req: Request, res: Response): void {
  res.json({ status: 'shutting down' });
  console.log('Received shutdown signal, stopping server');
  const server = getServer();
  server?.close(() => {
    console.log('Server stopped due to shutdown request');
  });
}

export function handleNotFound(_req: Request, res: Response): void {
  res.status(404).send('Not found');
}
