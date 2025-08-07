/**
 * VS Code-related type definitions for the VS Code Context MCP Extension
 */

export interface EditorInfo {
  fileName: string;
  languageId: string;
  lineCount: number;
  uri: string;
  isDirty: boolean;
  isUntitled: boolean;
  content: string;
}

export interface TabInfo {
  fileName: string;
  languageId: string;
  uri: string;
  isActive: boolean;
  isDirty: boolean;
  isUntitled: boolean;
}
