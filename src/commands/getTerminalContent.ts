import * as vscode from 'vscode';

export async function getTerminalContent(): Promise<string | undefined> {
  try {
    // Select & copy terminal content
    await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
    await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');

    // Read from clipboard
    const terminalContent = await vscode.env.clipboard.readText();
    
    // Show the content in an information message
    console.log('Terminal content:', terminalContent);
    vscode.window.showInformationMessage("Terminal content: "+terminalContent);
    
    return terminalContent;
  } catch (error) {
    console.error('Failed to get terminal content:', error);
    vscode.window.showErrorMessage('Failed to copy terminal content');
    return undefined;
  }
}
