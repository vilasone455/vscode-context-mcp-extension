export interface ContextFile {
  file_name: string;
  fullPath: string;
  content: string;
  start_line: number;
  end_line: number;
  fullCode: boolean;
  id: number;
}

export interface Message {
  type: string;
  payload?: any;
}

export interface FileSearchResult {
  fileName: string;
  fullPath: string;
}
