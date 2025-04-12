import React, { useState, useEffect, useRef } from 'react';
import { FileSearchResult } from './types';
import { getVSCodeAPI } from './vscode-api';

// Get VS Code API singleton for use throughout the component
const vscodeApi = getVSCodeAPI();

interface FileSearchInputProps {
  onFileSelect: (file: FileSearchResult) => void;
}

const FileSearchInput: React.FC<FileSearchInputProps> = ({ onFileSelect }) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle search input changes with debounce
  useEffect(() => {
    const handleSearch = () => {
      if (query) {
        setIsLoading(true);
        vscodeApi.postMessage({
          type: 'searchWorkspaceFiles',
          payload: query
        });
      } else {
        setSearchResults([]);
        setIsDropdownVisible(false);
      }
    };

    // Debounce search to avoid excessive requests
    const timerId = setTimeout(handleSearch, 300);
    return () => clearTimeout(timerId);
  }, [query]);

  // Set up message handler for search results
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'fileSearchResults') {
        setSearchResults(message.payload);
        setIsLoading(false);
        setIsDropdownVisible(message.payload.length > 0);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsDropdownVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileClick = (file: FileSearchResult) => {
    onFileSelect(file);
    setQuery('');
    setSearchResults([]);
    setIsDropdownVisible(false);
  };

  return (
    <div className="file-search-container">
      <input
        ref={inputRef}
        type="text"
        placeholder="Add context file..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query && searchResults.length > 0 && setIsDropdownVisible(true)}
      />
      
      {isDropdownVisible && (
        <div className="file-search-dropdown" ref={dropdownRef}>
          {isLoading ? (
            <div className="search-loading">Loading...</div>
          ) : (
            searchResults.map((file, index) => (
              <div 
                key={index} 
                className="file-search-item"
                onClick={() => handleFileClick(file)}
              >
                <div className="file-name">{file.fileName}</div>
                <div className="file-path">{file.fullPath}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FileSearchInput;
