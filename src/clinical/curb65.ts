/**
 * CURB-65 severity score for community-acquired pneumonia (Lim et al., Thorax 2003; BTS and NICE).
 * One point each for new confusion, urea above 7 mmol/L, respiratory rate 30 or more,
 * systolic below 90 or diastolic 60 or less, and age 65 or more.
 */

export interface Curb65Input {
  confused: boolean;
  urea: number | null; // mmol/L; null when not measured, which scores as CRB-65
  respRate: number;
  systolic: number;
  diastolic: number;
  age: number;
}

export interface Curb65 {
  total: number;
  criteria: string[];
  severity: 'low' | 'moderate' | 'high';
  measuredUrea: boolean;
}

export function curb65(i: Curb65Input): Curb65 {
  const criteria: string[] = [];
  if (i.confused) criteria.push('new confusion');
  if (i.urea !== null && i.urea > 7) criteria.push(`urea ${i.urea}`);
  if (i.respRate >= 30) criteria.push(`respiration ${i.respRate}`);
  if (i.systolic < 90 || i.diastolic <= 60) criteria.push(`blood pressure ${i.systolic}/${i.diastolic}`);
  if (i.age >= 65) criteria.push(`age ${i.age}`);
  const total = criteria.length;
  return { total, criteria, severity: total >= 3 ? 'high' : total === 2 ? 'moderate' : 'low', measuredUrea: i.urea !== null };
}
