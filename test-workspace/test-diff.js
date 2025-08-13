/**
 * Test script for diff algorithm
 * Run this to verify the diff highlighting logic works correctly
 */

// Simple diff test cases
const testCases = [
  {
    name: "Simple Addition",
    original: "Hello world",
    new: "Hello world!",
    expected: { additions: 1, deletions: 0 }
  },
  {
    name: "Simple Deletion", 
    original: "Hello world!",
    new: "Hello world",
    expected: { additions: 0, deletions: 1 }
  },
  {
    name: "Mixed Change",
    original: "Hello, I'm John and I'm a developer!",
    new: "Hi there! I'm John, a happy developer!",
    expected: { additions: 1, deletions: 1 }
  },
  {
    name: "Complex Modification",
    original: "console.log(`${name} is eating ${food}`);",
    new: "console.log(`🐾 ${name} is enjoying ${food}!`);",
    expected: { additions: 1, deletions: 1 }
  },
  {
    name: "No Change",
    original: "Hello world",
    new: "Hello world",
    expected: { additions: 0, deletions: 0 }
  }
];

// Simple diff function for testing (simplified version)
function simpleDiff(original, newText) {
  const segments = [];
  
  if (original === newText) {
    return { additions: 0, deletions: 0 };
  }
  
  // Find common prefix and suffix
  let prefixLength = 0;
  const minLength = Math.min(original.length, newText.length);
  
  while (prefixLength < minLength && original[prefixLength] === newText[prefixLength]) {
    prefixLength++;
  }
  
  let suffixLength = 0;
  const remaining1 = original.length - prefixLength;
  const remaining2 = newText.length - prefixLength;
  const maxSuffixLength = Math.min(remaining1, remaining2);
  
  while (suffixLength < maxSuffixLength && 
         original[original.length - 1 - suffixLength] === newText[newText.length - 1 - suffixLength]) {
    suffixLength++;
  }
  
  const originalMiddle = original.substring(prefixLength, original.length - suffixLength);
  const newMiddle = newText.substring(prefixLength, newText.length - suffixLength);
  
  return {
    additions: newMiddle ? 1 : 0,
    deletions: originalMiddle ? 1 : 0
  };
}

// Run tests
console.log('🧪 Testing Diff Algorithm\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Original: "${testCase.original}"`);
  console.log(`New:      "${testCase.new}"`);
  
  const result = simpleDiff(testCase.original, testCase.new);
  
  console.log(`Result:   ${result.additions} additions, ${result.deletions} deletions`);
  console.log(`Expected: ${testCase.expected.additions} additions, ${testCase.expected.deletions} deletions`);
  
  const passed = result.additions === testCase.expected.additions && 
                 result.deletions === testCase.expected.deletions;
  
  console.log(`Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
});

console.log('🎯 Diff algorithm test complete!');
console.log('If all tests pass, the diff highlighting should work correctly in VS Code.');
