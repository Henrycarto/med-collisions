import { describe, expect, it } from 'vitest';
import { score } from '../clinical/news2';
import { EVENTS, LINKS, MOMENTS, byId, chain, flagFor, TESTS } from './record';
import { curbAt, medsAt, periodsAtOrAbove, resultsAt, sepsisSix, stateAt, timeToReview } from './state';
import { ADMITTED, DISCHARGED, at, clock, dayLabel, duration, parseAt, stamp, stayDay } from './time';
import { KEYS, OBS, nextDue, obsInterval, observationTimes, vitalsAt } from './vitals';

describe('time', () => {
  it('labels days and clock times of the stay', () => {
    expect(stamp(at(2, '01:05'))).toBe('Wed 7 Oct, 01:05');
    expect(dayLabel(DISCHARGED)).toBe('Sat 10 Oct');
    expect(clock(at(1, '23:59') + 1)).toBe('00:00');
    expect(stayDay(at(2, '01:00'))).toBe(3);
  });
  it('writes durations the way a note would', () => {
    expect([50, 60, 90, 300, 1440, 1500, 7030].map(duration)).toEqual(['50 min', '1 h', '1 h 30 min', '5 h', '1 day', '1 day 1 h', '4 days 21 h']);
  });
  it('parses deep links and rejects days outside the stay', () => {
    expect(parseAt('wed-01:05')).toBe(at(2, '01:05'));
    expect(parseAt('sun-10:00')).toBeNull();
    expect(parseAt('nonsense')).toBeNull();
  });
});

describe('vital signs', () => {
  it('uses the ward monitor keyframes for Bed 3 on the night of the deterioration', () => {
    // ward monitor minute 0 is 18:00 on Tuesday; these are its Bed 3 keyframes
    const monitor: Array<[number, Partial<ReturnType<typeof vitalsAt>>]> = [
      [0, { respRate: 18, spo2: 95, systolic: 128, pulse: 88, temp: 37.8 }],
      [300, { respRate: 19, spo2: 95, systolic: 122, pulse: 90, temp: 37.9 }],
      [330, { respRate: 23, spo2: 93, systolic: 112, pulse: 104, temp: 38.6 }],
      [360, { respRate: 25, spo2: 91, systolic: 104, pulse: 112, temp: 39.0, onOxygen: false }],
      [380, { respRate: 26, spo2: 92, systolic: 99, pulse: 118, temp: 39.2, onOxygen: true }],
      [420, { respRate: 28, spo2: 91, systolic: 94, pulse: 124, temp: 39.4, onOxygen: true, consciousness: 'new-confusion' }],
    ];
    for (const [m, v] of monitor) expect(vitalsAt(at(1, '18:00') + m)).toMatchObject(v);
  });

  it('peaks at NEWS2 17 at 01:00, the same score the ward monitor shows', () => {
    expect(score(vitalsAt(at(2, '01:00'))).total).toBe(17);
  });

  it('is exact at keyframes and stays inside plausible ranges everywhere', () => {
    for (let t = KEYS[0].t; t <= DISCHARGED; t += 7) {
      const v = vitalsAt(t);
      expect(v.respRate).toBeGreaterThanOrEqual(12);
      expect(v.respRate).toBeLessThanOrEqual(30);
      expect(v.spo2).toBeGreaterThanOrEqual(88);
      expect(v.systolic).toBeGreaterThan(v.diastolic + 20);
      expect(v.temp).toBeGreaterThan(36);
      expect(v.temp).toBeLessThan(40);
    }
  });

  it('changes oxygen and consciousness only at the keyframes that record the change', () => {
    expect(vitalsAt(at(2, '00:19')).onOxygen).toBe(false);
    expect(vitalsAt(at(2, '00:20')).onOxygen).toBe(true);
    expect(vitalsAt(at(3, '13:59')).onOxygen).toBe(true);
    expect(vitalsAt(at(3, '14:00')).onOxygen).toBe(false);
    expect(vitalsAt(at(2, '00:59')).consciousness).toBe('alert');
    expect(vitalsAt(at(2, '02:59')).consciousness).toBe('new-confusion');
    expect(vitalsAt(at(2, '03:00')).consciousness).toBe('alert');
  });
});

describe('observation schedule follows NEWS2', () => {
  it('maps risk to minutes until the next set', () => {
    const at0 = score({ respRate: 16, spo2: 98, onOxygen: false, systolic: 120, pulse: 70, consciousness: 'alert', temp: 37 });
    const at2 = score({ respRate: 16, spo2: 95, onOxygen: false, systolic: 120, pulse: 95, consciousness: 'alert', temp: 37 });
    const single3 = score({ respRate: 16, spo2: 98, onOxygen: false, systolic: 120, pulse: 135, consciousness: 'alert', temp: 37 });
    const at6 = score(vitalsAt(at(1, '23:30')));
    const at17 = score(vitalsAt(at(2, '01:00')));
    expect([at0, at2, single3, at6, at17].map(obsInterval)).toEqual([720, 240, 60, 60, 30]);
  });

  it('charts on ward rounds and never later than the interval allows', () => {
    expect(clock(nextDue(at(0, '14:25'), 240))).toBe('18:00');
    expect(clock(nextDue(at(1, '23:30'), 60))).toBe('00:00');
    expect(clock(nextDue(at(2, '00:20'), 30))).toBe('00:30');
    expect(clock(nextDue(at(4, '08:00'), 720))).toBe('20:00');
    for (const [t, i] of [[at(0, '14:25'), 240], [at(2, '00:20'), 30], [at(3, '09:59'), 720]]) {
      expect(nextDue(t, i)).toBeGreaterThan(t);
      expect(nextDue(t, i) - t).toBeLessThanOrEqual(i);
    }
  });

  it('never leaves a gap longer than the previous score allows', () => {
    const times = observationTimes();
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(obsInterval(score(vitalsAt(times[i - 1]))));
    }
  });

  it('charts every 30 minutes while the score is high, and densest on the worst night', () => {
    const night = OBS.filter((o) => o.t >= at(2, '00:00') && o.t < at(2, '06:00'));
    const quietDay = OBS.filter((o) => o.t >= at(4, '00:00') && o.t < at(5, '00:00'));
    expect(night.length).toBeGreaterThanOrEqual(12);
    expect(quietDay.length).toBeLessThanOrEqual(4);
  });

  it('includes every set a link or moment points at', () => {
    for (const hhmm of ['23:30']) expect(byId.has(`obs@${at(1, hhmm)}`)).toBe(true);
    for (const hhmm of ['00:00', '01:00', '04:00']) expect(byId.has(`obs@${at(2, hhmm)}`)).toBe(true);
  });
});

describe('the record', () => {
  it('has unique ids and every link and moment points at a real event', () => {
    expect(byId.size).toBe(EVENTS.length);
    for (const l of LINKS) {
      expect(byId.has(l.from), l.from).toBe(true);
      expect(byId.has(l.to), l.to).toBe(true);
    }
    for (const m of MOMENTS) expect(byId.has(m.id), m.id).toBe(true);
  });

  it('never links a decision to something that happened after it', () => {
    for (const l of LINKS) expect(byId.get(l.from)!.t, `${l.from} -> ${l.to}`).toBeLessThanOrEqual(byId.get(l.to)!.t);
  });

  it('keeps every event inside the admission, except the dose planned at home', () => {
    for (const e of EVENTS.filter((x) => x.kind !== 'place' && x.status !== 'planned')) {
      expect(e.t).toBeGreaterThanOrEqual(ADMITTED);
      expect(e.t).toBeLessThanOrEqual(DISCHARGED);
    }
    expect(EVENTS.filter((e) => e.status === 'planned').every((e) => e.t > DISCHARGED)).toBe(true);
  });

  it('flags results outside the reference range', () => {
    const lactate = TESTS.find((t) => t.id === 'lactate')!;
    const wcc = TESTS.find((t) => t.id === 'wcc')!;
    expect([1.4, 2.2, 3.1, 4.0].map((v) => flagFor(lactate, v))).toEqual([undefined, 'abnormal', 'abnormal', 'critical']);
    expect([3.9, 4, 11, 11.1].map((v) => flagFor(wcc, v))).toEqual(['abnormal', undefined, undefined, 'abnormal']);
  });

  it('gives no antibiotic dose between the vomited dose and the sepsis response', () => {
    const lost = byId.get('amoxicillin@1-22:00')!;
    const next = EVENTS.find((e) => e.t > lost.t && e.kind === 'dose' && ['amoxicillin', 'coamoxiclav'].includes(e.row) && e.status === 'given')!;
    expect(lost.status).toBe('not-retained');
    expect(next.id).toBe('coamoxiclav@2-00:55');
    expect(duration(next.t - byId.get('amoxicillin@1-14:00')!.t)).toBe('10 h 55 min');
  });
});

describe('decision chains', () => {
  it('trace the peak back to the vomited dose and forward to the response', () => {
    const c = chain(`obs@${at(2, '01:00')}`);
    expect(c.ids.has('registrar')).toBe(true);
    expect(c.ids.has('clarithromycin@2-01:15')).toBe(true);
    expect(c.ids.has('pharmacy')).toBe(true); // clarithromycin led to the statin interaction
    const sepsis = chain('sepsis');
    for (const id of ['amoxicillin@1-22:00', 'vomit', 'outreach', 'bolus-1', 'coamoxiclav@2-00:55']) expect(sepsis.ids.has(id), id).toBe(true);
  });

  it('handle cycles and unlinked events', () => {
    const loop = [{ from: 'a', to: 'b', why: '' }, { from: 'b', to: 'a', why: '' }];
    expect(chain('a', loop).ids).toEqual(new Set(['a', 'b']));
    expect(chain('enoxaparin@2-18:00').links).toHaveLength(0);
  });
});

describe('state at a moment', () => {
  it('at the peak: high risk, CURB-65 4, oxygen running, antibiotics just given', () => {
    const s = stateAt(at(2, '01:05'));
    expect(s.place?.title).toBe('Ward 4B, bed 3');
    expect(s.obs?.s.total).toBe(17);
    expect(s.curb?.total).toBe(4);
    const med = Object.fromEntries(s.meds.map((m) => [m.drug.id, m.state]));
    expect(med).toMatchObject({ oxygen: 'running', coamoxiclav: 'given', amoxicillin: 'stopped', fluids: 'finished', atorvastatin: 'not-retained' });
    expect(med.clarithromycin).toBeUndefined();
    expect(s.note?.id).toBe('urine');
  });

  it('in the emergency department: CURB-65 1, matching the note', () => {
    expect(curbAt(at(0, '15:40'))?.total).toBe(1);
    expect(curbAt(at(0, '15:40'))?.criteria).toEqual(['age 71']);
  });

  it('shows results with the previous value for the trend', () => {
    const crp = resultsAt(at(4, '07:00')).find((r) => r.test.id === 'crp')!;
    expect([crp.last.value, crp.previous?.value]).toEqual([96, 180]);
  });

  it('lets medicines lapse once they stop being given, and shows the statin held', () => {
    const med = Object.fromEntries(medsAt(at(4, '23:00')).map((m) => [m.drug.id, m.state]));
    expect(med).toMatchObject({ paracetamol: 'finished', clarithromycin: 'stopped', atorvastatin: 'held', oxygen: 'stopped', coamoxiclav: 'given' });
  });

  it('is at home after discharge', () => {
    expect(stateAt(DISCHARGED).place?.title).toBe('Home');
  });
});

describe('response times', () => {
  it('meets every step of the Sepsis Six within the hour, antibiotics at 50 minutes', () => {
    const steps = sepsisSix();
    expect(steps.every((s) => s.met)).toBe(true);
    expect(Object.fromEntries(steps.map((s) => [s.name, s.minutes]))).toEqual({ Oxygen: 15, 'Blood cultures': 20, Lactate: 25, Fluids: 30, Antibiotics: 50, 'Urine output': 35 });
  });

  it('measures time at high risk and time to first clinical review', () => {
    const high = periodsAtOrAbove(7);
    expect(high).toHaveLength(1);
    expect(clock(high[0][0])).toBe('00:00');
    expect(clock(high[0][1])).toBe('05:00');
    const r = timeToReview(5)!;
    expect(clock(r.trigger.t)).toBe('23:30');
    expect(r.review.id).toBe('outreach');
    expect(r.minutes).toBe(45);
  });
});
