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
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', height: '100vh', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <div style={{ borderRight: '1px solid #e5e7eb', padding: 16, overflow: 'auto' }}>
        <h2 style={{ margin: 0 }}>Become Inspired</h2>
        <p style={{ marginTop: 4, color: '#6b7280' }}>Workshop System (MVP)</p>

        {err ? <div style={{ color: '#b91c1c', fontSize: 12 }}>{err}</div> : null}

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, URN, postcode, town" style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }} />

          <select value={region} onChange={e => setRegion(e.target.value)} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <option value="">All regions</option>
            {regions.map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={phase} onChange={e => setPhase(e.target.value)} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <option value="">All phases</option>
            {phases.map((p: string) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label style={{ fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={hasSend} onChange={e => setHasSend(e.target.checked)} />{' '}
            SEND
          </label>

          <label style={{ fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={hasPupilPremium} onChange={e => setHasPupilPremium(e.target.checked)} />{' '}
            Pupil Premium
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => refresh().catch(e => setErr(String(e?.message || e)))} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #2563eb', background: '#2563eb', color: 'white', fontWeight: 700 }}>
              Apply filters
            </button>
            <button onClick={() => { setQ(''); setRegion(''); setPhase(''); setHasSend(false); setHasPupilPremium(false); }} style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: 'white' }}>
              Reset
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
          Showing {schools.length} schools (max 1000 per query).
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {schools.slice(0, 50).map(s => (
            <div key={s.urn} onClick={() => setSelected(s)} style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 12, cursor: 'pointer', background: selected?.urn === s.urn ? '#eff6ff' : 'white' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{s.town} • {s.postcode} • {s.phase}</div>
            </div>
          ))}
        </div>

        {selected ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 800 }}>{selected.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{selected.postcode} • {selected.town} • {selected.region}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div><b>URN:</b> {selected.urn}</div>
              <div><b>Phone:</b> {selected.telephone || '—'}</div>
              <div><b>Website:</b> {selected.website ? <a href={selected.website} target="_blank">{selected.website}</a> : '—'}</div>
              <div><b>Emails:</b> {(selected.emails || []).slice(0, 5).join(', ') || '—'}</div>
              <div><b>SEND:</b> {selected.has_send ? 'Yes' : 'No'} | <b>Pupil Premium:</b> {selected.has_pupil_premium ? 'Yes' : 'No'}</div>
              {selected.ofsted_mention ? <div><b>Ofsted mention:</b> {selected.ofsted_mention}</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'relative' }}>
        <div id="map" style={{ height: '100%', width: '100%' }} />
        <div style={{ position: 'absolute', right: 12, top: 12, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, fontSize: 12, color: '#374151' }}>
          Map: OpenStreetMap (postcode-level for now)
        </div>
      </div>
    </div>
  );
};

export default App;
