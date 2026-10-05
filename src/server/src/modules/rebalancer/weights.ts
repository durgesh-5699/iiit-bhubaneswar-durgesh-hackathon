/** Pure weight maths for Module A. No I/O, easy to test. */
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const turnoverOf = (a: number[], b: number[]) => 0.5 * sum(a.map((x, i) => Math.abs(x - b[i])));

/**
 * Scales `w` by a single factor and clamps every weight into [lo, hi] so that the weights sum to exactly 1.
 * Solved by bisection on the scale factor (sum of clamped values is monotone in it). Needs n*lo <= 1 <= n*hi.
 */
export function applyCaps(w: number[], lo: number, hi: number): number[] {
  const clampSum = (k: number) => sum(w.map((v) => Math.min(hi, Math.max(lo, v * k))));
  let a = 0, b = 1;
  while (clampSum(b) < 1 && b < 1e12) b *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (a + b) / 2;
    if (clampSum(mid) < 1) a = mid; else b = mid;
  }
  const out = w.map((v) => Math.min(hi, Math.max(lo, v * b)));
  const total = sum(out);
  return out.map((v) => v / total); // removes the last ~1e-15 of bisection error
}

/** Multiplicative tilt: positive score -> weight up, negative -> weight down, then caps. */
export function targetWeights(scores: number[], base: number[], tilt: number, lo: number, hi: number): number[] {
  return applyCaps(scores.map((s, i) => base[i] * Math.exp(tilt * s)), lo, hi);
}

/** Moves a fraction `alpha` of the way to the target, and never trades more than `maxTurnover` (one-way) in a day. */
export function stepToward(current: number[], target: number[], alpha: number, maxTurnover: number, lo: number, hi: number): number[] {
  let moved = current.map((c, i) => c + alpha * (target[i] - c));
  const t = turnoverOf(current, moved);
  if (t > maxTurnover) {
    const k = maxTurnover / t;
    moved = current.map((c, i) => c + k * (moved[i] - c));
  }
  return applyCaps(moved, lo, hi);
}
