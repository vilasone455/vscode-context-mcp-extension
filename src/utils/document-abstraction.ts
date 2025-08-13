/**
 * Abstract interfaces for document operations to enable easier testing
 */

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface DocumentLike {
  getText(): string;
  lineCount: number;
  lineAt(line: number): { range: Range };
  positionAt(offset: number): Position;
  getUri?(): string; // Optional method to get the document URI
}

/**
 * Simple implementation for testing
 */
export class MockDocument implements DocumentLike {
  private lines: string[];

  constructor(content: string) {
    this.lines = content.split('\n');
  }

  getText(): string {
    return this.lines.join('\n');
  }

  get lineCount(): number {
    return this.lines.length;
  }

  lineAt(line: number): { range: Range } {
    if (line < 0 || line >= this.lines.length) {
      throw new Error(`Line ${line} out of bounds`);
    }
    
    const startOffset = this.getOffsetAt({ line, character: 0 });
    const endOffset = startOffset + this.lines[line].length;
    
    return {
      range: {
        start: this.positionAt(startOffset),
        end: this.positionAt(endOffset)
      }
    };
  }

  positionAt(offset: number): Position {
    let currentOffset = 0;
    for (let line = 0; line < this.lines.length; line++) {
      const lineLength = this.lines[line].length;
      if (currentOffset + lineLength >= offset) {
        return {
          line,
          character: offset - currentOffset
        };
      }
      currentOffset += lineLength + 1; // +1 for newline
    }
    
    // If offset is at the very end
    return {
      line: this.lines.length - 1,
      character: this.lines[this.lines.length - 1].length
    };
  }

  private getOffsetAt(position: Position): number {
    let offset = 0;
    for (let i = 0; i < position.line; i++) {
      offset += this.lines[i].length + 1; // +1 for newline
    }
    return offset + position.character;
  }
}
