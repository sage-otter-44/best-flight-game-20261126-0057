// Ridge Runner — Alpine Courier: seeded randomness and smooth value noise.
// The terrain, fields, clouds and ring wobble all come from here, so one seed
// rebuilds the same valley every time and the staged screenshots are stable.

/** A small deterministic PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D value noise: a lattice of random heights, bilinearly smoothed. */
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
  const lattice = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lattice[i] = rand();

  const fade = (t) => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = xi & 255;
    const y0 = yi & 255;
    const x1 = (xi + 1) & 255;
    const y1 = (yi + 1) & 255;
    const a = lattice[perm[(perm[x0] + y0) & 255]];
    const b = lattice[perm[(perm[x1] + y0) & 255]];
    const c = lattice[perm[(perm[x0] + y1) & 255]];
    const d = lattice[perm[(perm[x1] + y1) & 255]];
    const u = fade(xf);
    const v = fade(yf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  /** Fractal noise: three octaves, roughly -1..1. */
  function fbm(x, y) {
    return noise(x, y) * 0.55 + noise(x * 2.1 + 7.3, y * 2.1 + 3.1) * 0.3 + noise(x * 4.3 + 13.7, y * 4.3 + 9.2) * 0.15;
  }
  return { noise, fbm };
}

/** Deterministic pick from an array by index. */
export function pick(rand, array) {
  return array[Math.floor(rand() * array.length) % array.length];
}
