import { describe, expect, it } from 'vitest';
import { curb65 } from './curb65';

const well = { confused: false, urea: 5, respRate: 16, systolic: 130, diastolic: 80, age: 50 };

describe('CURB-65', () => {
  it('scores nothing for a well 50-year-old', () => {
    expect(curb65(well)).toMatchObject({ total: 0, severity: 'low', criteria: [] });
  });

  it('counts each criterion at its threshold, from both sides', () => {
    expect(curb65({ ...well, urea: 7 }).total).toBe(0);
    expect(curb65({ ...well, urea: 7.1 }).total).toBe(1);
    expect(curb65({ ...well, respRate: 29 }).total).toBe(0);
    expect(curb65({ ...well, respRate: 30 }).total).toBe(1);
    expect(curb65({ ...well, systolic: 90 }).total).toBe(0);
    expect(curb65({ ...well, systolic: 89 }).total).toBe(1);
    expect(curb65({ ...well, diastolic: 61 }).total).toBe(0);
    expect(curb65({ ...well, diastolic: 60 }).total).toBe(1);
    expect(curb65({ ...well, age: 64 }).total).toBe(0);
    expect(curb65({ ...well, age: 65 }).total).toBe(1);
    expect(curb65({ ...well, confused: true }).total).toBe(1);
  });

  it('counts low blood pressure once even when both readings are low', () => {
    expect(curb65({ ...well, systolic: 85, diastolic: 50 }).total).toBe(1);
  });

  it('bands severity: 0 to 1 low, 2 moderate, 3 or more high', () => {
    expect(curb65({ ...well, age: 70 }).severity).toBe('low');
    expect(curb65({ ...well, age: 70, urea: 9 }).severity).toBe('moderate');
    expect(curb65({ ...well, age: 70, urea: 9, confused: true }).severity).toBe('high');
  });

  it('scores as CRB-65 when urea has not been measured', () => {
    const r = curb65({ ...well, urea: null, age: 80 });
    expect(r).toMatchObject({ total: 1, measuredUrea: false });
  });
});
