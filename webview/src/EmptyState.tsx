import React from 'react';

const EmptyState: React.FC = (): React.ReactElement => {
  console.log('Rendering EmptyState component');
  return (
    <div className="empty-state">
      <p>No context files yet.</p>
      <div style={{ fontSize: 'smaller', margin: '8px 0' }}>
        <div><strong>Ctrl+L</strong>: Add current file</div>
        <div><strong>Ctrl+I</strong>: Add selected code</div>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
        Or use the search box above to find files
      </p>
    </div>
  );
};

export default EmptyState;
