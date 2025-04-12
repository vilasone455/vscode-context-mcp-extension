import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
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
  const [selectedIndex, setSelectedIndex] = useState(-1); // Track selected index
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
    setSelectedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownVisible || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); // Prevent scrolling
        setSelectedIndex(prevIndex => {
          const newIndex = prevIndex < searchResults.length - 1 ? prevIndex + 1 : 0;
          // Scroll the item into view if needed
          const selectedElement = document.getElementById(`search-item-${newIndex}`);
          if (selectedElement && dropdownRef.current) {
            selectedElement.scrollIntoView({ block: 'nearest' });
          }
          return newIndex;
        });
        break;
      case 'ArrowUp':
        e.preventDefault(); // Prevent scrolling
        setSelectedIndex(prevIndex => {
          const newIndex = prevIndex > 0 ? prevIndex - 1 : searchResults.length - 1;
          // Scroll the item into view if needed
          const selectedElement = document.getElementById(`search-item-${newIndex}`);
          if (selectedElement && dropdownRef.current) {
            selectedElement.scrollIntoView({ block: 'nearest' });
          }
          return newIndex;
        });
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          e.preventDefault();
          handleFileClick(searchResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsDropdownVisible(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Reset the selected index when the search results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchResults]);

  return (
    <div className="file-search-container">
      <input
        ref={inputRef}
        type="text"
        placeholder="Add context file..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query && searchResults.length > 0 && setIsDropdownVisible(true)}
        onKeyDown={handleKeyDown}
      />
      
      {isDropdownVisible && (
        <div className="file-search-dropdown" ref={dropdownRef}>
          {isLoading ? (
            <div className="search-loading">Loading...</div>
          ) : (
            searchResults.map((file, index) => (
              <div 
                key={index}
                id={`search-item-${index}`}
                className={`file-search-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleFileClick(file)}
                onMouseEnter={() => setSelectedIndex(index)}
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
