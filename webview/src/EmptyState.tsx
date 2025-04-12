import React from 'react';

const EmptyState: React.FC = (): React.ReactElement => {
  console.log('Rendering EmptyState component');
  return (
    <div className="empty-state">
      <h3>No Context Files</h3>
      <p>
        Use keyboard shortcuts to add files:
      </p>
      <div style={{ textAlign: 'left', fontSize: 'smaller' }}>
        <div><strong>Ctrl+L</strong>: Add current file</div>
        <div><strong>Ctrl+I</strong>: Add selected code</div>
      </div>
      <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
        Or type in the search box above to find and add files
      </p>
    </div>
  );
};

export default EmptyState;
