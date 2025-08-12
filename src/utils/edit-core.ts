import { ApiEdit } from '../models/ApplyEditsRequest';
import { DocumentLike, TextEdit, Range, Position } from './document-abstraction';
import { DocumentSymbol } from 'vscode';
import * as vscode from 'vscode';

// --- Symbol Finding Logic ---

/**
 * Maps VSCode SymbolKind numbers to readable strings
 */
const SYMBOL_KIND_MAP: { [key: number]: string } = {
  0: 'File',
  1: 'Module',
  2: 'Namespace',
  3: 'Package',
  4: 'Class',
  5: 'Method',
  6: 'Property',
  7: 'Field',
  8: 'Constructor',
  9: 'Enum',
  10: 'Interface',
  11: 'Function',
  12: 'Variable',
  13: 'Constant',
  14: 'String',
  15: 'Number',
  16: 'Boolean',
  17: 'Array',
  18: 'Object',
  19: 'Key',
  20: 'Null',
  21: 'EnumMember',
  22: 'Struct',
  23: 'Event',
  24: 'Operator',
  25: 'TypeParameter'
};

/**
 * Criteria for finding a symbol
 */
interface SymbolSearchCriteria {
  name: string;
  kind?: string;
  parentName?: string;
  parentKind?: string;
  occurrence: number;
}

/**
 * Accumulator for tracking search progress
 */
interface SearchAccumulator {
  count: number;
  found: DocumentSymbol | null;
}

/**
 * Recursively searches for a symbol matching the given criteria
 */
function findSymbolRecursive(
  symbols: DocumentSymbol[],
  parentSymbol: DocumentSymbol | null,
  criteria: SymbolSearchCriteria,
  accumulator: SearchAccumulator
): void {
  for (const symbol of symbols) {
    // Early return if we already found what we're looking for
    if (accumulator.found) {
      return;
    }

    // Check if symbol name matches
    const nameMatches = symbol.name === criteria.name;

    // Check if symbol kind matches (if specified)
    const kindMatches = criteria.kind === undefined ||
      SYMBOL_KIND_MAP[symbol.kind] === criteria.kind;

    // Check if parent matches (if specified)
    let parentMatches = !criteria.parentName; // Default to true if no parent specified

    if (criteria.parentName && parentSymbol && parentSymbol.name === criteria.parentName) {
      const parentKindMatches = criteria.parentKind === undefined ||
        SYMBOL_KIND_MAP[parentSymbol.kind] === criteria.parentKind;

      if (parentKindMatches) {
        parentMatches = true;
      }
    }

    // If all criteria match, increment counter
    if (nameMatches && kindMatches && parentMatches) {
      accumulator.count++;

      // If we've reached the desired occurrence, we found our symbol
      if (accumulator.count === criteria.occurrence) {
        accumulator.found = symbol;
        return;
      }
    }

    // Recursively search children
    if (symbol.children.length > 0) {
      findSymbolRecursive(symbol.children, symbol, criteria, accumulator);
    }
  }
}

/**
 * Finds a symbol based on the provided match criteria
 */
function findSymbol(
  symbols: DocumentSymbol[],
  match: ApiEdit & { match_type: 'symbol' }
): DocumentSymbol | null {
  const accumulator: SearchAccumulator = {
    count: 0,
    found: null
  };

  const criteria: SymbolSearchCriteria = {
    name: match.symbolName,
    kind: match.symbolKind,
    parentName: match.parentSymbolName,
    parentKind: match.parentSymbolKind,
    occurrence: match.occurrence || 1
  };

  findSymbolRecursive(symbols, null, criteria, accumulator);

  return accumulator.found;
}

function findNthMatch(content: string, search: string | RegExp, n: number): { start: number; end: number } | null {
    let matchResult: RegExpExecArray | null;
    let count = 0;
    const regex = typeof search === 'string'
        ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        : new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g');

    regex.lastIndex = 0; // Reset regex state

    while ((matchResult = regex.exec(content)) !== null) {
        count++;
        if (count === n) {
            return {
                start: matchResult.index,
                end: matchResult.index + matchResult[0].length,
            };
        }
    }
    return null;
}

/**
 * Creates an array of TextEdit objects based on a set of declarative ApiEdit instructions.
 */
export async function createTextEdits(
  document: DocumentLike,
  apiEdits: ApiEdit[],
): Promise<TextEdit[]> {
  // Get document symbols for the current file
  let documentSymbols: vscode.DocumentSymbol[] = [];

  const textEdits: TextEdit[] = [];
  const fullText = document.getText();

  const hasSymbolEdits = apiEdits.some(edit => edit.match_type === 'symbol');
  if (hasSymbolEdits) {
    // Use the document's URI if available, fallback to __filename for non-VSCode documents
    const documentPath = document.getUri?.() || __filename;
    const uri = vscode.Uri.file(documentPath);
    
    documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
  }

  for (const edit of apiEdits) {
    let range: Range | undefined;
    let position: Position | undefined;

    // --- Phase 1: Determine the Range or Position for the edit ---
    switch (edit.match_type) {
      case 'symbol': {
        if (!documentSymbols) {throw new Error('Symbol provider failed or was not available for a symbol-based edit.');}
        const symbol = findSymbol(documentSymbols, edit);
        if (!symbol) {
          let errorMsg = `Could not find symbol: "${edit.symbolName}"`;
          if (edit.symbolKind) {errorMsg += ` of kind ${edit.symbolKind}`;}
          if (edit.parentSymbolName) {errorMsg += ` inside parent "${edit.parentSymbolName}"`;}
          throw new Error(errorMsg);
        }
        range = symbol.range;
        break;
      }
      case 'lines': {
        const startLine = edit.startLine - 1; // 1-based to 0-based
        const endLine = edit.endLine - 1;
        if (startLine < 0 || endLine >= document.lineCount || startLine > endLine) {
          throw new Error(`Invalid line range for 'lines': ${edit.startLine}-${edit.endLine}.`);
        }
        range = {
          start: { line: startLine, character: 0 },
          end: document.lineAt(endLine).range.end
        };
        break;
      }
      case 'line': {
        const line = edit.atLine - 1;
        if (line < 0 || line >= document.lineCount) {
          throw new Error(`Invalid line for 'line': ${edit.atLine}.`);
        }
        // We use the full line range here; actions will pick start/end as needed
        range = document.lineAt(line).range;
        break;
      }
      case 'regex':
      case 'str': {
        const searchTerm = edit.match_type === 'regex' ? new RegExp(edit.regex) : edit.text;
        const matchPos = findNthMatch(fullText, searchTerm, edit.occurrence || 1);
        if (!matchPos) {
          throw new Error(`Could not find occurrence ${edit.occurrence || 1} of ${edit.match_type} "${'regex' in edit ? edit.regex : edit.text}".`);
        }
        range = {
          start: document.positionAt(matchPos.start),
          end: document.positionAt(matchPos.end)
        };
        break;
      }
      case 'whole_file': {
        range = {
          start: document.positionAt(0),
          end: document.positionAt(fullText.length)
        };
        break;
      }
      default:
        const exhaustiveCheck: never = edit;
        throw new Error(`Unhandled match type: ${(exhaustiveCheck as any).match_type}`);
    }

    if (!range) {throw new Error(`Could not determine a range for the edit: ${JSON.stringify(edit)}`);}

    // --- Phase 2: Apply the Action using the determined range ---
    switch (edit.action_type) {
      case 'replace':
        textEdits.push({ range, newText: edit.newText });
        break;
      case 'delete':
        textEdits.push({ range, newText: '' });
        break;
      case 'insert-before': {
        // For 'line' match, this adds a new line before. For others, it's just before the content.
        const newText = edit.match_type === 'line' ? `${edit.newText}\n` : edit.newText;
        position = range.start;
        textEdits.push({ range: { start: position, end: position }, newText });
        break;
      }
      case 'insert-after': {
        // For 'line' match, this adds a new line after. For others, it's just after the content.
        const newText = edit.match_type === 'line' ? `\n${edit.newText}` : edit.newText;
        position = range.end;
        textEdits.push({ range: { start: position, end: position }, newText });
        break;
      }
      case 'prepend': {
        // Prepending adds text to the beginning of the line.
        position = range.start;
        textEdits.push({ range: { start: position, end: position }, newText: edit.newText });
        break;
      }
      case 'append': {
        // Appending adds text to the end of the line's content.
        position = range.end;
        textEdits.push({ range: { start: position, end: position }, newText: edit.newText });
        break;
      }
      default:
        const exhaustiveCheck: never = edit;
        throw new Error(`Unhandled action type: ${(exhaustiveCheck as any).action_type}`);
    }
  }
  return textEdits;
}
