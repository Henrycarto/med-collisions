/**
 * How long each medicine keeps acting after a dose, and the interactions between them.
 * A small curated table for this patient's medicines, simplified from standard references
 * (BNF, product information). Durations are deliberately simple and written down so they can be argued with.
 */

export interface Pharm {
  id: string;
  acts: number; // minutes a dose keeps acting
  interval: number; // usual minutes between doses
  antibiotic?: boolean;
  klass: string;
  note: string;
  /** Strong CYP3A4 inhibition persists after the drug stops while the enzyme is remade. */
  cyp3a4Tail?: number;
}

const H = 60;

export const PHARM: Record<string, Pharm> = {
  amoxicillin: { id: 'amoxicillin', acts: 8 * H, interval: 8 * H, antibiotic: true, klass: 'penicillin', note: 'Covers 8 hours, three times a day' },
  coamoxiclav: { id: 'coamoxiclav', acts: 8 * H, interval: 8 * H, antibiotic: true, klass: 'penicillin', note: 'Amoxicillin with clavulanic acid; covers 8 hours' },
  clarithromycin: { id: 'clarithromycin', acts: 12 * H, interval: 12 * H, antibiotic: true, klass: 'macrolide', note: 'Covers 12 hours; blocks CYP3A4 for about 2 days after the last dose', cyp3a4Tail: 48 * H },
  paracetamol: { id: 'paracetamol', acts: 6 * H, interval: 6 * H, klass: 'analgesic', note: 'Up to 1 g, at least 4 hours apart, 4 g in 24 hours' },
  enoxaparin: { id: 'enoxaparin', acts: 24 * H, interval: 24 * H, klass: 'heparin', note: 'Once a day for clot prevention' },
  amlodipine: { id: 'amlodipine', acts: 48 * H, interval: 24 * H, klass: 'calcium channel blocker', note: 'Half-life of 30 to 50 hours, so a dose acts for about 2 days' },
  atorvastatin: { id: 'atorvastatin', acts: 24 * H, interval: 24 * H, klass: 'statin', note: 'Cleared by CYP3A4' },
};

export const DRUG_IDS = Object.keys(PHARM);

export interface Interaction {
  a: string;
  b: string;
  kind: 'drug-drug' | 'duplicate';
  severity: 'high' | 'moderate';
  title: string;
  mechanism: string;
  action: string;
  /** a's effect window to use: its exposure, or its CYP3A4 inhibition window */
  aWindow: 'exposure' | 'inhibition';
}

export const INTERACTIONS: Interaction[] = [
  {
    a: 'clarithromycin', b: 'atorvastatin', kind: 'drug-drug', severity: 'high', aWindow: 'inhibition',
    title: 'Clarithromycin and atorvastatin',
    mechanism: 'Clarithromycin blocks CYP3A4, the enzyme that clears atorvastatin. Statin levels rise, with a risk of muscle breakdown.',
    action: 'Hold the statin while on clarithromycin and for 2 days after the last dose.',
  },
  {
    a: 'clarithromycin', b: 'amlodipine', kind: 'drug-drug', severity: 'moderate', aWindow: 'inhibition',
    title: 'Clarithromycin and amlodipine',
    mechanism: 'The same CYP3A4 block raises amlodipine levels. In older patients this combination is linked to low blood pressure and acute kidney injury.',
    action: 'Watch blood pressure; consider holding amlodipine, or a macrolide that does not block CYP3A4.',
  },
  {
    a: 'amoxicillin', b: 'coamoxiclav', kind: 'duplicate', severity: 'moderate', aWindow: 'exposure',
    title: 'Amoxicillin and co-amoxiclav',
    mechanism: 'Co-amoxiclav contains amoxicillin. Giving both doubles the penicillin dose.',
    action: 'Stop amoxicillin when co-amoxiclav starts.',
  },
];
