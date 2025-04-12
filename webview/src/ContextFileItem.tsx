import React, { useState } from 'react';
import { ContextFile } from './types';

interface ContextFileItemProps {
  file: ContextFile;
  onClick: () => void;
  onRemove: () => void;
}

const ContextFileItem: React.FC<ContextFileItemProps> = ({ file, onClick, onRemove }: ContextFileItemProps) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpand = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <div className="context-file" onClick={onClick}>
      <div className="context-file-header">
        <div className="file-title">
          <strong>{file.file_name}</strong>
          {file.fullCode ? ' (Full)' : ` (Lines ${file.start_line + 1}-${file.end_line + 1})`}
        </div>
        <div className="file-actions">
          <button onClick={handleToggleExpand}>
            {expanded ? '−' : '+'}
          </button>
          <button onClick={handleRemove}>
            ×
          </button>
        </div>
      </div>
      
      {expanded && (
        <div className="context-file-content">
          {file.content}
        </div>
      )}
    </div>
  );
};

export default ContextFileItem;
