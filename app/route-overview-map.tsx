"use client";

import { useEffect, useMemo, useRef } from "react";

import { useLanguage } from "@/app/language-provider";

type RouteOverviewManager = {
  propertyManagerId: string;
  managerName: string;
  routeScore: number;
  mapPoints: Array<{
    label: string;
    shortLabel: string;
    order: number;
    lat: number;
    lng: number;
    isOffice: boolean;
    inferred?: boolean;
  }>;
};

type RouteOverviewMapProps = {
  managers: RouteOverviewManager[];
};

const routeColors = [
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#60a5fa",
  "#fb7185",
  "#2dd4bf",
];

function spreadOverlappingPoints<T extends { lat: number; lng: number }>(points: T[]) {
  const threshold = 0.00012;
  const clusters: Array<{ lat: number; lng: number; points: T[] }> = [];

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
      const radius = 0.00016 + Math.floor(index / 6) * 0.00008;

      return {
        ...point,
        lat: point.lat + Math.sin(angle) * radius,
        lng: point.lng + Math.cos(angle) * radius,
      };
    });
  });
}

export function RouteOverviewMap({ managers }: RouteOverviewMapProps) {
  const { isEnglish } = useLanguage();
  const mapRef = useRef<HTMLDivElement | null>(null);

  const visibleManagers = useMemo(
    () => managers.filter((manager) => manager.mapPoints.some((point) => point.lat && point.lng)),
    [managers],
  );

  useEffect(() => {
    if (!mapRef.current || visibleManagers.length === 0) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const L = await import("leaflet");

      if (cancelled || !mapRef.current) {
        return;
      }

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      visibleManagers.forEach((manager, index) => {
        const color = routeColors[index % routeColors.length]!;
        const routePoints = spreadOverlappingPoints(
          manager.mapPoints.filter((point) => point.lat != null && point.lng != null),
        );
        const orderedLine = routePoints.map((point) => {
          const latLng = L.latLng(point.lat, point.lng);
          bounds.extend(latLng);
          return [point.lat, point.lng] as [number, number];
        });

        if (orderedLine.length > 1) {
          L.polyline(orderedLine, {
            color,
            weight: 3,
            opacity: 0.88,
          })
            .addTo(map)
            .bindTooltip(`${manager.managerName} | ${isEnglish ? "Score" : "Score"}: ${manager.routeScore}`);
        }

        routePoints.forEach((point) => {
          const latLng = L.latLng(point.lat, point.lng);

          if (point.isOffice) {
            L.circleMarker(latLng, {
              radius: 6,
              weight: 2,
              color: "#e2e8f0",
              fillColor: color,
              fillOpacity: 0.95,
            })
              .addTo(map)
              .bindTooltip(
                `${manager.managerName}<br/>${
                  isEnglish ? "Route origin" : "Origem da rota"
                }`,
              );
            return;
          }

          L.circleMarker(latLng, {
            radius: 5,
            weight: 1.5,
            color: "#e2e8f0",
            fillColor: color,
            fillOpacity: 0.9,
          })
            .addTo(map)
            .bindTooltip(`${manager.managerName}<br/>${point.order}. ${point.label}`);
        });
      });

      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.16), { maxZoom: 12 });
      }

      cleanup = () => {
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isEnglish, visibleManagers]);

  if (visibleManagers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-xs text-slate-400">
        {isEnglish
          ? "There are not enough coordinates to draw the overall operation map."
          : "Ainda não há coordenadas suficientes para desenhar o mapa geral da operação."}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
          {isEnglish ? "Overview map" : "Mapa geral"}
        </p>
        <p className="text-[11px] text-slate-400">
          {visibleManagers.length} {isEnglish ? "routes in view" : "rotas em visão"}
        </p>
      </div>
      <div className="mb-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1 text-[11px] text-slate-300">
        {visibleManagers.map((manager, index) => (
          <span
            key={manager.propertyManagerId}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1"
            style={{ boxShadow: `inset 0 0 0 1px ${routeColors[index % routeColors.length]}33` }}
          >
            <span
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ backgroundColor: routeColors[index % routeColors.length] }}
            />
            {manager.managerName}
          </span>
        ))}
      </div>
      <div ref={mapRef} className="h-72 w-full overflow-hidden rounded-2xl" />
    </div>
  );
}
