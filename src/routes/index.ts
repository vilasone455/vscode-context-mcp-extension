/**
 * Route handlers index file for the VS Code Context MCP Extension
 */

export * from './project';
export * from './symbols';
export * from './system';

// Re-export the new handler functions explicitly for clarity
export { 
  handleCurrentFile,
  handleGetFilesLineCount, 
  handleReadFile, 
  handleReadMultipleFiles, 
  handleWriteFile,
  handleCreateDirectory,
  handleListDirectory,
  handleDirectoryTree,
  handleMoveFile,
  handleSearchFiles
} from './project';

export {
  handleTestSymbolCount,
  handleSearchSymbols,
  handleGetSymbolDefinition,
  handleListFileSymbols
} from './symbols';
