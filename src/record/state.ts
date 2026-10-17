/**
 * Questions asked of the record: what was true at a given moment, and how fast the team responded.
 */
import { curb65, type Curb65 } from '../clinical/curb65';
import { DRUGS, EVENTS, PATIENT, TESTS, byId, type Drug, type Event, type LabTest } from './record';
import { OBS, obsAtOrBefore, type ObsSet } from './vitals';

export type MedState = 'running' | 'given' | 'held' | 'not-retained' | 'stopped' | 'finished';

export interface MedNow {
  drug: Drug;
  state: MedState;
  last: Event;
}

export interface ResultNow {
  test: LabTest;
  last: Event;
  previous?: Event;
}

export interface StateAt {
  t: number;
  place?: Event;
  obs?: ObsSet;
  curb?: Curb65;
  meds: MedNow[];
  results: ResultNow[];
  note?: Event;
}

const rowEvents = (row: string, t: number) => EVENTS.filter((e) => e.row === row && e.t <= t);

/** A dose not repeated within a day is no longer a current medicine. */
const LAPSE = 24 * 60;

export function medsAt(t: number): MedNow[] {
  const out: MedNow[] = [];
  for (const drug of DRUGS) {
    const evs = rowEvents(drug.id, t).filter((e) => e.status !== 'planned');
    if (!evs.length) continue;
    const spans = evs.filter((e) => e.kind === 'infusion');
    const running = spans.find((e) => e.end !== undefined && e.t <= t && t < e.end);
    if (running) {
      out.push({ drug, state: 'running', last: running });
      continue;
    }
    const last = evs[evs.length - 1];
    if (last.kind === 'stop') out.push({ drug, state: 'stopped', last });
    else if (last.kind === 'infusion' || t - last.t > LAPSE) out.push({ drug, state: 'finished', last });
    else out.push({ drug, state: last.status === 'held' || last.status === 'not-retained' ? last.status : 'given', last });
  }
  return out;
}

export function resultsAt(t: number): ResultNow[] {
  return TESTS.flatMap((test) => {
    const evs = rowEvents(test.id, t);
    if (!evs.length) return [];
    return [{ test, last: evs[evs.length - 1], previous: evs[evs.length - 2] }];
  });
}

export function curbAt(t: number): Curb65 | undefined {
  const o = obsAtOrBefore(t);
  if (!o) return undefined;
  const urea = rowEvents('urea', t).pop()?.value ?? null;
  return curb65({ confused: o.v.consciousness !== 'alert', urea, respRate: o.v.respRate, systolic: o.v.systolic, diastolic: o.v.diastolic, age: PATIENT.age });
}

export function stateAt(t: number): StateAt {
  const place = EVENTS.find((e) => e.kind === 'place' && e.t <= t && t < (e.end ?? Infinity));
  const notes = EVENTS.filter((e) => e.kind === 'note' && e.t <= t);
  return { t, place, obs: obsAtOrBefore(t), curb: curbAt(t), meds: medsAt(t), results: resultsAt(t), note: notes[notes.length - 1] };
}

// ---- response times ---------------------------------------------------------

export interface BundleStep {
  name: string;
  id: string;
  minutes: number;
  met: boolean;
}

/** The Sepsis Six (UK Sepsis Trust): each step, minutes from the positive screen, and whether it was within the hour. */
export function sepsisSix(flagId = 'sepsis'): BundleStep[] {
  const flag = byId.get(flagId)!.t;
  const steps: Array<[string, string]> = [
    ['Oxygen', 'oxygen'],
    ['Blood cultures', 'cultures'],
    ['Lactate', 'lactate@2-00:30'],
    ['Fluids', 'bolus-1'],
    ['Antibiotics', 'coamoxiclav@2-00:55'],
    ['Urine output', 'urine'],
  ];
  return steps.map(([name, id]) => {
    const minutes = byId.get(id)!.t - flag;
    return { name, id, minutes, met: minutes >= 0 && minutes <= 60 };
  });
}

/** Periods where consecutive observation sets scored at or above a threshold: [start, end of the period]. */
export function periodsAtOrAbove(threshold: number, obs: ObsSet[] = OBS): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (const o of obs) {
    if (o.s.total >= threshold && start === null) start = o.t;
    if (o.s.total < threshold && start !== null) {
      out.push([start, o.t]);
      start = null;
    }
  }
  if (start !== null) out.push([start, obs[obs.length - 1].t]);
  return out;
}

const NURSE = /nurse/i;

/** From the first set at or above a NEWS2 threshold to the first review by a doctor or the outreach team. */
export function timeToReview(threshold: number): { trigger: ObsSet; review: Event; minutes: number } | undefined {
  const trigger = OBS.find((o) => o.s.total >= threshold);
  if (!trigger) return undefined;
  const review = EVENTS.find((e) => e.kind === 'note' && e.t >= trigger.t && !NURSE.test(e.author ?? ''));
  if (!review) return undefined;
  return { trigger, review, minutes: review.t - trigger.t };
}
