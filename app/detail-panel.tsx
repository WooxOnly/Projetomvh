"use client";

import { useMemo, useState } from "react";

import { useLanguage } from "@/app/language-provider";

type DetailPanelProps = {
  onOpenAvailabilityTab?: () => void;
  data: {
    offices: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
    propertyManagers: Array<{
      id: string;
      name: string;
      isActive: boolean;
      phone: string | null;
      office: {
        id: string;
        name: string;
      } | null;
    }>;
    activeUploadOfficeBreakdown: {
      id: string;
      sequenceNumber: number | null;
      fileName: string;
      operationDate: Date | string;
      createdAt: Date | string;
      totalCheckins: number;
      offices: Array<{
        officeId: string | null;
        officeName: string;
        officeSlug: string | null;
        regions: Array<{
          region: string;
          condominiumCount: number;
          houseCount: number;
          condominiums: Array<{
            condominiumId: string;
            condominiumName: string;
            houseCount: number;
            checkinCount: number;
            houseNames: string[];
          }>;
        }>;
      }>;
    } | null;
  };
};

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

type BreakdownMode = "offices" | "resorts";

type ChartSlice = {
  id: string;
  label: string;
  metricValue: number;
  sublabel: string;
  details: string;
  color: string;
};

type LegendItem = {
  id: string;
  label: string;
  metricValue: number;
  sublabel: string;
  details: string;
  color: string;
};

const COLORS = [
  "#22d3ee",
  "#38bdf8",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#14b8a6",
  "#2dd4bf",
];

const regionLabelMap: Record<string, { pt: string; en: string }> = {
  NORTH: { pt: "North", en: "North" },
  SOUTH: { pt: "South", en: "South" },
  EAST: { pt: "East", en: "East" },
  WEST: { pt: "West", en: "West" },
  UNASSIGNED: { pt: "Unassigned", en: "Unassigned" },
};

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    cx,
    cy,
    "L",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

function truncateCenterLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

export function DetailPanel({ data, onOpenAvailabilityTab }: DetailPanelProps) {
  const { isEnglish } = useLanguage();
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("resorts");
  const [officeFilter, setOfficeFilter] = useState("all");
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const activeManagerCount = data.propertyManagers.filter((manager) => manager.isActive).length;
  const locale = isEnglish ? "en-US" : "pt-BR";

  function formatDateOnly(value: Date | string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }

  const chartData = useMemo(() => {
    const breakdown = data.activeUploadOfficeBreakdown;

    if (!breakdown) {
      return {
        slices: [] as ChartSlice[],
        legendItems: [] as LegendItem[],
        total: 0,
      };
    }

    if (breakdownMode === "offices") {
      const slices = breakdown.offices
        .map((office, index) => {
          const totalCheckins = office.regions.reduce(
            (grandTotal, region) =>
              grandTotal +
              region.condominiums.reduce(
                (regionTotal, condominium) => regionTotal + condominium.checkinCount,
                0,
              ),
            0,
          );
          const totalHouses = office.regions.reduce((total, region) => total + region.houseCount, 0);
          const totalResorts = office.regions.reduce((total, region) => total + region.condominiumCount, 0);

          return {
            id: office.officeId ?? office.officeName,
            label: office.officeName,
            metricValue: totalCheckins,
            sublabel: isEnglish
              ? `${totalResorts} resorts | ${totalHouses} houses`
              : `${totalResorts} condomínios | ${totalHouses} casas`,
            details: office.regions
              .filter((region) => region.houseCount > 0 || region.condominiumCount > 0)
              .map((region) => {
                const regionLabel = regionLabelMap[region.region]?.[isEnglish ? "en" : "pt"] ?? region.region;
                return isEnglish
                  ? `${regionLabel}: ${region.condominiumCount} resorts | ${region.houseCount} houses`
                  : `${regionLabel}: ${region.condominiumCount} condomínios | ${region.houseCount} casas`;
              })
              .join(" | "),
            color: COLORS[index % COLORS.length],
          };
        })
        .filter((slice) => slice.metricValue > 0);

      return {
        slices,
        legendItems: slices.map((slice) => ({
          id: slice.id,
          label: slice.label,
          metricValue: slice.metricValue,
          sublabel: slice.sublabel,
          details: slice.details,
          color: slice.color,
        })),
        total: slices.reduce((total, slice) => total + slice.metricValue, 0),
      };
    }

    const selectedOffices =
      officeFilter === "all"
        ? breakdown.offices
        : breakdown.offices.filter((office) => office.officeId === officeFilter);

    const flatResorts = selectedOffices.flatMap((office) =>
      office.regions.flatMap((region) =>
        region.condominiums.map((condominium) => ({
          id: condominium.condominiumId,
          label: condominium.condominiumName,
          metricValue: condominium.checkinCount,
          sublabel: `${office.officeName} | ${
            regionLabelMap[region.region]?.[isEnglish ? "en" : "pt"] ?? region.region
          }`,
          details: `${condominium.checkinCount} check-ins`,
        })),
      ),
    );

    const orderedResorts = [...flatResorts]
      .sort(
        (left, right) =>
          right.metricValue - left.metricValue || left.label.localeCompare(right.label),
      )
      .filter((slice) => slice.metricValue > 0);

    const legendItems = orderedResorts.map((slice, index) => ({
      id: slice.id,
      label: slice.label,
      metricValue: slice.metricValue,
      sublabel: slice.sublabel,
      details: slice.details,
      color: COLORS[index % COLORS.length],
    }));

    const visible = orderedResorts.map((slice, index) => ({
      ...slice,
      color: COLORS[index % COLORS.length],
    }));

    return {
      slices: visible,
      legendItems,
      total: visible.reduce((total, slice) => total + slice.metricValue, 0),
    };
  }, [breakdownMode, data.activeUploadOfficeBreakdown, isEnglish, officeFilter]);

  const activeSlice = useMemo(
    () => chartData.legendItems.find((slice) => slice.id === activeSliceId) ?? null,
    [activeSliceId, chartData.legendItems],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
          {isEnglish ? "Details" : "Detalhamento"}
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          {isEnglish ? "Visual analysis of the imported file" : "Análise visual do arquivo importado"}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          {isEnglish ? (
            <>
              Here you can analyze the file more clearly before moving forward to the property managers
              available for the day. The pie chart lets you break the operation down by{" "}
              <span className="font-medium text-white">Office</span> or{" "}
              <span className="font-medium text-white">Resorts</span>, with hover and quick side reading.
            </>
          ) : (
            <>
              Aqui você consegue analisar o arquivo com mais clareza antes de avançar para os
              gerentes de propriedades disponíveis. O gráfico em pizza permite detalhar a operação por{" "}
              <span className="font-medium text-white">escritório</span> ou{" "}
              <span className="font-medium text-white">condomínios</span>, com hover e leitura lateral rápida.
            </>
          )}
        </p>
        {data.activeUploadOfficeBreakdown ? (
          <p className="mt-3 text-sm text-slate-400">
            {isEnglish ? "Active file" : "Arquivo ativo"}: {formatUploadLabel(data.activeUploadOfficeBreakdown)} |{" "}
            {isEnglish ? "Operation" : "Operação"}:{" "}
            {formatDateOnly(data.activeUploadOfficeBreakdown.operationDate)} | Check-ins:{" "}
            {data.activeUploadOfficeBreakdown.totalCheckins}
          </p>
        ) : null}
      </section>

      {data.activeUploadOfficeBreakdown ? (
        <>
          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                  {isEnglish ? "Next step" : "Próximo passo"}
                </p>
                <h4 className="mt-3 text-xl font-semibold text-white">
                  {isEnglish
                    ? "Move forward to the managers of the day"
                    : "Avançar para os gerentes do dia"}
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {isEnglish
                    ? "After the analysis, the next step is defining who is available for the day to separate the check-ins."
                    : "Depois da análise, o próximo passo é definir quem está disponível no dia para a separação dos check-ins."}
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  {isEnglish
                    ? "Active property managers registered"
                    : "Gerentes de propriedades ativos cadastrados"}
                  : <span className="font-medium text-white"> {activeManagerCount}</span>
                </p>
              </div>
              {onOpenAvailabilityTab ? (
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={onOpenAvailabilityTab}
                    className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
                  >
                    {isEnglish ? "Go to managers of the day" : "Avançar para os gerentes do dia"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setBreakdownMode("resorts")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    breakdownMode === "resorts"
                      ? "bg-cyan-300 text-slate-950"
                      : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {isEnglish ? "By Resorts" : "Por condom\u00ednios"}
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownMode("offices")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    breakdownMode === "offices"
                      ? "bg-cyan-300 text-slate-950"
                      : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {isEnglish ? "By Office" : "Por escrit\u00f3rio"}
                </button>
              </div>

              {breakdownMode === "resorts" ? (
                <div className="mt-4">
                  <label className="block text-sm text-slate-300">
                    <span className="mb-2 block">
                      {isEnglish ? "Filter resorts by office" : "Filtrar condomínios por escritório"}
                    </span>
                    <select
                      value={officeFilter}
                      onChange={(event) => setOfficeFilter(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="all">{isEnglish ? "All offices" : "Todos os escritórios"}</option>
                      {data.offices.map((office) => (
                        <option key={office.id} value={office.id}>
                          {office.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
                {chartData.slices.length > 0 ? (
                  <div
                    className="relative flex items-center justify-center"
                    onMouseLeave={() => setActiveSliceId(null)}
                  >
                    <svg viewBox="0 0 320 320" className="h-80 w-80">
                      {(() => {
                        let startAngle = 0;

                        return chartData.slices.map((slice) => {
                          const angle = (slice.metricValue / chartData.total) * 360;
                          const endAngle = startAngle + angle;
                          const path = describeArc(160, 160, 120, startAngle, endAngle);
                          startAngle = endAngle;

                          return (
                            <path
                              key={slice.id}
                              d={path}
                              fill={slice.color}
                              stroke={activeSlice?.id === slice.id ? "#e2e8f0" : "#020617"}
                              strokeWidth={activeSlice?.id === slice.id ? 4 : 2}
                              className="cursor-pointer transition-opacity duration-200 hover:opacity-90"
                              onMouseEnter={() => setActiveSliceId(slice.id)}
                            >
                              <title>
                                {slice.label} | Check-ins: {slice.metricValue}
                              </title>
                            </path>
                          );
                        });
                      })()}
                      <circle cx="160" cy="160" r="68" fill="#020617" />
                      <text
                        x="160"
                        y="132"
                        textAnchor="middle"
                        className="fill-slate-400 text-[9px] uppercase tracking-[0.28em]"
                      >
                        {truncateCenterLabel(activeSlice ? activeSlice.label : "Check-ins", 18)}
                      </text>
                      <text
                        x="160"
                        y="172"
                        textAnchor="middle"
                        className="fill-white text-4xl font-semibold"
                      >
                        {activeSlice ? activeSlice.metricValue : chartData.total}
                      </text>
                      <text
                        x="160"
                        y="196"
                        textAnchor="middle"
                        className="fill-slate-300 text-[11px]"
                      >
                        {truncateCenterLabel(
                          activeSlice
                            ? activeSlice.sublabel
                            : breakdownMode === "offices"
                              ? isEnglish
                                ? "Distribution by office"
                                : "Distribuição por escritório"
                              : isEnglish
                                ? "Distribution by resorts"
                                : "Distribuição por condomínios",
                          26,
                        )}
                      </text>
                    </svg>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 p-8 text-sm text-slate-300">
                    {isEnglish
                      ? "There is not enough data to build the chart with this filter."
                      : "Não há dados suficientes para montar o gráfico com esse filtro."}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-[10.75rem] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                  {isEnglish ? "Hover / focus" : "Hover / foco"}
                </p>
                {activeSlice ? (
                  <div className="mt-3 flex h-[7.25rem] flex-col overflow-hidden">
                    <h4 className="line-clamp-2 min-h-[3.5rem] overflow-hidden text-xl font-semibold leading-7 text-white">
                      {activeSlice.label}
                    </h4>
                    <p className="mt-2 text-sm text-slate-300">
                      Check-ins: <span className="font-medium text-white">{activeSlice.metricValue}</span>
                    </p>
                    <p className="mt-2 line-clamp-1 min-h-[1.25rem] overflow-hidden text-sm text-slate-300">
                      {activeSlice.sublabel}
                    </p>
                    <p className="mt-3 line-clamp-2 min-h-[3rem] text-sm leading-6 text-slate-400">
                      {activeSlice.details}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 h-[7.25rem] overflow-hidden text-sm text-slate-300">
                    {isEnglish
                      ? "Move the mouse over a slice to see the details."
                      : "Passe o mouse sobre uma fatia para ver os detalhes."}
                  </p>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                  {isEnglish ? "Legend" : "Legenda"}
                </p>
                <div
                  className="mt-4 grid max-h-[30rem] gap-2 overflow-y-auto pr-2 sm:grid-cols-2"
                  onMouseLeave={() => setActiveSliceId(null)}
                >
                  {chartData.legendItems.map((slice) => (
                    <button
                      key={slice.id}
                      type="button"
                      onMouseEnter={() => setActiveSliceId(slice.id)}
                      onFocus={() => setActiveSliceId(slice.id)}
                      className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                        activeSlice?.id === slice.id
                          ? "border-cyan-300/50 bg-cyan-300/10"
                          : "border-white/10 bg-slate-950/40 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] font-medium text-white">
                            {slice.label}
                          </span>
                          <span className="shrink-0 text-[13px] font-semibold text-cyan-200">
                            {slice.metricValue}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                          {slice.sublabel}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              {isEnglish ? "Details by office" : "Detalhamento por escritório"}
            </p>
            <div className="mt-5 space-y-5">
              {data.activeUploadOfficeBreakdown.offices.map((office) => {
                const totalResorts = office.regions.reduce((total, region) => total + region.condominiumCount, 0);
                const totalHouses = office.regions.reduce((total, region) => total + region.houseCount, 0);
                const totalCheckins = office.regions.reduce(
                  (grandTotal, region) =>
                    grandTotal +
                    region.condominiums.reduce(
                      (regionTotal, condominium) => regionTotal + condominium.checkinCount,
                      0,
                    ),
                  0,
                );

                return (
                  <div
                    key={office.officeId ?? office.officeName}
                    className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <h4 className="text-xl font-semibold text-white">{office.officeName}</h4>
                        <p className="mt-2 text-sm text-slate-300">
                          {isEnglish
                            ? `${totalResorts} resorts | ${totalHouses} houses | ${totalCheckins} check-ins`
                            : `${totalResorts} condomínios | ${totalHouses} casas | ${totalCheckins} check-ins`}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {office.regions.map((region) => {
                          const regionCheckins = region.condominiums.reduce(
                            (total, condominium) => total + condominium.checkinCount,
                            0,
                          );

                          return (
                          <div
                            key={`${office.officeId ?? office.officeName}-${region.region}`}
                            className="rounded-2xl border border-cyan-400/10 bg-slate-950/50 p-4"
                          >
                            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                              {regionLabelMap[region.region]?.[isEnglish ? "en" : "pt"] ?? region.region}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-white">{regionCheckins}</p>
                            <p className="text-xs text-slate-400">
                              {region.condominiumCount} {isEnglish ? "resorts" : "condomínios"}
                            </p>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-full text-left text-sm text-slate-300">
                        <thead>
                          <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-slate-500">
                            <th className="px-3 py-3">{isEnglish ? "Region" : "Região"}</th>
                            <th className="px-3 py-3">{isEnglish ? "Resort" : "Condomínio"}</th>
                            <th className="px-3 py-3">{isEnglish ? "Houses" : "Casas"}</th>
                            <th className="px-3 py-3">Check-ins</th>
                            <th className="px-3 py-3">{isEnglish ? "Examples" : "Exemplos"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {office.regions.flatMap((region) =>
                            region.condominiums.map((condominium) => (
                              <tr key={condominium.condominiumId} className="border-b border-white/5">
                                <td className="px-3 py-3">
                                  {regionLabelMap[region.region]?.[isEnglish ? "en" : "pt"] ?? region.region}
                                </td>
                                <td className="px-3 py-3 text-white">{condominium.condominiumName}</td>
                                <td className="px-3 py-3">{condominium.houseCount}</td>
                                <td className="px-3 py-3">{condominium.checkinCount}</td>
                                <td className="px-3 py-3 text-xs text-slate-400">
                                  {condominium.houseNames.slice(0, 4).join(", ")}
                                  {condominium.houseNames.length > 4 ? "..." : ""}
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-[1.75rem] border border-dashed border-white/15 bg-slate-950/30 p-8 text-sm text-slate-300">
          {isEnglish
            ? "No upload has been processed yet. As soon as a file is imported, this page will show the visual details with charts, office view, and resort view."
            : "Nenhum upload foi processado ainda. Assim que um arquivo for importado, esta aba passará a mostrar o detalhamento visual com gráficos, leitura por escritório e leitura por condomínios."}
        </section>
      )}
    </div>
  );
}
