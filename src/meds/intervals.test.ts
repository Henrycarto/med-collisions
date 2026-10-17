import { describe, expect, it } from 'vitest';
import { gaps, intersect, merge, subtract, total } from './intervals';

describe('intervals', () => {
  it('merge overlapping and touching intervals, drop empty ones', () => {
    expect(merge([[5, 8], [1, 3], [3, 4], [7, 10], [12, 12]])).toEqual([[1, 4], [5, 10]]);
  });
  it('intersect two sets', () => {
    expect(intersect([[0, 10], [20, 30]], [[5, 25]])).toEqual([[5, 10], [20, 25]]);
    expect(intersect([[0, 10]], [[10, 20]])).toEqual([]);
  });
  it('subtract one set from another', () => {
    expect(subtract([[0, 10]], [[2, 4], [6, 12]])).toEqual([[0, 2], [4, 6]]);
    expect(subtract([[0, 10]], [[-5, 15]])).toEqual([]);
  });
  it('measure total length and the gaps inside a window', () => {
    expect(total([[0, 10], [5, 15], [20, 25]])).toBe(20);
    expect(gaps([[0, 4], [6, 10]], 0, 12)).toEqual([[4, 6], [10, 12]]);
  });
});
