class Animal {
    constructor(name, species, age = 0) {
        this.name = name;
        this.species = species;
        this.age = age;
        this.hunger = 50;
        this.favoriteFood = 'kibble';
    }

    getInfo() {
        return `Name: ${this.name}, Species: ${this.species}, Age: ${this.age}`;
    }

    eat(food) {
        console.log(`${this.name} is eating ${food}`);
        this.hunger = Math.max(0, this.hunger - 25);
    }

    celebrateBirthday() {
        this.age++;
        return `Happy birthday to ${this.name}! Now ${this.age} years old.`;
    }
}

module.exports = Animal;
