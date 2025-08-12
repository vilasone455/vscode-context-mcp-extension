import * as vscode from 'vscode';
import * as fs from 'fs';
import { ApiEdit } from '../models/ApplyEditsRequest';
import { createTextEdits } from './edit-core';
import { DocumentLike, TextEdit, Range, Position } from './document-abstraction';

/**
 * Adapter class to make vscode.TextDocument compatible with DocumentLike interface
 */
class VscodeDocumentAdapter implements DocumentLike {
  constructor(private document: vscode.TextDocument) { }

  getText(): string {
    return this.document.getText();
  }

  get lineCount(): number {
    return this.document.lineCount;
  }

  lineAt(line: number): { range: Range } {
    const vscodeLine = this.document.lineAt(line);
    return {
      range: {
        start: {
          line: vscodeLine.range.start.line,
          character: vscodeLine.range.start.character
        },
        end: {
          line: vscodeLine.range.end.line,
          character: vscodeLine.range.end.character
        }
      }
    };
  }

  positionAt(offset: number): Position {
    const vscodePos = this.document.positionAt(offset);
    return {
      line: vscodePos.line,
      character: vscodePos.character
    };
  }

  getUri(): string {
    return this.document.uri.fsPath;
  }
}

/**
 * Converts abstract TextEdit to vscode.TextEdit
 */
function convertToVscodeTextEdit(textEdit: TextEdit , document : vscode.TextDocument): vscode.TextEdit {
  
  const startLine = textEdit.range.start.line;
  const endLine = textEdit.range.end.line;

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
  const range = new vscode.Range(startPos, endPos);


  if (textEdit.newText === '') {
    return vscode.TextEdit.delete(range);
  } else if (textEdit.range.start.line === textEdit.range.end.line &&
    textEdit.range.start.character === textEdit.range.end.character) {
    return vscode.TextEdit.insert(range.start, textEdit.newText);
  } else {
    return vscode.TextEdit.replace(range, textEdit.newText);
  }
}

/**
 * Creates an array of VS Code TextEdit objects from a list of abstract ApiEdit instructions.
 * This is now a thin wrapper around the testable core logic.
 * @param document The VS Code TextDocument to be edited.
 * @param apiEdits An array of ApiEdit instructions.
 * @returns A promise that resolves to an array of vscode.TextEdit objects.
 */
export async function createVscodeTextEdits(document: vscode.TextDocument, apiEdits: ApiEdit[]): Promise<vscode.TextEdit[]> {
  const adapter = new VscodeDocumentAdapter(document);
  const textEdits = await createTextEdits(adapter, apiEdits);
  return textEdits.map(textEdit => convertToVscodeTextEdit(textEdit, document));
}

/**
 * Applies a series of edits to a file using the VS Code workspace API.
 * @param filePath The absolute path to the file to modify.
 * @param edits An array of ApiEdit instructions.
 * @returns A promise that resolves to true if edits were successful, false otherwise.
 */
export async function applyVscodeEdits(filePath: string, edits: ApiEdit[]): Promise<boolean> {
  // Check if file exists first for a clearer error message.
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
  } catch (e) {
    throw new Error(`File not found: ${filePath}`);
  }

  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const vscodeEdits = await createVscodeTextEdits(document, edits);

  if (vscodeEdits.length === 0) {
    console.log('No edits to apply.');
    return true;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(uri, vscodeEdits);

  const success = await vscode.workspace.applyEdit(workspaceEdit);

  if (success) {
    // Save the document to ensure changes are written to disk.
    await document.save();
  }

  return success;
}