import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const BUILD_STAMP = new Date().toISOString();

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

type LeadStatus = 'new' | 'contacting' | 'interested' | 'booked' | 'not_now';

type SchoolActionRecord = {
  status: LeadStatus;
  notes: string;
  followUpAt: string;
  segments: string[];
  updatedAt: string;
};

type SchoolActionState = Record<string, SchoolActionRecord>;

const DEFAULT_ACTION_RECORD: SchoolActionRecord = {
  status: 'new',
  notes: '',
  followUpAt: '',
  segments: [],
  updatedAt: '',
};

const QUICK_ACTIONS_STORAGE_KEY = 'bi-workshop-quick-actions-v1';

type ProjectKey = 'schools' | 'hotels';

const PROJECTS: Record<ProjectKey, { name: string; subtitle: string; searchPlaceholder: string }> = {
  schools: {
    name: 'Schools Outreach',
    subtitle: 'Education lead mapping & outreach',
    searchPlaceholder: 'Search school name, URN, postcode, town',
  },
  hotels: {
    name: 'Hotels Outreach',
    subtitle: 'Hospitality digital services prospecting',
    searchPlaceholder: 'Search hotel, group, town, postcode',
  },
};

function normalizeSchoolName(name: string) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORKED_WITH_SCHOOLS = new Set<string>([
  'Nethergate Academy',
  'Biggin Hill Primary',
  'Woodland Primary',
  'Crumpsall Lane Primary',
  'Priory Woods',
  'St Leo’s and Southmead Primary',
  'St Clements Primary',
  'Priestley Smith',
  'St Luke’s Primary',
  'Seely Primary',
  'TBAC @ The Learning Centre',
  'Skegness Academy',
  'Harbinger Primary',
  'Greenfields Primary',
  'Whitnash Primary',
  'South Nottinghamshire Academy and Sixth Form',
  'Woodlands Primary',
  'Welcombe Hills Primary',
  'Southwark Primary',
  'Highbury fields, Islington',
  'Eden Girls Academy',
  'Fernwood school',
  'Little Heath Primary',
  'King Edward VI School',
  'Abbott School',
  'Redhill Academy',
  'Challney Boys School',
  'Dogsthorpe Primary',
  'Wells Academy',
  'Ingoldmells Primary',
  'Seathorne Primary',
  'Warren Primary',
  'Ormsby academy',
  'Southwold Primary',
  'Bilborough College',
  'Hogarth Academy',
  'Ark Victoria Academy',
  'Norman Parnell Primary',
  'Manorfield Primary',
  'Meade Hill School',
  'Blessed Sacrament Primary',
  'Sneinton Primary',
  'Nottingham Academy',
  'Notts Girls Academy',
  'George Greens Primary',
  'Sandwell College',
  'Oaklands Primary',
  'Col Frank Seely Academy',
  'Seven Kings School',
  'Beech Hill Primary',
  'Copenhagen Primary',
  'Mansfield Primary',
  'Roscoe Primary',
  'New Park Primary',
  'Breckon Hill Primary',
  'Halewood Academy',
  'Ellis Guildford School',
].map(normalizeSchoolName));

function formatTelephone(raw: string | null | undefined) {
  let s = String(raw || '').trim();
  if (!s) return '—';
  // common artefact: numeric string from spreadsheets, e.g. "01234567890.0"
  if (/^\d+\.\d+$/.test(s)) {
    const [a, b] = s.split('.');
    if (b && /^0+$/.test(b)) s = a;
  }
  s = s.replace(/\.0+$/, '');
  // remove spaces/brackets
  const digits = s.replace(/\D+/g, '');
  if (!digits) return s;

  // If number looks like it lost its leading 0 (common in spreadsheets), add it back.
  // Heuristic: UK landlines are typically 10-11 digits including leading 0.
  let d = digits;
  if (d.length === 10 && !d.startsWith('0')) d = '0' + d;

  // Simple grouping for readability (not perfect, but better than a blob)
  if (d.length === 11) return d.replace(/(\d{5})(\d{3})(\d{3})/, '$1 $2 $3');
  if (d.length === 10) return d.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  return d;
}

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
  const [schools, setSchools] = useState<School[]>([]); // list + sidebar
  const [pins, setPins] = useState<School[]>([]);       // map pins (viewport-based)
  const [selected, setSelected] = useState<School | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickActionsByUrn, setQuickActionsByUrn] = useState<SchoolActionState>({});
  const [newSegment, setNewSegment] = useState('');
  const [activeProject, setActiveProject] = useState<ProjectKey>('schools');
  const [filteredMeta, setFilteredMeta] = useState<{ schools: number; withEmails: number; withoutEmails: number; geocoded: number } | null>(null);

  useEffect(() => {
    fetchJson('/api/stats').then(setStats).catch(()=>{});
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SchoolActionState;
      if (parsed && typeof parsed === 'object') setQuickActionsByUrn(parsed);
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(quickActionsByUrn));
    } catch {
      // ignore storage write errors
    }
  }, [quickActionsByUrn]);

  type FilterOverrides = Partial<{ q: string; region: string; phase: string; hasSend: boolean; hasPupilPremium: boolean }>;

  const appliedFiltersRef = useRef<{ q: string; region: string; phase: string; hasSend: boolean; hasPupilPremium: boolean }>({
    q: '',
    region: '',
    phase: '',
    hasSend: false,
    hasPupilPremium: false,
  });

  function currentPinParams(overrides: FilterOverrides = {}) {
    const base = appliedFiltersRef.current;
    const effectiveQ = overrides.q ?? base.q;
    const effectiveRegion = overrides.region ?? base.region;
    const effectivePhase = overrides.phase ?? base.phase;
    const effectiveHasSend = overrides.hasSend ?? base.hasSend;
    const effectiveHasPupilPremium = overrides.hasPupilPremium ?? base.hasPupilPremium;

    const p = new URLSearchParams();
    if (effectiveQ) p.set('q', effectiveQ);
    if (effectiveRegion) p.set('region', effectiveRegion);
    if (effectivePhase) p.set('phase', effectivePhase);
    if (effectiveHasSend) p.set('hasSend', 'true');
    if (effectiveHasPupilPremium) p.set('hasPupilPremium', 'true');

    // Viewport-based pins
    const map = mapRef.current;
    if (map) {
      const b = map.getBounds();
      p.set('minLat', String(b.getSouth()));
      p.set('maxLat', String(b.getNorth()));
      p.set('minLng', String(b.getWest()));
      p.set('maxLng', String(b.getEast()));
      p.set('onlyGeocoded', 'true');
      // cap pins to keep Leaflet snappy; viewport query makes this feel dense without needing country-wide samples
      p.set('limit', '5000');
      p.set('order', 'name');
    } else {
      // fallback (should only happen very early on first load)
      p.set('onlyGeocoded', 'true');
      p.set('limit', '3000');
      p.set('order', 'random');
    }

    return p;
  }

  async function refreshPins(overrides: FilterOverrides = {}) {
    const pinParams = currentPinParams(overrides);
    const pinJ = await fetchJson('/api/schools?' + pinParams.toString());
    setPins(pinJ.schools || []);
  }

  async function refresh(overrides: FilterOverrides = {}) {
    setErr('');
    setLoading(true);

    try {
      // Sidebar list (ordered by name)
      const effectiveQ = overrides.q ?? q;
      const effectiveRegion = overrides.region ?? region;
      const effectivePhase = overrides.phase ?? phase;
      const effectiveHasSend = overrides.hasSend ?? hasSend;
      const effectiveHasPupilPremium = overrides.hasPupilPremium ?? hasPupilPremium;

      appliedFiltersRef.current = {
        q: effectiveQ,
        region: effectiveRegion,
        phase: effectivePhase,
        hasSend: effectiveHasSend,
        hasPupilPremium: effectiveHasPupilPremium,
      };

      const listParams = new URLSearchParams();
      if (effectiveQ) listParams.set('q', effectiveQ);
      if (effectiveRegion) listParams.set('region', effectiveRegion);
      if (effectivePhase) listParams.set('phase', effectivePhase);
      if (effectiveHasSend) listParams.set('hasSend', 'true');
      if (effectiveHasPupilPremium) listParams.set('hasPupilPremium', 'true');
      listParams.set('limit', '1000');
      listParams.set('order', 'name');

      const listJ = await fetchJson('/api/schools?' + listParams.toString());
      setSchools(listJ.schools || []);
      setFilteredMeta(listJ.meta || null);

      // Pins are fetched based on current map viewport (so no more "missing patches")
      await refreshPins(overrides);

      // If a search query is present, zoom map to visible filtered pins.
      const effectiveQForZoom = overrides.q ?? q;
      if ((effectiveQForZoom || '').trim()) {
        const geocoded = (listJ.schools || []).filter((s: School) => typeof s.lat === 'number' && typeof s.lng === 'number');
        if (geocoded.length && mapRef.current) {
          const pts = geocoded.map((s: School) => [s.lat as number, s.lng as number]) as [number, number][];
          const bounds = L.latLngBounds(pts);
          mapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
          await refreshPins(overrides);
        }
      }

      setLastRefreshAt(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(e => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geocodedPins = useMemo(() => pins.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number').length, [pins]);

  const regions = useMemo(() => (stats?.byRegion || []).map((x: any) => x.region).filter(Boolean), [stats]);
  const phases = useMemo(() => (stats?.byPhase || []).map((x: any) => x.phase).filter(Boolean), [stats]);

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerByUrnRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const detailRef = useRef<HTMLDivElement | null>(null);

  const pinRefreshTimerRef = useRef<number | null>(null);

  function schedulePinsRefresh() {
    // debounce so pan/zoom doesn’t spam the API
    if (pinRefreshTimerRef.current) window.clearTimeout(pinRefreshTimerRef.current);
    pinRefreshTimerRef.current = window.setTimeout(() => {
      refreshPins().catch(e => setErr(String(e?.message || e)));
    }, 180);
  }

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

    // As you move the map, re-fetch pins for the visible area.
    map.on('moveend zoomend', schedulePinsRefresh);

    // First pins fetch once the map is ready
    schedulePinsRefresh();

    return () => {
      map.off('moveend zoomend', schedulePinsRefresh);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  function renderMarkers(items: School[]) {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markerByUrnRef.current = new Map();

    for (const s of items) {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
      const isSel = selected?.urn === s.urn;
      const isWorkedWith = activeProject === 'schools' && WORKED_WITH_SCHOOLS.has(normalizeSchoolName(s.name));
      const hasContactEmail = Array.isArray(s.emails) && s.emails.length > 0;

      const stroke = isSel
        ? '#22c55e'
        : (!hasContactEmail ? '#dc2626' : (isWorkedWith ? '#f59e0b' : '#2563eb'));
      const fill = isSel
        ? '#86efac'
        : (!hasContactEmail ? '#f87171' : (isWorkedWith ? '#fbbf24' : '#60a5fa'));

      const m = L.circleMarker([s.lat, s.lng], {
        radius: isSel ? 7 : 4,
        color: stroke,
        weight: isSel ? 2 : ((!hasContactEmail || isWorkedWith) ? 2 : 1),
        fillColor: fill,
        fillOpacity: 0.9,
      });
      m.on('click', () => { selectSchool(s); });
      m.addTo(layer);
      markerByUrnRef.current.set(s.urn, m);
    }
  }

  useEffect(() => {
    renderMarkers(pins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, selected?.urn, activeProject]);

  async function loadFullSchool(urn: string) {
    const j = await fetchJson('/api/schools/' + encodeURIComponent(urn));
    return (j.school || null) as School | null;
  }

  async function selectSchool(s: School) {
    setSelectedLoading(true);
    try {
      const full = await loadFullSchool(s.urn).catch(() => null);
      setSelected(full || s);
      setDrawerExpanded(false);
    } finally {
      setSelectedLoading(false);
    }
  }

  useEffect(() => {
    if (!selected) return;

    // Pan/zoom map to selected school if it has coords.
    const lat = selected.lat;
    const lng = selected.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current?.getZoom() || 6, 11), { duration: 0.6 });
    }
  }, [selected]);

  const selectedActions = selected
    ? (quickActionsByUrn[selected.urn] || DEFAULT_ACTION_RECORD)
    : DEFAULT_ACTION_RECORD;

  const projectMeta = PROJECTS[activeProject];

  const allKnownSegments = useMemo(() => {
    const s = new Set<string>();
    Object.values(quickActionsByUrn).forEach((v) => (v.segments || []).forEach(seg => s.add(seg)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [quickActionsByUrn]);

  function updateSelectedActions(patch: Partial<SchoolActionRecord>) {
    if (!selected) return;
    setQuickActionsByUrn(prev => {
      const base = prev[selected.urn] || DEFAULT_ACTION_RECORD;
      return {
        ...prev,
        [selected.urn]: {
          ...base,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function addSegmentToSelected(segmentRaw: string) {
    if (!selected) return;
    const segment = segmentRaw.trim();
    if (!segment) return;
    const current = selectedActions.segments || [];
    if (current.includes(segment)) return;
    updateSelectedActions({ segments: [...current, segment] });
    setNewSegment('');
  }

  function removeSegmentFromSelected(segment: string) {
    if (!selected) return;
    updateSelectedActions({ segments: (selectedActions.segments || []).filter(s => s !== segment) });
  }

  function exportSelectedSchool() {
    if (!selected) return;
    const payload = {
      school: selected,
      actions: selectedActions,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = selected.name.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
    a.download = `${safeName || selected.urn}-record.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100">
      <div className="h-full grid grid-cols-[420px_1fr]">
        <aside className="h-full border-r border-white/10 bg-slate-950/60 backdrop-blur p-4 overflow-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tight">The Kosmos System</h1>
              <p className="text-xs text-slate-400">{projectMeta.subtitle}</p>
              <p className="mt-1 text-[10px] text-slate-500">Build: {BUILD_STAMP}</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
              {stats?.totals?.schools ? `${stats.totals.schools} schools` : 'loading…'}
            </span>
          </div>

          {err ? <div className="mt-3 text-xs text-red-300">{err}</div> : null}

          <div className="mt-4 grid gap-2">
            <label className="grid gap-1 text-[11px] text-slate-400">
              <span className="font-bold tracking-wide text-slate-300">Project</span>
              <select
                value={activeProject}
                onChange={(e) => setActiveProject(e.target.value as ProjectKey)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10"
              >
                {(Object.keys(PROJECTS) as ProjectKey[]).map((k) => (
                  <option key={k} value={k}>{PROJECTS[k].name}</option>
                ))}
              </select>
            </label>

            {activeProject !== 'schools' ? (
              <div className="text-[11px] text-amber-300 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2">
                Hotels project mode is scaffolded. Data source wiring is next.
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const nextQ = (e.currentTarget as HTMLInputElement).value;
                  setQ(nextQ);
                  refresh({ q: nextQ }).catch(err => setErr(String(err?.message || err)));
                }
              }}
              placeholder={projectMeta.searchPlaceholder}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />

            <div className="grid grid-cols-2 gap-2">
              <select value={region} onChange={e => { const v = e.target.value; setRegion(v); refresh({ region: v }).catch(err => setErr(String(err?.message || err))); }} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <option value="">All regions</option>
                {regions.map((r: string) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={phase} onChange={e => { const v = e.target.value; setPhase(v); refresh({ phase: v }).catch(err => setErr(String(err?.message || err))); }} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <option value="">All phases</option>
                {phases.map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasSend} onChange={e => { const v = e.target.checked; setHasSend(v); refresh({ hasSend: v }).catch(err => setErr(String(err?.message || err))); }} />
                SEND
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasPupilPremium} onChange={e => { const v = e.target.checked; setHasPupilPremium(v); refresh({ hasPupilPremium: v }).catch(err => setErr(String(err?.message || err))); }} />
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
                onClick={() => { setQ(''); setRegion(''); setPhase(''); setHasSend(false); setHasPupilPremium(false); refresh({ q: '', region: '', phase: '', hasSend: false, hasPupilPremium: false }).catch(err => setErr(String(err?.message || err))); }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-400 grid gap-1">
            <div>
              Filtered total: {filteredMeta?.schools ?? '…'} schools • with email: {filteredMeta?.withEmails ?? '…'} • without email: {filteredMeta?.withoutEmails ?? '…'}
            </div>
            <div>
              Showing {schools.length} schools in list (max 1000) • Pins loaded: {geocodedPins}/{pins.length} geocoded (viewport sample)
            </div>
            {activeProject === 'schools' ? (
              <div className="text-[10px] text-slate-300">Map colours: <span className="text-blue-300">blue</span> = has contact email, <span className="text-red-300">red</span> = no contact email, <span className="text-amber-300">amber</span> = worked with before, <span className="text-emerald-300">green</span> = selected</div>
            ) : null}
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span>{loading ? 'Loading…' : (lastRefreshAt ? `Last refresh: ${new Date(lastRefreshAt).toLocaleTimeString()}` : 'Not refreshed yet')}</span>
              <button
                onClick={() => refresh().catch(e => setErr(String(e?.message || e)))}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Refresh
              </button>
              {pins.length && geocodedPins === 0 ? (
                <span className="text-amber-300">No geocoded pins yet (geocoding may still be running)</span>
              ) : null}
            </div>
          </div>

          {/* Drawer: school details (opens when a pin/school is selected) */}
          {selected ? (
            <div
              className="mt-4 rounded-2xl border border-black/10 bg-white text-black overflow-hidden shadow-sm"
              onClick={() => setDrawerExpanded(true)}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-black/10 bg-white">
                <div className="text-xs font-black tracking-wide text-black/80">School details</div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                  className="text-[11px] px-2 py-1 rounded-lg bg-black/5 border border-black/10 hover:bg-black/10 text-black"
                >
                  Close
                </button>
              </div>

              <div className="p-3">
                {selectedLoading ? (
                  <div className="text-xs text-black/70">Loading…</div>
                ) : (
                  <>
                    <div className="text-base font-black text-black">{selected.name}</div>
                    <div className="text-xs text-black/60">{selected.postcode} • {selected.town} • {selected.region || '—'}</div>

                    <div className="mt-3 text-xs text-black/80 grid gap-1">
                      <div><span className="text-black/50">URN:</span> {selected.urn}</div>
                      <div><span className="text-black/50">Phase:</span> {selected.phase || '—'}</div>
                      <div><span className="text-black/50">Phone:</span> {formatTelephone(selected.telephone)}</div>
                      <div>
                        <span className="text-black/50">Website:</span> {selected.website
                          ? <a className="text-blue-700 hover:underline" href={(selected.website.startsWith('http') ? selected.website : `https://${selected.website}`)} target="_blank">{selected.website}</a>
                          : '—'}
                      </div>
                      <div><span className="text-black/50">Emails:</span> {(selected.emails || []).slice(0, 4).join(', ') || '—'}</div>
                      <div className="text-[11px] text-black/60 mt-1">Click for full details</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            {schools.slice(0, 60).map(s => (
              <button
                key={s.urn}
                onClick={() => selectSchool(s)}
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

          

        </aside>

        <main className="relative h-full">
          <div id="map" className="h-full w-full" />
          {/* Map overlay: expanded school window should appear over the map */}
          {drawerExpanded && selected ? (
            <div className="absolute inset-0 z-[9999]">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => setDrawerExpanded(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-[min(920px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white text-black border border-black/10 shadow-2xl">
                <div className="flex items-start justify-between gap-3 p-4 border-b border-black/10">
                  <div>
                    <div className="text-lg font-black leading-tight">{selected.name}</div>
                    <div className="text-xs text-black/60">{selected.postcode} • {selected.town} • {selected.region || '—'} • URN {selected.urn}</div>
                  </div>
                  <button
                    onClick={() => setDrawerExpanded(false)}
                    className="text-sm px-3 py-2 rounded-xl bg-black/5 border border-black/10 hover:bg-black/10"
                  >
                    Close
                  </button>
                </div>

                <div className="p-4 grid md:grid-cols-2 gap-4">
                  <div className="grid gap-2 text-sm">
                    <div><span className="text-black/50">Phase:</span> {selected.phase || '—'}</div>
                    <div><span className="text-black/50">Phone:</span> {formatTelephone(selected.telephone)}</div>
                    <div>
                      <span className="text-black/50">Website:</span> {selected.website
                        ? <a className="text-blue-700 hover:underline" href={(selected.website.startsWith('http') ? selected.website : `https://${selected.website}`)} target="_blank">{selected.website}</a>
                        : '—'}
                    </div>
                    <div><span className="text-black/50">Emails:</span> {(selected.emails || []).join(', ') || '—'}</div>
                    <div><span className="text-black/50">Flags:</span> {selected.has_send ? 'SEND' : 'No SEND'} • {selected.has_pupil_premium ? 'Pupil Premium' : 'No Pupil Premium'}</div>
                    {selected.ofsted_mention ? (
                      <div><span className="text-black/50">Ofsted mention:</span> {selected.ofsted_mention}</div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
                    <div className="text-xs font-black tracking-wide text-black/70">Quick actions</div>

                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1 text-xs text-black/70">
                        <span className="font-bold">Status</span>
                        <select
                          value={selectedActions.status}
                          onChange={(e) => updateSelectedActions({ status: e.target.value as LeadStatus })}
                          className="px-3 py-2 rounded-xl border border-black/15 bg-white text-black"
                        >
                          <option value="new">New</option>
                          <option value="contacting">Contacting</option>
                          <option value="interested">Interested</option>
                          <option value="booked">Booked</option>
                          <option value="not_now">Not now</option>
                        </select>
                      </label>

                      <label className="grid gap-1 text-xs text-black/70">
                        <span className="font-bold">Notes</span>
                        <textarea
                          value={selectedActions.notes}
                          onChange={(e) => updateSelectedActions({ notes: e.target.value })}
                          placeholder="What happened, who spoke, next step..."
                          className="min-h-[88px] px-3 py-2 rounded-xl border border-black/15 bg-white text-black"
                        />
                      </label>

                      <label className="grid gap-1 text-xs text-black/70">
                        <span className="font-bold">Follow-up reminder</span>
                        <input
                          type="datetime-local"
                          value={selectedActions.followUpAt}
                          onChange={(e) => updateSelectedActions({ followUpAt: e.target.value })}
                          className="px-3 py-2 rounded-xl border border-black/15 bg-white text-black"
                        />
                      </label>

                      <div className="grid gap-2 text-xs text-black/70">
                        <span className="font-bold">Add to segment</span>
                        <div className="flex gap-2">
                          <input
                            value={newSegment}
                            onChange={(e) => setNewSegment(e.target.value)}
                            placeholder="e.g. SEN-focused, Priority Q2"
                            className="flex-1 px-3 py-2 rounded-xl border border-black/15 bg-white text-black"
                          />
                          <button
                            onClick={() => addSegmentToSelected(newSegment)}
                            className="px-3 py-2 rounded-xl bg-black text-white hover:bg-black/85"
                          >
                            Add
                          </button>
                        </div>

                        {allKnownSegments.length ? (
                          <div className="flex flex-wrap gap-2">
                            {allKnownSegments.map(seg => (
                              <button
                                key={seg}
                                onClick={() => addSegmentToSelected(seg)}
                                className="px-2 py-1 rounded-lg border border-black/15 bg-white hover:bg-black/5"
                              >
                                {seg}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {(selectedActions.segments || []).length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedActions.segments.map(seg => (
                              <button
                                key={seg}
                                onClick={() => removeSegmentFromSelected(seg)}
                                className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200"
                                title="Click to remove"
                              >
                                {seg} ×
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-black/50">No segments yet.</div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-black/50">
                          {selectedActions.updatedAt ? `Saved ${new Date(selectedActions.updatedAt).toLocaleString()}` : 'No quick actions saved yet'}
                        </div>
                        <button
                          onClick={exportSelectedSchool}
                          className="px-3 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-xs font-bold"
                        >
                          Export record
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div className="absolute right-4 top-4 rounded-2xl bg-slate-950/70 border border-white/10 backdrop-blur px-3 py-2 text-xs text-slate-200">
            OpenStreetMap • postcode-level pins (geocoding runs in background)
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
