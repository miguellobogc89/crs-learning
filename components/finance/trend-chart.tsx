"use client";
// Evolución de los últimos meses en una línea azul suave (curva monótona: pasa por cada punto sin picos ni
// «rebotes» por debajo de cero). El último punto es el mes en curso: hueco y con el tramo final discontinuo,
// porque aún no ha terminado. Cada punto lleva su importe encima y el mes debajo.
import { eur } from "@/components/trading/format";

export type TrendPoint = { label: string; value: number; current?: boolean };

/** Curva monótona (Fritsch–Carlson) como path SVG: suave y sin pasarse de los puntos. */
function smoothPath(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1));
  const m = pts.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i]; }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3, c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3, c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

export function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-slate-400">Aún no hay meses suficientes para ver la evolución.</p>;
  const W = 340, H = 190, pad = { l: 22, r: 22, t: 26, b: 24 };
  const top = Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (Math.max(0, v) / top) * (H - pad.t - pad.b);
  const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const closed = points[points.length - 1].current ? pts.slice(0, -1) : pts;
  const line = smoothPath(closed);
  const tail = points[points.length - 1].current && closed.length ? smoothPath(pts.slice(-2)) : "";
  const area = line ? `${smoothPath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${y(0)} L${pts[0].x.toFixed(1)},${y(0)} Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
      aria-label={`${title}: ${points.map((p) => `${p.label} ${eur(p.value, 0)}`).join(", ")}`}>
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3478f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3478f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad.l - 10} x2={W - pad.r + 10} y1={y(0)} y2={y(0)} stroke="#e2e8f0" />
      {area && <path d={area} fill="url(#trend-fill)" />}
      {line && <path d={line} fill="none" stroke="#3478f6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {tail && <path d={tail} fill="none" stroke="#3478f6" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 6" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={pts[i].x} cy={pts[i].y} r={4.5} fill={p.current ? "#fff" : "#3478f6"} stroke="#3478f6" strokeWidth={2.5} />
          <text x={pts[i].x} y={pts[i].y - 10} textAnchor="middle" fontSize="11" fontWeight={600} fill="#0f172a" className="amount">{eur(p.value, 0)}</text>
          <text x={pts[i].x} y={H - 6} textAnchor="middle" fontSize="11" fill={p.current ? "#3478f6" : "#94a3b8"} fontWeight={p.current ? 600 : 400}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
