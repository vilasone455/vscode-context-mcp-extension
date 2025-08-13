const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');  // 📦 install this: `npm i -D terser-webpack-plugin`

const extensionConfig = {
  mode: 'production',      // ensure we’re actually minifying
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'source-map',
  externals: { vscode: 'commonjs vscode' },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      { test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,   // don’t yank comments to a separate file
        terserOptions: {
          format: {
            // only strip comments *not* matching @openapi
            comments: /@openapi/i  
          }
        }
      })
    ]
  }
};

// Configuration for webview
const webviewConfig = {
  target: 'web',
  entry: './webview/src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'webview/dist'),
    filename: 'bundle.js'
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};

module.exports = [extensionConfig, webviewConfig];