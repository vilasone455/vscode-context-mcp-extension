import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// Simple script to analyze symbols in extension.ts
const analyzeSymbols = () => {
  const extensionFilePath = path.join(__dirname, 'src', 'extension.ts');
  
  if (!fs.existsSync(extensionFilePath)) {
    console.error('extension.ts not found');
    return;
  }
  
  const sourceCode = fs.readFileSync(extensionFilePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    'extension.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );
  
  const symbols: Array<{name: string, kind: string, line: number}> = [];
  
  const visit = (node: ts.Node) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
    
    // Top-level function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'Function',
        line: line
      });
    }
    
    // Variable declarations (const, let, var)
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      // Check if it's top-level (not inside a function)
      let parent: ts.Node | undefined = node.parent;
      let isTopLevel = true;
      while (parent) {
        if (ts.isFunctionDeclaration(parent) || 
            ts.isMethodDeclaration(parent) || 
            ts.isArrowFunction(parent) ||
            ts.isFunctionExpression(parent)) {
          isTopLevel = false;
          break;
        }
        parent = parent.parent;
      }
      
      if (isTopLevel) {
        symbols.push({
          name: node.name.text,
          kind: 'Variable',
          line: line
        });
      }
    }
    
    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: 'Interface',
        line: line
      });
    }
    
    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: 'Type',
        line: line
      });
    }
    
    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'Class',
        line: line
      });
    }
    
    // Enum declarations
    if (ts.isEnumDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: 'Enum',
        line: line
      });
    }
    
    ts.forEachChild(node, visit);
  };
  
  visit(sourceFile);
  
  console.log('=== SYMBOL ANALYSIS FOR extension.ts ===\n');
  console.log(`Total Symbols Found: ${symbols.length}\n`);
  
  // Group by kind
  const symbolsByKind = symbols.reduce((acc, symbol) => {
    acc[symbol.kind] = (acc[symbol.kind] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('SYMBOLS BY TYPE:');
  Object.entries(symbolsByKind).forEach(([kind, count]) => {
    console.log(`• ${kind}: ${count}`);
  });
  
  console.log('\nDETAILED SYMBOL LIST:');
  symbols.forEach((symbol, index) => {
    console.log(`${index + 1}. ${symbol.name} (${symbol.kind}) - Line ${symbol.line}`);
  });
  
  console.log('\n=== WHAT THIS MEANS ===');
  console.log(`✅ VSCode would likely find: ${symbols.length} symbols`);
  console.log('❌ Local variables, function parameters, and route handlers are NOT included');
  console.log('⚠️  This is an approximation - actual VSCode results may vary slightly');
};

// Run the analysis
try {
  analyzeSymbols();
} catch (error) {
  console.error('Error analyzing symbols:', error);
}
