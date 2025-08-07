import * as ts from 'typescript';
import * as path from 'path';
import { ASTNodeInfo } from '../models/ApplyEditsRequest';

// ========================================
// Core Types & Interfaces
// ========================================

export type SupportedLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'php' | 'python' | 'java' | 'csharp' | 'go';

/**
 * Base interface for all language parsers
 */
export interface ILanguageParser {
  /**
   * Parse source code and return AST nodes
   */
  parse(content: string, fileName?: string): ASTNodeInfo[];

  /**
   * Check if this parser supports the given language
   */
  supportsLanguage(language: SupportedLanguage): boolean;

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[];
}

// ========================================
// TypeScript/JavaScript Parser
// ========================================

class TypeScriptParser implements ILanguageParser {
  private supportedLanguages: SupportedLanguage[] = ['typescript', 'javascript', 'tsx', 'jsx'];
  private supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  supportsLanguage(language: SupportedLanguage): boolean {
    return this.supportedLanguages.includes(language);
  }

  getSupportedExtensions(): string[] {
    return this.supportedExtensions;
  }

  parse(content: string, fileName: string = 'temp.ts'): ASTNodeInfo[] {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const nodes: ASTNodeInfo[] = [];

    const getDepth = (node: ts.Node): number => {
      let depth = 0;
      let current = node.parent;
      while (current && current.kind !== ts.SyntaxKind.SourceFile) {
        if (ts.isClassDeclaration(current) ||
          ts.isInterfaceDeclaration(current) ||
          ts.isObjectLiteralExpression(current)) {
          depth++;
        }
        current = current.parent;
      }
      return depth;
    };

    const getParentName = (node: ts.Node): string | undefined => {
      let current = node.parent;
      while (current) {
        if (ts.isClassDeclaration(current) && current.name) {
          return current.name.text;
        }
        if (ts.isInterfaceDeclaration(current) && current.name) {
          return current.name.text;
        }
        current = current.parent;
      }
      return undefined;
    };

    const visit = (node: ts.Node) => {
      // Function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        nodes.push({
          type: 'function',
          name: node.name.text,
          depth: getDepth(node),
          parent: getParentName(node),
          startOffset: node.pos,
          endOffset: node.end,
          startLine: sourceFile.getLineAndCharacterOfPosition(node.pos).line,
          endLine: sourceFile.getLineAndCharacterOfPosition(node.end).line
        });
      }

      // Class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        nodes.push({
          type: 'class',
          name: node.name.text,
          depth: getDepth(node),
          parent: getParentName(node),
          startOffset: node.pos,
          endOffset: node.end,
          startLine: sourceFile.getLineAndCharacterOfPosition(node.pos).line,
          endLine: sourceFile.getLineAndCharacterOfPosition(node.end).line
        });
      }

      // Method declarations
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        nodes.push({
          type: 'method',
          name: node.name.text,
          depth: getDepth(node),
          parent: getParentName(node),
          startOffset: node.pos,
          endOffset: node.end,
          startLine: sourceFile.getLineAndCharacterOfPosition(node.pos).line,
          endLine: sourceFile.getLineAndCharacterOfPosition(node.end).line
        });
      }

      // Arrow functions and function expressions assigned to variables
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          nodes.push({
            type: 'function',
            name: node.name.text,
            depth: getDepth(node),
            parent: getParentName(node),
            startOffset: node.parent.parent.pos,
            endOffset: node.parent.parent.end,
            startLine: sourceFile.getLineAndCharacterOfPosition(node.parent.parent.pos).line,
            endLine: sourceFile.getLineAndCharacterOfPosition(node.parent.parent.end).line
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    console.log(nodes)
    return nodes;
  }
}

// ========================================
// PHP Parser (Example Implementation)
// ========================================

class PHPParser implements ILanguageParser {
  private supportedLanguages: SupportedLanguage[] = ['php'];
  private supportedExtensions = ['.php', '.php3', '.php4', '.php5', '.phtml'];

  supportsLanguage(language: SupportedLanguage): boolean {
    return this.supportedLanguages.includes(language);
  }

  getSupportedExtensions(): string[] {
    return this.supportedExtensions;
  }

  parse(content: string, fileName: string = 'temp.php'): ASTNodeInfo[] {
    try {
      const PhpParser = require('php-parser');
      return this.parseWithPhpParser(content, fileName, PhpParser);
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
        console.warn(
          'The "php-parser" package is not installed. Please run "npm install php-parser" for more accurate PHP parsing. Falling back to a simple regex-based parser.'
        );
      } else {
        console.error('An error occurred during PHP parsing:', e);
      }
      return this.parseWithRegex(content);
    }
  }

  private parseWithPhpParser(content: string, fileName: string, PhpParser: any): ASTNodeInfo[] {
    const parser = new PhpParser({
      parser: { extractDoc: true, php7: true, php8: true },
      ast: { withPositions: true },
    });

    try {
      const ast = parser.parseCode(content, fileName);
      const nodes: ASTNodeInfo[] = [];

      const getNodeName = (node: any): string | null => (node.name ? (typeof node.name === 'string' ? node.name : node.name.name) : null);

      const visit = (node: any, parentStack: { name: string }[]) => {
        if (!node || typeof node !== 'object' || !node.kind) return;

        let name: string | null = null;
        let newStack = parentStack;
        const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined;

        switch (node.kind) {
          case 'class':
          case 'interface':
          case 'trait':
            name = getNodeName(node);
            if (name && node.loc) {
              nodes.push({
                // Casting to the new ASTNodeType
                type: node.kind as 'class' | 'interface' | 'trait',
                name,
                depth: parentStack.length,
                parent: parent?.name,
                startOffset: node.loc.start.offset,
                endOffset: node.loc.end.offset,
                startLine: node.loc.start.line - 1,
                endLine: node.loc.end.line - 1,
              });
              newStack = [...parentStack, { name }];
            }
            break;

          case 'function':
          case 'method':
            name = getNodeName(node);
            if (name && node.loc) {
              nodes.push({
                // Casting to the new ASTNodeType
                type: node.kind as 'function' | 'method',
                name,
                depth: parentStack.length,
                parent: parent?.name,
                startOffset: node.loc.start.offset,
                endOffset: node.loc.end.offset,
                startLine: node.loc.start.line - 1,
                endLine: node.loc.end.line - 1,
              });
            }
            break;
        }

        const children = node.children || node.body || (node.body?.children) || [];
        if (Array.isArray(children)) {
          for (const child of children) {
            visit(child, newStack);
          }
        }
      };

      visit(ast, []);
      return nodes;
    } catch (err: any) {
      console.error(`Error parsing PHP file "${fileName}":`, err.message);
      return [];
    }
  }

  private parseWithRegex(content: string): ASTNodeInfo[] {
    // This fallback parser remains the same. It's simple and doesn't need to be updated
    // with the full type list, as its capabilities are limited anyway.
    const nodes: ASTNodeInfo[] = [];
    const classRegex = /^(?:abstract\s+|final\s+)?(class|interface|trait)\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/gm;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const type = match[1] as 'class' | 'interface' | 'trait';
      const name = match[2];
      const startOffset = match.index;
      const startLine = content.substring(0, startOffset).split('\n').length - 1;

      nodes.push({
        type, name, depth: 0, startOffset, endOffset: -1, startLine, endLine: startLine,
      });
    }

    const functionRegex = /function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1];
      const startOffset = match.index;
      const startLine = content.substring(0, startOffset).split('\n').length - 1;

      nodes.push({
        type: 'function', name, depth: 0, startOffset, endOffset: -1, startLine, endLine: startLine,
      });
    }

    return nodes;
  }
}


// ========================================
// Python Parser (Example Implementation)
// ========================================

class PythonParser implements ILanguageParser {
  private supportedLanguages: SupportedLanguage[] = ['python'];
  private supportedExtensions = ['.py', '.pyw'];

  supportsLanguage(language: SupportedLanguage): boolean {
    return this.supportedLanguages.includes(language);
  }

  getSupportedExtensions(): string[] {
    return this.supportedExtensions;
  }

  parse(content: string): ASTNodeInfo[] {
    const nodes: ASTNodeInfo[] = [];

    // Python-specific parsing logic
    // Could use python-ast npm package or regex fallback
    const functionRegex = /^(\s*)def\s+(\w+)\s*\(/gm;
    const classRegex = /^(\s*)class\s+(\w+)\s*(?:\([^)]*\))?\s*:/gm;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const indentLevel = match[1].length / 4; // Assuming 4-space indentation
      nodes.push({
        type: indentLevel === 0 ? 'function' : 'method',
        name: match[2],
        depth: Math.floor(indentLevel),
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        startLine: content.substring(0, match.index).split('\n').length - 1,
        endLine: content.substring(0, match.index + match[0].length).split('\n').length - 1
      });
    }

    while ((match = classRegex.exec(content)) !== null) {
      const indentLevel = match[1].length / 4;
      nodes.push({
        type: 'class',
        name: match[2],
        depth: Math.floor(indentLevel),
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        startLine: content.substring(0, match.index).split('\n').length - 1,
        endLine: content.substring(0, match.index + match[0].length).split('\n').length - 1
      });
    }

    return nodes;
  }
}

// ========================================
// Parser Registry & Factory
// ========================================

class ParserRegistry {
  private parsers: Map<SupportedLanguage, ILanguageParser> = new Map();
  private extensionMap: Map<string, SupportedLanguage> = new Map();

  constructor() {
    // Register default parsers
    this.registerParser(new TypeScriptParser());
    this.registerParser(new PHPParser());
    this.registerParser(new PythonParser());
  }

  /**
   * Register a language parser
   */
  registerParser(parser: ILanguageParser): void {
    // Register for each supported language
    (['typescript', 'javascript', 'tsx', 'jsx', 'php', 'python', 'java', 'csharp', 'go'] as SupportedLanguage[])
      .forEach(lang => {
        if (parser.supportsLanguage(lang)) {
          this.parsers.set(lang, parser);
        }
      });

    // Build extension map
    parser.getSupportedExtensions().forEach(ext => {
      // Map extension to first supported language
      const lang = (['typescript', 'javascript', 'tsx', 'jsx', 'php', 'python', 'java', 'csharp', 'go'] as SupportedLanguage[])
        .find(l => parser.supportsLanguage(l));
      if (lang) {
        this.extensionMap.set(ext, lang);
      }
    });
  }

  /**
   * Get parser for a specific language
   */
  getParser(language: SupportedLanguage): ILanguageParser | undefined {
    return this.parsers.get(language);
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): SupportedLanguage | undefined {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensionMap.get(ext);
  }

  /**
   * Parse content with automatic language detection
   */
  parse(content: string, filePathOrLanguage?: string | SupportedLanguage): ASTNodeInfo[] {
    let language: SupportedLanguage | undefined;

    if (filePathOrLanguage) {
      // Check if it's a language identifier
      if (this.parsers.has(filePathOrLanguage as SupportedLanguage)) {
        language = filePathOrLanguage as SupportedLanguage;
      } else {
        // Assume it's a file path
        language = this.detectLanguage(filePathOrLanguage);
      }
    }

    if (!language) {
      // Default to TypeScript if no language detected
      console.warn('No language detected, defaulting to TypeScript');
      language = 'typescript';
    }

    const parser = this.getParser(language);
    if (!parser) {
      throw new Error(`No parser available for language: ${language}`);
    }

    return parser.parse(content, filePathOrLanguage as string);
  }
}

// ========================================
// Singleton Instance & Main Export
// ========================================

const parserRegistry = new ParserRegistry();

/**
 * Main parse function - backwards compatible
 * This replaces your original parseAST function
 */
export function parseAST(content: string, filePathOrLanguage?: string | SupportedLanguage): ASTNodeInfo[] {
  return parserRegistry.parse(content, filePathOrLanguage);
}

/**
 * Register a custom parser
 */
export function registerParser(parser: ILanguageParser): void {
  parserRegistry.registerParser(parser);
}

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  return parserRegistry.detectLanguage(filePath);
}

/**
 * Get parser for specific language
 */
export function getParser(language: SupportedLanguage): ILanguageParser | undefined {
  return parserRegistry.getParser(language);
}

// ========================================
// Usage Examples
// ========================================

/*
// Example 1: Parse TypeScript (backwards compatible)
const tsNodes = parseAST(typescriptCode);

// Example 2: Parse PHP with explicit language
const phpNodes = parseAST(phpCode, 'php');

// Example 3: Parse with file path (auto-detect language)
const nodes = parseAST(content, '/path/to/file.php');

// Example 4: Register a custom parser
class JavaParser implements ILanguageParser {
  // ... implementation
}
registerParser(new JavaParser());

// Example 5: Use in createTextEdits
export function createTextEdits(document: DocumentLike, apiEdits: ApiEdit[], filePath?: string): TextEdit[] {
  const fullText = document.getText();
  const language = filePath ? detectLanguage(filePath) : 'typescript';
  const astNodes = parseAST(fullText, language);
  // ... rest of implementation
}
*/