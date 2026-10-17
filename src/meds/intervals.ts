/** Half-open time intervals [start, end) in minutes, and the set operations the collision rules need. */

export type Interval = readonly [number, number];

export function merge(xs: readonly Interval[]): Interval[] {
  const sorted = xs.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [s1, e1] of merge(a)) {
    for (const [s2, e2] of merge(b)) {
      const s = Math.max(s1, s2);
      const e = Math.min(e1, e2);
      if (e > s) out.push([s, e]);
    }
  }
  return merge(out);
}

/** The parts of a that b does not cover. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  let rest = merge(a);
  for (const [bs, be] of merge(b)) {
    rest = rest.flatMap(([s, e]): Interval[] => {
      if (be <= s || bs >= e) return [[s, e]];
      const parts: Interval[] = [];
      if (bs > s) parts.push([s, bs]);
      if (be < e) parts.push([be, e]);
      return parts;
    });
  }
  return rest;
}

export const total = (xs: readonly Interval[]): number => merge(xs).reduce((a, [s, e]) => a + (e - s), 0);

/** Gaps between the merged intervals, inside [from, to). */
export function gaps(xs: readonly Interval[], from: number, to: number): Interval[] {
  return subtract([[from, to]], xs);
}
