// Test file to demonstrate symbol scope in VSCode
// This will help us understand what gets indexed as symbols

// ===== TOP-LEVEL SYMBOLS (SHOULD BE INDEXED) =====
const TOP_LEVEL_CONST = "This is a top-level constant";
let topLevelVariable = "This is a top-level variable";
var oldStyleVariable = "This is an old-style var";

interface TopLevelInterface {
  name: string;
  value: number;
}

type TopLevelType = {
  id: string;
  data: any;
};

enum TopLevelEnum {
  VALUE_ONE = "one",
  VALUE_TWO = "two"
}

class TopLevelClass {
  // ===== CLASS MEMBER SYMBOLS (SHOULD BE INDEXED) =====
  private classProperty: string = "Class property";
  public publicField: number = 42;
  readonly readonlyField: boolean = true;
  
  constructor(initialValue: string) {
    // ===== LOCAL VARIABLES (PROBABLY NOT INDEXED) =====
    const localInConstructor = "Local variable in constructor";
    let anotherLocal = initialValue;
    
    this.classProperty = anotherLocal;
  }
  
  // ===== CLASS METHOD SYMBOLS (SHOULD BE INDEXED) =====
  public classMethod(param1: string, param2: number): string {
    // ===== LOCAL VARIABLES INSIDE METHODS (PROBABLY NOT INDEXED) =====
    const localConstant = "Local to method";
    let localVariable = param1 + param2.toString();
    var functionScopedVar = "Function scoped";
    
    // ===== NESTED FUNCTION (MIGHT BE INDEXED) =====
    function innerFunction(innerParam: string): void {
      // ===== DEEPLY NESTED LOCAL VARIABLES (DEFINITELY NOT INDEXED) =====
      const veryLocalVariable = "Very local";
      let anotherVeryLocal = innerParam + veryLocalVariable;
      
      console.log(anotherVeryLocal);
    }
    
    // ===== ARROW FUNCTION (MIGHT BE INDEXED IF ASSIGNED) =====
    const arrowFunction = (arrowParam: number) => {
      // ===== LOCAL VARIABLES IN ARROW FUNCTION (NOT INDEXED) =====
      const localInArrow = arrowParam * 2;
      return localInArrow;
    };
    
    // ===== LOOP VARIABLES (NOT INDEXED) =====
    for (let i = 0; i < 10; i++) {
      const loopLocal = `Iteration ${i}`;
      console.log(loopLocal);
    }
    
    // ===== BLOCK SCOPED VARIABLES (NOT INDEXED) =====
    if (true) {
      const blockScoped = "Block scoped variable";
      let anotherBlockScoped = blockScoped;
    }
    
    innerFunction(localVariable);
    return arrowFunction(42).toString();
  }
  
  // ===== GETTER/SETTER (SHOULD BE INDEXED) =====
  get computedProperty(): string {
    const getterLocal = "Local in getter"; // NOT INDEXED
    return this.classProperty + getterLocal;
  }
  
  set computedProperty(value: string) {
    const setterLocal = "Local in setter"; // NOT INDEXED
    this.classProperty = value + setterLocal;
  }
}

// ===== TOP-LEVEL FUNCTION (SHOULD BE INDEXED) =====
function topLevelFunction(functionParam: string): void {
  // ===== FUNCTION PARAMETERS (USUALLY NOT INDEXED) =====
  // ===== LOCAL VARIABLES IN FUNCTION (NOT INDEXED) =====
  const localInFunction = "Local variable in function";
  let mutableLocal = functionParam + localInFunction;
  
  // ===== NESTED OBJECT WITH PROPERTIES (NOT INDEXED AS SEPARATE SYMBOLS) =====
  const complexObject = {
    property1: "value1",
    property2: {
      nestedProp: "nested value",
      deeplyNested: {
        veryDeep: "very deep value"
      }
    },
    method: function(param: any) {
      const methodLocal = param;
      return methodLocal;
    }
  };
  
  console.log(mutableLocal, complexObject);
}

// ===== NAMESPACE (SHOULD BE INDEXED) =====
namespace TestNamespace {
  // ===== NAMESPACE MEMBERS (SHOULD BE INDEXED) =====
  export const NAMESPACE_CONSTANT = "Constant in namespace";
  export let namespaceVariable = "Variable in namespace";
  
  export function namespaceFunction(): void {
    // ===== LOCAL VARIABLES IN NAMESPACE FUNCTION (NOT INDEXED) =====
    const localInNamespaceFunction = "Local in namespace function";
    console.log(localInNamespaceFunction);
  }
  
  export class NamespaceClass {
    // ===== NESTED CLASS MEMBERS (SHOULD BE INDEXED) =====
    private nestedProperty: string = "Nested class property";
    
    public nestedMethod(): string {
      // ===== LOCAL VARIABLES IN NESTED CLASS (NOT INDEXED) =====
      const localInNestedMethod = "Local in nested method";
      return this.nestedProperty + localInNestedMethod;
    }
  }
}

// ===== MODULE-LEVEL EXPORT (SHOULD BE INDEXED) =====
export const EXPORTED_CONSTANT = "This is exported";
export { topLevelFunction as renamedFunction };

// ===== DEFAULT EXPORT (SHOULD BE INDEXED) =====
export default class DefaultExportClass {
  defaultProperty: string = "Default export class property";
  
  defaultMethod(): void {
    // ===== LOCAL IN DEFAULT EXPORT (NOT INDEXED) =====
    const localInDefault = "Local in default export";
    console.log(localInDefault);
  }
}
