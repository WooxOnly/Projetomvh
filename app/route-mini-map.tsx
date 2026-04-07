"use client";

type RouteMiniMapPoint = {
  label: string;
  shortLabel: string;
  order: number;
  lat: number;
  lng: number;
  isOffice: boolean;
};

type RouteMiniMapProps = {
  title: string;
  points: RouteMiniMapPoint[];
};

function projectPoints(points: RouteMiniMapPoint[]) {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const padding = 16;
  const width = 100;
  const height = 72;
  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;

  return points.map((point) => ({
    ...point,
    x: padding + ((point.lng - minLng) / lngSpan) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2),
  }));
}

export function RouteMiniMap({ title, points }: RouteMiniMapProps) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-xs text-slate-400">
        Sem coordenadas suficientes para desenhar o mini-mapa.
      </div>
    );
  }

  const projectedPoints = projectPoints(points);
  const routePoints = projectedPoints.filter((point) => !point.isOffice);
  const polylinePoints = projectedPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Mini-mapa</p>
        <p className="text-[11px] text-slate-400">{title}</p>
      </div>
      <svg viewBox="0 0 100 72" className="h-44 w-full overflow-visible rounded-2xl bg-slate-950/70">
        <rect x="0" y="0" width="100" height="72" rx="8" fill="rgba(15, 23, 42, 0.85)" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgba(103, 232, 249, 0.85)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {projectedPoints.map((point) =>
          point.isOffice ? (
            <g key={`${point.label}-${point.order}`}>
              <rect
                x={point.x - 2.6}
                y={point.y - 2.6}
                width="5.2"
                height="5.2"
                rx="1"
                fill="#22d3ee"
                stroke="#e2e8f0"
                strokeWidth="0.35"
              />
              <title>{`${point.label} | origem da rota`}</title>
            </g>
          ) : (
            <g key={`${point.label}-${point.order}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r="2.6"
                fill="#0f172a"
                stroke="#e2e8f0"
                strokeWidth="0.45"
              />
              <text
                x={point.x}
                y={point.y + 0.9}
                textAnchor="middle"
                fontSize="2.3"
                fontWeight="700"
                fill="#67e8f9"
              >
                {point.shortLabel}
              </text>
              <title>{`${point.order}. ${point.label}`}</title>
            </g>
          ),
        )}
        {routePoints.length > 0 ? (
          <text x="50" y="66" textAnchor="middle" fontSize="3" fill="#94a3b8">
            Origem do office + stops ordenados
          </text>
        ) : null}
      </svg>
    </div>
  );
}
