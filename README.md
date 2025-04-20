# Project Session Manager

A Visual Studio Code extension that enables developers to efficiently manage project context by storing and organizing relevant files and code snippets. This extension helps maintain context when working on complex projects, making it easier to switch between tasks while preserving important references.

## Features

### Context Management
- **Add Files to Context**: Quickly add entire files to your current session with `Ctrl+L` (Cmd+L on macOS)
- **Add Code Selections**: Capture specific code snippets with `Ctrl+I` (Cmd+I on macOS)
- **Terminal Integration**: Access terminal content directly from your session
- **Context Explorer**: View and manage all context files in a dedicated sidebar

### REST API Integration
The extension provides a REST API server running on port 4569, allowing external tools to integrate with your VS Code environment:

- Get project path information
- Access currently open files and their content
- Retrieve terminal outputs
- View project diagnostics (errors and warnings)
- Manage session context via HTTP endpoints

## Installation

1. Download the `.vsix` file from the [releases page](https://github.com/vilasone455/vscode-project-context-mcp/releases)
2. In VS Code, go to the Extensions view (Ctrl+Shift+X)
3. Click on the "..." in the top right of the Extensions view
4. Select "Install from VSIX..." and choose the downloaded file
5. Reload VS Code when prompted

## Getting Started

1. Open your project in VS Code
2. Navigate to the Project Session Manager sidebar icon in the Activity Bar
3. Use keyboard shortcuts to add files or code snippets to your context:
   - `Ctrl+L` (Cmd+L on macOS): Add the current file to context
   - `Ctrl+I` (Cmd+I on macOS): Add selected code to context
4. View and manage your context files in the sidebar

## REST API Reference

The extension runs a local REST API server on port 4569 with the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/project-path` | GET | Get the current project path |
| `/current-file` | GET | Get details of the currently active file |
| `/open-tabs` | GET | Get a list of all open tabs in the editor |
| `/problems` | GET | Get all diagnostic problems (errors, warnings) |
| `/session-context` | GET | Get the current session context |
| `/get-file-list-and-clear` | GET | Retrieve and clear the current file list |
| `/terminal-content` | GET | Get the current terminal content |
| `/shutdown` | POST | Gracefully shut down the API server |

### API Examples

#### Get Current File Information
```
GET http://localhost:4569/current-file
```

Response:
```json
{
  "fileName": "c:\\Projects\\example\\src\\index.js",
  "languageId": "javascript",
  "lineCount": 42,
  "uri": "file:///c%3A/Projects/example/src/index.js",
  "isDirty": false,
  "isUntitled": false,
  "content": "// File content here..."
}
```

#### Get Open Editor Tabs
```
GET http://localhost:4569/open-tabs
```

Response:
```json
{
  "openTabs": [
    {
      "fileName": "c:\\Projects\\example\\src\\index.js",
      "languageId": "javascript",
      "uri": "file:///c%3A/Projects/example/src/index.js",
      "isActive": true,
      "isDirty": false,
      "isUntitled": false
    },
    {
      "fileName": "c:\\Projects\\example\\package.json",
      "languageId": "json",
      "uri": "file:///c%3A/Projects/example/package.json",
      "isActive": false,
      "isDirty": true,
      "isUntitled": false
    }
  ]
}
```





## Development

### Prerequisites

- Node.js (v14+) and npm
- Visual Studio Code

### Setup

1. Clone the repository
```
git clone https://github.com/vilasone455/vscode-project-context-mcp.git
cd project-session-manager
```

2. Install dependencies
```
npm install
```

3. Build the extension
```
npm run build
```

### Development Workflow

1. Start the watch process to automatically compile changes:
```
npm run watch
```

2. Press F5 in VS Code to launch the extension in debug mode

3. Make changes to the code

4. To package the extension for distribution:
```
vsce package
```



## Troubleshooting

- **Port Conflicts**: If you see an error about port 4569 being in use, you may have another instance of the extension running. Restart VS Code to resolve this.




## License

This project is licensed under the MIT License - see the LICENSE file for details.