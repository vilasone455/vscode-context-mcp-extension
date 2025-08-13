// Quick Test Script for VS Code Context MCP Extension
// This file helps you quickly test edit operations without switching Claude chats

// ============================================
// COPY ANY OF THESE TEST CASES TO TEST
// ============================================

// TEST 1: Simple Insert After
const test1 = {
  "filePath": "animal.js",
  "shortComment": "Add play method",
  "edits": [{
    "action_type": "insert-after",
    "match_type": "symbol",
    "symbolName": "celebrateBirthday",
    "newText": `
    // Method for playing
    play(activity = 'fetch') {
        if (this.hunger > 80) {
            return \`\${this.name} is too hungry to play!\`;
        }
        return \`\${this.name} is playing \${activity}!\`;
    }`
  }]
};

// TEST 2: Replace + Insert (Tests Overlap Fix)
const test2 = {
  "filePath": "animal.js",
  "shortComment": "Fix birthday and add methods",
  "edits": [
    {
      "action_type": "replace",
      "match_type": "symbol",
      "symbolName": "celebrateBirthday",
      "newText": `    celebrateBirthday() {
        this.age++;
        return \`Happy birthday! \${this.name} is now \${this.age} years old.\`;
    }`
    },
    {
      "action_type": "insert-after",
      "match_type": "symbol",
      "symbolName": "celebrateBirthday",
      "newText": `

    feed(food = null) {
        const foodToGive = food || this.favoriteFood;
        this.hunger = Math.max(0, this.hunger - 30);
        return \`\${this.name} ate \${foodToGive}!\`;
    }`
    }
  ]
};

// TEST 3: Multiple Replacements
const test3 = {
  "filePath": "animal.js",
  "shortComment": "Update multiple methods",
  "edits": [
    {
      "action_type": "replace",
      "match_type": "symbol",
      "symbolName": "getInfo",
      "newText": `    getInfo() {
        return \`\${this.name}: \${this.age}yo \${this.species}\`;
    }`
    },
    {
      "action_type": "replace",
      "match_type": "symbol",
      "symbolName": "introduce",
      "newText": `    introduce() {
        return \`Hi! I'm \${this.name}!\`;
    }`
    }
  ]
};

// ============================================
// TO USE: 
// 1. Copy one of the test objects above
// 2. Use it with the modify_file MCP tool
// 3. Check the UI for proper highlighting and buttons
// ============================================

console.log("Test configurations loaded!");
console.log("Available tests: test1, test2, test3");
console.log("\nTo use in Claude:");
console.log("1. Copy a test object (e.g., test2)");
console.log("2. Ask Claude to 'apply this edit using modify_file tool'");
console.log("3. Paste the test object");

// Export for potential automated testing
if (typeof module !== 'undefined') {
  module.exports = { test1, test2, test3 };
}
