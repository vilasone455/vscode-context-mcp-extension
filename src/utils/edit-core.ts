import { ApiEdit, ASTNodeInfo } from '../models/ApplyEditsRequest';
import { DocumentLike, TextEdit, Range, Position } from './document-abstraction';
import { parseAST } from '../parser';

function getNodeIndentation(document: any, node: any): string {
  const fullText = document.getText();
  const lineStart = fullText.lastIndexOf('\n', node.startOffset) + 1;
  const textBeforeNode = fullText.substring(lineStart, node.startOffset);
  const match = textBeforeNode.match(/^(\s*)/);
  return match ? match[1] : '';
}

// Add this helper to apply indentation to each line
function applyIndentation(text: string, indent: string): string {
  // Split into lines, apply indent to each non-empty line
  return text.split('\n').map((line, index) => {
    // Don't indent the first line (it will use existing indent)
    if (index === 0) return line;
    // Only indent non-empty lines
    return line.trim() ? indent + line : line;
  }).join('\n');
}

/**
 * Finds an AST node matching the specified criteria
 */
function findASTNode(
  nodes: ASTNodeInfo[],
  nodeType: string,
  name: string,
  depth?: number,
  parent?: string,
  occurrence: number = 1
): ASTNodeInfo | null {
  let count = 0;

  for (const node of nodes) {
    const matches =
      node.type === nodeType &&
      node.name === name &&
      (depth === undefined || node.depth === depth) &&
      (parent === undefined || node.parent === parent);

    if (matches) {
      count++;
      if (count === occurrence) {
        return node;
      }
    }
  }

  return null;
}

/**
 * Enhanced createTextEdits with AST support
 */
export function createTextEdits(document: DocumentLike, apiEdits: ApiEdit[], filePath?: string): TextEdit[] {
  const textEdits: TextEdit[] = [];
  const fullText = document.getText();
  let astNodes: ASTNodeInfo[] | null = null;

  // Parse AST once if any edit uses AST matching
  const hasASTEdits = apiEdits.some(edit => 'match_type' in edit && edit.match_type === 'ast');
  if (hasASTEdits) {
    astNodes = parseAST(fullText, filePath ?? "typescript");
  }

  for (const edit of apiEdits) {
    switch (edit.action_type) {
      // --- REPLACE ACTION ---
      case 'replace': {
        switch (edit.match_type) {
          case 'lines': {
            const startLine = edit.startLine - 1;
            const endLine = edit.endLine - 1;
            if (startLine < 0 || endLine >= document.lineCount || startLine > endLine) {
              throw new Error(`Invalid line range for 'replace' > 'lines': ${edit.startLine}-${edit.endLine}.`);
            }
            const range: Range = {
              start: { line: startLine, character: 0 },
              end: document.lineAt(endLine).range.end
            };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'ast': {
            if (!astNodes) throw new Error('AST parsing failed');

            const node = findASTNode(
              astNodes,
              edit.nodeType,
              edit.name,
              edit.depth,
              edit.parent,
              edit.occurrence || 1
            );

            if (!node) {
              throw new Error(
                `Could not find AST node: ${edit.nodeType} "${edit.name}"` +
                (edit.depth !== undefined ? ` at depth ${edit.depth}` : '') +
                (edit.parent ? ` in parent "${edit.parent}"` : '')
              );
            }
            const startPosition = document.positionAt(node.startOffset);
            const endPosition = document.positionAt(node.endOffset);
            const range: Range = { start: startPosition, end: endPosition };

            let newText = edit.newText;

            const fullText = document.getText();

            if (node.startOffset > 0) {
              const charBefore = fullText.charAt(node.startOffset - 1);

              if (charBefore !== '\n' && charBefore !== '\r') {
                newText = '\n\n' + newText;
              }
            }

            textEdits.push({ range, newText: newText }); 

            break;
          }

          case 'regex': {
            const matchPos = findNthMatch(fullText, new RegExp(edit.regex), edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of regex "${edit.regex}" for 'replace'.`);
            }
            const range: Range = {
              start: document.positionAt(matchPos.start),
              end: document.positionAt(matchPos.end)
            };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'str': {
            const matchPos = findNthMatch(fullText, edit.text, edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of string "${edit.text}" for 'replace'.`);
            }
            const range: Range = {
              start: document.positionAt(matchPos.start),
              end: document.positionAt(matchPos.end)
            };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'whole_file': {
            const range: Range = {
              start: document.positionAt(0),
              end: document.positionAt(fullText.length)
            };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          default:
            const exhaustiveCheck: never = edit;
            throw new Error(`Unhandled match type for 'replace': ${(exhaustiveCheck as any).match_type}`);
        }
        break;
      }

      // --- INSERT-BEFORE ACTION ---
      case 'insert-before': {
        switch (edit.match_type) {
          case 'line': {
            const line = edit.atLine - 1;
            if (line < 0 || line > document.lineCount) {
              throw new Error(`Invalid line for 'insert-before' > 'line': ${edit.atLine}.`);
            }
            const position: Position = { line, character: 0 };
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: `${edit.newText}\n` });
            break;
          }

          case 'ast': {
            if (!astNodes) throw new Error('AST parsing failed');

            const node = findASTNode(
              astNodes,
              edit.nodeType,
              edit.name,
              edit.depth,
              edit.parent,
              edit.occurrence || 1
            );

            if (!node) {
              throw new Error(
                `Could not find AST node: ${edit.nodeType} "${edit.name}" for 'insert-before'`
              );
            }

            const startPosition = document.positionAt(node.startOffset); // Or node.getStart()
            const endPosition = document.positionAt(node.endOffset); // Or node.end

            const range: Range = { start: startPosition, end: endPosition };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'regex': {
            const matchPos = findNthMatch(fullText, new RegExp(edit.regex), edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of regex "${edit.regex}" for 'insert-before'.`);
            }
            const position = document.positionAt(matchPos.start);
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'str': {
            const matchPos = findNthMatch(fullText, edit.text, edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of string "${edit.text}" for 'insert-before'.`);
            }
            const position = document.positionAt(matchPos.start);
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          default:
            const exhaustiveCheck: never = edit;
            throw new Error(`Unhandled match type for 'insert-before': ${(exhaustiveCheck as any).match_type}`);
        }
        break;
      }

      // --- INSERT-AFTER ACTION ---
      case 'insert-after': {
        switch (edit.match_type) {
          case 'line': {
            const line = edit.atLine - 1;
            if (line < 0 || line >= document.lineCount) {
              throw new Error(`Invalid line for 'insert-after' > 'line': ${edit.atLine}.`);
            }
            const position = document.lineAt(line).range.end;
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: `\n${edit.newText}` });
            break;
          }

          case 'ast': {
            if (!astNodes) throw new Error('AST parsing failed');

            const node = findASTNode(
              astNodes,
              edit.nodeType,
              edit.name,
              edit.depth,
              edit.parent,
              edit.occurrence || 1
            );

            if (!node) {
              throw new Error(
                `Could not find AST node: ${edit.nodeType} "${edit.name}" for 'insert-after'`
              );
            }

            const position = document.positionAt(node.endOffset);
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'regex': {
            const matchPos = findNthMatch(fullText, new RegExp(edit.regex), edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of regex "${edit.regex}" for 'insert-after'.`);
            }
            const position = document.positionAt(matchPos.end);
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          case 'str': {
            const matchPos = findNthMatch(fullText, edit.text, edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of string "${edit.text}" for 'insert-after'.`);
            }
            const position = document.positionAt(matchPos.end);
            const range: Range = { start: position, end: position };
            textEdits.push({ range, newText: edit.newText });
            break;
          }

          default:
            const exhaustiveCheck: never = edit;
            throw new Error(`Unhandled match type for 'insert-after': ${(exhaustiveCheck as any).match_type}`);
        }
        break;
      }

      // --- DELETE ACTION ---
      case 'delete': {
        switch (edit.match_type) {
          case 'lines': {
            const startLine = edit.startLine - 1;
            const endLine = edit.endLine - 1;
            if (startLine < 0 || endLine >= document.lineCount || startLine > endLine) {
              throw new Error(`Invalid line range for 'delete' > 'lines': ${edit.startLine}-${edit.endLine}.`);
            }
            const endPosition = endLine + 1 < document.lineCount
              ? { line: endLine + 1, character: 0 }
              : document.lineAt(endLine).range.end;
            const range: Range = {
              start: { line: startLine, character: 0 },
              end: endPosition
            };
            textEdits.push({ range, newText: '' });
            break;
          }

          case 'ast': {
            if (!astNodes) throw new Error('AST parsing failed');

            const node = findASTNode(
              astNodes,
              edit.nodeType,
              edit.name,
              edit.depth,
              edit.parent,
              edit.occurrence || 1
            );

            if (!node) {
              throw new Error(
                `Could not find AST node: ${edit.nodeType} "${edit.name}" for 'delete'`
              );
            }

            // CORRECTED: Directly use the node's boundaries for deletion.
            const range: Range = {
              start: document.positionAt(node.startOffset),
              end: document.positionAt(node.endOffset)
            };
            textEdits.push({ range, newText: '' });
            break;
          }

          case 'regex': {
            const matchPos = findNthMatch(fullText, new RegExp(edit.regex), edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of regex "${edit.regex}" for 'delete'.`);
            }
            const range: Range = {
              start: document.positionAt(matchPos.start),
              end: document.positionAt(matchPos.end)
            };
            textEdits.push({ range, newText: '' });
            break;
          }

          case 'str': {
            const matchPos = findNthMatch(fullText, edit.text, edit.occurrence || 1);
            if (!matchPos) {
              throw new Error(`Could not find occurrence ${edit.occurrence || 1} of string "${edit.text}" for 'delete'.`);
            }
            const range: Range = {
              start: document.positionAt(matchPos.start),
              end: document.positionAt(matchPos.end)
            };
            textEdits.push({ range, newText: '' });
            break;
          }

          case 'whole_file': {
            const range: Range = {
              start: document.positionAt(0),
              end: document.positionAt(fullText.length)
            };
            textEdits.push({ range, newText: '' });
            break;
          }

          default:
            const exhaustiveCheck: never = edit;
            throw new Error(`Unhandled match type for 'delete': ${(exhaustiveCheck as any).match_type}`);
        }
        break;
      }

      // --- PREPEND/APPEND unchanged ---
      case 'prepend': {
        if (edit.match_type === 'line') {
          const line = edit.atLine - 1;
          if (line < 0 || line >= document.lineCount) {
            throw new Error(`Invalid line for 'prepend': ${edit.atLine}.`);
          }
          const position: Position = { line, character: 0 };
          const range: Range = { start: position, end: position };
          textEdits.push({ range, newText: edit.newText });
        } else {
          const exhaustiveCheck: never = edit;
          throw new Error(`Invalid match type for 'prepend': ${(exhaustiveCheck as any).match_type}. Must be 'line'.`);
        }
        break;
      }

      case 'append': {
        if (edit.match_type === 'line') {
          const line = edit.atLine - 1;
          if (line < 0 || line >= document.lineCount) {
            throw new Error(`Invalid line for 'append': ${edit.atLine}.`);
          }
          const position = document.lineAt(line).range.end;
          const range: Range = { start: position, end: position };
          textEdits.push({ range, newText: edit.newText });
        } else {
          const exhaustiveCheck: never = edit;
          throw new Error(`Invalid match type for 'append': ${(exhaustiveCheck as any).match_type}. Must be 'line'.`);
        }
        break;
      }

      default:
        const exhaustiveCheck: never = edit;
        throw new Error(`Unhandled action type: ${(exhaustiveCheck as any).action_type}`);
    }
  }

  return textEdits;
}

// Helper function from original code
export function findNthMatch(content: string, search: string | RegExp, n: number): { start: number; end: number } | null {
  let matchResult: RegExpExecArray | null;
  let count = 0;
  const regex = typeof search === 'string'
    ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    : new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g');

  regex.lastIndex = 0;

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
