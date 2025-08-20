const fs = require('fs');
const path = require('path');

export async function cleanTestFile() {
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
        console.log("clean test file");
        const extensionPath = path.resolve(__dirname, '../test-workspace');
        const filePath = path.join(extensionPath, 'animal.js');
        fs.writeFileSync(filePath, originalContent, 'utf8');
    } catch (error:any) {
      console.error('❌ Failed to reset file:', error.message);
    }
  }