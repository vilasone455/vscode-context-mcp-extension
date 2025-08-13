// src/utils/diff-utils.ts

import { diffLines, Change } from 'diff';
import { DocumentLike, TextEdit } from './document-abstraction';

// ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};


/**
 * Applies an array of TextEdit instructions to a document to get the final text.
 * Edits are applied in reverse order to avoid offset conflicts.
 * 
 * @param document The original document.
 * @param edits The array of text edits to apply.
 * @returns The new string with all edits applied.
 */
export function applyTextEdits(document: DocumentLike, edits: TextEdit[]): string {
  let text = document.getText();
  
  // Create a helper to convert a Position to an offset
  const getOffset = (position: { line: number; character: number }): number => {
    let offset = 0;
    const lines = text.split('\n');
    for (let i = 0; i < position.line; i++) {
      offset += lines[i].length + 1; // +1 for the newline character
    }
    return offset + position.character;
  };

  // Sort edits in reverse order (from the end of the file to the beginning)
  // This is crucial to ensure that character offsets of later edits remain valid.
  const sortedEdits = [...edits].sort((a, b) => {
    const aStart = getOffset(a.range.start);
    const bStart = getOffset(b.range.start);
    return bStart - aStart;
  });

  // Apply each edit to the text
  for (const edit of sortedEdits) {
    const startOffset = getOffset(edit.range.start);
    const endOffset = getOffset(edit.range.end);
    text = text.substring(0, startOffset) + edit.newText + text.substring(endOffset);
  }

  return text;
}

/**
 * Generates a colored, git-style diff string from two text inputs.
 * 
 * @param originalText The "before" text.
 * @param modifiedText The "after" text.
 * @returns A formatted string representing the diff.
 */
export function generateVisualDiff(originalText: string, modifiedText: string): string {
  const changes: Change[] = diffLines(originalText, modifiedText);
  let output = `${colors.gray}--- Before\n${colors.green}+++ After\n${colors.reset}`;
  
  for (const part of changes) {
    const color = part.added ? colors.green : part.removed ? colors.red : colors.gray;
    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
    
    // Get all lines in the part, but remove a final empty line if it exists
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }

    for (const line of lines) {
      output += `\n${color}${prefix}${line}${colors.reset}`;
    }
  }
  
  return output;
}