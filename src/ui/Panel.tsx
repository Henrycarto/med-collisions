/** The pair matrix and the list of collisions, each with what happened and what the record shows. */
import { byId, drugById } from '../record/record';
import { duration, stamp } from '../record/time';
import type { Collision } from '../meds/analysis';
import { DRUG_IDS, INTERACTIONS } from '../meds/pharma';

const SHORT: Record<string, string> = {
  amoxicillin: 'Amox', coamoxiclav: 'Co-amox', clarithromycin: 'Clari', paracetamol: 'Para', enoxaparin: 'Enox', amlodipine: 'Amlo', atorvastatin: 'Atorva',
};
const STATUS: Record<Collision['status'], string> = { happened: 'Happened', averted: 'Averted', clear: 'Checked, clear' };
const KIND: Record<Collision['kind'], string> = { 'drug-drug': 'Drug and drug', duplicate: 'Duplicate', 'drug-condition': 'Drug and patient', gap: 'Gap in treatment', check: 'Dose check' };

export function Matrix({ co, list, selected, onSelect }: { co: Map<string, number>; list: Collision[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const max = Math.max(...co.values());
  const n = DRUG_IDS.length;
  const cell = 34;
  const left = 64;
  const top = 8;
  return (
    <section className="card matrix">
      <span className="kicker">Every pair of medicines</span>
      <svg width={left + cell * (n - 1) + 4} height={top + cell * (n - 1) + 58} role="img" aria-label="Matrix of medicine pairs: shading shows hours both were acting, marks show known interactions">
        {DRUG_IDS.slice(1).map((b, j) => (
          <text key={b} x={left - 6} y={top + j * cell + cell / 2 + 4} textAnchor="end" className="mlabel">{SHORT[b]}</text>
        ))}
        {DRUG_IDS.slice(0, -1).map((a, i) => (
          <text key={a} x={left + i * cell + cell / 2} y={top + (n - 1) * cell + 14} textAnchor="end" transform={`rotate(-40 ${left + i * cell + cell / 2} ${top + (n - 1) * cell + 14})`} className="mlabel">{SHORT[a]}</text>
        ))}
        {DRUG_IDS.map((a, i) =>
          DRUG_IDS.map((b, j) => {
            if (j <= i) return null;
            const hours = co.get(`${a}+${b}`) ?? 0;
            const x = INTERACTIONS.find((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a));
            const c = x ? list.find((k) => k.id === `${x.a}+${x.b}`) : undefined;
            const cx = left + i * cell;
            const cy = top + (j - 1) * cell;
            return (
              <g key={`${a}${b}`} className={`mcell${c ? ` has ${c.status}` : ''}${c && selected === c.id ? ' sel' : ''}`} onClick={() => c && onSelect(selected === c.id ? null : c.id)}>
                <rect x={cx + 1} y={cy + 1} width={cell - 2} height={cell - 2} rx={5} style={{ fillOpacity: hours ? 0.12 + 0.6 * (hours / max) : 0 }} className="mfill" />
                <rect x={cx + 1} y={cy + 1} width={cell - 2} height={cell - 2} rx={5} className="mframe" />
                {c && <circle cx={cx + cell / 2} cy={cy + cell / 2} r={6} className={`mmark ${c.status}`} />}
                <title>{`${drugById(a).name} and ${drugById(b).name}: ${hours ? `${duration(hours)} both acting` : 'never acting together'}${c ? `. ${c.title}: ${STATUS[c.status].toLowerCase()}.` : '. No interaction in the table.'}`}</title>
              </g>
            );
          }),
        )}
      </svg>
      <p className="legend">Shade: how long both were acting. Filled mark: an interaction that happened. Ring: one that was averted.</p>
    </section>
  );
}

export function Cards({ list, selected, onSelect, onZoom }: { list: Collision[]; selected: string | null; onSelect: (id: string | null) => void; onZoom: (c: Collision) => void }) {
  return (
    <ol className="cards">
      {list.map((c, i) => {
        const open = selected === c.id;
        return (
          <li key={c.id} className={`ccard ${c.status}${open ? ' open' : ''}`}>
            <button className="chead" onClick={() => onSelect(open ? null : c.id)} aria-expanded={open}>
              <span className="num">{i + 1}</span>
              <span className="ctitle">
                <b>{c.title}</b>
                <span className="tags">
                  <span className={`status ${c.status}`}>{STATUS[c.status]}</span>
                  <span className="kind">{KIND[c.kind]}</span>
                </span>
              </span>
            </button>
            <p className="headline">{c.headline}</p>
            {open && (
              <div className="cbody">
                <h4>Why it matters</h4>
                <p>{c.mechanism}</p>
                <h4>What the record shows</h4>
                <p>{c.record}</p>
                <h4>Rule</h4>
                <p>{c.action}</p>
                {c.evidence.length > 0 && (
                  <>
                    <h4>Evidence</h4>
                    <ul className="evidence">
                      {c.evidence.map((id) => {
                        const e = byId.get(id)!;
                        return <li key={id}><span>{stamp(e.t)}</span> {e.title}</li>;
                      })}
                    </ul>
                  </>
                )}
                {c.kind !== 'check' && <button className="btn small" onClick={() => onZoom(c)}>Zoom the map to this</button>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
