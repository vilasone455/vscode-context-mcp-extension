/**
 * Route handlers index file for the VS Code Context MCP Extension
 */

export * from './project';
export * from './symbols';
export * from './system';

// Re-export the new handler function explicitly for clarity
export { handleGetFilesLineCount } from './project';
