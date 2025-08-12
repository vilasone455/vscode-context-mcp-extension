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

export interface ModifyViaSymbolRequest {
  filePath: string;
  text: string;
  symbol: string;
  depth?: number;
  actionType: 'replace' | 'insert before bracket' | 'insert after bracket';
}

export interface ModifyViaSymbolResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface CompactSymbol {
  /** Symbol name */
  n: string;
  /** Symbol kind (lowercase) */
  k: string;
  /** Children symbols (depth 0-1 only) */
  c: CompactSymbol[];
}

export interface ListFileSymbolsRequest {
  path: string;
}

export interface ListFileSymbolsResponse {
  success?: boolean;
  symbols?: CompactSymbol[];
  error?: string;
}
