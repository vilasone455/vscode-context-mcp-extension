/**
 * API-related type definitions for the VS Code Context MCP Extension
 */

export interface SymbolSearchResult {
  name: string;
  kind: string;
  location: {
    uri: string;
    range: string;
  };
  containerName?: string;
}



export interface SymbolDefinitionResult {
  name: string;
  kind: string;
  range : string
  context?: string;
  documentation?: string;
}
