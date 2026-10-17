import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PATIENT } from './record/record';
import { ADMITTED, DISCHARGED, at, duration, stamp } from './record/time';
import { coExposure, collisions, type Collision } from './meds/analysis';
import { merge } from './meds/intervals';
import { Cards, Matrix } from './ui/Panel';
import { MapView, type View } from './ui/MapView';

const STAY: View = { start: at(0, '12:00'), end: at(6, '06:00') };
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function viewFor(c: Collision): View {
  const ivs = merge(c.status === 'happened' ? c.actual : c.planned);
  if (!ivs.length) return STAY;
  const s = ivs[0][0];
  const e = ivs[ivs.length - 1][1];
  const pad = Math.max(6 * 60, (e - s) * 0.35);
  return { start: Math.max(STAY.start, s - pad), end: Math.min(STAY.end, e + pad) };
}

export default function App() {
  const list = useMemo(collisions, []);
  const co = useMemo(coExposure, []);
  const initial = new URLSearchParams(window.location.search).get('c');
  const [selected, setSelected] = useState<string | null>(list.some((c) => c.id === initial) ? initial : null);
  const [view, setView] = useState<View>(STAY);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const anim = useRef<number | null>(null);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);
  const dimmed = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    const q = new URLSearchParams();
    if (selected) q.set('c', selected);
    window.history.replaceState(null, '', selected ? `?${q}` : window.location.pathname);
  }, [selected]);

  const animateTo = useCallback((to: View) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    if (reduced()) return setView(to);
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / 600);
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      setView({ start: from.start + (to.start - from.start) * e, end: from.end + (to.end - from.end) * e });
      anim.current = f < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  const counts = { happened: 0, averted: 0, clear: 0 };
  for (const c of list) counts[c.status]++;
  const zoomed = view.end - view.start < STAY.end - STAY.start - 1;

  return (
    <div className="shell">
      <header className="banner">
        <div className="who">
          <h1>{PATIENT.name}</h1>
          <span>{PATIENT.age}, {PATIENT.sex}. {PATIENT.number}</span>
        </div>
        <div className="dx">
          <b>Medicine collisions</b>
          <span>{stamp(ADMITTED)} to {stamp(DISCHARGED)}, {duration(DISCHARGED - ADMITTED)}. Seven medicines, every pair checked.</span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setTheme(dimmed ? 'light' : 'dark')} aria-pressed={dimmed}>
          {dimmed ? 'Bright display' : 'Dim display'}
        </button>
      </header>

      <div className="summary">
        <span className="pill happened"><b>{counts.happened}</b> happened</span>
        <span className="pill averted"><b>{counts.averted}</b> averted by the team</span>
        <span className="pill clear"><b>{counts.clear}</b> checked, clear</span>
        <div className="spacer" />
        {zoomed && <button className="btn small" onClick={() => animateTo(STAY)}>Whole stay</button>}
      </div>

      <main className="main">
        <section className="map-wrap" aria-label="Map">
          <MapView view={view} list={list} selected={selected} onSelect={setSelected} />
          <div className="key">
            <span><i className="k-acting" /> Acting</span>
            <span><i className="k-planned" /> Planned but not acting (held, vomited or stopped)</span>
            <span><i className="k-dose" /> Dose given</span>
            <span><i className="k-held" /> Held</span>
            <span><i className="k-lost" /> Not absorbed</span>
            <span><i className="k-inhib" /> Enzyme still blocked</span>
            <span><i className="k-zone" /> Collision, numbered as in the list</span>
          </div>
          <p className="method">
            A dose acts for its duration, and at least until the next dose is due, so a normal ward timetable leaves no gap and a lost dose does.
            Clarithromycin keeps blocking CYP3A4 for two days after the last dose. Amlodipine acts for about two days. Averted means the team's
            hold or stop is the only reason the overlap did not happen.
          </p>
        </section>
        <aside className="panel">
          <Matrix co={co} list={list} selected={selected} onSelect={setSelected} />
          <Cards list={list} selected={selected} onSelect={setSelected} onZoom={(c) => {
              animateTo(viewFor(c));
              document.querySelector('.map-wrap')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
            }} />
          <p className="foot">
            A fictional patient and a small curated interaction table, for demonstrating interface design and the logic behind it. Not a medical
            device and not prescribing advice. The same patient as the ward monitor, the patient timeline and the decision cockpit.
          </p>
        </aside>
      </main>
    </div>
  );
}
