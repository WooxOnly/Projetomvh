"use client";

import { useEffect, useRef } from "react";

import { useLanguage } from "@/app/language-provider";

type RouteLiveMapPoint = {
  label: string;
  shortLabel: string;
  order: number;
  lat: number;
  lng: number;
  isOffice: boolean;
  inferred?: boolean;
};

type RouteLiveMapProps = {
  title: string;
  points: RouteLiveMapPoint[];
};

function spreadOverlappingPoints(points: RouteLiveMapPoint[]) {
  const threshold = 0.00012;
  const clusters: Array<{
    lat: number;
    lng: number;
    points: RouteLiveMapPoint[];
  }> = [];

  for (const point of points) {
    const existingCluster = clusters.find(
      (cluster) =>
        Math.abs(cluster.lat - point.lat) <= threshold &&
        Math.abs(cluster.lng - point.lng) <= threshold,
    );

    if (existingCluster) {
      existingCluster.points.push(point);
      continue;
    }

    clusters.push({
      lat: point.lat,
      lng: point.lng,
      points: [point],
    });
  }

  return clusters.flatMap((cluster) => {
    if (cluster.points.length <= 1) {
      return cluster.points;
    }

    return cluster.points.map((point, index) => {
      const angle = (Math.PI * 2 * index) / cluster.points.length;
      const radius = 0.00018 + Math.floor(index / 6) * 0.00008;

      return {
        ...point,
        lat: point.lat + Math.sin(angle) * radius,
        lng: point.lng + Math.cos(angle) * radius,
      };
    });
  });
}

export function RouteLiveMap({ title, points }: RouteLiveMapProps) {
  const { isEnglish } = useLanguage();
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current || points.length === 0) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const L = await import("leaflet");

      if (cancelled || !mapRef.current) {
        return;
      }

      const renderedPoints = spreadOverlappingPoints(points);

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      const routeStops = renderedPoints.filter((point) => !point.isOffice);
      const firstStopOrder = routeStops[0]?.order ?? null;
      const lastStopOrder = routeStops.at(-1)?.order ?? null;

      renderedPoints.forEach((point) => {
        const latLng = L.latLng(point.lat, point.lng);
        bounds.extend(latLng);

        if (point.isOffice) {
          L.circleMarker(latLng, {
            radius: 7,
            weight: 2,
            color: "#e2e8f0",
            fillColor: "#22d3ee",
            fillOpacity: 0.95,
          })
            .addTo(map)
            .bindTooltip(
              `${point.label}<br/>${
                point.inferred
                  ? isEnglish
                    ? "Origin inferred automatically"
                    : "Origem inferida automaticamente"
                  : isEnglish
                    ? "Route origin"
                    : "Origem da rota"
              }`,
              {
                direction: "top",
              },
            );
          return;
        }

        const isFirstStop = point.order === firstStopOrder;
        const isLastStop = point.order === lastStopOrder;
        const fillColor = isFirstStop ? "#10b981" : isLastStop ? "#f97316" : "#0f172a";
        const badgeColor = isFirstStop ? "#d1fae5" : isLastStop ? "#ffedd5" : "#67e8f9";

        L.circleMarker(latLng, {
          radius: 11,
          weight: 2,
          color: "#e2e8f0",
          fillColor,
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindTooltip(
            `${point.order}. ${point.label}${
              isFirstStop
                ? `<br/>${isEnglish ? "First stop" : "Primeira parada"}`
                : isLastStop
                  ? `<br/>${isEnglish ? "Last stop" : "Última parada"}`
                  : ""
            }${
              point.inferred
                ? `<br/>${
                    isEnglish
                      ? "Position inferred automatically"
                      : "Posição inferida automaticamente"
                  }`
                : ""
            }`,
            {
              direction: "top",
            },
          );

        L.marker(latLng, {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:22px;height:22px;border-radius:9999px;border:2px solid #e2e8f0;background:${fillColor};color:${badgeColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${point.shortLabel}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(map);
      });

      const routeLine = renderedPoints.map((point) => [point.lat, point.lng] as [number, number]);

      if (routeLine.length > 1) {
        L.polyline(routeLine, {
          color: "#67e8f9",
          weight: 3,
          opacity: 0.8,
        }).addTo(map);
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2), { maxZoom: 13 });
      } else if (points[0]) {
        map.setView([points[0].lat, points[0].lng], 12);
      }

      cleanup = () => {
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isEnglish, points]);

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-xs text-slate-400">
        {isEnglish
          ? "Not enough coordinates to show the real route map."
          : "Sem coordenadas suficientes para mostrar o mapa real da rota."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
          {isEnglish ? "Live map" : "Mapa real"}
        </p>
        <p className="text-[11px] text-slate-400">{title}</p>
      </div>
      {points.some((point) => point.inferred) ? (
        <p className="mb-2 text-xs text-amber-200">
          {isEnglish
            ? "Some points were positioned automatically to keep the route visible while the real base is enriched."
            : "Alguns pontos foram posicionados automaticamente para manter a rota visível enquanto a base real é enriquecida."}
        </p>
      ) : null}
      <div ref={mapRef} className="h-56 w-full overflow-hidden rounded-2xl sm:h-72" />
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
          {isEnglish ? "Origin" : "Origem"}
        </span>
        <span className="inline-flex items-center gap-2 text-emerald-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {isEnglish ? "First" : "Primeira"}
        </span>
        <span className="inline-flex items-center gap-2 text-orange-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
          {isEnglish ? "Last" : "Última"}
        </span>
      </div>
    </div>
  );
}


