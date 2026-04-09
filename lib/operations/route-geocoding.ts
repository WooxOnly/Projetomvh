import "server-only";

import OpenAI from "openai";

import {
  getPendingLocationReviewEntityIds,
  LOCATION_REVIEW_ENTITY_TYPE,
  type LocationReviewEntityType,
  resolveLocationReview,
  upsertPendingLocationReview,
} from "@/lib/location-review";
import { mergeKnownCondominiumContext } from "@/lib/known-condominium-context";
import { prisma } from "@/lib/prisma";
import {
  composeAddress,
  geocodeAddress,
  geocodeAddressCandidates,
  isWithinCentralFloridaServiceArea,
} from "@/lib/geocoding";

type CondominiumGeoContext = {
  preferredPoint: { lat: number; lng: number } | null;
  requiredLocality: string | null;
  preferredTerms: string[];
};

type GeocodeCandidate = Awaited<ReturnType<typeof geocodeAddressCandidates>>[number];

type LocationConfirmationResult = {
  selectedCandidate: GeocodeCandidate | null;
  confidence: number | null;
  aiModel: string | null;
  aiRationale: string | null;
  needsManualReview: boolean;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMiles(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function hasCoordinates(value: { lat: number | null; lng: number | null } | null | undefined) {
  return isWithinCentralFloridaServiceArea(value ?? { lat: null, lng: null });
}

function getKnownRoutePoint(
  ...candidates: Array<{ lat: number | null; lng: number | null } | null | undefined>
) {
  for (const candidate of candidates) {
    if (hasCoordinates(candidate)) {
      return {
        lat: candidate!.lat!,
        lng: candidate!.lng!,
      };
    }
  }

  return null;
}

function areSamePoint(
  left: { lat: number | null; lng: number | null } | null | undefined,
  right: { lat: number | null; lng: number | null } | null | undefined,
) {
  if (!hasCoordinates(left) || !hasCoordinates(right)) {
    return false;
  }

  return Math.abs(left!.lat! - right!.lat!) < 0.000001 && Math.abs(left!.lng! - right!.lng!) < 0.000001;
}

function cleanGeocodeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function sanitizeZipCode(value: string | null | undefined) {
  const normalized = cleanGeocodeString(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/\b\d{5}\b/u);
  return match?.[0] ?? null;
}

function buildGeocodeQueryVariants(input: {
  normalizedAddress: string | null;
  label: string | null;
  condominiumName: string | null;
  condominium?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  } | null;
}) {
  const address = cleanGeocodeString(input.normalizedAddress);
  const label = cleanGeocodeString(input.label);
  const condominiumName = cleanGeocodeString(input.condominiumName);
  const city = cleanGeocodeString(input.condominium?.city);
  const state = cleanGeocodeString(input.condominium?.state);
  const zipCode = sanitizeZipCode(input.condominium?.zipCode);
  const condominiumAddress = cleanGeocodeString(input.condominium?.address);

  return Array.from(
    new Set(
      [
        composeAddress([address, city, state, zipCode, "USA"]),
        composeAddress([address, state, zipCode, "USA"]),
        composeAddress([address, city, state, "USA"]),
        composeAddress([address, condominiumName, state, zipCode, "USA"]),
        composeAddress([address, condominiumName, state, "USA"]),
        composeAddress([label, condominiumName, state, zipCode, "USA"]),
        composeAddress([label, condominiumName, state, "USA"]),
        composeAddress([address, zipCode, "USA"]),
        composeAddress([condominiumAddress, city, state, zipCode, "USA"]),
      ].filter((query): query is string => Boolean(query)),
    ),
  );
}

function buildCondominiumGeoContext(value: {
  nameOriginal?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): CondominiumGeoContext {
  const preferredPoint =
    value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : null;

  return {
    preferredPoint,
    requiredLocality: cleanGeocodeString(value.city),
    preferredTerms: [
      cleanGeocodeString(value.city),
      cleanGeocodeString(value.state),
      sanitizeZipCode(value.zipCode),
      cleanGeocodeString(value.address),
      cleanGeocodeString(value.nameOriginal),
    ].filter((term): term is string => Boolean(term)),
  };
}

function getLocationReviewTitle(entityType: LocationReviewEntityType, label: string | null) {
  const safeLabel = label?.trim() || "Localização sem identificação";
  switch (entityType) {
    case LOCATION_REVIEW_ENTITY_TYPE.CONDOMINIUM:
      return `Revisar localização do condomínio: ${safeLabel}`;
    case LOCATION_REVIEW_ENTITY_TYPE.PROPERTY:
      return `Revisar localização da casa: ${safeLabel}`;
    case LOCATION_REVIEW_ENTITY_TYPE.CHECKIN:
      return `Revisar localização do check-in: ${safeLabel}`;
  }
}

function candidateDistanceMiles(
  candidate: GeocodeCandidate,
  referencePoint: { lat: number; lng: number } | null,
) {
  if (!referencePoint) {
    return null;
  }

  return haversineDistanceMiles(referencePoint, {
    lat: candidate.lat,
    lng: candidate.lng,
  });
}

function toReviewCandidate(candidate: GeocodeCandidate | null) {
  if (!candidate) {
    return null;
  }

  return {
    displayName: candidate.displayName,
    lat: candidate.lat,
    lng: candidate.lng,
    road: candidate.address.road,
    city: candidate.address.city,
    state: candidate.address.state,
    postcode: candidate.address.postcode,
  };
}

function shouldRequireLocationConfirmation(
  candidates: GeocodeCandidate[],
  context: CondominiumGeoContext | null,
) {
  if (candidates.length === 0) {
    return true;
  }

  if (candidates.length === 1) {
    return false;
  }

  if (!context?.preferredPoint) {
    return true;
  }

  const [first, second] = candidates;
  if (!first || !second) {
    return false;
  }

  const firstDistance = candidateDistanceMiles(first, context.preferredPoint);
  const secondDistance = candidateDistanceMiles(second, context.preferredPoint);

  if (firstDistance == null || secondDistance == null) {
    return true;
  }

  return Math.abs(secondDistance - firstDistance) < 2.5;
}

async function confirmLocationCandidateWithAi(input: {
  entityType: LocationReviewEntityType;
  entityId: string;
  label: string | null;
  query: string;
  normalizedAddress: string | null;
  condominiumName: string | null;
  context: CondominiumGeoContext | null;
  candidates: GeocodeCandidate[];
  currentSelection: GeocodeCandidate | null;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ROUTE_AI_MODEL || "gpt-5.4-mini";

  if (!apiKey) {
    return {
      selectedCandidate: input.currentSelection,
      confidence: null,
      aiModel: null,
      aiRationale: "OpenAI API key ausente.",
      needsManualReview: input.candidates.length !== 1,
    } satisfies LocationConfirmationResult;
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
            "You validate Florida vacation-rental addresses. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: "Choose the best geocoding candidate for the address using condominium context.",
              rules: [
                "Prefer the candidate that best matches the condominium city, ZIP, and resort context.",
                "Reject candidates that appear to belong to another city when the condominium context is clear.",
                "If confidence is low, request manual review.",
                "Return JSON only.",
              ],
              output: {
                keys: ["selectedIndex", "confidence", "needsManualReview", "rationale"],
              },
              item: {
                entityType: input.entityType,
                label: input.label,
                query: input.query,
                normalizedAddress: input.normalizedAddress,
                condominiumName: input.condominiumName,
                condominiumCity: input.context?.requiredLocality,
                condominiumReferencePoint: input.context?.preferredPoint,
              },
              candidates: input.candidates.map((candidate, index) => ({
                index,
                displayName: candidate.displayName,
                road: candidate.address.road,
                city: candidate.address.city,
                state: candidate.address.state,
                postcode: candidate.address.postcode,
                lat: candidate.lat,
                lng: candidate.lng,
                distanceFromCondominium:
                  input.context?.preferredPoint != null
                    ? candidateDistanceMiles(candidate, input.context.preferredPoint)
                    : null,
              })),
            },
            null,
            2,
          ),
        },
      ],
    });

    const payload = JSON.parse(
      (() => {
        const text = response.output_text?.trim() || "";
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        if (first === -1 || last === -1 || last <= first) {
          throw new Error("Resposta de confirmacao sem JSON valido.");
        }
        return text.slice(first, last + 1);
      })(),
    ) as {
      selectedIndex?: number;
      confidence?: number;
      needsManualReview?: boolean;
      rationale?: string;
    };

    const selectedCandidate =
      typeof payload.selectedIndex === "number"
        ? input.candidates[payload.selectedIndex] ?? null
        : input.currentSelection;
    const confidence =
      typeof payload.confidence === "number"
        ? Math.max(0, Math.min(1, payload.confidence))
        : null;
    const needsManualReview =
      payload.needsManualReview === true || selectedCandidate == null || (confidence ?? 0) < 0.8;

    return {
      selectedCandidate,
      confidence,
      aiModel: model,
      aiRationale: payload.rationale ?? null,
      needsManualReview,
    } satisfies LocationConfirmationResult;
  } catch {
    return {
      selectedCandidate: input.currentSelection,
      confidence: null,
      aiModel: model,
      aiRationale: "Falha ao confirmar com IA.",
      needsManualReview: input.candidates.length !== 1,
    } satisfies LocationConfirmationResult;
  }
}

async function confirmAndPersistLocation(input: {
  entityType: LocationReviewEntityType;
  entityId: string;
  label: string | null;
  query: string | string[];
  normalizedAddress: string | null;
  condominiumName: string | null;
  context: CondominiumGeoContext | null;
}) {
  const queries = Array.from(
    new Set(
      (Array.isArray(input.query) ? input.query : [input.query])
        .map((query) => cleanGeocodeString(query))
        .filter((query): query is string => Boolean(query)),
    ),
  );

  let selectedQuery = queries[0] ?? null;
  let selectedContext = input.context;
  let candidates: GeocodeCandidate[] = [];

  for (const query of queries) {
    const strictCandidates = await geocodeAddressCandidates(query, {
      restrictToServiceArea: true,
      requiredLocality: input.context?.requiredLocality ?? null,
      preferredTerms: input.context?.preferredTerms ?? [],
      preferredPoint: input.context?.preferredPoint ?? null,
      maxDistanceFromPreferredMiles: input.context?.preferredPoint ? 10 : undefined,
    });

    if (strictCandidates.length > 0) {
      selectedQuery = query;
      selectedContext = input.context;
      candidates = strictCandidates;
      break;
    }

    if (!input.context?.requiredLocality) {
      continue;
    }

    const relaxedCandidates = await geocodeAddressCandidates(query, {
      restrictToServiceArea: true,
      requiredLocality: null,
      preferredTerms: input.context.preferredTerms,
      preferredPoint: input.context.preferredPoint,
      maxDistanceFromPreferredMiles: input.context.preferredPoint ? 10 : undefined,
    });

    if (relaxedCandidates.length > 0) {
      selectedQuery = query;
      selectedContext = {
        ...input.context,
        requiredLocality: null,
      };
      candidates = relaxedCandidates;
      break;
    }
  }

  const currentSelection = candidates[0] ?? null;
  if (!currentSelection) {
    await upsertPendingLocationReview({
      entityType: input.entityType,
      entityId: input.entityId,
      title: getLocationReviewTitle(input.entityType, input.label),
      originalQuery: selectedQuery,
      normalizedAddress: input.normalizedAddress,
      condominiumName: input.condominiumName,
      condominiumCity: selectedContext?.requiredLocality ?? null,
      condominiumState: null,
      condominiumZipCode: null,
      confidence: null,
      aiModel: null,
      aiRationale: "Nenhum candidato geográfico encontrado.",
      selectedCandidate: null,
      candidates: [],
    });
    return null;
  }

  const needsConfirmation = shouldRequireLocationConfirmation(candidates, input.context);
  const confirmation = needsConfirmation
    ? await confirmLocationCandidateWithAi({
      ...input,
      query: selectedQuery ?? "",
      context: selectedContext,
      candidates,
      currentSelection,
    })
    : ({
        selectedCandidate: currentSelection,
        confidence: 0.95,
        aiModel: null,
        aiRationale: "Candidato único ou coerente com o condomínio.",
        needsManualReview: false,
      } satisfies LocationConfirmationResult);

  if (confirmation.needsManualReview || !confirmation.selectedCandidate) {
    await upsertPendingLocationReview({
      entityType: input.entityType,
      entityId: input.entityId,
      title: getLocationReviewTitle(input.entityType, input.label),
      originalQuery: selectedQuery,
      normalizedAddress: input.normalizedAddress,
      condominiumName: input.condominiumName,
      condominiumCity: selectedContext?.requiredLocality ?? null,
      condominiumState: null,
      condominiumZipCode: null,
      confidence: confirmation.confidence,
      aiModel: confirmation.aiModel,
      aiRationale: confirmation.aiRationale,
      selectedCandidate: toReviewCandidate(confirmation.selectedCandidate),
      candidates: candidates.map((candidate) => toReviewCandidate(candidate)!),
    });
    return null;
  }

  await resolveLocationReview(input.entityType, input.entityId);
  return confirmation.selectedCandidate;
}

async function persistCondominiumAddressData(
  condominiumId: string,
  point: Awaited<ReturnType<typeof geocodeAddress>>,
  current: {
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  },
) {
  if (!point) {
    return;
  }

  const updates: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: number;
    lng?: number;
  } = {
    lat: point.lat,
    lng: point.lng,
  };

  if (!current.address && point.address.road) {
    updates.address = point.address.road;
  }

  if (!current.city && point.address.city) {
    updates.city = point.address.city;
  }

  if (!current.state && point.address.state) {
    updates.state = point.address.state;
  }

  if (!current.zipCode && point.address.postcode) {
    updates.zipCode = point.address.postcode;
  }

  await prisma.condominium.update({
    where: { id: condominiumId },
    data: updates,
  });
}

async function getCondominiumReferencePoint(condominiumId: string) {
  const [properties, checkins] = await Promise.all([
    prisma.property.findMany({
      where: {
        condominiumId,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        lat: true,
        lng: true,
      },
    }),
    prisma.checkin.findMany({
      where: {
        condominiumId,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        lat: true,
        lng: true,
      },
      take: 25,
    }),
  ]);

  const points = [...properties, ...checkins].filter(
    (point): point is { lat: number; lng: number } => hasCoordinates(point),
  );

  if (points.length < 2) {
    return null;
  }

  const total = points.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat!,
      lng: accumulator.lng + point.lng!,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

async function clearInvalidCoordinates(
  model: "office" | "condominium" | "property" | "checkin",
  id: string,
  point: { lat: number | null; lng: number | null } | null | undefined,
) {
  if (point?.lat == null || point.lng == null || isWithinCentralFloridaServiceArea(point)) {
    return;
  }

  const data = {
    lat: null,
    lng: null,
  };

  switch (model) {
    case "office":
      await prisma.office.update({
        where: { id },
        data,
      });
      return;
    case "condominium":
      await prisma.condominium.update({
        where: { id },
        data,
      });
      return;
    case "property":
      await prisma.property.update({
        where: { id },
        data,
      });
      return;
    case "checkin":
      await prisma.checkin.update({
        where: { id },
        data,
      });
      return;
  }
}

async function geocodeOffice(officeId: string) {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: {
      id: true,
      lat: true,
      lng: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      name: true,
    },
  });

  if (!office) {
    return office;
  }

  await clearInvalidCoordinates("office", office.id, office);

  if (hasCoordinates(office)) {
    return office;
  }

  const query = composeAddress([
    office.address,
    office.city,
    office.state,
    office.zipCode,
    "USA",
  ]);
  const point = await geocodeAddress(query, { restrictToServiceArea: true });

  if (!point) {
    return office;
  }

  await prisma.office.update({
    where: { id: office.id },
    data: {
      lat: point.lat,
      lng: point.lng,
    },
  });

  return {
    ...office,
    lat: point.lat,
    lng: point.lng,
  };
}

async function geocodeCondominium(condominiumId: string) {
  const rawCondominium = await prisma.condominium.findUnique({
    where: { id: condominiumId },
    select: {
      id: true,
      lat: true,
      lng: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      nameOriginal: true,
    },
  });

  if (!rawCondominium) {
    return rawCondominium;
  }

  const condominium = mergeKnownCondominiumContext(rawCondominium);

  if (
    condominium.address !== rawCondominium.address ||
    condominium.city !== rawCondominium.city ||
    condominium.state !== rawCondominium.state ||
    condominium.zipCode !== rawCondominium.zipCode
  ) {
    await prisma.condominium.update({
      where: { id: rawCondominium.id },
      data: {
        address: condominium.address,
        city: condominium.city,
        state: condominium.state,
        zipCode: condominium.zipCode,
      },
    });
  }

  await clearInvalidCoordinates("condominium", condominium.id, condominium);

  if (hasCoordinates(condominium)) {
    if (!condominium.city || !condominium.state || !condominium.zipCode || !condominium.address) {
      const confirmationQuery =
        composeAddress([
          condominium.nameOriginal,
          condominium.address,
          condominium.city,
          condominium.state,
          condominium.zipCode,
          "Florida",
          "USA",
        ]) || composeAddress([condominium.nameOriginal, "Florida", "USA"]);
      const confirmedPoint = await confirmAndPersistLocation({
        entityType: LOCATION_REVIEW_ENTITY_TYPE.CONDOMINIUM,
        entityId: condominium.id,
        label: condominium.nameOriginal,
        query: confirmationQuery,
        normalizedAddress: condominium.address,
        condominiumName: condominium.nameOriginal,
        context: buildCondominiumGeoContext(condominium),
      });

      await persistCondominiumAddressData(condominium.id, confirmedPoint, condominium);
    }

    return condominium;
  }

  const inferredPoint = await getCondominiumReferencePoint(condominium.id);
  if (inferredPoint) {
    await prisma.condominium.update({
      where: { id: condominium.id },
      data: {
        lat: inferredPoint.lat,
        lng: inferredPoint.lng,
      },
    });

    return {
      ...condominium,
      lat: inferredPoint.lat,
      lng: inferredPoint.lng,
    };
  }

  const query =
    composeAddress([
      condominium.nameOriginal,
      condominium.address,
      condominium.city,
      condominium.state,
      condominium.zipCode,
      "USA",
    ]) ||
    composeAddress([condominium.nameOriginal, condominium.city, condominium.state, "Florida", "USA"]);

  const point = await confirmAndPersistLocation({
    entityType: LOCATION_REVIEW_ENTITY_TYPE.CONDOMINIUM,
    entityId: condominium.id,
    label: condominium.nameOriginal,
    query,
    normalizedAddress: condominium.address,
    condominiumName: condominium.nameOriginal,
    context: buildCondominiumGeoContext(condominium),
  });

  if (!point) {
    return condominium;
  }

  await persistCondominiumAddressData(condominium.id, point, condominium);

  return {
    ...condominium,
    lat: point.lat,
    lng: point.lng,
  };
}

async function geocodeProperty(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      lat: true,
      lng: true,
      address: true,
      nameOriginal: true,
      condominium: {
        select: {
          id: true,
          nameOriginal: true,
          city: true,
          state: true,
          zipCode: true,
          address: true,
          lat: true,
          lng: true,
        },
      },
    },
  });

  if (!property) {
    return property;
  }

  const condominium = property.condominium
    ? mergeKnownCondominiumContext({
      ...property.condominium,
      zipCode: sanitizeZipCode(property.condominium.zipCode) ?? property.condominium.zipCode,
    })
    : null;

  await clearInvalidCoordinates("property", property.id, property);

  const condominiumReferencePoint =
    condominium?.id != null
      ? (hasCoordinates(condominium)
        ? { lat: condominium.lat!, lng: condominium.lng! }
        : await getCondominiumReferencePoint(condominium.id))
      : null;
  const condominiumGeoContext = condominium
    ? buildCondominiumGeoContext({
      ...condominium,
      lat: condominiumReferencePoint?.lat ?? condominium.lat,
      lng: condominiumReferencePoint?.lng ?? condominium.lng,
      })
    : null;

  if (
    hasCoordinates(property) &&
    condominiumReferencePoint &&
    haversineDistanceMiles(
      { lat: property.lat!, lng: property.lng! },
      condominiumReferencePoint,
    ) > 8
  ) {
    await prisma.property.update({
      where: { id: property.id },
      data: { lat: null, lng: null },
    });
    property.lat = null;
    property.lng = null;
  }

  if (hasCoordinates(property)) {
    return property;
  }

  const query = buildGeocodeQueryVariants({
    normalizedAddress: property.address,
    label: property.nameOriginal,
    condominiumName: condominium?.nameOriginal ?? null,
    condominium,
  });

  const point = await confirmAndPersistLocation({
    entityType: LOCATION_REVIEW_ENTITY_TYPE.PROPERTY,
    entityId: property.id,
    label: property.nameOriginal,
    query,
    normalizedAddress: property.address,
    condominiumName: condominium?.nameOriginal ?? null,
    context: condominiumGeoContext,
  });

  if (!point) {
    return property;
  }

  if (
    condominiumReferencePoint &&
    haversineDistanceMiles(
      { lat: point.lat, lng: point.lng },
      condominiumReferencePoint,
    ) > 8
  ) {
    await prisma.property.update({
      where: { id: property.id },
      data: { lat: null, lng: null },
    });

    return {
      ...property,
      lat: null,
      lng: null,
    };
  }

  await prisma.property.update({
    where: { id: property.id },
    data: {
      lat: point.lat,
      lng: point.lng,
    },
  });

  return {
    ...property,
    lat: point.lat,
    lng: point.lng,
  };
}

export async function enrichCondominiumLocationData(condominiumId: string) {
  return geocodeCondominium(condominiumId);
}

async function geocodeCheckin(checkinId: string) {
  const checkin = await prisma.checkin.findUnique({
    where: { id: checkinId },
    select: {
      id: true,
      address: true,
      lat: true,
      lng: true,
      propertyName: true,
      condominiumName: true,
      propertyId: true,
      condominiumId: true,
      property: {
        select: {
          lat: true,
          lng: true,
        },
      },
      condominium: {
        select: {
          address: true,
          city: true,
          state: true,
          zipCode: true,
          lat: true,
          lng: true,
          nameOriginal: true,
        },
      },
    },
  });

  if (!checkin) {
    return null;
  }

  const condominium = checkin.condominium
    ? mergeKnownCondominiumContext({
      ...checkin.condominium,
      zipCode: sanitizeZipCode(checkin.condominium.zipCode) ?? checkin.condominium.zipCode,
    })
    : null;

  await clearInvalidCoordinates("checkin", checkin.id, checkin);

  if (hasCoordinates(checkin)) {
    return checkin;
  }

  let propertyPoint: { lat: number; lng: number } | null = null;
  if (checkin.propertyId) {
    const property = await geocodeProperty(checkin.propertyId);
    propertyPoint = getKnownRoutePoint(property, checkin.property);
  }

  if (checkin.condominiumId) {
    await geocodeCondominium(checkin.condominiumId);
  }

  let point = propertyPoint ?? getKnownRoutePoint(checkin.property);

  if (!point) {
    const query = buildGeocodeQueryVariants({
      normalizedAddress: checkin.address,
      label: checkin.propertyName,
      condominiumName: checkin.condominiumName,
      condominium,
    });

    const condominiumGeoContext = condominium
      ? buildCondominiumGeoContext(condominium)
      : null;
    const geocoded = query.length > 0
      ? await confirmAndPersistLocation({
          entityType: LOCATION_REVIEW_ENTITY_TYPE.CHECKIN,
          entityId: checkin.id,
          label: checkin.propertyName,
          query,
          normalizedAddress: checkin.address,
          condominiumName: checkin.condominiumName,
          context: condominiumGeoContext,
        })
      : null;
    if (geocoded) {
      point = { lat: geocoded.lat, lng: geocoded.lng };
    }
  }

  if (!point) {
    return {
      ...checkin,
      lat: null,
      lng: null,
    };
  }

  await prisma.checkin.update({
    where: { id: checkin.id },
    data: {
      lat: point.lat,
      lng: point.lng,
    },
  });

  return {
    ...checkin,
    lat: point.lat,
    lng: point.lng,
  };
}

export async function ensureOperationRouteCoordinates(operationRunId: string) {
  const inheritedUpdates = await prisma.operationAssignment.findMany({
    where: {
      operationRunId,
    },
    select: {
      checkinId: true,
      checkin: {
        select: {
          lat: true,
          lng: true,
          property: {
            select: {
              lat: true,
              lng: true,
            },
          },
          condominium: {
            select: {
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });

  const syncOperations = inheritedUpdates
    .map((assignment) => {
      if (hasCoordinates(assignment.checkin)) {
        return null;
      }

      const point = getKnownRoutePoint(assignment.checkin.property);
      if (!point) {
        return null;
      }

      return prisma.checkin.update({
        where: {
          id: assignment.checkinId,
        },
        data: {
          lat: point.lat,
          lng: point.lng,
        },
      });
    })
    .filter(
      (operation): operation is ReturnType<typeof prisma.checkin.update> => operation != null,
    );

  if (syncOperations.length > 0) {
    await prisma.$transaction(syncOperations);
  }

  const assignments = await prisma.operationAssignment.findMany({
    where: {
      operationRunId,
    },
    select: {
      id: true,
      propertyManager: {
        select: {
          officeId: true,
        },
      },
      checkin: {
        select: {
          id: true,
          address: true,
          lat: true,
          lng: true,
          propertyName: true,
          condominiumName: true,
          propertyId: true,
          condominiumId: true,
          condominium: {
            select: {
              address: true,
              city: true,
              state: true,
              zipCode: true,
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });

  const officeIdsSet = new Set<string>();
  for (const assignmentRecord of assignments) {
    const officeId = assignmentRecord.propertyManager.officeId;
    if (officeId) {
      officeIdsSet.add(officeId);
    }
  }
  const officeIds = Array.from(officeIdsSet);

  for (const officeId of officeIds) {
    await geocodeOffice(officeId);
  }

  for (const assignment of assignments) {
    await geocodeCheckin(assignment.checkin.id);
  }
}

export async function cleanupUploadInheritedCondominiumCoordinates(uploadId: string) {
  const checkins = await prisma.checkin.findMany({
    where: {
      spreadsheetUploadId: uploadId,
      lat: { not: null },
      lng: { not: null },
      condominium: {
        lat: { not: null },
        lng: { not: null },
      },
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      property: {
        select: {
          lat: true,
          lng: true,
        },
      },
      condominium: {
        select: {
          lat: true,
          lng: true,
        },
      },
    },
  });

  const suspiciousCheckins = checkins.filter((checkin) => {
    if (!areSamePoint(checkin, checkin.condominium)) {
      return false;
    }

    return !areSamePoint(checkin, checkin.property);
  });

  if (suspiciousCheckins.length === 0) {
    return 0;
  }

  await prisma.$transaction([
    ...suspiciousCheckins.map((checkin) =>
      prisma.checkin.update({
        where: {
          id: checkin.id,
        },
        data: {
          lat: null,
          lng: null,
        },
      }),
    ),
    prisma.operationRun.updateMany({
      where: {
        spreadsheetUploadId: uploadId,
      },
      data: {
        routeAnalysisJson: null,
        routeAnalysisSource: null,
        routeAnalysisModel: null,
        routeAnalysisGeneratedAt: null,
      },
    }),
  ]);

  return suspiciousCheckins.length;
}

type UploadLocationEnrichmentOptions = {
  condominiumLimit?: number;
  propertyLimit?: number;
  checkinLimit?: number;
  reviewCooldownMinutes?: number;
  candidateWindowMultiplier?: number;
};

type UploadLocationCoverageSnapshot = {
  condominiumsMissing: number;
  propertiesMissing: number;
  checkinsMissing: number;
};

function getReviewCooldownDate(reviewCooldownMinutes: number) {
  return new Date(Date.now() - reviewCooldownMinutes * 60 * 1000);
}

export async function getUploadLocationCoverageSnapshot(
  uploadId: string,
): Promise<UploadLocationCoverageSnapshot> {
  const [condominiumsMissing, propertiesMissing, checkinsMissing] = await Promise.all([
    prisma.condominium.count({
      where: {
        checkins: {
          some: {
            spreadsheetUploadId: uploadId,
          },
        },
        OR: [
          { address: null },
          { city: null },
          { state: null },
          { zipCode: null },
          { lat: null },
          { lng: null },
        ],
      },
    }),
    prisma.property.count({
      where: {
        checkins: {
          some: {
            spreadsheetUploadId: uploadId,
          },
        },
        OR: [{ lat: null }, { lng: null }],
      },
    }),
    prisma.checkin.count({
      where: {
        spreadsheetUploadId: uploadId,
        OR: [{ lat: null }, { lng: null }],
      },
    }),
  ]);

  return {
    condominiumsMissing,
    propertiesMissing,
    checkinsMissing,
  };
}

export async function hasUploadLocationBacklog(uploadId: string) {
  const snapshot = await getUploadLocationCoverageSnapshot(uploadId);
  return (
    snapshot.condominiumsMissing > 0 ||
    snapshot.propertiesMissing > 0 ||
    snapshot.checkinsMissing > 0
  );
}

export async function enrichUploadLocationData(
  uploadId: string,
  options: UploadLocationEnrichmentOptions = {},
) {
  const condominiumLimit = options.condominiumLimit ?? 24;
  const propertyLimit = options.propertyLimit ?? 80;
  const checkinLimit = options.checkinLimit ?? 240;
  const reviewCooldownMinutes = options.reviewCooldownMinutes ?? 180;
  const candidateWindowMultiplier = Math.max(1, options.candidateWindowMultiplier ?? 4);
  const reviewCooldownDate = getReviewCooldownDate(reviewCooldownMinutes);

  const uploadSyncCandidates = await prisma.checkin.findMany({
    where: {
      spreadsheetUploadId: uploadId,
      OR: [{ lat: null }, { lng: null }],
    },
    select: {
      id: true,
      property: {
        select: {
          lat: true,
          lng: true,
        },
      },
      condominium: {
        select: {
          lat: true,
          lng: true,
        },
      },
    },
    take: checkinLimit * candidateWindowMultiplier,
  });

  const uploadSyncOperations = uploadSyncCandidates
    .map((checkin) => {
      const point = getKnownRoutePoint(checkin.property);
      if (!point) {
        return null;
      }

      return prisma.checkin.update({
        where: {
          id: checkin.id,
        },
        data: {
          lat: point.lat,
          lng: point.lng,
        },
      });
    })
    .filter(
      (operation): operation is ReturnType<typeof prisma.checkin.update> => operation != null,
    );

  if (uploadSyncOperations.length > 0) {
    await prisma.$transaction(uploadSyncOperations);
  }

  const [recentCondominiumReviewIds, recentPropertyReviewIds, recentCheckinReviewIds] =
    await Promise.all([
      getPendingLocationReviewEntityIds(LOCATION_REVIEW_ENTITY_TYPE.CONDOMINIUM, {
        updatedSince: reviewCooldownDate,
        limit: condominiumLimit * candidateWindowMultiplier * 8,
      }),
      getPendingLocationReviewEntityIds(LOCATION_REVIEW_ENTITY_TYPE.PROPERTY, {
        updatedSince: reviewCooldownDate,
        limit: propertyLimit * candidateWindowMultiplier * 8,
      }),
      getPendingLocationReviewEntityIds(LOCATION_REVIEW_ENTITY_TYPE.CHECKIN, {
        updatedSince: reviewCooldownDate,
        limit: checkinLimit * candidateWindowMultiplier * 8,
      }),
    ]);

  const [condominiums, properties, checkins] = await Promise.all([
    prisma.condominium.findMany({
      where: {
        checkins: {
          some: {
            spreadsheetUploadId: uploadId,
          },
        },
        OR: [
          { address: null },
          { city: null },
          { state: null },
          { zipCode: null },
          { lat: null },
          { lng: null },
        ],
      },
      select: {
        id: true,
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: condominiumLimit * candidateWindowMultiplier,
    }),
    prisma.property.findMany({
      where: {
        checkins: {
          some: {
            spreadsheetUploadId: uploadId,
          },
        },
        OR: [{ lat: null }, { lng: null }],
      },
      select: {
        id: true,
        address: true,
        condominiumId: true,
        defaultPropertyManagerId: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: propertyLimit * candidateWindowMultiplier,
    }),
    prisma.checkin.findMany({
      where: {
        spreadsheetUploadId: uploadId,
        OR: [{ lat: null }, { lng: null }],
      },
      select: {
        id: true,
        address: true,
        propertyId: true,
        condominiumId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: checkinLimit * candidateWindowMultiplier,
    }),
  ]);

  const prioritizedCondominiums = condominiums
    .filter((condominium) => !recentCondominiumReviewIds.has(condominium.id))
    .slice(0, condominiumLimit);

  const prioritizedProperties = [...properties]
    .filter((property) => !recentPropertyReviewIds.has(property.id))
    .sort((left, right) => {
      const leftScore =
        (left.address ? 3 : 0) + (left.condominiumId ? 2 : 0) + (left.defaultPropertyManagerId ? 1 : 0);
      const rightScore =
        (right.address ? 3 : 0) + (right.condominiumId ? 2 : 0) + (right.defaultPropertyManagerId ? 1 : 0);

      return rightScore - leftScore || left.updatedAt.getTime() - right.updatedAt.getTime();
    })
    .slice(0, propertyLimit);

  const prioritizedCheckins = [...checkins]
    .filter((checkin) => !recentCheckinReviewIds.has(checkin.id))
    .sort((left, right) => {
      const leftScore = (left.propertyId ? 5 : 0) + (left.condominiumId ? 3 : 0) + (left.address ? 1 : 0);
      const rightScore = (right.propertyId ? 5 : 0) + (right.condominiumId ? 3 : 0) + (right.address ? 1 : 0);

      return rightScore - leftScore || right.createdAt.getTime() - left.createdAt.getTime();
    })
    .slice(0, checkinLimit);

  for (const condominium of prioritizedCondominiums) {
    await geocodeCondominium(condominium.id);
  }

  for (const property of prioritizedProperties) {
    await geocodeProperty(property.id);
  }

  for (const checkin of prioritizedCheckins) {
    await geocodeCheckin(checkin.id);
  }
}

export async function enrichAllCondominiumLocationData() {
  const condominiums = await prisma.condominium.findMany({
    select: {
      id: true,
    },
    orderBy: {
      nameOriginal: "asc",
    },
  });

  for (const condominium of condominiums) {
    await geocodeCondominium(condominium.id);
  }
}

export async function enrichMissingCondominiumLocationData() {
  const condominiums = await prisma.condominium.findMany({
    where: {
      OR: [
        { address: null },
        { city: null },
        { state: null },
        { zipCode: null },
        { lat: null },
        { lng: null },
      ],
    },
    select: {
      id: true,
    },
    orderBy: {
      nameOriginal: "asc",
    },
  });

  for (const condominium of condominiums) {
    await geocodeCondominium(condominium.id);
  }
}

export async function enrichMissingPropertyLocationData(limit = 50) {
  const properties = await prisma.property.findMany({
    where: {
      OR: [{ lat: null }, { lng: null }],
    },
    select: {
      id: true,
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: limit,
  });

  for (const property of properties) {
    await geocodeProperty(property.id);
  }
}

export async function auditPropertyLocationData(limit = 200) {
  const properties = await prisma.property.findMany({
    select: {
      id: true,
      lat: true,
      lng: true,
      updatedAt: true,
      condominium: {
        select: {
          lat: true,
          lng: true,
        },
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
  });

  const candidates = [];
  for (const propertyRecord of properties) {
    const missingCoordinates = propertyRecord.lat == null || propertyRecord.lng == null;
    const outsideServiceArea =
      propertyRecord.lat != null &&
      propertyRecord.lng != null &&
      !isWithinCentralFloridaServiceArea({ lat: propertyRecord.lat, lng: propertyRecord.lng });
    const farFromCondominium =
      propertyRecord.lat != null &&
      propertyRecord.lng != null &&
      propertyRecord.condominium?.lat != null &&
      propertyRecord.condominium?.lng != null &&
      haversineDistanceMiles(
        { lat: propertyRecord.lat, lng: propertyRecord.lng },
        { lat: propertyRecord.condominium.lat, lng: propertyRecord.condominium.lng },
      ) > 8;

    if (missingCoordinates || outsideServiceArea || farFromCondominium) {
      candidates.push(propertyRecord);
      if (candidates.length >= limit) {
        break;
      }
    }
  }

  for (const property of candidates) {
    await geocodeProperty(property.id);
  }
}

export async function enrichMissingCheckinLocationData(limit = 100) {
  const checkins = await prisma.checkin.findMany({
    where: {
      OR: [{ lat: null }, { lng: null }],
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  for (const checkin of checkins) {
    await geocodeCheckin(checkin.id);
  }
}

export async function auditCheckinLocationData(limit = 500) {
  const checkins = await prisma.checkin.findMany({
    select: {
      id: true,
      lat: true,
      lng: true,
      createdAt: true,
      condominium: {
        select: {
          lat: true,
          lng: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const candidates = [];
  for (const checkinRecord of checkins) {
    const missingCoordinates = checkinRecord.lat == null || checkinRecord.lng == null;
    const outsideServiceArea =
      checkinRecord.lat != null &&
      checkinRecord.lng != null &&
      !isWithinCentralFloridaServiceArea({ lat: checkinRecord.lat, lng: checkinRecord.lng });
    const farFromCondominium =
      checkinRecord.lat != null &&
      checkinRecord.lng != null &&
      checkinRecord.condominium?.lat != null &&
      checkinRecord.condominium?.lng != null &&
      haversineDistanceMiles(
        { lat: checkinRecord.lat, lng: checkinRecord.lng },
        { lat: checkinRecord.condominium.lat, lng: checkinRecord.condominium.lng },
      ) > 8;

    if (missingCoordinates || outsideServiceArea || farFromCondominium) {
      candidates.push(checkinRecord);
      if (candidates.length >= limit) {
        break;
      }
    }
  }

  for (const checkin of candidates) {
    await geocodeCheckin(checkin.id);
  }
}
