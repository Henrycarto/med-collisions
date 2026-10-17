import { describe, expect, it } from 'vitest';
import { byId } from '../record/record';
import { at, clock } from '../record/time';
import {
  antibioticCover, coExposure, collisions, continuation, exposure, inhibition, lostDoses, lowBloodPressure, lowestEgfr, paracetamolLoad, unwell,
} from './analysis';
import { gaps, total } from './intervals';
import { DRUG_IDS, INTERACTIONS, PHARM } from './pharma';

const find = (id: string) => collisions().find((c) => c.id === id)!;

describe('exposure', () => {
  it('runs each dose until the next one is due, so the ward timetable leaves no gap', () => {
    // amoxicillin at 22:00 Monday and 08:00 Tuesday: 10 hours apart, covered
    expect(gaps(exposure('amoxicillin', 'actual'), at(0, '16:00'), at(1, '22:00'))).toEqual([]);
  });

  it('leaves out doses that were held or vomited', () => {
    const atorva = exposure('atorvastatin', 'actual');
    expect(atorva).toEqual([[at(0, '22:00'), at(1, '22:00')]]); // Tuesday's dose was vomited, the next three held
  });

  it('keeps amlodipine acting for two days after a dose', () => {
    expect(exposure('amlodipine', 'actual')[0]).toEqual([at(1, '08:00'), at(3, '08:00')]);
  });

  it('continues a stopped medicine on its usual interval when asking what would have happened', () => {
    expect(continuation('amoxicillin').map(clock)).toEqual(['06:00', '14:00', '22:00']);
    expect(continuation('enoxaparin')).toEqual([]); // never stopped
  });

  it('extends clarithromycin enzyme inhibition 2 days past the last dose', () => {
    expect(inhibition('clarithromycin', 'actual')).toEqual([[at(2, '01:15'), at(5, '01:00')]]);
    expect(inhibition('atorvastatin', 'actual')).toEqual([]);
  });
});

describe('conditions from the chart', () => {
  it('finds systolic below 100 from 00:20 to 01:45 on Wednesday', () => {
    expect(lowBloodPressure()).toEqual([[at(2, '00:20'), at(2, '01:45')]]);
  });

  it('finds NEWS2 5 or more starting at 23:30', () => {
    expect(unwell()[0][0]).toBe(at(1, '23:30'));
  });

  it('flags the oral doses in the hour before vomiting, matching the statuses the nurse recorded', () => {
    const lost = lostDoses();
    expect(lost.map((d) => d.id)).toEqual(['amoxicillin@1-22:00', 'atorvastatin@1-22:00']);
    for (const d of lost) expect(d.status).toBe('not-retained');
  });
});

describe('collisions', () => {
  it('find one gap in antibiotic cover: 22:00 to 00:55, overlapping the rise in NEWS2', () => {
    const c = find('antibiotic-gap');
    expect(c.status).toBe('happened');
    expect(c.actual).toEqual([[at(1, '22:00'), at(2, '00:55')]]);
    expect(total(c.actual)).toBe(175);
    expect(c.headline).toContain('1 h 25 min'); // 23:30 to 00:55 with NEWS2 5 or more
  });

  it('show the statin interaction averted by the pharmacist, and the restart clear of the enzyme block', () => {
    const c = find('clarithromycin+atorvastatin');
    expect(c.status).toBe('averted');
    expect(total(c.actual)).toBe(0);
    expect(c.planned).toEqual([[at(2, '01:15'), at(5, '01:00')]]);
    expect(c.record).toContain('21 h after the enzyme block ends');
  });

  it('find the clarithromycin and amlodipine overlap that no note mentions', () => {
    const c = find('clarithromycin+amlodipine');
    expect(c.status).toBe('happened');
    expect(c.actual).toEqual([[at(2, '01:15'), at(3, '08:00')]]);
    expect(c.headline).toContain('30 min of it with systolic below 100');
    expect(c.record).toContain('No note mentions');
  });

  it('show the double penicillin averted by stopping amoxicillin', () => {
    const c = find('amoxicillin+coamoxiclav');
    expect(c.status).toBe('averted');
    expect(total(c.actual)).toBe(0);
    expect(byId.get('stop-amoxicillin')!.t).toBe(byId.get('coamoxiclav@2-00:55')!.t);
  });

  it('find low blood pressure while amlodipine was acting', () => {
    expect(find('amlodipine+lowbp')).toMatchObject({ status: 'happened', actual: [[at(2, '00:20'), at(2, '01:45')]] });
  });

  it('clear paracetamol and kidney dosing, with the numbers that clear them', () => {
    expect(paracetamolLoad()).toEqual({ max24: 4, minGap: 360 });
    expect(Math.round(lowestEgfr().value)).toBe(47);
    expect(find('paracetamol-dose').status).toBe('clear');
    expect(find('renal-doses').status).toBe('clear');
  });

  it('come out ordered: happened first, then averted, then clear, severe first within each', () => {
    const order = collisions().map((c) => c.status);
    expect(order).toEqual([...order].sort((a, b) => ['happened', 'averted', 'clear'].indexOf(a) - ['happened', 'averted', 'clear'].indexOf(b)));
    expect(collisions()[0].severity).toBe('high');
  });

  it('point only at real events and lanes', () => {
    const lanes = new Set([...DRUG_IDS, 'unwell', 'lowbp', 'vomiting']);
    for (const c of collisions()) {
      for (const id of c.evidence) expect(byId.has(id), `${c.id}: ${id}`).toBe(true);
      for (const l of c.lanes) expect(lanes.has(l), `${c.id}: ${l}`).toBe(true);
      expect(`${c.headline} ${c.record} ${c.mechanism}`).not.toMatch(/\u2014/);
    }
  });
});

describe('the interaction table', () => {
  it('names only medicines in the pharmacology table', () => {
    for (const x of INTERACTIONS) {
      expect(PHARM[x.a]).toBeDefined();
      expect(PHARM[x.b]).toBeDefined();
    }
  });

  it('marks every antibiotic, and the co-exposure matrix covers every pair once', () => {
    expect(DRUG_IDS.filter((d) => PHARM[d].antibiotic)).toEqual(['amoxicillin', 'coamoxiclav', 'clarithromycin']);
    const n = DRUG_IDS.length;
    expect(coExposure().size).toBe((n * (n - 1)) / 2);
    expect(coExposure().get('amoxicillin+coamoxiclav')).toBe(0);
  });

  it('antibiotic cover runs from the first dose to the end of the stay with one gap', () => {
    const cover = antibioticCover('actual');
    expect(gaps(cover, at(0, '16:00'), at(5, '08:00'))).toHaveLength(1);
  });
});
