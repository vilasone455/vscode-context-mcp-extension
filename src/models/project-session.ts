// Data model for the session
export class ProjectSession {
  // List of context files
  public context_file_lists: ContextFile[];
  // List of currently open tabs
  public opening_tabs: string[];
  // Current active tab
  public curTab: string | null;

  constructor() {
    this.opening_tabs = [];
    this.curTab = null;
    this.context_file_lists = [];
  }
}

// Class to represent a context file as requested
export class ContextFile {
  // File name (without path)
  public file_name: string;
  // Full file path
  public fullPath: string;
  // File content or selection content
  public content: string;
  // Start line of selection (0 for full file)
  public start_line: number;
  // End line of selection (last line for full file)
  public end_line: number;
  // Whether this is the full file content
  public fullCode: boolean;

  constructor(
    file_name: string, 
    fullPath: string, 
    content: string, 
    start_line: number, 
    end_line: number, 
    fullCode: boolean
  ) {
    this.file_name = file_name;
    this.fullPath = fullPath;
    this.content = content;
    this.start_line = start_line;
    this.end_line = end_line;
    this.fullCode = fullCode;
  }
}

// Interface for context file with ID for UI display
export interface ContextFileWithId extends ContextFile {
  id: number;
}