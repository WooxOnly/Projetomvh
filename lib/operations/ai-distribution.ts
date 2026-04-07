import OpenAI from "openai";

import {
  buildDistributionPlan,
  type PlannedAssignment,
} from "@/lib/operations/distribution";

export type CheckinInput = {
  id: string;
  condominiumId: string | null;
  condominiumName: string | null;
  condominium?: {
    officeId: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  propertyName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  bedroomsSnapshot: number | null;
  propertyManagerId: string | null;
  propertyManagerName: string | null;
  property?: {
    defaultPropertyManagerId: string | null;
  } | null;
};

export type ManagerInput = {
  id: string;
  name: string;
  officeId: string | null;
  office?: {
    lat: number | null;
    lng: number | null;
  } | null;
};

export type PlanInput = {
  checkins: CheckinInput[];
  availableManagers: ManagerInput[];
  decisionMode: "default" | "override";
  preventMixedCondominiumOffices?: boolean;
  forceEqualCheckins?: boolean;
};

type AiPlanPayload = {
  assignments: Array<{
    checkinId: string;
    propertyManagerId: string;
    routeOrder: number;
  }>;
};

function extractJsonObject(value: string) {
  const firstCurly = value.indexOf("{");
  const lastCurly = value.lastIndexOf("}");

  if (firstCurly === -1 || lastCurly === -1 || lastCurly <= firstCurly) {
    throw new Error("A IA nao retornou JSON valido para a rota.");
  }

  return value.slice(firstCurly, lastCurly + 1);
}

function getWorkload(checkin: CheckinInput) {
  return Math.max(1, checkin.bedroomsSnapshot ?? 1);
}

function buildPrompt(input: PlanInput) {
  return JSON.stringify(
    {
      task: "Build the actual daily assignment and route order for vacation-home check-ins.",
      output: {
        format: "JSON only",
        keys: ["assignments"],
        assignmentKeys: ["checkinId", "propertyManagerId", "routeOrder"],
      },
      hardRules: [
        "Assign every checkin exactly once.",
        "Use only the available propertyManagerId values provided.",
        "Route order must start at 1 for each PM and be sequential without gaps.",
        "Office is only the starting point of the route, not the center of the territory.",
        "Do not send a PM across the city for an isolated stop if another PM is already closer.",
        "Prefer keeping the same PM on the same resort only when that does not create a worse geographic route.",
        "Prioritize geographic cohesion and avoid isolated stops.",
        "Use bedrooms/workload only as a secondary balancing factor.",
        ...(input.forceEqualCheckins
          ? [
              "Keep the number of check-ins almost equal between all PMs whenever geographically possible.",
              "The final difference between the PM with the most check-ins and the PM with the fewest should be at most 1 whenever feasible.",
            ]
          : []),
      ],
      optimizationPriority: [
        "Minimize geographic dispersion",
        "Avoid isolated houses",
        "Use PM starting office as route origin",
        "Balance check-in count",
        "Balance workload",
        ...(input.forceEqualCheckins ? ["Strongly balance check-in count"] : []),
      ],
      officeMixingRule: input.preventMixedCondominiumOffices
        ? "Do not mix condominiums from different condominium offices in the same property manager route when the condominium office is known."
        : "Mixing condominium offices is allowed when it improves the route.",
      managers: input.availableManagers.map((manager) => ({
        propertyManagerId: manager.id,
        name: manager.name,
        officeId: manager.officeId,
        officeLat: manager.office?.lat,
        officeLng: manager.office?.lng,
      })),
      checkins: input.checkins.map((checkin) => ({
        checkinId: checkin.id,
        resort: checkin.condominiumName,
        propertyName: checkin.propertyName,
        address: checkin.address,
        lat: checkin.lat ?? checkin.condominium?.lat ?? null,
        lng: checkin.lng ?? checkin.condominium?.lng ?? null,
        workload: getWorkload(checkin),
        preferredPropertyManagerId:
          input.decisionMode === "default"
            ? checkin.property?.defaultPropertyManagerId ?? checkin.propertyManagerId ?? null
            : null,
      })),
    },
    null,
    2,
  );
}

function normalizeAiAssignments(
  input: PlanInput,
  payload: AiPlanPayload,
): PlannedAssignment[] | null {
  const validManagerIds = new Set(input.availableManagers.map((manager) => manager.id));
  const checkinsById = new Map(input.checkins.map((checkin) => [checkin.id, checkin]));

  if (payload.assignments.length !== input.checkins.length) {
    return null;
  }

  const seenCheckins = new Set<string>();
  const routeOrdersByManager = new Map<string, number[]>();

  for (const assignment of payload.assignments) {
    if (!checkinsById.has(assignment.checkinId) || !validManagerIds.has(assignment.propertyManagerId)) {
      return null;
    }

    if (seenCheckins.has(assignment.checkinId)) {
      return null;
    }

    seenCheckins.add(assignment.checkinId);
    const existingOrders = routeOrdersByManager.get(assignment.propertyManagerId) ?? [];
    existingOrders.push(assignment.routeOrder);
    routeOrdersByManager.set(assignment.propertyManagerId, existingOrders);
  }

  for (const orders of routeOrdersByManager.values()) {
    const sorted = [...orders].sort((left, right) => left - right);
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index + 1) {
        return null;
      }
    }
  }

  return payload.assignments.map((assignment) => {
    const checkin = checkinsById.get(assignment.checkinId)!;
    const clusterLabel =
      (checkin.condominiumName?.trim() || checkin.address?.trim() || checkin.propertyName?.trim() || "sem-cluster");

    return {
      checkinId: assignment.checkinId,
      propertyManagerId: assignment.propertyManagerId,
      routeOrder: assignment.routeOrder,
      workload: getWorkload(checkin),
      clusterLabel,
      source: "ai_distribution",
    } satisfies PlannedAssignment;
  });
}

export async function buildOperationPlan(input: PlanInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ROUTE_AI_MODEL || "gpt-5.4-mini";

  if (!apiKey) {
    return buildDistributionPlan(input);
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
            "You are a dispatch optimizer for vacation-home check-ins. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return buildDistributionPlan(input);
    }

    const payload = JSON.parse(extractJsonObject(outputText)) as AiPlanPayload;
    const normalized = normalizeAiAssignments(input, payload);

    return normalized ?? buildDistributionPlan(input);
  } catch {
    return buildDistributionPlan(input);
  }
}
