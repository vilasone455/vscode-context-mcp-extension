# 🧪 Change Tracking Test Suite

This folder contains automated testing tools for the **Change Tracking approve/reject functionality**.

## 🚀 Quick Start

```bash
# 1. Start Extension Development Host
# Press F5 in main VSCode window

# 2. Navigate to test workspace
cd test-workspace

# 3. Run tests
node test-executor.js list          # See all available tests
node test-executor.js run "Change Tracking - Addition Test"
node test-executor.js run-all       # Run all tests interactively
```

## 📋 Test Categories

### 🔧 **Basic Edit Tests** (Original)
- Simple Insert After
- Replace and Insert  
- Multiple Modifications
- Line-based Edit
- String Replace

### 🎯 **Change Tracking Tests** (NEW!)
- **Addition Test** - Green decoration with + icon
- **Deletion Test** - Red decoration with - icon  
- **Modification Test** - Yellow decoration with ~ icon
- **Multiple Changes** - Test mixed approve/reject workflow

### 🔥 **Diff Highlighting Tests** (NEW!)
- **Mixed Change** - Shows both green (additions) and red (deletions) in same change
- **Complex Modification** - Tests character-level diff highlighting
- **Addition Only** - Pure green highlighting for new content
- **Deletion Only** - Pure red highlighting for removed content
- **Multi-line Mixed** - Tests diff highlighting across multiple lines

## 🎯 Manual Testing Workflow

1. **Execute test**: `node test-executor.js run "Change Tracking - Addition Test"`
2. **Check VSCode editor** for visual decorations:
   - 🟢 Green background = Addition (+)
   - 🔴 Red background = Deletion (-)
   - 🟡 Yellow background = Modification (~)
   - 🔥 **NEW: Mixed highlighting** = Shows both green and red parts in same change
3. **Look for CodeLens buttons** above the changes
4. **Click Accept** ✅ or **Reject** ❌ 
5. **Verify behavior**:
   - Accept: Changes stay, decorations disappear
   - Reject: Changes reverted, decorations disappear

## 📁 Files

- **`test-executor.js`** - Automated test runner that makes HTTP calls to MCP server
- **`test-edits.json`** - Test scenario definitions (now includes change tracking tests)
- **`animal.js`** - Test file that gets modified
- **`test-runner.js`** - Legacy manual test objects

## 🎯 Testing Checklist

When testing change tracking, verify:

- [ ] **Visual decorations appear** with correct colors
- [ ] **🔥 NEW: Diff highlighting works** - mixed changes show both green and red parts
- [ ] **Gutter icons show** (+, -, ~) 
- [ ] **CodeLens buttons appear** above changes
- [ ] **Accept button** keeps changes and removes decorations
- [ ] **Reject button** reverts changes and removes decorations
- [ ] **Multiple changes** can be approved/rejected individually
- [ ] **Persistence** - changes survive Extension Host restart (Ctrl+Shift+F5)

## 🔄 Reset Between Tests

```bash
node test-executor.js reset    # Reset animal.js to original state
```

## 🐛 Troubleshooting

**Server not running?**
- Make sure Extension Development Host is open (F5)
- Check that MCP server is running on port 4569

**No decorations appearing?**
- Verify the test actually applied changes to the file
- Check VS Code Problems panel for errors
- Try restarting Extension Host (Ctrl+Shift+F5)

**CodeLens buttons not showing?**
- Make sure you're viewing the `animal.js` file in the Extension Host window
- Try `Ctrl+Shift+P` → "Developer: Reload Window"

---

🎉 **Happy Testing!** You now have automated tools to thoroughly test the change tracking approve/reject workflow.
