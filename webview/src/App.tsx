import React, { useEffect, useState } from 'react';
import { ContextFile, Message, FileSearchResult } from './types';
import ContextFileItem from './ContextFileItem';
import EmptyState from './EmptyState';
import FileSearchInput from './FileSearchInput';
import { getVSCodeAPI } from './vscode-api';

// Get VS Code API singleton for use throughout the component
const vscodeApi = getVSCodeAPI();

const App: React.FC = () => {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [search, setSearch] = useState('');
  const [showAllFiles, setShowAllFiles] = useState(true);

  // Set up message handling and request initial data
  useEffect(() => {
    console.log('App component mounted');
    
    const handleMessage = (event: MessageEvent<any>) => {
      const message = event.data as Message;
      console.log('React received message:', message.type, message.payload ? 
        `(${Array.isArray(message.payload) ? message.payload.length : 'object'})` : 
        '');

      switch (message.type) {
        case 'updateContextFiles':
          setContextFiles(message.payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request initial data
    vscodeApi.postMessage({ type: 'getContextFiles' });
    console.log('Requested initial context files');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // UI event handlers
  const handleClearContext = () => {
    vscodeApi.postMessage({ type: 'clearContext' });
  };

  const handleFileClick = (file: ContextFile) => {
    vscodeApi.postMessage({
      type: 'openFile',
      payload: {
        path: file.fullPath,
        startLine: file.start_line,
        endLine: file.end_line
      }
    });
  };

  const handleRemoveFile = (id: number) => {
    vscodeApi.postMessage({
      type: 'removeContextFile',
      payload: id
    });
  };

  const handleRefresh = () => {
    vscodeApi.postMessage({ type: 'getContextFiles' });
  };

  const handleAddFile = (file: FileSearchResult) => {
    vscodeApi.postMessage({
      type: 'addFileToContext',
      payload: file
    });
  };

  const handleGetTerminal = async () => {
    vscodeApi.postMessage({ type: 'getTerminalContent' });
  }

  // Filter files if search is active
  const filteredFiles = showAllFiles 
    ? contextFiles 
    : contextFiles.filter(file => 
        file.file_name.toLowerCase().includes(search.toLowerCase()) || 
        file.content.toLowerCase().includes(search.toLowerCase())
      );

  console.log(`Rendering ${contextFiles.length} context files`);

  return (
    <div>
      <div className="toolbar">
        <button onClick={handleClearContext}>Clear All</button>
        <button onClick={handleGetTerminal}>Refresh</button>
      </div>
      
      <div className="search-container">
        <FileSearchInput onFileSelect={handleAddFile} />
      </div>

      <div className="context-files-container">
        {contextFiles.length === 0 ? (
          <EmptyState />
        ) : (
          filteredFiles.map((file) => (
            <ContextFileItem
              key={file.id}
              file={file}
              onClick={() => handleFileClick(file)}
              onRemove={() => handleRemoveFile(file.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default App;
