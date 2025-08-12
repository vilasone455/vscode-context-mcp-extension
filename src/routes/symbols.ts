/**
 * Symbol search and definition route handlers for the VS Code Context MCP Extension
 */

import { Request, Response } from 'express';
import * as path from 'path';
import * as vscode from 'vscode';
import { SymbolSearchResult, SymbolDefinitionResult, CompactSymbol } from '../types';
import { getCurrentProjectPath } from '../server/state';

export async function handleSearchSymbols(req: Request, res: Response): Promise<void> {
  try {
    const { query, maxResults = 10 } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Query parameter is required and must be a string'
      });
      return;
    }

    if (maxResults && (typeof maxResults !== 'number' || maxResults < 1 || maxResults > 100)) {
      res.status(400).json({
        success: false,
        error: 'maxResults must be a number between 1 and 100'
      });
      return;
    }

    // Use VSCode's built-in workspace symbol search
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query
    );

    if (!symbols) {
      res.json({ success: true, query: query, results: [], count: 0 });
      return;
    }

    // Convert VSCode symbols to our API format and limit results
    const results: SymbolSearchResult[] = symbols.slice(0, maxResults).map(symbol => ({
      name: symbol.name,
      kind: vscode.SymbolKind[symbol.kind],
      location: {
        uri: symbol.location.uri.toString(),
        range: symbol.location.range.start.line + "-" + symbol.location.range.end.line
      },
      containerName: symbol.containerName
    }));

    res.json({
      success: true,
      query: query,
      results: results,
      count: results.length
    });
  } catch (error) {
    console.error('Error in search-symbols:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

export async function handleGetSymbolDefinition(req: Request, res: Response): Promise<void> {
  try {
    // Request body now requires 'symbols' and 'path'
    const {
      symbols,
      path: filePath,
      includeContext = true,
      includeDocumentation = true
    } = req.body;

    // 1. Validate input parameters
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'symbols parameter is required and must be a non-empty array of strings'
      });
      return;
    }
    if (symbols.some(s => typeof s !== 'string')) {
      res.status(400).json({
        success: false,
        error: 'All elements in the symbols array must be strings'
      });
      return;
    }

    // The 'path' parameter is now mandatory
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({
        success: false,
        error: 'path parameter is required and must be a string'
      });
      return;
    }

    // 2. Use VSCode's provider to find all occurrences for EACH symbol
    const searchPromises = symbols.map(symbol =>
      vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        symbol
      )
    );

    const searchResults = await Promise.all(searchPromises);
    const allFoundSymbols = searchResults.flat();

    const uniqueSymbolsMap = new Map<string, vscode.SymbolInformation>();
    for (const symbolInfo of allFoundSymbols) {
      const key = `${symbolInfo.location.uri.toString()}:${symbolInfo.location.range.start.line}:${symbolInfo.location.range.start.character}`;
      if (!uniqueSymbolsMap.has(key)) {
        uniqueSymbolsMap.set(key, symbolInfo);
      }
    }
    const allSymbols = Array.from(uniqueSymbolsMap.values());

    if (allSymbols.length === 0) {
      res.status(404).json({
        success: false,
        error: `No symbols matching '${symbols.join(', ')}' found anywhere in the workspace.`,
        searchCriteria: {
          symbols,
          filePath
        }
      });
      return;
    }

    // 3. Apply the mandatory path filter
    const originalCount = allSymbols.length;

    const normalizePathForComparison = (path: string): string => {
      return path.replace(/\\/g, '/').toLowerCase();
    };

    const targetPathNormalized = normalizePathForComparison(filePath);

    const filteredSymbols = allSymbols.filter(s => {
      const symbolPath = s.location.uri.fsPath;
      const symbolPathNormalized = normalizePathForComparison(symbolPath);

      return symbolPathNormalized === targetPathNormalized ||
        symbolPathNormalized.endsWith(targetPathNormalized);
    });

    // Since the path filter is always applied, we can provide a more specific error.
    if (filteredSymbols.length === 0) {
      res.status(404).json({
        success: false,
        error: `No symbols matching '${symbols.join(', ')}' were found within the specified path.`,
        searchCriteria: {
          symbols,
          filePath
        },
        originalMatches: originalCount, // Shows how many were found in the workspace before filtering
        suggestion: `The symbol(s) were found in the workspace but not at path '${filePath}'. Check if the path is correct.`
      });
      return;
    }

    // 4. Enrich each found symbol with context and documentation
    const definitions = await Promise.all(
      filteredSymbols.map(async (symbolInfo): Promise<SymbolDefinitionResult> => {
        const { location, name, kind } = symbolInfo;

        // Get hover information for documentation
        let documentation: string | undefined;
        if (includeDocumentation) {
          try {
            const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
              'vscode.executeHoverProvider',
              location.uri,
              location.range.start
            );
            if (hoverInfo?.length) {
              documentation = hoverInfo
                .map(h => h.contents.map(c => (typeof c === 'string' ? c : c.value)).join('\n'))
                .join('\n');
            }
          } catch (hoverError) {
            console.warn(`Could not get hover info for ${name}:`, hoverError);
          }
        }

        // Get surrounding code for context
        let context: string | undefined;
        if (includeContext) {
          try {
            const doc = await vscode.workspace.openTextDocument(location.uri);
            const startLine = Math.max(0, location.range.start.line - 2);
            const endLine = Math.min(doc.lineCount - 1, location.range.end.line + 2);
            const contextRange = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).range.end.character);
            context = doc.getText(contextRange);
          } catch (docError) {
            console.warn(`Could not open document for context for ${name}:`, docError);
          }
        }

        return {
          name: name,
          kind: vscode.SymbolKind[kind],
          range: `${location.range.start.line}-${location.range.end.line}`,
          context: includeContext ? context : undefined,
          documentation: includeDocumentation ? documentation : undefined
        };
      })
    );

    // 5. Send the successful response
    res.json({
      success: true,
      definitions: definitions
    });
  } catch (error) {
    console.error('Error in get-symbol-definition:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

export async function handleListFileSymbols(req: Request, res: Response): Promise<void> {
  try {
    const { path: filePath } = req.body;

    // Validate input parameters
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({
        success: false,
        error: 'path parameter is required and must be a string'
      });
      return;
    }

    // Resolve relative paths against the current project path
    const projectPath = getCurrentProjectPath();
    let resolvedPath: string;
    if (path.isAbsolute(filePath)) {
      resolvedPath = filePath;
    } else {
      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'No project path available to resolve relative path.'
        });
        return;
      }
      resolvedPath = path.resolve(projectPath, filePath);
    }

    // Convert to VS Code URI
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.file(resolvedPath);
    } catch (uriError) {
      res.status(400).json({
        success: false,
        error: `Invalid file path: ${resolvedPath}`
      });
      return;
    }

    // Get document symbols for the specified file
    const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );

    if (!documentSymbols) {
      res.json([]);
      return;
    }

    // Convert to compact format (only depth 0-1)
    const convertToCompactFormat = (symbols: vscode.DocumentSymbol[]): CompactSymbol[] => {
      return symbols.map(symbol => ({
        n: symbol.name,
        k: vscode.SymbolKind[symbol.kind].toLowerCase(),
        c: symbol.children.map(child => ({
          n: child.name,
          k: vscode.SymbolKind[child.kind].toLowerCase(),
          c: [] // Only go to depth 1, so children of children are empty
        }))
      }));
    };

     const convertToKindNameFormat = (symbols: any[]): any => {
      return symbols.reduce((accumulator, symbol) => {
        // 1. Create the top-level key (e.g., "class:Logger")
        const key = `${symbol.k}:${symbol.n}`;

        // 2. Create the array of children strings (e.g., "method:clear")
        const children = symbol.c.map((child: { k: any; n: any; }) => `${child.k}:${child.n}`);

        // 3. Add the new key-value pair to the object we're building
        accumulator[key] = children;

        // 4. Return the updated object for the next iteration
        return accumulator;
      }, {} as any); // Start with an empty object
    };


    const compactSymbols = convertToCompactFormat(documentSymbols);

    const trueCompactSymbols = convertToKindNameFormat(compactSymbols);
   
    res.json(trueCompactSymbols);

  } catch (error) {
    console.error('Error in list-file-symbols:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
