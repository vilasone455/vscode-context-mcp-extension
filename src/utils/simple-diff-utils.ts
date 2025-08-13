import * as vscode from 'vscode';
import { diffLines } from 'diff';

export interface DiffDecoration {
  range: vscode.Range;
  type: 'added' | 'removed' | 'unchanged';
  hoverMessage: string;
}

/**
 * Simple diff implementation using the 'diff' library
 * Clean and straightforward - no over-engineering
 */
export function computeSimpleDiff(oldText: string, newText: string): DiffDecoration[] {
  const changes = diffLines(oldText, newText);
  const decorations: DiffDecoration[] = [];
  
  let lineNumber = 0;
  
  changes.forEach((change) => {
    if (change.added) {
      // Added lines
      const startLine = lineNumber;
      const endLine = lineNumber + change.count - 1;
      
      decorations.push({
        range: new vscode.Range(startLine, 0, endLine, Number.MAX_VALUE),
        type: 'added',
        hoverMessage: `Added ${change.count} line(s)`
      });
      
      lineNumber += change.count;
    } else if (change.removed) {
      // Removed lines - show at current position but don't advance line number
      const startLine = lineNumber;
      const endLine = lineNumber;
      
      decorations.push({
        range: new vscode.Range(startLine, 0, endLine, Number.MAX_VALUE),
        type: 'removed',
        hoverMessage: `Removed ${change.count} line(s): ${change.value.trim()}`
      });
      
      // Don't advance lineNumber for removed lines
    } else {
      // Unchanged lines - just advance lineNumber
      lineNumber += change.count;
    }
  });
  
  return decorations;
}

/**
 * Create decoration types for diff highlighting
 */
export function createDiffDecorationTypes(): {
  added: vscode.TextEditorDecorationType;
  removed: vscode.TextEditorDecorationType;
} {
  return {
    added: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0, 255, 0, 0.2)',
      border: '1px solid rgba(0, 255, 0, 0.5)'
    }),
    
    removed: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 0, 0, 0.2)',
      border: '1px solid rgba(255, 0, 0, 0.5)',
      textDecoration: 'line-through'
    })
  };
}

/**
 * Apply diff decorations to an editor
 */
export function applyDiffDecorations(
  editor: vscode.TextEditor, 
  decorations: DiffDecoration[],
  decorationTypes: { added: vscode.TextEditorDecorationType; removed: vscode.TextEditorDecorationType }
) {
  const addedDecorations: vscode.DecorationOptions[] = [];
  const removedDecorations: vscode.DecorationOptions[] = [];
  
  decorations.forEach(decoration => {
    const options = {
      range: decoration.range,
      hoverMessage: decoration.hoverMessage
    };
    
    if (decoration.type === 'added') {
      addedDecorations.push(options);
    } else if (decoration.type === 'removed') {
      removedDecorations.push(options);
    }
  });
  
  // Apply decorations
  editor.setDecorations(decorationTypes.added, addedDecorations);
  editor.setDecorations(decorationTypes.removed, removedDecorations);
  
  console.log(`📝 Applied ${addedDecorations.length} added and ${removedDecorations.length} removed decorations`);
}
