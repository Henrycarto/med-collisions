/**
 * The record of one fictional admission: Margarete Huber, 71, community-acquired pneumonia,
 * Ward 4B bed 3 (the same patient as Bed 3 in the ward monitor).
 *
 * Everything that happened is an Event on a row of a lane. Decisions are joined to what prompted
 * them by Links, the way a good note says "because": the NEWS2 of 10 prompted the sepsis screen,
 * the lactate of 3.1 prompted the fluid bolus, the pharmacist's note held the statin.
 * Links are documented reasons, not inferred causes.
 */
import { OBS } from './vitals';
import { DISCHARGED, at } from './time';

export const PATIENT = {
  name: 'Margarete Huber',
  age: 71,
  sex: 'female',
  number: 'W4B-000317',
  diagnosis: 'Community-acquired pneumonia, right lower lobe',
  allergies: 'No known drug allergies',
  background: 'Hypertension, high cholesterol. Lives alone, independent.',
};

export type Lane = 'place' | 'news2' | 'vitals' | 'meds' | 'results' | 'notes';
export type Route = 'oral' | 'iv' | 'sc' | 'inhaled';
export type Status = 'given' | 'held' | 'not-retained' | 'planned';

export interface Event {
  id: string;
  t: number;
  end?: number; // spans: a place, an infusion, oxygen
  lane: Lane;
  row: string;
  kind: 'place' | 'obs' | 'dose' | 'infusion' | 'stop' | 'lab' | 'micro' | 'note';
  title: string;
  detail?: string;
  route?: Route;
  status?: Status;
  value?: number;
  flag?: 'abnormal' | 'critical' | 'positive';
  author?: string;
}

export interface Drug {
  id: string;
  name: string;
  dose: string;
  how: string;
  route: Route;
}

export const DRUGS: Drug[] = [
  { id: 'amoxicillin', name: 'Amoxicillin', dose: '500 mg', how: 'three times a day', route: 'oral' },
  { id: 'coamoxiclav', name: 'Co-amoxiclav', dose: '1.2 g IV, then 625 mg oral', how: 'three times a day', route: 'iv' },
  { id: 'clarithromycin', name: 'Clarithromycin', dose: '500 mg', how: 'twice a day', route: 'iv' },
  { id: 'oxygen', name: 'Oxygen', dose: '2 L/min, nasal', how: 'target SpO₂ 94 to 98%', route: 'inhaled' },
  { id: 'fluids', name: 'IV fluids', dose: "500 mL Hartmann's", how: 'bolus over 15 min', route: 'iv' },
  { id: 'paracetamol', name: 'Paracetamol', dose: '1 g', how: 'up to four times a day', route: 'oral' },
  { id: 'enoxaparin', name: 'Enoxaparin', dose: '40 mg', how: 'once a day, clot prevention', route: 'sc' },
  { id: 'amlodipine', name: 'Amlodipine', dose: '5 mg', how: 'once a day, own medicine', route: 'oral' },
  { id: 'atorvastatin', name: 'Atorvastatin', dose: '40 mg', how: 'at night, own medicine', route: 'oral' },
];
export const drugById = (id: string) => DRUGS.find((d) => d.id === id)!;

export interface LabTest {
  id: string;
  name: string;
  unit: string;
  low?: number;
  high: number;
  critical?: number;
}
export const TESTS: LabTest[] = [
  { id: 'lactate', name: 'Lactate', unit: 'mmol/L', high: 2, critical: 4 },
  { id: 'crp', name: 'CRP', unit: 'mg/L', high: 5 },
  { id: 'wcc', name: 'White cells', unit: '×10⁹/L', low: 4, high: 11 },
  { id: 'creatinine', name: 'Creatinine', unit: 'µmol/L', low: 45, high: 90 },
  { id: 'urea', name: 'Urea', unit: 'mmol/L', low: 2.5, high: 7.8 },
];

const id = (prefix: string, day: number, hhmm: string) => `${prefix}@${day}-${hhmm}`;

// ---- medicines -------------------------------------------------------------

type DoseSpec = [day: number, hhmm: string, status?: Status, route?: Route, detail?: string];

const DOSES: Record<string, DoseSpec[]> = {
  amoxicillin: [[0, '16:00'], [0, '22:00'], [1, '08:00'], [1, '14:00'], [1, '22:00', 'not-retained', undefined, 'Vomited at 22:40, tablets seen in the vomit']],
  coamoxiclav: [
    [2, '00:55', 'given', 'iv', 'First intravenous dose, 50 minutes after the sepsis screen'],
    [2, '08:00', 'given', 'iv'], [2, '16:00', 'given', 'iv'], [3, '00:00', 'given', 'iv'], [3, '08:00', 'given', 'iv'],
    [3, '16:00', 'given', 'iv'], [4, '00:00', 'given', 'iv'], [4, '08:00', 'given', 'iv'],
    [4, '14:00', 'given', 'oral', 'First oral dose after the switch'], [4, '22:00', 'given', 'oral'], [5, '08:00', 'given', 'oral'],
  ],
  clarithromycin: [[2, '01:15', 'given', 'iv', 'Added for atypical cover in severe pneumonia'], [2, '13:00'], [3, '01:00']],
  paracetamol: [
    [0, '16:00'], [0, '22:00'], [1, '06:00'], [1, '14:00'], [1, '23:10', 'given', 'iv', 'Intravenous, after vomiting'],
    [2, '05:10', 'given', 'iv'], [2, '11:10'], [2, '17:10'], [2, '23:10'], [3, '06:00'], [3, '12:00'],
  ],
  enoxaparin: [[0, '19:30'], [1, '18:00'], [2, '18:00'], [3, '18:00'], [4, '18:00']],
  amlodipine: [
    [1, '08:00'], [2, '08:00', 'held', undefined, 'Held by the nurse: systolic 116 after sepsis'], [3, '08:00', 'held', undefined, 'Held: blood pressure still recovering'],
    [4, '08:00', 'held', undefined, 'Held until the ward round'], [5, '08:00', 'given', undefined, 'Restarted'],
  ],
  atorvastatin: [
    [0, '22:00'], [1, '22:00', 'not-retained', undefined, 'Vomited at 22:40'],
    [2, '22:00', 'held', undefined, 'Held: interaction with clarithromycin'], [3, '22:00', 'held', undefined, 'Held: 2 days after the last clarithromycin'],
    [4, '22:00', 'held', undefined, 'Held: 2 days after the last clarithromycin'], [5, '22:00', 'planned', undefined, 'Restart at home tonight'],
  ],
};

const doseEvents: Event[] = Object.entries(DOSES).flatMap(([drug, specs]) =>
  specs.map(([day, hhmm, status = 'given', route, detail]) => {
    const d = drugById(drug);
    const r = route ?? d.route;
    const dose = drug === 'coamoxiclav' ? (r === 'iv' ? '1.2 g IV' : '625 mg oral') : `${d.dose}${r === 'iv' && d.route !== 'iv' ? ' IV' : ''}`;
    const verb = { given: 'given', held: 'held', 'not-retained': 'not retained', planned: 'planned' }[status];
    return { id: id(drug, day, hhmm), t: at(day, hhmm), lane: 'meds', row: drug, kind: 'dose', route: r, status, title: `${d.name} ${dose} ${verb}`, detail } satisfies Event;
  }),
);

const spans: Event[] = [
  { id: 'oxygen', t: at(2, '00:20'), end: at(3, '14:00'), lane: 'meds', row: 'oxygen', kind: 'infusion', route: 'inhaled', title: 'Oxygen 2 L/min by nasal cannula', detail: 'Started at SpO₂ 92%. Target 94 to 98%. Weaned to air on Thursday afternoon.' },
  { id: 'bolus-1', t: at(2, '00:35'), end: at(2, '00:50'), lane: 'meds', row: 'fluids', kind: 'infusion', route: 'iv', title: "Hartmann's 500 mL bolus", detail: 'First bolus for a lactate of 3.1' },
  { id: 'bolus-2', t: at(2, '01:20'), end: at(2, '01:35'), lane: 'meds', row: 'fluids', kind: 'infusion', route: 'iv', title: "Hartmann's 500 mL bolus", detail: 'Second bolus, systolic still 94' },
  { id: 'stop-amoxicillin', t: at(2, '00:55'), lane: 'meds', row: 'amoxicillin', kind: 'stop', title: 'Amoxicillin stopped', detail: 'Replaced by intravenous co-amoxiclav' },
  { id: 'stop-oxygen', t: at(3, '14:00'), lane: 'meds', row: 'oxygen', kind: 'stop', title: 'Oxygen stopped', detail: 'SpO₂ 95% on air' },
  { id: 'stop-clarithromycin', t: at(3, '09:30'), lane: 'meds', row: 'clarithromycin', kind: 'stop', title: 'Clarithromycin stopped', detail: 'Pneumococcal antigen positive, Legionella negative' },
];

// ---- results ---------------------------------------------------------------

type LabSpec = [day: number, hhmm: string, values: Partial<Record<string, number>>];
const LABS: LabSpec[] = [
  [0, '14:40', { lactate: 1.5, crp: 148, wcc: 14.6, creatinine: 84, urea: 6.9 }],
  [1, '06:00', { crp: 172, wcc: 15.1, creatinine: 86, urea: 7.0 }],
  [2, '00:30', { lactate: 3.1, crp: 221, wcc: 18.2, creatinine: 108, urea: 8.1 }],
  [2, '02:00', { lactate: 2.2 }],
  [2, '06:00', { lactate: 1.4 }],
  [3, '06:00', { crp: 180, wcc: 14.0, creatinine: 98, urea: 7.2 }],
  [4, '06:00', { crp: 96, wcc: 10.8, creatinine: 86, urea: 6.1 }],
];

export function flagFor(test: LabTest, v: number): Event['flag'] {
  if (test.critical !== undefined && v >= test.critical) return 'critical';
  if (v > test.high || (test.low !== undefined && v < test.low)) return 'abnormal';
  return undefined;
}

const labEvents: Event[] = LABS.flatMap(([day, hhmm, values]) =>
  TESTS.filter((x) => values[x.id] !== undefined).map((x) => {
    const v = values[x.id]!;
    return { id: id(x.id, day, hhmm), t: at(day, hhmm), lane: 'results', row: x.id, kind: 'lab', value: v, flag: flagFor(x, v), title: `${x.name} ${v} ${x.unit}`, detail: `Reference ${x.low !== undefined ? `${x.low} to ${x.high}` : `below ${x.high}`} ${x.unit}` } satisfies Event;
  }),
);

const micro: Event[] = [
  { id: 'cxr', t: at(0, '15:10'), lane: 'results', row: 'micro', kind: 'micro', title: 'Chest X-ray', detail: 'Right lower lobe consolidation. No effusion.', flag: 'positive' },
  { id: 'cultures', t: at(2, '00:25'), lane: 'results', row: 'micro', kind: 'micro', title: 'Blood cultures taken, 2 sets', detail: 'Before the first intravenous antibiotic' },
  { id: 'antigens-sent', t: at(2, '10:00'), lane: 'results', row: 'micro', kind: 'micro', title: 'Urinary antigens sent', detail: 'Pneumococcus and Legionella' },
  { id: 'antigens', t: at(2, '15:00'), lane: 'results', row: 'micro', kind: 'micro', flag: 'positive', title: 'Pneumococcal antigen positive', detail: 'Legionella antigen negative' },
  { id: 'cultures-36h', t: at(3, '12:00'), lane: 'results', row: 'micro', kind: 'micro', title: 'Blood cultures: no growth at 36 hours' },
  { id: 'cultures-60h', t: at(4, '12:00'), lane: 'results', row: 'micro', kind: 'micro', title: 'Blood cultures: no growth at 60 hours' },
];

// ---- notes -----------------------------------------------------------------

type NoteSpec = [id: string, day: number, hhmm: string, author: string, title: string, detail: string];
const NOTES: NoteSpec[] = [
  ['triage', 0, '14:20', 'Emergency department nurse', 'Triage', 'Four days of cough with green sputum, fever and breathlessness on walking. Takes amlodipine 5 mg and atorvastatin 40 mg. No known drug allergies.'],
  ['ed-review', 0, '15:40', 'Emergency department doctor', 'Pneumonia, low severity', 'Right lower lobe pneumonia. CURB-65 1 (age). Admitted because she lives alone and is breathless on walking. Oral amoxicillin, paracetamol, observations by NEWS2.'],
  ['round-1', 1, '09:30', 'Medical team', 'Ward round, day 2', 'Still febrile, eating a little. CRP 172. Continue oral amoxicillin, review tomorrow.'],
  ['vomit', 1, '22:40', 'Ward nurse', 'Vomited evening medicines', 'Vomited about 40 minutes after her 22:00 medicines, tablets seen in the vomit. On-call doctor informed by phone: intravenous paracetamol, next doses as normal. Repeat observations within the hour.'],
  ['news6', 1, '23:35', 'Ward nurse', 'NEWS2 6: doctor called', 'Feels hot and short of breath. On-call doctor asked to review urgently, nurse in charge informed. Hourly observations.'],
  ['sepsis', 2, '00:05', 'Ward nurse', 'Sepsis screen positive', 'NEWS2 10 with a chest source. Sepsis Six started. Critical care outreach called.'],
  ['outreach', 2, '00:15', 'Critical care outreach', 'Outreach review', 'Breathing fast, warm to touch, systolic 104. Oxygen, blood cultures, lactate, fluid bolus, intravenous antibiotics, urine output monitoring.'],
  ['urine', 2, '00:40', 'Critical care outreach', 'Urine output monitoring', 'Catheter inserted, hourly urine output chart started.'],
  ['registrar', 2, '01:10', 'Medical registrar', 'Severe pneumonia', 'New confusion. CURB-65 4. Add clarithromycin, second fluid bolus. Discussed with intensive care: ward-based care, outreach to review at 04:00 or sooner if NEWS2 rises.'],
  ['outreach-2', 2, '04:00', 'Critical care outreach', 'Outreach follow-up', 'Improving. Alert again, systolic 108, passing urine, lactate down to 2.2. Continue observations every 30 minutes.'],
  ['round-2', 2, '09:30', 'Consultant', 'Ward round, day 3', 'Severe pneumonia, responding. Continue intravenous co-amoxiclav and clarithromycin. Hold amlodipine while blood pressure is low. Send urinary antigens.'],
  ['pharmacy', 2, '09:40', 'Ward pharmacist', 'Statin held', 'Clarithromycin raises atorvastatin levels, with a risk of muscle damage. Hold atorvastatin while on clarithromycin and for 2 days after the last dose.'],
  ['round-3', 3, '09:30', 'Consultant', 'Ward round, day 4', 'No fever since the early hours. Pneumococcal antigen positive, Legionella negative: stop clarithromycin. Continue intravenous co-amoxiclav. Wean oxygen to air.'],
  ['physio-1', 3, '11:00', 'Physiotherapist', 'Physiotherapy', 'Sat out in the chair. Walked 10 m with a frame.'],
  ['round-4', 4, '09:30', 'Consultant', 'Ward round, day 5', 'No fever for over 24 hours, eating, CRP down to 96. Switch to oral co-amoxiclav. Restart amlodipine tomorrow. Plan home tomorrow.'],
  ['physio-2', 4, '14:30', 'Physiotherapist', 'Safe for home', 'Walked 40 m and managed the stairs. Daughter will stay with her for the first week.'],
  ['round-5', 5, '09:30', 'Medical team', 'Ward round, day 6', 'Well, observations normal. Fit for discharge.'],
  ['discharge', 5, '11:30', 'Medical team', 'Discharge summary', 'Home with her daughter. Oral co-amoxiclav to complete 7 days, last dose Tuesday 13 October. Restart atorvastatin tonight. GP review and repeat chest X-ray in 6 weeks.'],
];

const notes: Event[] = NOTES.map(([nid, day, hhmm, author, title, detail]) => ({ id: nid, t: at(day, hhmm), lane: 'notes', row: 'notes', kind: 'note', author, title, detail }));

const places: Event[] = [
  { id: 'ed', t: at(0, '14:20'), end: at(0, '18:30'), lane: 'place', row: 'place', kind: 'place', title: 'Emergency department' },
  { id: 'ward', t: at(0, '18:30'), end: DISCHARGED, lane: 'place', row: 'place', kind: 'place', title: 'Ward 4B, bed 3' },
  { id: 'home', t: DISCHARGED, end: at(6, '00:00'), lane: 'place', row: 'place', kind: 'place', title: 'Home' },
];

const obsEvents: Event[] = OBS.map((o) => ({
  id: o.id, t: o.t, lane: 'news2', row: 'news2', kind: 'obs', value: o.s.total,
  title: `NEWS2 ${o.s.total}`, detail: o.reason,
}));

export const EVENTS: Event[] = [...places, ...obsEvents, ...doseEvents, ...spans, ...labEvents, ...micro, ...notes].sort((a, b) => a.t - b.t);
export const byId = new Map(EVENTS.map((e) => [e.id, e]));

// ---- decisions and what prompted them --------------------------------------

export interface Link {
  from: string;
  to: string;
  why: string;
}

const obsAt = (day: number, hhmm: string) => `obs@${at(day, hhmm)}`;

export const LINKS: Link[] = [
  { from: 'cxr', to: 'ed-review', why: 'Consolidation confirmed pneumonia' },
  { from: 'ed-review', to: id('amoxicillin', 0, '16:00'), why: 'Low severity: oral amoxicillin' },
  { from: id('amoxicillin', 1, '22:00'), to: 'vomit', why: 'Dose vomited, not retained' },
  { from: 'vomit', to: id('paracetamol', 1, '23:10'), why: 'Changed to intravenous paracetamol' },
  { from: 'vomit', to: obsAt(1, '23:30'), why: 'Repeat observations within the hour' },
  { from: obsAt(1, '23:30'), to: 'news6', why: 'NEWS2 5 or more: urgent review' },
  { from: obsAt(2, '00:00'), to: 'sepsis', why: 'NEWS2 10 with a source of infection' },
  { from: 'news6', to: 'sepsis', why: 'Reassessed at the next observations' },
  { from: 'sepsis', to: 'outreach', why: 'Outreach called' },
  { from: 'outreach', to: 'oxygen', why: 'SpO₂ 92%' },
  { from: 'outreach', to: 'cultures', why: 'Sepsis Six: cultures before antibiotics' },
  { from: 'outreach', to: id('lactate', 2, '00:30'), why: 'Sepsis Six: measure lactate' },
  { from: id('lactate', 2, '00:30'), to: 'bolus-1', why: 'Lactate 3.1' },
  { from: 'outreach', to: id('coamoxiclav', 2, '00:55'), why: 'Sepsis Six: intravenous antibiotics' },
  { from: id('coamoxiclav', 2, '00:55'), to: 'stop-amoxicillin', why: 'Replaced oral amoxicillin' },
  { from: 'outreach', to: 'urine', why: 'Sepsis Six: urine output' },
  { from: obsAt(2, '01:00'), to: 'registrar', why: 'New confusion, NEWS2 17' },
  { from: id('urea', 2, '00:30'), to: 'registrar', why: 'Urea 8.1 counts in CURB-65' },
  { from: 'registrar', to: id('clarithromycin', 2, '01:15'), why: 'Severe pneumonia: add atypical cover' },
  { from: 'registrar', to: 'bolus-2', why: 'Systolic still 94' },
  { from: 'registrar', to: 'outreach-2', why: 'Review at 04:00' },
  { from: id('lactate', 2, '02:00'), to: 'outreach-2', why: 'Lactate falling' },
  { from: obsAt(2, '04:00'), to: 'outreach-2', why: 'Alert again, systolic 108' },
  { from: 'round-2', to: id('amlodipine', 3, '08:00'), why: 'Hold while blood pressure is low' },
  { from: 'round-2', to: 'antigens-sent', why: 'Find the organism' },
  { from: id('clarithromycin', 2, '01:15'), to: 'pharmacy', why: 'Interaction with atorvastatin' },
  { from: 'pharmacy', to: id('atorvastatin', 2, '22:00'), why: 'Statin held' },
  { from: 'pharmacy', to: id('atorvastatin', 5, '22:00'), why: 'Restart 2 days after the last clarithromycin' },
  { from: 'antigens-sent', to: 'antigens', why: 'Result' },
  { from: 'antigens', to: 'round-3', why: 'Pneumococcus, not Legionella' },
  { from: 'round-3', to: 'stop-clarithromycin', why: 'Atypical cover no longer needed' },
  { from: 'round-3', to: 'stop-oxygen', why: 'Wean to air' },
  { from: id('crp', 4, '06:00'), to: 'round-4', why: 'CRP down to 96' },
  { from: 'round-4', to: id('coamoxiclav', 4, '14:00'), why: 'Intravenous to oral switch' },
  { from: 'round-4', to: id('amlodipine', 5, '08:00'), why: 'Restart amlodipine' },
  { from: 'physio-2', to: 'discharge', why: 'Safe on the stairs, daughter staying' },
  { from: 'round-5', to: 'discharge', why: 'Fit for discharge' },
  { from: 'stop-clarithromycin', to: id('atorvastatin', 5, '22:00'), why: 'Last clarithromycin was Thursday 01:00' },
];

/** Everything upstream and downstream of an event through the links: the decision chain. */
export function chain(start: string, links: Link[] = LINKS): { links: Link[]; ids: Set<string> } {
  const ids = new Set([start]);
  const out = new Set<Link>();
  const walk = (dir: 'up' | 'down') => {
    const queue = [start];
    const seen = new Set([start]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const l of links) {
        const [here, there] = dir === 'up' ? [l.to, l.from] : [l.from, l.to];
        if (here !== cur) continue;
        out.add(l);
        ids.add(there);
        if (!seen.has(there)) {
          seen.add(there);
          queue.push(there);
        }
      }
    }
  };
  walk('up');
  walk('down');
  return { links: [...out], ids };
}

/** The moments the demo offers as starting points. */
export const MOMENTS: Array<{ label: string; id: string; view: [number, number] }> = [
  { label: 'Arrival', id: 'ed-review', view: [at(0, '12:00'), at(1, '00:00')] },
  { label: 'Dose vomited', id: 'vomit', view: [at(1, '19:00'), at(2, '03:00')] },
  { label: 'Sepsis flagged', id: 'sepsis', view: [at(1, '22:30'), at(2, '02:30')] },
  { label: 'Peak NEWS2', id: obsAt(2, '01:00'), view: [at(1, '21:00'), at(2, '06:00')] },
  { label: 'Statin held', id: 'pharmacy', view: [at(1, '20:00'), at(5, '23:59')] },
  { label: 'Switch to oral', id: 'round-4', view: [at(3, '18:00'), at(5, '00:00')] },
  { label: 'Home', id: 'discharge', view: [at(4, '06:00'), at(6, '00:00')] },
];
