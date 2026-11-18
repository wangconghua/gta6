// A tiny seeded random generator (mulberry32) so the city, traffic and every
// screenshot scene are the same on every run for the same seed.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] from `rng`. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max) from `rng`. */
export function randFloat(rng, min, max) {
  return min + rng() * (max - min);
}

/** One element of `list`, from `rng`. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
