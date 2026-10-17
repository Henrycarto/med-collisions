/**
 * Margarete Huber's vital signs across the stay, and when they were charted.
 *
 * The values follow keyframes; between keyframes they are interpolated with small seeded noise.
 * The night of Tuesday into Wednesday uses the same keyframes as Bed 3 in the ward monitor,
 * up to the point where the team responds (01:00); after that this record shows the response
 * working. When observations were taken is not authored: it follows the NEWS2 rule for how
 * often to observe at each score, plus the times a nurse charted extra sets.
 */
import { score, type Observation, type Score } from '../clinical/news2';
import { DISCHARGED, at } from './time';

export interface Vitals extends Observation {
  diastolic: number;
}

type Key = Partial<Vitals> & { t: number };

const first: Vitals = { respRate: 20, spo2: 95, onOxygen: false, systolic: 134, diastolic: 78, pulse: 96, consciousness: 'alert', temp: 38.4 };

export const KEYS: Key[] = [
  { t: at(0, '14:25'), ...first },
  { t: at(0, '22:00'), respRate: 18, spo2: 95, systolic: 128, diastolic: 76, pulse: 90, temp: 37.9 },
  { t: at(1, '06:00'), respRate: 18, spo2: 95, systolic: 126, diastolic: 74, pulse: 88, temp: 37.6 },
  { t: at(1, '14:00'), respRate: 18, spo2: 95, systolic: 126, diastolic: 74, pulse: 88, temp: 37.9 },
  // the ward monitor's night shift (Bed 3), minute 0 at 18:00
  { t: at(1, '18:00'), respRate: 18, spo2: 95, systolic: 128, diastolic: 74, pulse: 88, temp: 37.8 },
  { t: at(1, '23:00'), respRate: 19, spo2: 95, systolic: 122, diastolic: 70, pulse: 90, temp: 37.9 },
  { t: at(1, '23:30'), respRate: 23, spo2: 93, systolic: 112, diastolic: 66, pulse: 104, temp: 38.6 },
  { t: at(2, '00:00'), respRate: 25, spo2: 91, systolic: 104, diastolic: 62, pulse: 112, temp: 39.0 },
  { t: at(2, '00:20'), respRate: 26, spo2: 92, systolic: 99, diastolic: 60, pulse: 118, temp: 39.2, onOxygen: true },
  { t: at(2, '01:00'), respRate: 28, spo2: 91, systolic: 94, diastolic: 58, pulse: 124, temp: 39.4, consciousness: 'new-confusion' },
  // from here the response takes effect: fluids, oxygen, intravenous antibiotics
  { t: at(2, '01:45'), respRate: 26, spo2: 93, systolic: 102, diastolic: 62, pulse: 116, temp: 39.0 },
  { t: at(2, '03:00'), respRate: 24, spo2: 94, systolic: 106, diastolic: 64, pulse: 108, temp: 38.5, consciousness: 'alert' },
  { t: at(2, '04:00'), respRate: 22, spo2: 94, systolic: 108, diastolic: 64, pulse: 104, temp: 38.2 },
  { t: at(2, '06:00'), respRate: 21, spo2: 95, systolic: 112, diastolic: 66, pulse: 98, temp: 37.8 },
  { t: at(2, '10:00'), respRate: 20, spo2: 95, systolic: 116, diastolic: 68, pulse: 94, temp: 37.6 },
  { t: at(2, '18:00'), respRate: 19, spo2: 96, systolic: 118, diastolic: 70, pulse: 90, temp: 37.9 },
  { t: at(3, '02:00'), respRate: 18, spo2: 96, systolic: 120, diastolic: 70, pulse: 86, temp: 37.4 },
  { t: at(3, '14:00'), respRate: 18, spo2: 95, systolic: 122, diastolic: 72, pulse: 84, temp: 37.2, onOxygen: false },
  { t: at(4, '08:00'), respRate: 17, spo2: 96, systolic: 128, diastolic: 74, pulse: 80, temp: 36.9 },
  { t: DISCHARGED, respRate: 16, spo2: 97, systolic: 130, diastolic: 76, pulse: 76, temp: 36.8 },
];

/** Times a nurse charted a set outside the NEWS2 schedule, with the reason written on the chart. */
export const EXTRA_OBS: Record<number, string> = {
  [at(0, '18:40')]: 'Arrival on the ward',
  [at(1, '23:30')]: 'Repeat after vomiting',
  [at(2, '00:20')]: 'Oxygen started',
  [at(2, '01:45')]: 'After the second fluid bolus',
};

function noise(seed: number, minute: number): number {
  const x = Math.sin(seed * 127.1 + minute * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
const NOISE = { respRate: 0.6, spo2: 0.4, systolic: 2, diastolic: 1.5, pulse: 2, temp: 0.05 };
const KEY_TIMES = new Set(KEYS.map((k) => k.t));

const resolved: Vitals[] = (() => {
  let acc = first;
  return KEYS.map((k) => (acc = { ...acc, ...k }));
})();

/** The patient's vital signs at minute t. Exactly the keyframe values at keyframe times. */
export function vitalsAt(t: number): Vitals {
  let i = KEYS.findIndex((k) => k.t > t);
  if (i === -1) return resolved[resolved.length - 1];
  if (i === 0) return resolved[0];
  i -= 1;
  const a = resolved[i];
  const b = resolved[i + 1];
  const f = (t - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t);
  const quiet = KEY_TIMES.has(t);
  const n = (k: keyof typeof NOISE, s: number) => (quiet ? 0 : noise(s, t) * NOISE[k]);
  const lerp = (k: keyof typeof NOISE, s: number) => a[k] + (b[k] - a[k]) * f + n(k, s);
  return {
    respRate: Math.round(lerp('respRate', 1)),
    spo2: Math.min(100, Math.round(lerp('spo2', 2))),
    onOxygen: a.onOxygen, // oxygen and consciousness change at the keyframe that records the change
    systolic: Math.round(lerp('systolic', 3)),
    diastolic: Math.round(lerp('diastolic', 4)),
    pulse: Math.round(lerp('pulse', 5)),
    consciousness: a.consciousness,
    temp: Math.round(lerp('temp', 6) * 10) / 10,
  };
}

/**
 * Minutes until the next set of observations, from the NEWS2 chart (RCP 2017).
 * High risk calls for continuous monitoring; charted here every 30 minutes.
 */
export function obsInterval(s: Score): number {
  if (s.risk === 'high') return 30;
  if (s.risk === 'medium' || s.risk === 'low-medium') return 60;
  if (s.total >= 1) return 240;
  return 720;
}

export interface ObsSet {
  id: string;
  t: number;
  v: Vitals;
  s: Score;
  reason: string;
}

/**
 * Wards chart on fixed rounds: every 4 hours at 02, 06, 10, 14, 18 and 22, every 12 hours at
 * 08 and 20, hourly on the hour. The next set is the first round of the required frequency,
 * so it is never later than the interval allows.
 */
const ROUND_OFFSET: Record<number, number> = { 30: 0, 60: 0, 240: 120, 720: 480 };
export function nextDue(t: number, interval: number): number {
  const off = ROUND_OFFSET[interval] ?? 0;
  return Math.floor((t - off) / interval) * interval + off + interval;
}

/** Walk the stay: after each set, the next is due by the NEWS2 rule unless a nurse charted one sooner. */
export function observationTimes(start = KEYS[0].t, end = DISCHARGED - 60): number[] {
  const extra = Object.keys(EXTRA_OBS).map(Number).sort((a, b) => a - b);
  const out = [start];
  let t = start;
  for (;;) {
    let next = nextDue(t, obsInterval(score(vitalsAt(t))));
    const sooner = extra.find((x) => x > t && x < next);
    if (sooner !== undefined) next = sooner;
    if (next > end) break;
    out.push(next);
    t = next;
  }
  return out;
}

export const OBS: ObsSet[] = observationTimes().map((t, i, all) => {
  const v = vitalsAt(t);
  const prev = i > 0 ? score(vitalsAt(all[i - 1])) : null;
  const reason = EXTRA_OBS[t] ? `Extra set: ${EXTRA_OBS[t].toLowerCase()}` : prev ? `On schedule, ${frequencyWords(obsInterval(prev))}` : 'Triage, emergency department';
  return { id: `obs@${t}`, t, v, s: score(v), reason };
});

function frequencyWords(min: number): string {
  if (min === 30) return 'every 30 minutes at high risk';
  if (min === 60) return 'hourly';
  if (min === 240) return 'every 4 hours';
  return 'every 12 hours';
}

export const obsAtOrBefore = (t: number): ObsSet | undefined => {
  let found: ObsSet | undefined;
  for (const o of OBS) if (o.t <= t) found = o;
  return found;
};
