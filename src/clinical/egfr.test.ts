import { describe, expect, it } from 'vitest';
import { egfr } from './egfr';

// Reference values worked by hand from the CKD-EPI 2021 equation.
describe('eGFR, CKD-EPI 2021', () => {
  it('matches hand-worked values for women and men', () => {
    expect(egfr(88.4, 50, 'F')).toBeCloseTo(68.6, 0); // 1.0 mg/dL
    expect(egfr(108, 71, 'F')).toBeCloseTo(47.4, 0); // Margarete at 01:10
    expect(egfr(88.4, 50, 'M')).toBeCloseTo(92.0, 0);
  });

  it('uses the low-creatinine branch below kappa', () => {
    // below 0.7 mg/dL for women the exponent is -0.241, so eGFR rises slowly
    const a = egfr(50, 40, 'F');
    const b = egfr(55, 40, 'F');
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBeLessThan(5);
  });

  it('falls as creatinine and age rise', () => {
    expect(egfr(200, 71, 'F')).toBeLessThan(30);
    expect(egfr(108, 80, 'F')).toBeLessThan(egfr(108, 60, 'F'));
  });
});
