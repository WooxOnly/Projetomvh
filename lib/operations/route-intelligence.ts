import OpenAI from "openai";

import { isWithinCentralFloridaServiceArea } from "@/lib/geocoding";
import {
  buildHeuristicRouteAnalysis,
  type ManagerRouteMetric,
  type RouteAnalysis,
  type RouteDirectoryManager,
  type RouteRunReport,
} from "@/lib/operations/route-report";

type AiManagerInsight = {
  propertyManagerId: string;
  summary: string;
  risk: string;
  hint: string;
};

type AiPayload = {
  overallSummary: string;
  routeHighlights: string[];
  routeRisks: string[];
  managers: AiManagerInsight[];
};

function extractJsonObject(value: string) {
  const firstCurly = value.indexOf("{");
  const lastCurly = value.lastIndexOf("}");

  if (firstCurly === -1 || lastCurly === -1 || lastCurly <= firstCurly) {
    throw new Error("A resposta da IA nao retornou JSON valido.");
  }

  return value.slice(firstCurly, lastCurly + 1);
}

function mergeAnalysis(
  heuristic: RouteAnalysis,
  aiPayload: AiPayload,
  model: string,
): RouteAnalysis {
  const managersById = new Map(
    heuristic.managers.map((manager) => [manager.propertyManagerId, manager]),
  );

  const mergedManagers = heuristic.managers.map((manager) => {
    const aiManager = aiPayload.managers.find(
      (item) => item.propertyManagerId === manager.propertyManagerId,
    );

    if (!aiManager) {
      return manager;
    }

    return {
      ...manager,
      summary: aiManager.summary || manager.summary,
      risk: aiManager.risk || manager.risk,
      hint: aiManager.hint || manager.hint,
    } satisfies ManagerRouteMetric;
  });

  const unmatchedManagers = aiPayload.managers.filter(
    (item) => !managersById.has(item.propertyManagerId),
  );

  return {
    ...heuristic,
    source: "openai",
    model,
    generatedAt: new Date().toISOString(),
    overallSummary: aiPayload.overallSummary || heuristic.overallSummary,
    routeHighlights:
      aiPayload.routeHighlights.filter(Boolean).slice(0, 4).length > 0
        ? aiPayload.routeHighlights.filter(Boolean).slice(0, 4)
        : heuristic.routeHighlights,
    routeRisks:
      aiPayload.routeRisks.filter(Boolean).slice(0, 4).length > 0
        ? aiPayload.routeRisks.filter(Boolean).slice(0, 4)
        : heuristic.routeRisks,
    managers: unmatchedManagers.length > 0 ? heuristic.managers : mergedManagers,
  };
}

function buildPrompt(run: RouteRunReport, heuristic: RouteAnalysis) {
  return JSON.stringify(
    {
      task: "Evaluate the operational route plan for vacation-home check-ins in Florida.",
      outputRules: {
        language: "pt-BR",
        format: "JSON only",
        keys: [
          "overallSummary",
          "routeHighlights",
          "routeRisks",
          "managers",
        ],
        managerKeys: ["propertyManagerId", "summary", "risk", "hint"],
      },
      businessRules: [
        "Prioritize geographic cohesion before fairness tweaks.",
        "Consider office as route origin when available.",
        "Use bedrooms as workload proxy when present.",
        "If geolocation coverage is low, mention that route still depends on textual addresses.",
        "Do not invent data or coordinates.",
      ],
      run: {
        id: run.id,
        operationDate: run.operationDate,
        decisionMode: run.decisionMode,
        totalAssignments: run.totalAssignments,
        fileName: run.spreadsheetUpload.fileName,
      },
      heuristic,
    },
    null,
    2,
  );
}

export async function getRouteAnalysis(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
) {
  const heuristic = buildHeuristicRouteAnalysis(run, directoryManagers);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ROUTE_AI_MODEL || "gpt-5.4-mini";

  if (!apiKey) {
    return heuristic;
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "You are an operations analyst for vacation-home check-ins. Respond only with valid JSON in pt-BR.",
        },
        {
          role: "user",
          content: buildPrompt(run, heuristic),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return heuristic;
    }

    const parsed = JSON.parse(extractJsonObject(outputText)) as AiPayload;
    return mergeAnalysis(heuristic, parsed, model);
  } catch {
    return heuristic;
  }
}

export function parseStoredRouteAnalysis(
  stored:
    | {
        routeAnalysisJson: string | null;
        routeAnalysisSource?: string | null;
        routeAnalysisModel?: string | null;
        routeAnalysisGeneratedAt?: Date | string | null;
      }
    | null
    | undefined,
) {
  if (!stored?.routeAnalysisJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored.routeAnalysisJson) as RouteAnalysis;
    const hasOnlyLocalMapPoints = parsed.managers.every((manager) =>
      manager.mapPoints.every((point) =>
        isWithinCentralFloridaServiceArea({ lat: point.lat, lng: point.lng }),
      ),
    );

    if (!hasOnlyLocalMapPoints) {
      return null;
    }

    return {
      ...parsed,
      source:
        stored.routeAnalysisSource === "openai" ? "openai" : parsed.source ?? "heuristic",
      model: stored.routeAnalysisModel ?? parsed.model ?? null,
      generatedAt:
        typeof stored.routeAnalysisGeneratedAt === "string"
          ? stored.routeAnalysisGeneratedAt
          : stored.routeAnalysisGeneratedAt?.toISOString() ?? parsed.generatedAt,
    } satisfies RouteAnalysis;
  } catch {
    return null;
  }
}
