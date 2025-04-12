/**
 * Type definitions for VS Code's webview API
 */

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};
