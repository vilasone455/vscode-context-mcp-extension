import * as vscode from 'vscode';
import { PendingChange, FileChangeSet } from './types';

/**
 * Simple change tracker for approve/reject workflow
 * No persistence, no overlapping detection, no complex state management
 */
export class ChangeTracker {
  private files = new Map<string, FileChangeSet>();
  private onDidChangeEmitter = new vscode.EventEmitter<string>();
  public onDidChange = this.onDidChangeEmitter.event;

  /**
   * Add new changes to track with proper original content capture
   */
  async addChanges(filePath: string, textEdits: vscode.TextEdit[], description: string): Promise<PendingChange[]> {
    // Ensure we have the original file content captured
    await this.ensureOriginalContentCaptured(filePath);
    
    const fileChanges = this.getOrCreateFileChanges(filePath);
    const newChanges: PendingChange[] = [];

    textEdits.forEach((textEdit, index) => {
      const originalText = this.getOriginalContentForRange(filePath, textEdit.range);
      
      const change: PendingChange = {
        id: this.generateId(),
        filePath,
        textEdit,
        originalText,
        description: `${description} (${index + 1}/${textEdits.length})`,
        timestamp: new Date(),
        changeType: this.determineChangeType(originalText, textEdit.newText)
      };

      fileChanges.changes.set(change.id, change);
      newChanges.push(change);
      
      console.log(`➕ Added change ${change.id}: ${change.changeType} - "${originalText}" -> "${textEdit.newText}"`);
    });

    return newChanges;
  }

  /**
   * Approve a change - remove from tracking
   */
  async approveChange(changeId: string): Promise<boolean> {
    const change = this.findChange(changeId);
    if (!change) {
      return false;
    }

    this.removeChange(changeId);
    console.log(`✅ Approved: ${change.description}`);
    this.onDidChangeEmitter.fire(changeId);
    return true;
  }

  /**
   * Reject a change - revert to original content
   */
  async rejectChange(changeId: string): Promise<boolean> {
    const change = this.findChange(changeId);
    if (!change) {
      return false;
    }

    try {
      const uri = vscode.Uri.file(change.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const revertEdit = new vscode.WorkspaceEdit();
      
      // For insertions, calculate the range to delete
      if (change.changeType === 'addition' && change.textEdit.range.start.isEqual(change.textEdit.range.end)) {
        const insertedLines = change.textEdit.newText.split('\n');
        const lastLineLength = insertedLines[insertedLines.length - 1].length;
        
        let deleteRange: vscode.Range;
        if (insertedLines.length === 1) {
          deleteRange = new vscode.Range(
            change.textEdit.range.start,
            new vscode.Position(
              change.textEdit.range.start.line, 
              change.textEdit.range.start.character + lastLineLength
            )
          );
        } else {
          deleteRange = new vscode.Range(
            change.textEdit.range.start,
            new vscode.Position(
              change.textEdit.range.start.line + insertedLines.length - 1,
              lastLineLength
            )
          );
        }
        revertEdit.delete(uri, deleteRange);
      } else {
        revertEdit.replace(uri, change.textEdit.range, change.originalText);
      }
      
      const success = await vscode.workspace.applyEdit(revertEdit);
      
      if (success) {
        await document.save();
        this.removeChange(changeId);
        console.log(`❌ Rejected: ${change.description}`);
        this.onDidChangeEmitter.fire(changeId);
        return true;
      }
    } catch (error) {
      console.error(`Failed to reject change ${changeId}:`, error);
    }

    return false;
  }

  /**
   * Get all pending changes for a file
   */
  getPendingChanges(filePath: string): PendingChange[] {
    const fileChanges = this.files.get(filePath);
    return fileChanges ? Array.from(fileChanges.changes.values()) : [];
  }

  /**
   * Find a change by ID
   */
  findChange(changeId: string): PendingChange | undefined {
    for (const fileChanges of this.files.values()) {
      if (fileChanges.changes.has(changeId)) {
        return fileChanges.changes.get(changeId);
      }
    }
    return undefined;
  }

  /**
   * Clear all changes for a file
   */
  clearChangesForFile(filePath: string): void {
    this.files.delete(filePath);
  }

  // Private helper methods
  private async ensureOriginalContentCaptured(filePath: string): Promise<void> {
    if (this.files.has(filePath)) {
      return; // Already captured
    }

    try {
      // Try to read the current file content as "original"
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const originalContent = document.getText();
      
      const fileChanges: FileChangeSet = {
        filePath,
        changes: new Map(),
        originalFileContent: originalContent
      };
      
      this.files.set(filePath, fileChanges);
      console.log(`📦 Captured original content for ${filePath} (${originalContent.length} chars)`);
    } catch (error) {
      console.error(`⚠️ Failed to capture original content for ${filePath}:`, error);
      // Create empty file changes as fallback
      this.files.set(filePath, {
        filePath,
        changes: new Map(),
        originalFileContent: ''
      });
    }
  }

  private getOrCreateFileChanges(filePath: string): FileChangeSet {
    let fileChanges = this.files.get(filePath);
    if (!fileChanges) {
      fileChanges = {
        filePath,
        changes: new Map(),
        originalFileContent: ''
      };
      this.files.set(filePath, fileChanges);
    }
    return fileChanges;
  }

  private removeChange(changeId: string): boolean {
    for (const fileChanges of this.files.values()) {
      if (fileChanges.changes.has(changeId)) {
        fileChanges.changes.delete(changeId);
        return true;
      }
    }
    return false;
  }

  private getOriginalContentForRange(filePath: string, range: vscode.Range): string {
    const fileChanges = this.files.get(filePath);
    if (!fileChanges) return '';

    const lines = fileChanges.originalFileContent.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;
    const startChar = range.start.character;
    const endChar = range.end.character;

    if (startLine === endLine) {
      return lines[startLine]?.substring(startChar, endChar) || '';
    } else {
      const selectedLines = lines.slice(startLine, endLine + 1);
      if (selectedLines.length > 0) {
        selectedLines[0] = selectedLines[0]?.substring(startChar) || '';
        selectedLines[selectedLines.length - 1] = selectedLines[selectedLines.length - 1]?.substring(0, endChar) || '';
      }
      return selectedLines.join('\n');
    }
  }

  private determineChangeType(originalText: string, newText: string): 'addition' | 'deletion' | 'modification' {
    if (originalText === '' && newText !== '') {
      return 'addition';
    } else if (originalText !== '' && newText === '') {
      return 'deletion';
    } else {
      return 'modification';
    }
  }

  private generateId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
