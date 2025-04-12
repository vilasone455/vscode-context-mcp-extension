import React, { useEffect, useState } from 'react';
import { ContextFile, Message } from './types';
import ContextFileItem from './ContextFileItem';
import EmptyState from './EmptyState';

// Access VS Code API
const vscode = acquireVsCodeApi();

const App: React.FC = (): React.ReactElement => {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleMessage = (event: MessageEvent<any>) => {
      const message = event.data as Message;

      switch (message.type) {
        case 'updateContextFiles':
          setContextFiles(message.payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request initial data
    vscode.postMessage({ type: 'getContextFiles' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleClearContext = () => {
    vscode.postMessage({ type: 'clearContext' });
  };

  const handleFileClick = (file: ContextFile) => {
    vscode.postMessage({
      type: 'openFile',
      payload: {
        path: file.fullPath,
        startLine: file.start_line,
        endLine: file.end_line
      }
    });
  };

  const handleRemoveFile = (id: number) => {
    vscode.postMessage({
      type: 'removeContextFile',
      payload: id
    });
  };

  const handleRefresh = () => {
    vscode.postMessage({ type: 'getContextFiles' });
  };

  const filteredFiles = contextFiles.filter(file => 
    file.file_name.toLowerCase().includes(search.toLowerCase()) || 
    file.content.toLowerCase().includes(search.toLowerCase())
  );

  if (contextFiles.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <div className="toolbar">
        <button onClick={handleClearContext}>Clear All</button>
        <button onClick={handleRefresh}>Refresh</button>
      </div>
      
      <div className="search-container">
        <input
          type="text"
          placeholder="Search context files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div>
        {filteredFiles.map((file) => (
          <ContextFileItem
            key={file.id}
            file={file}
            onClick={() => handleFileClick(file)}
            onRemove={() => handleRemoveFile(file.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default App;
