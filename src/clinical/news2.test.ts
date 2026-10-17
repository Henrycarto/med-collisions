import { describe, expect, it } from 'vitest';
import { pulsePoints, respRatePoints, score, spo2Scale1Points, spo2Scale2Points, systolicPoints, tempPoints, type Observation } from './news2';

// Band edges straight from the RCP NEWS2 chart, both sides of every boundary.
describe('NEWS2 parameter bands', () => {
  it.each([[8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3]])('respiration %i -> %i', (v, p) => expect(respRatePoints(v)).toBe(p));
  it.each([[91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0]])('SpO2 scale 1 %i -> %i', (v, p) => expect(spo2Scale1Points(v)).toBe(p));
  it.each([[90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3]])('systolic %i -> %i', (v, p) => expect(systolicPoints(v)).toBe(p));
  it.each([[40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3]])('pulse %i -> %i', (v, p) => expect(pulsePoints(v)).toBe(p));
  it.each([[35.0, 3], [35.1, 1], [36.0, 1], [36.1, 0], [38.0, 0], [38.1, 1], [39.0, 1], [39.1, 2]])('temperature %f -> %i', (v, p) => expect(tempPoints(v)).toBe(p));

  it('SpO2 scale 2 scores high saturations only when on oxygen', () => {
    expect([83, 84, 85, 86, 87, 88, 92].map((s) => spo2Scale2Points(s, true))).toEqual([3, 2, 2, 1, 1, 0, 0]);
    expect([93, 94, 95, 96, 97].map((s) => spo2Scale2Points(s, true))).toEqual([1, 1, 2, 2, 3]);
    expect(spo2Scale2Points(97, false)).toBe(0);
  });
});

const normal: Observation = { respRate: 16, spo2: 97, onOxygen: false, systolic: 125, pulse: 72, consciousness: 'alert', temp: 36.8 };

describe('NEWS2 aggregate and risk', () => {
  it('a normal set scores 0', () => {
    const s = score(normal);
    expect(s.total).toBe(0);
    expect(s.frequency).toMatch(/12 hours/);
  });

  it('a single red score makes the risk low-medium even when the total is low', () => {
    const s = score({ ...normal, pulse: 135 });
    expect(s.total).toBe(3);
    expect(s.risk).toBe('low-medium');
  });

  it('new confusion alone scores 3', () => {
    expect(score({ ...normal, consciousness: 'new-confusion' }).points.consciousness).toBe(3);
  });

  it('5 to 6 is medium, 7 or more is high', () => {
    expect(score({ ...normal, respRate: 22, onOxygen: true, temp: 38.5 }).risk).toBe('medium'); // 2+2+1
    expect(score({ ...normal, respRate: 26, spo2: 91, onOxygen: true, pulse: 115 }).total).toBe(10);
    expect(score({ ...normal, respRate: 26, spo2: 91, onOxygen: true, pulse: 115 }).risk).toBe('high');
  });

  it('a COPD patient at target on scale 2 scores only for the oxygen', () => {
    const o = { ...normal, spo2: 90, onOxygen: true };
    expect(score(o, 2).total).toBe(2);
    expect(score(o, 1).total).toBe(5); // the same patient on the wrong scale would trigger an urgent response
  });
});
