/**
 * Time in the record is minutes from 00:00 on the day of admission, Monday 5 October 2026.
 * Plain numbers keep the arithmetic exact and avoid time zones and daylight saving entirely.
 */

export const DAY = 1440;
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FIRST_DATE = 5; // Monday 5 October 2026

/** at(2, '01:05') is Wednesday 7 October, 01:05. */
export function at(day: number, hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`bad time ${hhmm}`);
  return day * DAY + Number(m[1]) * 60 + Number(m[2]);
}

export const ADMITTED = at(0, '14:20');
export const DISCHARGED = at(5, '11:30');
/** What the timeline can show: from late morning on admission day to the end of discharge day. */
export const DOMAIN = { start: at(0, '12:00'), end: at(6, '00:00') };

export function clock(t: number): string {
  const m = ((Math.round(t) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function dayLabel(t: number): string {
  const d = Math.floor(t / DAY);
  return `${WEEKDAY[((d % 7) + 7) % 7]} ${FIRST_DATE + d} Oct`;
}

export function weekday(t: number): string {
  return WEEKDAY[((Math.floor(t / DAY) % 7) + 7) % 7];
}

export const stamp = (t: number): string => `${dayLabel(t)}, ${clock(t)}`;

/** Day of stay, counting the day of admission as day 1. */
export const stayDay = (t: number): number => Math.floor(t / DAY) + 1;

export function duration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  const d = Math.floor(m / DAY);
  const h = Math.floor((m % DAY) / 60);
  const r = m % 60;
  const parts = [d ? `${d} ${d === 1 ? 'day' : 'days'}` : '', h ? `${h} h` : '', r && !d ? `${r} min` : ''];
  return parts.filter(Boolean).join(' ');
}

/** Parses ?at=wed-01:05 style deep links (weekday of the stay and a clock time). */
export function parseAt(s: string | null): number | null {
  const m = /^(mon|tue|wed|thu|fri|sat|sun)-(\d{2}:\d{2})$/i.exec(s ?? '');
  if (!m) return null;
  const d = WEEKDAY.findIndex((w) => w.toLowerCase() === m[1].toLowerCase());
  if (d < 0 || d > 5) return null;
  return at(d, m[2]);
}
