/**
 * MCP tool wrapper functions with proper path resolution
 * Fixes the relative path handling bug in VSCode context MCP tools
 */

import * as path from 'path';
import { getCurrentProjectPath } from '../server/state';

/**
 * Resolves a file path (relative or absolute) against the current project path
 */
export function resolveProjectPath(filePath: string): string {
  const projectPath = getCurrentProjectPath();
  
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  
  if (!projectPath) {
    throw new Error('No project path available to resolve relative path');
  }
  
  return path.resolve(projectPath, filePath);
}

/**
 * MCP-aware file reading with proper path resolution
 */
export async function readFileWithProjectPath(filePath: string): Promise<string> {
  const absolutePath = resolveProjectPath(filePath);
  
  // Here you would call the actual MCP tool with the resolved absolute path
  // For now, using fs as an example - replace with actual MCP call
  const fs = await import('fs');
  return fs.promises.readFile(absolutePath, 'utf8');
}

/**
 * MCP-aware file writing with proper path resolution
 */
export async function writeFileWithProjectPath(filePath: string, content: string): Promise<void> {
  const absolutePath = resolveProjectPath(filePath);
  
  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  const fs = await import('fs');
  await fs.promises.mkdir(dir, { recursive: true });
  
  // Write file with absolute path
  await fs.promises.writeFile(absolutePath, content, 'utf8');
}

/**
 * MCP-aware file modification with proper path resolution
 */
export async function modifyFileWithProjectPath(
  filePath: string, 
  edits: any[], 
  shortComment?: string
): Promise<boolean> {
  const absolutePath = resolveProjectPath(filePath);
  
  // Here you would call the actual MCP modify tool with the resolved absolute path
  // This is a placeholder - replace with actual MCP call
  console.log(`Would modify ${absolutePath} with ${edits.length} edits: ${shortComment}`);
  
  return true;
}

/**
 * Convert relative paths to absolute for MCP tool usage
 */
export function preparePathForMCP(filePath: string): string {
  return resolveProjectPath(filePath);
}

/**
 * Batch prepare multiple paths for MCP tools
 */
export function preparePathsForMCP(filePaths: string[]): string[] {
  return filePaths.map(preparePathForMCP);
}
