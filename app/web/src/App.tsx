import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

type School = {
  urn: string;
  name: string;
  phase: string;
  region: string;
  town: string;
  postcode: string;
  website: string;
  telephone: string;
  emails: string[];
  has_pupil_premium: number;
  has_send: number;
  ofsted_mention: string;
  lat: number | null;
  lng: number | null;
};

async function fetchJson(url: string) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || r.statusText);
  return j;
}

const App: React.FC = () => {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [phase, setPhase] = useState('');
  const [hasSend, setHasSend] = useState(false);
  const [hasPupilPremium, setHasPupilPremium] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [selected, setSelected] = useState<School | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchJson('/api/stats').then(setStats).catch(()=>{});
  }, []);

  async function refresh() {
    setErr('');
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (region) params.set('region', region);
    if (phase) params.set('phase', phase);
    if (hasSend) params.set('hasSend', 'true');
    if (hasPupilPremium) params.set('hasPupilPremium', 'true');
    params.set('limit', '1000');

    const j = await fetchJson('/api/schools?' + params.toString());
    setSchools(j.schools || []);
  }

  useEffect(() => {
    refresh().catch(e => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regions = useMemo(() => (stats?.byRegion || []).map((x: any) => x.region).filter(Boolean), [stats]);
  const phases = useMemo(() => (stats?.byPhase || []).map((x: any) => x.phase).filter(Boolean), [stats]);

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    // Map init
    const map = L.map('map', { zoomControl: true }).setView([52.7, -1.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerRef.current = layer;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  function renderMarkers(items: School[]) {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const s of items) {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
      const m = L.circleMarker([s.lat, s.lng], {
        radius: 4,
        color: '#2563eb',
        weight: 1,
        fillColor: '#60a5fa',
        fillOpacity: 0.8,
      });
      m.on('click', () => setSelected(s));
      m.addTo(layer);
    }
  }

  useEffect(() => {
    renderMarkers(schools);
  }, [schools]);

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100">
      <div className="h-full grid grid-cols-[420px_1fr]">
        <aside className="h-full border-r border-white/10 bg-slate-950/60 backdrop-blur p-4 overflow-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tight">Become Inspired</h1>
              <p className="text-xs text-slate-400">Workshop System • internal MVP</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
              {stats?.totals?.schools ? `${stats.totals.schools} schools` : 'loading…'}
            </span>
          </div>

          {err ? <div className="mt-3 text-xs text-red-300">{err}</div> : null}

          <div className="mt-4 grid gap-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name, URN, postcode, town"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />

            <div className="grid grid-cols-2 gap-2">
              <select value={region} onChange={e => setRegion(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <option value="">All regions</option>
                {regions.map((r: string) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={phase} onChange={e => setPhase(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <option value="">All phases</option>
                {phases.map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasSend} onChange={e => setHasSend(e.target.checked)} />
                SEND
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasPupilPremium} onChange={e => setHasPupilPremium(e.target.checked)} />
                Pupil Premium
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => refresh().catch(e => setErr(String(e?.message || e)))}
                className="flex-1 px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 font-extrabold hover:bg-cyan-400"
              >
                Apply filters
              </button>
              <button
                onClick={() => { setQ(''); setRegion(''); setPhase(''); setHasSend(false); setHasPupilPremium(false); }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-400">
            Showing {schools.length} schools (max 1000 per query).
            {stats?.enriched?.withEmails != null ? ` • ${stats.enriched.withEmails} have emails` : ''}
          </div>

          <div className="mt-4 grid gap-2">
            {schools.slice(0, 60).map(s => (
              <button
                key={s.urn}
                onClick={() => setSelected(s)}
                className={
                  "text-left p-3 rounded-2xl border transition " +
                  (selected?.urn === s.urn
                    ? "bg-cyan-500/10 border-cyan-500/30"
                    : "bg-white/5 border-white/10 hover:bg-white/10")
                }
              >
                <div className="text-sm font-bold text-slate-100 leading-tight">{s.name}</div>
                <div className="text-xs text-slate-400">{s.town} • {s.postcode} • {s.phase}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {s.has_send ? 'SEND' : ''}{s.has_send && s.has_pupil_premium ? ' • ' : ''}{s.has_pupil_premium ? 'Pupil Premium' : ''}
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="mt-5 pt-4 border-t border-white/10">
              <div className="text-base font-black">{selected.name}</div>
              <div className="text-xs text-slate-400">{selected.postcode} • {selected.town} • {selected.region || '—'}</div>

              <div className="mt-3 text-xs text-slate-200 grid gap-1">
                <div><span className="text-slate-400">URN:</span> {selected.urn}</div>
                <div><span className="text-slate-400">Phone:</span> {selected.telephone || '—'}</div>
                <div>
                  <span className="text-slate-400">Website:</span> {selected.website
                    ? <a className="text-cyan-300 hover:underline" href={(selected.website.startsWith('http') ? selected.website : `https://${selected.website}`)} target="_blank">{selected.website}</a>
                    : '—'}
                </div>
                <div><span className="text-slate-400">Emails:</span> {(selected.emails || []).slice(0, 5).join(', ') || '—'}</div>
                <div>
                  <span className="text-slate-400">Flags:</span> {selected.has_send ? 'SEND' : 'No SEND'} • {selected.has_pupil_premium ? 'Pupil Premium' : 'No Pupil Premium'}
                </div>
                {selected.ofsted_mention ? <div><span className="text-slate-400">Ofsted mention:</span> {selected.ofsted_mention}</div> : null}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="relative h-full">
          <div id="map" className="h-full w-full" />
          <div className="absolute right-4 top-4 rounded-2xl bg-slate-950/70 border border-white/10 backdrop-blur px-3 py-2 text-xs text-slate-200">
            OpenStreetMap • postcode-level pins (after geocode)
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
