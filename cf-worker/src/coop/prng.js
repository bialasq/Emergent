/** Deterministic PRNG for dungeon + combat (not Python-identical, stable per Worker room). */
export class Prng {
  /** @param {number} seed */
  constructor(seed) {
    this.s = seed >>> 0;
  }
  random() {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  /** inclusive a,b */
  int(a, b) {
    return a + Math.floor(this.random() * (b - a + 1));
  }
  choice(arr) {
    return arr[Math.floor(this.random() * arr.length)];
  }
}
