import * as vscode from 'vscode';
import { PendingChange } from './types';
import { computeSimpleDiff, createDiffDecorationTypes, applyDiffDecorations } from '../utils/simple-diff-utils';

/**
 * Simple decorator for showing approve/reject UI using diff highlighting
 * Uses the 'diff' library for clean, straightforward line-based diffs
 */
export class ChangeDecorator {
  private decorationTypes = createDiffDecorationTypes();
  private activeDecorations = new Map<string, { added: vscode.DecorationOptions[]; removed: vscode.DecorationOptions[] }>();

  constructor(private changeTracker: any) {
    // Listen for change approvals/rejections to clean up decorations
    this.changeTracker.onDidChange((changeId: string) => {
      this.removeDecoration(changeId);
    });
  }

  /**
   * Show diff-based decorations for pending changes
   */
  async showDecorations(editor: vscode.TextEditor, changes: PendingChange[]) {
    console.log(`🎨 Showing ${changes.length} changes with diff highlighting`);
    
    // Clear existing decorations for this file
    this.clearDecorationsForFile(editor.document.uri.fsPath);

    // Show diff decoration for each change
    changes.forEach(change => {
      this.showDiffDecoration(editor, change);
    });
  }

  /**
   * Show diff-based decoration for a single change
   */
  private showDiffDecoration(editor: vscode.TextEditor, change: PendingChange) {
    console.log(`📝 Showing diff for change: ${change.id} (${change.changeType})`);
    
    try {
      // Compute diff between original and new text
      const diffDecorations = computeSimpleDiff(change.originalText, change.textEdit.newText);
      
      if (diffDecorations.length === 0) {
        console.log(`⚠️ No diff decorations found for change ${change.id}`);
        return;
      }
      
      // Adjust decoration ranges to the actual change position in the document
      const adjustedDecorations = diffDecorations.map(decoration => ({
        ...decoration,
        range: new vscode.Range(
          change.textEdit.range.start.line + decoration.range.start.line,
          decoration.range.start.character,
          change.textEdit.range.start.line + decoration.range.end.line,
          decoration.range.end.character
        )
      }));
      
      // Apply the diff decorations
      applyDiffDecorations(editor, adjustedDecorations, this.decorationTypes);
      
      // Store for cleanup (simplified - just track that we have decorations for this change)
      this.activeDecorations.set(change.id, {
        added: adjustedDecorations.filter(d => d.type === 'added').map(d => ({ range: d.range, hoverMessage: d.hoverMessage })),
        removed: adjustedDecorations.filter(d => d.type === 'removed').map(d => ({ range: d.range, hoverMessage: d.hoverMessage }))
      });
      
    } catch (error) {
      console.error(`❌ Error computing diff for change ${change.id}:`, error);
      // Fallback to simple highlighting
      this.showFallbackDecoration(editor, change);
    }
  }

  /**
   * Fallback decoration for when diff computation fails
   */
  private showFallbackDecoration(editor: vscode.TextEditor, change: PendingChange) {
    let range = change.textEdit.range;

    // For insertions, calculate the actual range of inserted text
    if (change.changeType === 'addition' && range.start.isEqual(range.end)) {
      const insertedLines = change.textEdit.newText.split('\n');
      const lastLineLength = insertedLines[insertedLines.length - 1].length;
      
      if (insertedLines.length === 1) {
        range = new vscode.Range(
          range.start,
          new vscode.Position(range.start.line, range.start.character + lastLineLength)
        );
      } else {
        range = new vscode.Range(
          range.start,
          new vscode.Position(
            range.start.line + insertedLines.length - 1,
            lastLineLength
          )
        );
      }
    }

    // Apply simple highlighting as fallback
    const decorationOptions = [{ range, hoverMessage: `${change.changeType}: ${change.description}` }];
    
    if (change.changeType === 'addition' || change.changeType === 'modification') {
      editor.setDecorations(this.decorationTypes.added, decorationOptions);
    } else {
      editor.setDecorations(this.decorationTypes.removed, decorationOptions);
    }
  }

  /**
   * Remove decoration for a specific change
   */
  removeDecoration(changeId: string) {
    this.activeDecorations.delete(changeId);
    console.log(`🧹 Removed decorations for change: ${changeId}`);
  }

  /**
   * Clear all decorations for a file
   */
  clearDecorationsForFile(filePath: string) {
    // Clear all active decorations
    this.activeDecorations.clear();
    
    // Clear VSCode decorations
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.fsPath === filePath) {
      activeEditor.setDecorations(this.decorationTypes.added, []);
      activeEditor.setDecorations(this.decorationTypes.removed, []);
    }
    
    console.log(`🧹 Cleared all decorations for file: ${filePath}`);
  }

  /**
   * Dispose all resources
   */
  dispose() {
    this.decorationTypes.added.dispose();
    this.decorationTypes.removed.dispose();
    this.activeDecorations.clear();
  }
}
