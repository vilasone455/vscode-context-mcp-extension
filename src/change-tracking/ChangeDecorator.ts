import * as vscode from 'vscode';
import { PendingChange } from './types';


/**
 * Simple decorator for showing approve/reject UI using diff highlighting
 * Uses the 'diff' library for clean, straightforward line-based diffs
 */
export class ChangeDecorator {
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
    console.log(`🔍 Showing decorations for ${changes.length} changes in file: ${editor.document.fileName}`);
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
  
    console.log(`🧹 Cleared all decorations for file: ${filePath}`);
  }

  /**
   * Dispose all resources
   */
  dispose() {

  }
}
