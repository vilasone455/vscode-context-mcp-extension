import React from 'react';

const EmptyState: React.FC = (): React.ReactElement => {
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
    </div>
  );
};

export default EmptyState;
