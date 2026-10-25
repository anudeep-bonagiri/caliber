import { BRASS } from './carrier';
import { clockFromMicros, qty, type Evidence } from './model';

const W = 340;
const H = 150;
const PAD_X = 70;
const PAD_Y = 34;

type Pt = { lat: number; lon: number };

// Equirectangular projection on a small frame around the midpoint of the two points. No tiles, no network:
// two dots, a dashed line and the distance the ledger already measured (distanceMiles, not recomputed).
export function hasMapPoints(ev: Evidence): boolean {
  const p = ev.nearestPing;
  return typeof ev.stationLat === 'number' && typeof ev.stationLon === 'number' && !!p && typeof p.lat === 'number' && typeof p.lon === 'number';
}

export function MiniMap({ ev }: { ev: Evidence }) {
  if (!hasMapPoints(ev)) return null;
  const pump: Pt = { lat: ev.stationLat!, lon: ev.stationLon! };
  const truck: Pt = { lat: ev.nearestPing!.lat!, lon: ev.nearestPing!.lon! };
  const midLat = (pump.lat + truck.lat) / 2;
  const midLon = (pump.lon + truck.lon) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const dx = (p: Pt) => (p.lon - midLon) * k;
  const dy = (p: Pt) => p.lat - midLat;
  const spanX = Math.max(Math.abs(dx(pump)), Math.abs(dx(truck)), 1e-6);
  const spanY = Math.max(Math.abs(dy(pump)), Math.abs(dy(truck)), 1e-6);
  const scale = Math.min((W / 2 - PAD_X) / spanX, (H / 2 - PAD_Y) / spanY);
  const at = (p: Pt) => ({ x: W / 2 + dx(p) * scale, y: H / 2 - dy(p) * scale });
  const a = at(pump);
  const b = at(truck);
  const time = clockFromMicros(ev.nearestPing?.atMicros);
  const truckLabel = `${typeof ev.truckId === 'number' ? `Truck ${ev.truckId}` : 'The truck'}${time ? ` at ${time}` : ''}`;
  const miles = ev.distanceMiles !== undefined ? `${qty(ev.distanceMiles)} miles` : '';
  const label = (p: { x: number; y: number }, other: { x: number; y: number }) => ({
    x: p.x,
    y: p.y + (p.y <= other.y ? -12 : 20),
    anchor: (p.x < other.x - 4 ? 'start' : p.x > other.x + 4 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
  });
  const la = label(a, b);
  const lb = label(b, a);
  // the distance label sits just off the line's midpoint, on the side away from the labels
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return (
    <figure className="cv-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map: the pump and ${truckLabel}${miles ? `, ${miles} apart` : ''}`}>
        <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="6" className="cv-map-frame" />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BRASS} strokeWidth="1.75" strokeDasharray="5 4" strokeLinecap="round" />
        <circle cx={a.x} cy={a.y} r="5" className="cv-map-pump" />
        <circle cx={b.x} cy={b.y} r="5" className="cv-map-truck" />
        <text x={la.x} y={la.y} textAnchor={la.anchor} className="cv-map-label">the pump</text>
        <text x={lb.x} y={lb.y} textAnchor={lb.anchor} className="cv-map-label">{truckLabel}</text>
        {miles ? (
          <text x={mx} y={my - 8} textAnchor="middle" className="cv-map-miles" fill={BRASS}>
            {miles}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}
