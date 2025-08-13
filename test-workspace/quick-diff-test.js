/**
 * Quick test for the exact diff case we're testing
 */

// Test the exact case from our test
const original = "return `Hello, I'm ${this.name} and I'm a ${this.species}!`;";
const newText = "return `Hi there! I'm ${this.name}, a happy ${this.species}!`;";

console.log('🧪 Quick Diff Test');
console.log('Original:', `"${original}"`);
console.log('New:     ', `"${newText}"`);

// Simple diff function
function findCommonParts(str1, str2) {
  // Find common prefix
  let prefixLength = 0;
  const minLength = Math.min(str1.length, str2.length);
  
  while (prefixLength < minLength && str1[prefixLength] === str2[prefixLength]) {
    prefixLength++;
  }
  
  // Find common suffix
  let suffixLength = 0;
  const remaining1 = str1.length - prefixLength;
  const remaining2 = str2.length - prefixLength;
  const maxSuffixLength = Math.min(remaining1, remaining2);
  
  while (suffixLength < maxSuffixLength && 
         str1[str1.length - 1 - suffixLength] === str2[str2.length - 1 - suffixLength]) {
    suffixLength++;
  }
  
  const prefix = str1.substring(0, prefixLength);
  const suffix = str1.substring(str1.length - suffixLength);
  const originalMiddle = str1.substring(prefixLength, str1.length - suffixLength);
  const newMiddle = str2.substring(prefixLength, str2.length - suffixLength);
  
  return { prefix, suffix, originalMiddle, newMiddle };
}

const result = findCommonParts(original, newText);

console.log('\n🔍 Diff Analysis:');
console.log('Prefix:     ', `"${result.prefix}"`);
console.log('Deleted:    ', `"${result.originalMiddle}"`);
console.log('Added:      ', `"${result.newMiddle}"`);
console.log('Suffix:     ', `"${result.suffix}"`);

console.log('\n🎨 Expected Highlighting:');
if (result.prefix) console.log('  No highlight: ', `"${result.prefix}"`);
if (result.originalMiddle) console.log('  🔴 RED:      ', `"${result.originalMiddle}"`);
if (result.newMiddle) console.log('  🟢 GREEN:    ', `"${result.newMiddle}"`);
if (result.suffix) console.log('  No highlight: ', `"${result.suffix}"`);

console.log('\n✅ Test complete!');
