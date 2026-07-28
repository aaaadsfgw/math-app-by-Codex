export class MemoryLocalStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  clear() {
    this.#values.clear();
  }

  dump() {
    return Object.fromEntries(this.#values);
  }
}

export function installStorageFixture() {
  const previousLocalStorage = globalThis.localStorage;
  const previousChrome = globalThis.chrome;
  const localStorage = new MemoryLocalStorage();
  globalThis.localStorage = localStorage;
  Reflect.deleteProperty(globalThis, "chrome");

  return {
    localStorage,
    restore() {
      if (previousLocalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
      else globalThis.localStorage = previousLocalStorage;
      if (previousChrome === undefined) Reflect.deleteProperty(globalThis, "chrome");
      else globalThis.chrome = previousChrome;
    },
  };
}

export function historyInput(overrides = {}) {
  return {
    question: "2x + 3 = 11",
    mode: "answer",
    output: "x=4",
    finalAnswer: "x=4",
    category: "一次方程式",
    solverId: "linear-equation",
    verified: true,
    verificationType: "solver",
    verificationMessage: "x=4を代入すると成立",
    selfAssessment: "answer_seen",
    source: "popup",
    ...overrides,
  };
}
