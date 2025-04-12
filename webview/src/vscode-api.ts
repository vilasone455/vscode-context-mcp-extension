/**
 * Safe wrapper for acquiring and using the VS Code API
 */

interface VSCodeAPI {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
}

// Singleton instance
let vscodeAPI: VSCodeAPI | null = null;

/**
 * Gets the VS Code API, creating a singleton instance if necessary
 */
export function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeAPI) {
    try {
      // @ts-ignore - acquireVsCodeApi is available in VS Code webview context
      vscodeAPI = acquireVsCodeApi();
      console.log('VS Code API acquired successfully');
    } catch (error) {
      console.error('Failed to acquire VS Code API:', error);
      // Provide a fallback that logs the attempts for debugging
      vscodeAPI = {
        postMessage: (msg: any) => {
          console.warn('Mock VS Code API: postMessage called with:', msg);
          
          // If we're in development, we can dispatch a fake message for initial data
          if (msg.type === 'getContextFiles') {
            window.dispatchEvent(new MessageEvent('message', {
              data: { type: 'updateContextFiles', payload: [] }
            }));
          }
        },
        getState: () => {
          console.warn('Mock VS Code API: getState called');
          return {};
        },
        setState: (state: any) => {
          console.warn('Mock VS Code API: setState called with:', state);
        }
      };
    }
  }
  return vscodeAPI;
}
