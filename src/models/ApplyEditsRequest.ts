import type { SymbolKind as VscodeSymbolKind } from 'vscode';

// We use this to get string keys from the enum, e.g., 'Class', 'Method'.
// This is a common pattern to avoid a direct dependency on the `vscode` module in your models.
export type SymbolKind = keyof typeof VscodeSymbolKind;

// --- Match Types ---

type MatchByLines = { match_type: 'lines'; startLine: number; endLine: number; };
type MatchByLine = { match_type: 'line'; atLine: number; };
type MatchByRegex = { match_type: 'regex'; regex: string; occurrence?: number; };
type MatchByString = { match_type: 'str'; text: string; occurrence?: number; };
type MatchByWholeFile = { match_type: 'whole_file'; };

/**
 * NEW: Defines a match based on a symbol's properties, replacing the old 'ast' type.
 */
type MatchBySymbol = {
  match_type: 'symbol';
  /** The name of the symbol (e.g., function or class name) to find. */
  symbolName: string;
  /** Optional: The kind of symbol to match (e.g., 'Class', 'Method', 'Constructor'). */
  symbolKind?: SymbolKind;
  /** Optional: The name of the parent symbol (e.g., the class name for a method). */
  parentSymbolName?: string;
  /** Optional: The kind of the parent symbol (e.g., 'Class'). */
  parentSymbolKind?: SymbolKind;
  /** Which occurrence of the symbol to match if names are not unique. Defaults to 1. */
  occurrence?: number;
};

// --- Action and Edit Definitions ---

type ActionWithText = { newText: string; };
type ActionWithoutText = {};

/**
 * The definitive ApiEdit type that your engine will process.
 * It combines all possible actions with their valid match types.
 */
export type ApiEdit =
  // Replace can use a full block, a specific match, or the whole file
  | ({ action_type: 'replace' } & ActionWithText & (MatchByLines | MatchByRegex | MatchByString | MatchByWholeFile | MatchBySymbol))
  // Insert can target a line, a specific match, or a symbol
  | ({ action_type: 'insert-before' | 'insert-after' } & ActionWithText & (MatchByLine | MatchByRegex | MatchByString | MatchBySymbol))
  // Prepend/Append are line-specific operations
  | ({ action_type: 'prepend' | 'append' } & ActionWithText & MatchByLine)
  // Delete can use a full block, a specific match, or the whole file
  | ({ action_type: 'delete' } & ActionWithoutText & (MatchByLines | MatchByRegex | MatchByString | MatchByWholeFile | MatchBySymbol));

/**
 * The top-level request object.
 */
export interface ApplyEditsRequest {
  filePath: string;
  shortComment: string;
  edits: ApiEdit[];
}