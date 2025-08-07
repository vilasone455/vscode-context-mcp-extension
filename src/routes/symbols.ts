/**
 * Symbol search and definition route handlers for the VS Code Context MCP Extension
 */

import { Request, Response } from 'express';
import * as vscode from 'vscode';
import { SymbolSearchResult, SymbolDefinitionResult } from '../types';

export async function handleTestSymbolCount(_req: Request, res: Response): Promise<void> {
  try {
    // Get the current extension.ts file path
    const extensionFilePath = __filename;
    const uri = vscode.Uri.file(extensionFilePath);
    
    // Get document symbols for the current file
    const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    
    if (!documentSymbols) {
      res.json({ success: false, error: 'No symbols found' });
      return;
    }
    
    // Count symbols recursively
    const countSymbols = (symbols: vscode.DocumentSymbol[]): number => {
      let count = 0;
      for (const symbol of symbols) {
        count += 1; // Count this symbol
        count += countSymbols(symbol.children); // Count nested symbols
      }
      return count;
    };
    
    const totalSymbols = countSymbols(documentSymbols);
    
    // Create detailed breakdown
    const symbolBreakdown = documentSymbols.map(symbol => ({
      name: symbol.name,
      kind: vscode.SymbolKind[symbol.kind],
      range: {
        start: { line: symbol.range.start.line, character: symbol.range.start.character },
        end: { line: symbol.range.end.line, character: symbol.range.end.character }
      },
      childCount: symbol.children.length,
      children: symbol.children.map(child => ({
        name: child.name,
        kind: vscode.SymbolKind[child.kind]
      }))
    }));
    
    res.json({
      success: true,
      file: 'extension.ts',
      totalSymbols: totalSymbols,
      topLevelSymbols: documentSymbols.length,
      symbolBreakdown: symbolBreakdown
    });
    
  } catch (error) {
    console.error('Error counting symbols:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

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

