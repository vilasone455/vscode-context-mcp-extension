# Project Session Manager

A Visual Studio Code extension that allows you to save and manage your project sessions with context files.

## Features

- Add entire files to your context
- Add specific code selections to your context
- Quickly find and open files in your workspace
- View and manage all your context files in a dedicated sidebar

## Project Structure

```
project-session-manager/
├── dist/                      # Compiled output
├── src/                       # Main source code
│   ├── commands/              # Command implementations
│   ├── models/                # Data models
│   ├── services/              # Business logic services
│   ├── utils/                 # Utility functions
│   ├── webview/               # Webview implementation
│   └── extension.ts           # Main extension entry point
├── webview/                   # Webview frontend
│   ├── dist/                  # Compiled webview output
│   └── src/                   # React webview source files
├── resources/                 # Icons and other resources
└── package.json               # Extension manifest
```

## Development

### Prerequisites

- Node.js and npm
- Visual Studio Code

### Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile the extension and webview

### Development Workflow

1. Make changes to the TypeScript files in `src/` or React components in `webview/src/`
2. Run `npm run watch` to automatically compile changes
3. Press F5 in VS Code to launch the extension in debug mode

## Building

To build the extension for production:

```
npm run build
```

This will compile both the extension and webview.

## Architecture

The extension follows SOLID principles:

- **Single Responsibility**: Each class and module has a specific purpose
- **Open/Closed**: Components are designed to be extended without modification
- **Liskov Substitution**: Types are substitutable for their base types
- **Interface Segregation**: Interfaces are specific to client needs
- **Dependency Inversion**: High-level modules depend on abstractions

## License

MIT