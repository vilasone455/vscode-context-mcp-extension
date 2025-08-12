/**
 * Route handlers index file for the VS Code Context MCP Extension
 * Updated to use modular structure
 */

// Import from new modular structure
export * from './filesystem';
export * from './search';
export * from './project';
export * from './symbols';
export * from './system';

// Re-export the handler functions explicitly for clarity
// Filesystem operations
export { 
  handleReadFile,
  handleWriteFile,
  handleReadMultipleFiles,
  handleMoveFile,
  handleGetFilesLineCount,
  handleModifyFile
} from './filesystem/file-operations';

export {
  handleCreateDirectory,
  handleListDirectory,
  handleDirectoryTree
} from './filesystem/directory-operations';

// Search operations
export {
  handleSearchFiles,
  handleSearchFileContent
} from './search/file-search';

// Project operations
export {
  handleProjectPath,
  handleCurrentFile,
  handleOpenTabs,
  handleSessionContext,
  handleGetFileListAndClear
} from './project/project-context';

export {
  handleTerminalContent,
  handleProblems
} from './project/project-integration';

// Symbol operations (unchanged)
export {
  handleSearchSymbols,
  handleGetSymbolDefinition,
  handleListFileSymbols
} from './symbols';
