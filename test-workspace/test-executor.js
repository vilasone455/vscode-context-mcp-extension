#!/usr/bin/env node

/**
 * Change Tracking Test Executor
 * Loads test scenarios and executes them via HTTP calls to MCP server
 * Allows manual testing of approve/reject workflow
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Simple fetch polyfill for Node.js
function fetchPolyfill(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

class ChangeTrackingTestExecutor {
  constructor() {
    this.serverUrl = 'http://localhost:4570';
    this.testScenariosPath = path.join(__dirname, 'test-edits.json');
    this.fetch = typeof fetch !== 'undefined' ? fetch : fetchPolyfill;
  }

  /**
   * Load test scenarios from JSON file
   */
  loadTestScenarios() {
    try {
      const content = fs.readFileSync(this.testScenariosPath, 'utf8');
      const data = JSON.parse(content);
      return data.test_scenarios;
    } catch (error) {
      console.error('❌ Failed to load test scenarios:', error.message);
      return [];
    }
  }

  /**
   * Execute a test scenario by making HTTP call to MCP server
   */
  async executeTestScenario(scenario) {
    console.log(`\n🧪 Executing: ${scenario.name}`);
    console.log(`📝 Description: ${scenario.description}`);
    
    try {
      const response = await this.fetch(`${this.serverUrl}/modify-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: scenario.filePath,
          shortComment: scenario.shortComment,
          edits: scenario.edits
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Test scenario executed successfully!');
        console.log(`📊 Changes applied: ${scenario.edits.length}`);
        
        // Instructions for manual testing
        console.log('\n🎯 MANUAL TESTING STEPS:');
        console.log('1. 👀 Check VSCode editor for visual decorations');
        console.log('   - Green background = Addition (+)');
        console.log('   - Red background = Deletion (-)'); 
        console.log('   - Yellow background = Modification (~)');
        console.log('2. 🔥 NEW: Check for diff-style highlighting:');
        console.log('   - Mixed changes should show BOTH green and red parts');
        console.log('   - Green = new text, Red = deleted text');
        console.log('   - Unchanged parts should have no highlighting');
        console.log('3. 🔍 Look for Accept/Reject buttons above the changes');
        console.log('4. ✅ Click "Accept" to approve changes');
        console.log('5. ❌ Click "Reject" to revert changes');
        console.log('6. 🧹 Verify decorations disappear after action');
        console.log('7. 💾 Check that file content is correct\n');
        
        return result;
      } else {
        const error = await response.text();
        console.error('❌ Failed to execute test:', error);
        return null;
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
      return null;
    }
  }

  /**
   * Reset animal.js to original state AND clear pending changes
   */
  async resetTestFile() {
    const originalContent = `class Animal {
    constructor(name, species, age = 0) {
        this.name = name;
        this.species = species;
        this.age = age;
        this.hunger = 50;
        this.favoriteFood = 'kibble';
    }

    getInfo() {
        return \`Name: \${this.name}, Species: \${this.species}, Age: \${this.age}\`;
    }

    eat(food) {
        console.log(\`\${this.name} is eating \${food}\`);
        this.hunger = Math.max(0, this.hunger - 25);
    }

    introduce() {
        return \`Hello, I'm \${this.name} and I'm a \${this.species}!\`;
    }

    celebrateBirthday() {
        this.age++;
        return \`Happy birthday to \${this.name}! Now \${this.age} years old.\`;
    }
}

module.exports = Animal;
`;

    try {
      // Reset file content
      fs.writeFileSync(path.join(__dirname, 'animal.js'), originalContent, 'utf8');
      console.log('🔄 Reset animal.js to original state');
      
      // 🔥 CLEAR PENDING CHANGES via API call
      try {
        const clearResponse = await this.fetch(`${this.serverUrl}/clear-pending-changes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: 'animal.js' })
        });
        
        if (clearResponse.ok) {
          console.log('🧹 Cleared pending changes');
        } else {
          console.log('⚠️ Could not clear pending changes (server might not support it yet)');
        }
      } catch (clearError) {
        console.log('⚠️ Could not clear pending changes:', clearError.message);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to reset file:', error.message);
      return false;
    }
  }

  /**
   * Execute all test scenarios
   */
  async executeAllTests() {
    const scenarios = this.loadTestScenarios();
    
    if (scenarios.length === 0) {
      console.log('❌ No test scenarios found');
      return;
    }

    console.log(`🚀 Found ${scenarios.length} test scenarios`);
    console.log('⚠️  Each test will apply changes that you need to manually approve/reject\n');

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      
      // Reset file before each test
      await this.resetTestFile();
      
      // Wait for user confirmation before each test
      await this.waitForUserInput(`\nPress Enter to execute "${scenario.name}"...`);
      
      await this.executeTestScenario(scenario);
      
      // Wait before next test to allow manual testing
      if (i < scenarios.length - 1) {
        await this.waitForUserInput('\nPress Enter after testing approve/reject to continue to next test...');
      }
    }

    console.log('\n🎉 All test scenarios completed!');
  }

  /**
   * Execute a specific test by name
   */
  async executeTestByName(testName) {
    const scenarios = this.loadTestScenarios();
    const scenario = scenarios.find(s => s.name === testName);
    
    if (!scenario) {
      console.log(`❌ Test "${testName}" not found`);
      console.log('Available tests:');
      scenarios.forEach(s => console.log(`  - ${s.name}`));
      return;
    }

    // Reset file before test
    await this.resetTestFile();
    await this.executeTestScenario(scenario);
  }

  /**
   * List all available test scenarios
   */
  listTests() {
    const scenarios = this.loadTestScenarios();
    
    console.log('📋 Available Test Scenarios:');
    scenarios.forEach((scenario, index) => {
      console.log(`\n${index + 1}. ${scenario.name}`);
      console.log(`   📝 ${scenario.description}`);
      console.log(`   📄 File: ${scenario.filePath}`);
      console.log(`   🔧 Edits: ${scenario.edits.length}`);
      console.log(`   🎯 Edit types: ${scenario.edits.map(e => e.action_type).join(', ')}`);
    });
  }

  /**
   * Wait for user input (press Enter)
   */
  waitForUserInput(message) {
    return new Promise((resolve) => {
      process.stdout.write(message);
      process.stdin.once('data', () => resolve());
    });
  }

  /**
   * Check if MCP server is running
   */
  async checkServer() {
    try {
      const response = await this.fetch(`${this.serverUrl}/project-path`);
      if (response.ok) {
        console.log('✅ MCP Server is running');
        return true;
      }
    } catch (error) {
      console.error('❌ MCP Server is not running. Start it with F5 in VSCode');
      console.error('   Make sure Extension Development Host is open');
      return false;
    }
  }
}

// CLI Interface
async function main() {
  const executor = new ChangeTrackingTestExecutor();
  const args = process.argv.slice(2);

  // Check if server is running
  const serverRunning = await executor.checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  if (args.length === 0) {
    console.log('🧪 Change Tracking Test Executor');
    console.log('\nUsage:');
    console.log('  node test-executor.js list                 # List all tests');
    console.log('  node test-executor.js run <test-name>      # Run specific test');
    console.log('  node test-executor.js run-all              # Run all tests');
    console.log('  node test-executor.js reset                # Reset animal.js');
    console.log('\nExamples:');
    console.log('  node test-executor.js list');
    console.log('  node test-executor.js run "Simple Insert After"');
    console.log('  node test-executor.js run-all');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'list':
      executor.listTests();
      break;
      
    case 'run':
      if (args[1]) {
        await executor.executeTestByName(args[1]);
      } else {
        console.log('❌ Please specify test name');
        executor.listTests();
      }
      break;
      
    case 'run-all':
      await executor.executeAllTests();
      break;
      
    case 'reset':
      await executor.resetTestFile();
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ChangeTrackingTestExecutor;
