import { ContextFile } from "../models/project-session";
import * as path from 'path';
import { getCurrentProjectPath } from '../server/state';

export const getContextFileWithLineNumber = (
    files: ContextFile[]) => {
    const filesWithLineNumbers = files.map(file => {
        const newContent = formatWithLineNumbers(file.content);
        
        // Convert absolute paths to relative paths
        const projectPath = getCurrentProjectPath();
        const relativePath = projectPath && path.isAbsolute(file.fullPath) 
            ? path.relative(projectPath, file.fullPath)
            : file.fullPath;

        return new ContextFile(
            file.file_name,
            relativePath,
            newContent,
            file.start_line,
            file.end_line,
            file.fullCode
        );
    });

    return filesWithLineNumbers;

}

export const formatWithLineNumbers = (content: string) => {
    const lines = content.split('\n');
    const lineNumberWidth = lines.length.toString().length;

    const numberedLines = lines.map((line, index) => {
        const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
        return `${lineNumber}: ${line}`;
    });

    const newContent = numberedLines.join('\n');

    return newContent;
}
