import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

/**
 * Error boundary component to catch and display React errors
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; errorMessage: string } {
    return { hasError: true, errorMessage: error.message || 'Unknown error occurred' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('React Error:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '16px', color: 'var(--vscode-errorForeground, red)' }}>
          <h3>Something went wrong</h3>
          <p>{this.state.errorMessage}</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Initialize the React application
 */
function initApp(): void {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.error('Root element not found!');
    document.body.innerHTML = '<div style="color:red;padding:20px;">Error: Root element not found</div>';
    return;
  }
  
  ReactDOM.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    rootElement
  );
  
  console.log('React app mounted successfully');
}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready, initializing React app');
  try {
    initApp();
  } catch (error: unknown) {
    console.error('Failed to initialize app:', error);
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    document.body.innerHTML = `
      <div style="color:red;padding:20px;">
        <h3>Failed to initialize application</h3>
        <p>${errorMessage}</p>
        <button onclick="window.location.reload()">Try Again</button>
      </div>
    `;
  }
});
