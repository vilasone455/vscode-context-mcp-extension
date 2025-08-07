// ===== UPDATED TYPE DEFINITIONS =====

export type ActionType = 'replace' | 'insert-before' | 'insert-after' | 'prepend' | 'append' | 'delete';
export type MatchType = 'lines' | 'line' | 'regex' | 'str' | 'whole_file' | 'ast';

// Existing match types
type MatchByLines = { match_type: 'lines'; startLine: number; endLine: number; };
type MatchByLine = { match_type: 'line'; atLine: number; };
type MatchByRegex = { match_type: 'regex'; regex: string; occurrence?: number; };
type MatchByStr = { match_type: 'str'; text: string; occurrence?: number; };
type MatchByWholeFile = { match_type: 'whole_file'; };

// NEW: AST/Structural match type
type ASTNodeType =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'trait'; // Added for PHP

type MatchByAST = {
  match_type: 'ast';
  nodeType: ASTNodeType;
  name: string;
  depth?: number; // 0 = top-level, 1 = class/object member, etc.
  parent?: string; // Parent class/object name for nested items
  occurrence?: number; // Which occurrence if multiple matches
};

type ActionWithText = { newText: string; };
type ActionWithoutText = {};

export type ApiEdit = {
  action_type: ActionType;
} & (
  | ({ action_type: 'replace' } & ActionWithText & (MatchByLines | MatchByRegex | MatchByStr | MatchByWholeFile | MatchByAST))
  | ({ action_type: 'insert-before' | 'insert-after' } & ActionWithText & (MatchByLine | MatchByRegex | MatchByStr | MatchByAST))
  | ({ action_type: 'prepend' | 'append' } & ActionWithText & MatchByLine)
  | ({ action_type: 'delete' } & ActionWithoutText & (MatchByLines | MatchByRegex | MatchByStr | MatchByWholeFile | MatchByAST))
);

export interface ApplyEditsRequest {
  filePath: string;
  shortComment: string;
  edits: ApiEdit[];
}

// Helper type for AST node information
export interface ASTNodeInfo {
  type: ASTNodeType;
  name: string;
  depth: number;
  parent?: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}