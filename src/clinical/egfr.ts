/**
 * Estimated GFR, CKD-EPI 2021 creatinine equation (race-free; Inker et al., NEJM 2021).
 * Creatinine in µmol/L, result in mL/min/1.73 m².
 */
export function egfr(creatinineUmol: number, age: number, sex: 'F' | 'M'): number {
  const scr = creatinineUmol / 88.4; // mg/dL
  const k = sex === 'F' ? 0.7 : 0.9;
  const a = sex === 'F' ? -0.241 : -0.302;
  const r = scr / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (sex === 'F' ? 1.012 : 1);
}
