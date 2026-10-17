/**
 * NEWS2, the National Early Warning Score 2 (Royal College of Physicians, 2017).
 * Pure functions: one observation set in, points per parameter and the clinical response out.
 */

export type Consciousness = 'alert' | 'new-confusion' | 'voice' | 'pain' | 'unresponsive';

export interface Observation {
  respRate: number; // breaths per minute
  spo2: number; // %
  onOxygen: boolean;
  systolic: number; // mmHg
  pulse: number; // beats per minute
  consciousness: Consciousness;
  temp: number; // °C
}

export type Param = 'respRate' | 'spo2' | 'air' | 'systolic' | 'pulse' | 'consciousness' | 'temp';
export type Points = 0 | 1 | 2 | 3;
export type Risk = 'low' | 'low-medium' | 'medium' | 'high';

export interface Score {
  total: number;
  points: Record<Param, Points>;
  risk: Risk;
  response: string;
  frequency: string;
}

const band = (v: number, cuts: Array<[number, Points]>, top: Points): Points => {
  for (const [max, pts] of cuts) if (v <= max) return pts;
  return top;
};

export const respRatePoints = (rr: number): Points => band(rr, [[8, 3], [11, 1], [20, 0], [24, 2]], 3);
export const systolicPoints = (sbp: number): Points => band(sbp, [[90, 3], [100, 2], [110, 1], [219, 0]], 3);
export const pulsePoints = (hr: number): Points => band(hr, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2]], 3);
export const tempPoints = (t: number): Points => band(Math.round(t * 10) / 10, [[35.0, 3], [36.0, 1], [38.0, 0], [39.0, 1]], 2);

/** SpO2 scale 1: the default. */
export const spo2Scale1Points = (s: number): Points => band(s, [[91, 3], [93, 2], [95, 1]], 0);

/**
 * SpO2 scale 2: only for patients with confirmed hypercapnic respiratory failure and a
 * prescribed target of 88-92%, decided by a clinician. Above 92% scores only on oxygen.
 */
export const spo2Scale2Points = (s: number, onOxygen: boolean): Points => {
  if (s <= 83) return 3;
  if (s <= 85) return 2;
  if (s <= 87) return 1;
  if (s <= 92 || !onOxygen) return 0;
  return band(s, [[94, 1], [96, 2]], 3);
};

export function score(o: Observation, spo2Scale: 1 | 2 = 1): Score {
  const points: Record<Param, Points> = {
    respRate: respRatePoints(o.respRate),
    spo2: spo2Scale === 2 ? spo2Scale2Points(o.spo2, o.onOxygen) : spo2Scale1Points(o.spo2),
    air: o.onOxygen ? 2 : 0,
    systolic: systolicPoints(o.systolic),
    pulse: pulsePoints(o.pulse),
    consciousness: o.consciousness === 'alert' ? 0 : 3,
    temp: tempPoints(o.temp),
  };
  const total = Object.values(points).reduce<number>((a, b) => a + b, 0);
  const single3 = Object.values(points).some((p) => p === 3);
  const risk: Risk = total >= 7 ? 'high' : total >= 5 ? 'medium' : single3 ? 'low-medium' : 'low';
  return { total, points, risk, ...RESPONSE[risk === 'low' && total === 0 ? 'zero' : risk] };
}

const RESPONSE: Record<Risk | 'zero', { response: string; frequency: string }> = {
  zero: { response: 'Continue routine monitoring.', frequency: 'Observations at least every 12 hours' },
  low: { response: 'Inform the nurse in charge, who decides whether to increase monitoring or escalate.', frequency: 'Observations at least every 4 to 6 hours' },
  'low-medium': { response: 'Urgent ward-based response: a clinician reviews the patient and decides whether to escalate.', frequency: 'Observations at least every hour' },
  medium: { response: 'Urgent response: inform the medical team and request an urgent assessment by a clinician skilled in acute illness.', frequency: 'Observations at least every hour' },
  high: { response: 'Emergency response: immediate assessment by a team with critical care skills, usually transfer to a higher level of care.', frequency: 'Continuous monitoring of vital signs' },
};

export const PARAM_LABEL: Record<Param, string> = {
  respRate: 'Respiration rate',
  spo2: 'SpO₂',
  air: 'Air or oxygen',
  systolic: 'Systolic BP',
  pulse: 'Pulse',
  consciousness: 'Consciousness',
  temp: 'Temperature',
};
