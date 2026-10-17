/** The map: the patient's conditions and each medicine's exposure on one time axis, with collisions bracketed between lanes. */
import { useLayoutEffect, useRef, useState } from 'react';
import { EVENTS, drugById } from '../record/record';
import { DAY, DISCHARGED, clock, dayLabel } from '../record/time';
import { CONDITIONS, exposure, inhibition, type Collision } from '../meds/analysis';
import type { Interval } from '../meds/intervals';
import { DRUG_IDS, PHARM } from '../meds/pharma';

export interface View {
  start: number;
  end: number;
}

const AXIS = 40;
const HEAD = 24;
const COND_H = 40;
const DRUG_H = 40;
const LABEL_W = 176;

interface Row {
  id: string;
  label: string;
  sub: string;
  y: number;
  h: number;
  kind: 'cond' | 'drug';
}

function rows(): { rows: Row[]; height: number; heads: Array<[string, number]> } {
  const out: Row[] = [];
  const heads: Array<[string, number]> = [];
  let y = AXIS;
  heads.push(['The patient', y]);
  y += HEAD;
  for (const c of CONDITIONS) {
    out.push({ id: c.id, label: c.label, sub: c.note, y, h: COND_H, kind: 'cond' });
    y += COND_H;
  }
  heads.push(['Medicines', y]);
  y += HEAD;
  for (const d of DRUG_IDS) {
    const drug = drugById(d);
    out.push({ id: d, label: drug.name, sub: PHARM[d].klass, y, h: DRUG_H, kind: 'drug' });
    y += DRUG_H;
  }
  return { rows: out, height: y + 8, heads };
}

const LAYOUT = rows();
const rowOf = new Map(LAYOUT.rows.map((r) => [r.id, r]));

interface Props {
  view: View;
  list: Collision[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function MapView({ view, list, selected, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(560, Math.floor(e.contentRect.width) - LABEL_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = (t: number) => ((t - view.start) / (view.end - view.start)) * w;
  const clip = (iv: Interval): [number, number] | null => {
    const a = Math.max(x(iv[0]), -4);
    const b = Math.min(x(iv[1]), w + 4);
    return b > a ? [a, b] : null;
  };
  const span = view.end - view.start;
  const step = span > 4 * DAY ? 720 : span > 1.5 * DAY ? 360 : span > 12 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(view.start / step) * step; t <= view.end; t += step) ticks.push(t);
  const days: number[] = [];
  for (let d = Math.floor(view.start / DAY); d * DAY < view.end; d++) days.push(d * DAY);

  const sel = list.find((c) => c.id === selected) ?? null;
  const number = new Map(list.map((c, i) => [c.id, i + 1]));
  const drawn = list.filter((c) => c.kind !== 'check');

  // badges: one per collision at the start of its first interval, nudged right so none overlap
  const badges = new Map<string, [number, number]>();
  const placed: Array<[number, number]> = [];
  for (const c of [...drawn].sort((p, q) => (p.status === 'happened' ? p.actual : p.planned)[0][0] - (q.status === 'happened' ? q.actual : q.planned)[0][0])) {
    const iv = (c.status === 'happened' ? c.actual : c.planned)[0];
    const top = Math.min(rowOf.get(c.lanes[0])!.y, rowOf.get(c.lanes[1])!.y);
    let bx = Math.min(w - 12, Math.max(12, x(iv[0]) + 2));
    while (placed.some(([px, py]) => Math.abs(px - bx) < 22 && Math.abs(py - (top - 2)) < 22)) bx += 22;
    placed.push([bx, top - 2]);
    badges.set(c.id, [bx, top - 2]);
  }

  return (
    <div className="map" ref={wrap}>
      <div className="map-labels" style={{ width: LABEL_W, height: LAYOUT.height }}>
        {LAYOUT.heads.map(([t, y]) => <div key={t} className="lhead" style={{ top: y }}>{t}</div>)}
        {LAYOUT.rows.map((r) => (
          <div key={r.id} className={`lrow ${r.kind}`} style={{ top: r.y, height: r.h }}>
            <b>{r.label}</b>
            <span>{r.sub}</span>
          </div>
        ))}
      </div>
      <svg className="map-svg" width={w} height={LAYOUT.height} role="img" aria-label="Medicines and conditions over the stay, with collisions marked">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
          <pattern id="hatch-amber" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-amber" />
          </pattern>
        </defs>

        {/* nights and days */}
        {days.map((d) => (
          <g key={d}>
            <rect x={x(d - 4 * 60)} y={AXIS} width={x(d + 8 * 60) - x(d - 4 * 60)} height={LAYOUT.height - AXIS} className="night" />
            <line x1={x(d)} x2={x(d)} y1={0} y2={LAYOUT.height} className="midnight" />
          </g>
        ))}
        <rect x={x(DISCHARGED)} y={AXIS} width={Math.max(0, w - x(DISCHARGED))} height={LAYOUT.height - AXIS} className="home" />

        {/* axis */}
        <g className="axis">
          {days.map((d, i) => {
            const lx = Math.max(4, x(d) + 6);
            const next = days[i + 1] !== undefined ? x(days[i + 1]) : w;
            return next - lx > 56 ? <text key={d} x={lx} y={15} className="day">{dayLabel(d)}</text> : null;
          })}
          {ticks.map((t) => (t % DAY === 0 ? null : (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={28} y2={AXIS} className="tick" />
              {x(t) > 16 && x(t) < w - 16 && <text x={x(t)} y={34} textAnchor="middle" className="tick-lbl">{clock(t)}</text>}
            </g>
          )))}
          {DISCHARGED > view.start && DISCHARGED < view.end && <text x={x(DISCHARGED) + 5} y={AXIS + 14} className="home-lbl">Home</text>}
        </g>
        {LAYOUT.heads.map(([t, y]) => <line key={t} x1={0} x2={w} y1={y + HEAD - 0.5} y2={y + HEAD - 0.5} className="rule" />)}

        {/* conditions */}
        {CONDITIONS.map((c) => {
          const r = rowOf.get(c.id)!;
          return c.spans().map((iv) => {
            const s = clip(iv);
            if (!s) return null;
            return <rect key={`${c.id}${iv[0]}`} x={s[0]} y={r.y + 7} width={Math.max(4, s[1] - s[0])} height={r.h - 14} rx={4} className={`cond ${c.id}`} />;
          });
        })}

        {/* medicines: what was planned (hatched), what acted (solid), and the doses */}
        {DRUG_IDS.map((d) => {
          const r = rowOf.get(d)!;
          const cy = r.y + r.h / 2;
          const inh = inhibition(d, 'actual');
          return (
            <g key={d}>
              <line x1={0} x2={w} y1={r.y + r.h} y2={r.y + r.h} className="lane-rule" />
              {exposure(d, 'planned').map((iv) => {
                const s = clip(iv);
                return s && <rect key={`p${iv[0]}`} x={s[0]} y={cy - 7} width={s[1] - s[0]} height={14} rx={3} fill="url(#hatch)" className="planned" />;
              })}
              {exposure(d, 'actual').map((iv) => {
                const s = clip(iv);
                return s && <rect key={`a${iv[0]}`} x={s[0]} y={cy - 7} width={s[1] - s[0]} height={14} rx={3} className="acting" />;
              })}
              {inh.map((iv) => {
                const s = clip(iv);
                return s && (
                  <g key={`i${iv[0]}`}>
                    <line x1={s[0]} x2={s[1]} y1={cy + 12} y2={cy + 12} className="inhib" />
                    {s[1] - s[0] > 160 && <text x={s[1] - 4} y={cy + 10} textAnchor="end" className="inhib-lbl">CYP3A4 blocked</text>}
                  </g>
                );
              })}
              {EVENTS.filter((e) => e.row === d && (e.kind === 'dose' || e.kind === 'stop')).map((e) => {
                const cx = x(e.t);
                if (cx < -6 || cx > w + 6) return null;
                if (e.kind === 'stop') return <path key={e.id} d={`M${cx} ${cy - 10} V${cy + 10}`} className="stop" />;
                return <circle key={e.id} cx={cx} cy={cy} r={3.2} className={`dose ${e.status}`}><title>{`${e.title}, ${clock(e.t)}`}</title></circle>;
              })}
            </g>
          );
        })}

        {/* collisions: a highlight on each lane and a bracket between them */}
        {drawn.map((c) => {
          const [ra, rb] = [rowOf.get(c.lanes[0])!, rowOf.get(c.lanes[1])!];
          const top = Math.min(ra.y, rb.y);
          const bot = Math.max(ra.y + ra.h, rb.y + rb.h);
          const happened = c.status === 'happened';
          const ivs = happened ? c.actual : c.planned;
          const on = !sel || sel.id === c.id;
          return (
            <g key={c.id} className={`zone ${c.status} ${c.kind}${sel?.id === c.id ? ' sel' : ''}`} opacity={on ? 1 : 0.18} onClick={() => onSelect(sel?.id === c.id ? null : c.id)}>
              {ivs.map((iv, k) => {
                const s = clip(iv);
                if (!s) return null;
                const [x0, x1] = [s[0], Math.max(s[1], s[0] + 6)];
                const mid = (x0 + x1) / 2;
                return (
                  <g key={k}>
                    {[ra, rb].map((r) => <rect key={r.id} x={x0} y={r.y + 3} width={x1 - x0} height={r.h - 6} rx={5} className="hit-lane" />)}
                    <line x1={mid} x2={mid} y1={top + 3} y2={bot - 3} className="bracket" />
                    {k === 0 && badges.has(c.id) && (
                      <g className="badge" transform={`translate(${badges.get(c.id)![0]},${badges.get(c.id)![1]})`}>
                        <circle r={10} />
                        <text y={4} textAnchor="middle">{number.get(c.id)}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
