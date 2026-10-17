/**
 * From the record to collisions. Each medicine's doses become the time it was acting (exposure);
 * the patient's chart becomes the time a condition held (low blood pressure, vomiting, unwell).
 * A collision is an overlap between two things that should not overlap.
 *
 * Every collision is computed twice: on what was actually given, and on what was planned
 * (held doses, vomited doses, and the doses a stopped medicine would have continued with).
 * Planned but not actual means a team decision averted it.
 */
import { egfr } from '../clinical/egfr';
import { EVENTS, PATIENT, byId, drugById, type Event } from '../record/record';
import { DISCHARGED, clock, duration, stamp } from '../record/time';
import { OBS } from '../record/vitals';
import { gaps, intersect, merge, total, type Interval } from './intervals';
import { DRUG_IDS, INTERACTIONS, PHARM } from './pharma';

const DAY = 1440;

export const dosesOf = (drug: string): Event[] => EVENTS.filter((e) => e.row === drug && e.kind === 'dose');
const stopOf = (drug: string) => EVENTS.find((e) => e.row === drug && e.kind === 'stop');

/** Doses that would have followed a stop, at the usual interval, for one day. */
export function continuation(drug: string): number[] {
  const stop = stopOf(drug);
  const doses = dosesOf(drug);
  if (!stop || !doses.length) return [];
  const p = PHARM[drug];
  const out: number[] = [];
  for (let t = doses[doses.length - 1].t + p.interval; t <= stop.t + DAY; t += p.interval) if (t > stop.t) out.push(t);
  return out;
}

/** Every dose that was due: given, held, vomited, planned, and the ones a stopped medicine would have continued with. */
export function schedule(drug: string): number[] {
  return [...dosesOf(drug).map((d) => d.t), ...continuation(drug)].sort((a, b) => a - b);
}

/**
 * When a medicine was acting. A dose acts for its duration, and at least until the next dose was
 * due, so an ordinary ward timetable (08:00, 14:00, 22:00) leaves no gap; a lost dose does.
 */
export function exposure(drug: string, mode: 'actual' | 'planned'): Interval[] {
  const p = PHARM[drug];
  const due = schedule(drug);
  const times = mode === 'actual' ? dosesOf(drug).filter((d) => d.status === 'given').map((d) => d.t) : due;
  return merge(
    times.map((t) => {
      const next = due.find((x) => x > t);
      const until = next !== undefined && next - t <= p.interval * 1.5 ? Math.max(p.acts, next - t) : p.acts;
      return [t, t + until] as const;
    }),
  );
}

/** CYP3A4 inhibition: from the first dose to the tail after the last one. */
export function inhibition(drug: string, mode: 'actual' | 'planned'): Interval[] {
  const p = PHARM[drug];
  if (!p.cyp3a4Tail) return [];
  const times = dosesOf(drug)
    .filter((d) => (mode === 'actual' ? d.status === 'given' : true))
    .map((d) => d.t);
  if (mode === 'planned') times.push(...continuation(drug));
  if (!times.length) return [];
  return [[Math.min(...times), Math.max(...times) + p.cyp3a4Tail]];
}

// ---- the patient's conditions, from the chart ------------------------------------

/** Spans where consecutive observation sets meet a test: from the first set that does to the first that does not. */
export function spans(test: (o: (typeof OBS)[number]) => boolean): Interval[] {
  const out: Interval[] = [];
  let start: number | null = null;
  for (const o of OBS) {
    if (test(o) && start === null) start = o.t;
    if (!test(o) && start !== null) {
      out.push([start, o.t]);
      start = null;
    }
  }
  if (start !== null) out.push([start, OBS[OBS.length - 1].t]);
  return out;
}

export const LOW_BP = 100;
export const lowBloodPressure = () => spans((o) => o.v.systolic < LOW_BP);
export const unwell = () => spans((o) => o.s.total >= 5);

/** A tablet taken within this long before vomiting is treated as not absorbed. */
export const VOMIT_WINDOW = 60;
export function vomiting(): Interval[] {
  const v = byId.get('vomit');
  return v ? [[v.t - VOMIT_WINDOW, v.t]] : [];
}
export function lostDoses(): Event[] {
  const v = byId.get('vomit');
  if (!v) return [];
  return EVENTS.filter((e) => e.kind === 'dose' && e.route === 'oral' && e.t > v.t - VOMIT_WINDOW && e.t <= v.t);
}

export const CONDITIONS: Array<{ id: string; label: string; spans: () => Interval[]; note: string }> = [
  { id: 'unwell', label: 'NEWS2 5 or more', spans: unwell, note: 'Urgent review threshold' },
  { id: 'lowbp', label: 'Systolic below 100', spans: lowBloodPressure, note: 'From the chart' },
  { id: 'vomiting', label: 'Vomiting', spans: vomiting, note: 'Tablets in the hour before' },
];

// ---- collisions -----------------------------------------------------------------

export type Status = 'happened' | 'averted' | 'clear';
export type Kind = 'drug-drug' | 'duplicate' | 'drug-condition' | 'gap' | 'check';

export interface Collision {
  id: string;
  kind: Kind;
  status: Status;
  severity: 'high' | 'moderate' | 'low';
  title: string;
  lanes: [string, string]; // the two lanes the collision joins
  actual: Interval[];
  planned: Interval[];
  headline: string; // one line: what happened, or what was averted
  mechanism: string;
  record: string; // what the record shows the team did
  action: string;
  evidence: string[]; // event ids
}

const h = (m: number) => duration(m);

function interactionCollisions(): Collision[] {
  return INTERACTIONS.map((x) => {
    const aWin = (mode: 'actual' | 'planned') => (x.aWindow === 'inhibition' ? inhibition(x.a, mode) : exposure(x.a, mode));
    const actual = intersect(aWin('actual'), exposure(x.b, 'actual'));
    // what the overlap would have been without the team's holds and stops, one drug at a time
    const planned = merge([...intersect(aWin('actual'), exposure(x.b, 'planned')), ...intersect(aWin('planned'), exposure(x.b, 'actual'))]);
    const status: Status = total(actual) > 0 ? 'happened' : total(planned) > 0 ? 'averted' : 'clear';
    const a = drugById(x.a).name;
    const b = drugById(x.b).name.toLowerCase();
    let headline = '';
    let record = '';
    const evidence: string[] = [];
    if (x.b === 'atorvastatin') {
      const held = dosesOf('atorvastatin').filter((d) => d.status === 'held');
      const restart = dosesOf('atorvastatin').find((d) => d.status === 'planned');
      const free = inhibition('clarithromycin', 'actual')[0]?.[1];
      headline = status === 'averted' ? `Averted: ${held.length} statin doses held, ${h(total(planned))} of overlap avoided` : `${h(total(actual))} of overlap`;
      record = `The ward pharmacist held atorvastatin at ${clock(byId.get('pharmacy')!.t)} on Wednesday.${restart && free ? ` The restart at home, ${stamp(restart.t)}, is ${h(restart.t - free)} after the enzyme block ends.` : ''}`;
      evidence.push('pharmacy', ...held.map((d) => d.id));
    } else if (x.b === 'amlodipine') {
      const lowBp = intersect(actual, lowBloodPressure());
      headline = status === 'happened' ? `Happened: ${h(total(actual))} with both acting${total(lowBp) ? `, ${h(total(lowBp))} of it with systolic below ${LOW_BP}` : ''}. Holding amlodipine cut it from ${h(total(intersect(aWin('actual'), exposure(x.b, 'planned'))))}.` : 'Averted';
      record = 'No note mentions this interaction. Amlodipine was held from Wednesday 08:00 because of low blood pressure, which shortened the overlap, but the dose given on Tuesday was still acting when clarithromycin started.';
      evidence.push('clarithromycin@2-01:15', 'amlodipine@1-08:00', 'amlodipine@2-08:00');
    } else {
      const stop = stopOf('amoxicillin')!;
      headline = status === 'averted' ? `Averted: amoxicillin stopped at ${clock(stop.t)}, when co-amoxiclav started` : `${h(total(actual))} of double penicillin`;
      record = `Amoxicillin was stopped as the first co-amoxiclav dose went in. Had it continued, the next dose was due at ${clock(continuation('amoxicillin')[0])}.`;
      evidence.push('stop-amoxicillin', 'coamoxiclav@2-00:55');
    }
    return { id: `${x.a}+${x.b}`, kind: x.kind, status, severity: x.severity, title: `${a} and ${b}`, lanes: [x.a, x.b], actual, planned, headline, mechanism: x.mechanism, record, action: x.action, evidence };
  });
}

function bloodPressureCollision(): Collision {
  const actual = intersect(exposure('amlodipine', 'actual'), lowBloodPressure());
  const planned = intersect(exposure('amlodipine', 'planned'), lowBloodPressure());
  const held = dosesOf('amlodipine').filter((d) => d.status === 'held');
  return {
    id: 'amlodipine+lowbp', kind: 'drug-condition', status: total(actual) ? 'happened' : total(planned) ? 'averted' : 'clear', severity: 'moderate',
    title: 'Amlodipine and low blood pressure', lanes: ['lowbp', 'amlodipine'], actual, planned,
    headline: `Happened: ${h(total(actual))} of systolic below ${LOW_BP} while amlodipine was acting`,
    mechanism: 'Amlodipine lowers blood pressure, and with a half-life of 30 to 50 hours a dose taken in the morning still acts the next night.',
    record: `The nurse held the ${held.map((d) => clock(d.t)).slice(0, 1)} dose on Wednesday and the next two; the consultant restarted it on Saturday. The Tuesday dose could not be taken back.`,
    action: 'Hold antihypertensives in sepsis until blood pressure recovers.',
    evidence: ['amlodipine@1-08:00', ...held.map((d) => d.id)],
  };
}

function vomitingCollision(): Collision {
  const lost = lostDoses();
  const v = byId.get('vomit')!;
  return {
    id: 'oral+vomiting', kind: 'drug-condition', status: lost.length ? 'happened' : 'clear', severity: 'high',
    title: 'Oral doses and vomiting', lanes: ['vomiting', 'amoxicillin'],
    actual: lost.length ? vomiting() : [], planned: vomiting(),
    headline: `Happened: ${lost.length} doses not absorbed (${lost.map((d) => drugById(d.row).name.toLowerCase()).join(', ')})`,
    mechanism: `Tablets taken within ${VOMIT_WINDOW} minutes before vomiting are unlikely to have been absorbed.`,
    record: `The nurse recorded the vomiting at ${clock(v.t)} and the doctor changed paracetamol to intravenous. Neither lost dose was replaced.`,
    action: 'Re-dose time-critical medicines, antibiotics first, by another route.',
    evidence: ['vomit', ...lost.map((d) => d.id)],
  };
}

export function antibioticCover(mode: 'actual' | 'planned' = 'actual'): Interval[] {
  return merge(DRUG_IDS.filter((d) => PHARM[d].antibiotic).flatMap((d) => exposure(d, mode)));
}

function coverGapCollision(): Collision {
  const abx = DRUG_IDS.filter((d) => PHARM[d].antibiotic).flatMap(dosesOf).filter((d) => d.status === 'given');
  const first = Math.min(...abx.map((d) => d.t));
  const last = Math.max(...abx.map((d) => d.t));
  const actual = gaps(antibioticCover('actual'), first, last);
  const sick = intersect(actual, unwell());
  const g = actual.find((x) => total(intersect([x], unwell())) > 0) ?? actual[0];
  return {
    id: 'antibiotic-gap', kind: 'gap', status: actual.length ? 'happened' : 'clear', severity: 'high',
    title: 'Gap in antibiotic cover', lanes: ['amoxicillin', 'coamoxiclav'], actual, planned: gaps(antibioticCover('planned'), first, last),
    headline: g ? `Happened: no antibiotic acting from ${clock(g[0])} to ${clock(g[1])}, ${h(total(actual))}${total(sick) ? `, while NEWS2 was 5 or more for ${h(total(sick))} of it` : ''}` : 'No gap',
    mechanism: 'Each dose covers until the next is due. A vomited dose leaves the interval uncovered.',
    record: `The last absorbed amoxicillin was ${stamp(byId.get('amoxicillin@1-14:00')!.t)}. The next antibiotic was intravenous co-amoxiclav at ${clock(byId.get('coamoxiclav@2-00:55')!.t)}, given for sepsis.`,
    action: 'Replace a lost antibiotic dose straight away.',
    evidence: ['amoxicillin@1-14:00', 'amoxicillin@1-22:00', 'vomit', 'coamoxiclav@2-00:55'],
  };
}

/** Highest paracetamol total in any 24 hours, and the shortest gap between doses. */
export function paracetamolLoad(): { max24: number; minGap: number } {
  const ds = dosesOf('paracetamol').filter((d) => d.status === 'given').map((d) => d.t);
  let max24 = 0;
  for (const t of ds) max24 = Math.max(max24, ds.filter((x) => x > t - DAY && x <= t).length);
  let minGap = Infinity;
  for (let i = 1; i < ds.length; i++) minGap = Math.min(minGap, ds[i] - ds[i - 1]);
  return { max24, minGap };
}

function paracetamolCheck(): Collision {
  const { max24, minGap } = paracetamolLoad();
  const ok = max24 <= 4 && minGap >= 240;
  return {
    id: 'paracetamol-dose', kind: 'check', status: ok ? 'clear' : 'happened', severity: 'low',
    title: 'Paracetamol daily limit', lanes: ['paracetamol', 'paracetamol'], actual: [], planned: [],
    headline: `${ok ? 'Clear' : 'Exceeded'}: at most ${max24} g in any 24 hours, doses at least ${h(minGap)} apart`,
    mechanism: 'Up to 4 g in 24 hours, with at least 4 hours between doses, for adults over 50 kg.',
    record: 'Oral, then intravenous after vomiting, then oral again.', action: 'None needed.', evidence: [],
  };
}

export function lowestEgfr(): { value: number; at: number } {
  const labs = EVENTS.filter((e) => e.row === 'creatinine');
  const all = labs.map((e) => ({ value: egfr(e.value!, PATIENT.age, 'F'), at: e.t }));
  return all.reduce((a, b) => (b.value < a.value ? b : a));
}

function kidneyCheck(): Collision {
  const low = lowestEgfr();
  const ok = low.value >= 30;
  return {
    id: 'renal-doses', kind: 'check', status: ok ? 'clear' : 'happened', severity: 'low',
    title: 'Kidney function and doses', lanes: ['clarithromycin', 'enoxaparin'], actual: [], planned: [],
    headline: `${ok ? 'Clear' : 'Adjust'}: lowest eGFR ${Math.round(low.value)} on ${stamp(low.at)}; doses change below 30`,
    mechanism: 'Clarithromycin, co-amoxiclav and enoxaparin need lower doses when kidney function falls below about 30 mL/min.',
    record: 'Creatinine rose to 108 during sepsis and recovered to 86.', action: 'None needed at these values.', evidence: [`creatinine@${'2-00:30'}`],
  };
}

const ORDER: Record<Status, number> = { happened: 0, averted: 1, clear: 2 };
const SEV: Record<Collision['severity'], number> = { high: 0, moderate: 1, low: 2 };

export function collisions(): Collision[] {
  return [...interactionCollisions(), coverGapCollision(), vomitingCollision(), bloodPressureCollision(), paracetamolCheck(), kidneyCheck()].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || SEV[a.severity] - SEV[b.severity],
  );
}

/** Hours each pair of medicines was acting at the same time, for the matrix. */
export function coExposure(): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < DRUG_IDS.length; i++) {
    for (let j = i + 1; j < DRUG_IDS.length; j++) {
      const a = DRUG_IDS[i];
      const b = DRUG_IDS[j];
      m.set(`${a}+${b}`, total(intersect(exposure(a, 'actual'), exposure(b, 'actual'))));
    }
  }
  return m;
}

export const STAY_END = DISCHARGED;
