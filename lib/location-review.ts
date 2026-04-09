import "server-only";

import { prisma } from "@/lib/prisma";

export const LOCATION_REVIEW_ENTITY_TYPE = {
  CONDOMINIUM: "CONDOMINIUM",
  PROPERTY: "PROPERTY",
  CHECKIN: "CHECKIN",
} as const;

export const LOCATION_REVIEW_STATUS = {
  PENDING: "PENDING",
  RESOLVED: "RESOLVED",
} as const;

export type LocationReviewEntityType =
  (typeof LOCATION_REVIEW_ENTITY_TYPE)[keyof typeof LOCATION_REVIEW_ENTITY_TYPE];

type ReviewCandidate = {
  displayName: string;
  lat: number;
  lng: number;
  road: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
};

type UpsertLocationReviewInput = {
  entityType: LocationReviewEntityType;
  entityId: string;
  title: string;
  originalQuery: string | null;
  normalizedAddress: string | null;
  condominiumName: string | null;
  condominiumCity: string | null;
  condominiumState: string | null;
  condominiumZipCode: string | null;
  confidence: number | null;
  aiModel: string | null;
  aiRationale: string | null;
  selectedCandidate: ReviewCandidate | null;
  candidates: ReviewCandidate[];
};

export async function upsertPendingLocationReview(input: UpsertLocationReviewInput) {
  await prisma.locationReview.upsert({
    where: {
      entityType_entityId: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    update: {
      status: LOCATION_REVIEW_STATUS.PENDING,
      title: input.title,
      originalQuery: input.originalQuery,
      normalizedAddress: input.normalizedAddress,
      condominiumName: input.condominiumName,
      condominiumCity: input.condominiumCity,
      condominiumState: input.condominiumState,
      condominiumZipCode: input.condominiumZipCode,
      confidence: input.confidence,
      aiModel: input.aiModel,
      aiRationale: input.aiRationale,
      selectedDisplayName: input.selectedCandidate?.displayName ?? null,
      selectedLat: input.selectedCandidate?.lat ?? null,
      selectedLng: input.selectedCandidate?.lng ?? null,
      candidatesJson: JSON.stringify(input.candidates),
    },
    create: {
      entityType: input.entityType,
      entityId: input.entityId,
      status: LOCATION_REVIEW_STATUS.PENDING,
      title: input.title,
      originalQuery: input.originalQuery,
      normalizedAddress: input.normalizedAddress,
      condominiumName: input.condominiumName,
      condominiumCity: input.condominiumCity,
      condominiumState: input.condominiumState,
      condominiumZipCode: input.condominiumZipCode,
      confidence: input.confidence,
      aiModel: input.aiModel,
      aiRationale: input.aiRationale,
      selectedDisplayName: input.selectedCandidate?.displayName ?? null,
      selectedLat: input.selectedCandidate?.lat ?? null,
      selectedLng: input.selectedCandidate?.lng ?? null,
      candidatesJson: JSON.stringify(input.candidates),
    },
  });
}

export async function resolveLocationReview(
  entityType: LocationReviewEntityType,
  entityId: string,
) {
  await prisma.locationReview.updateMany({
    where: {
      entityType,
      entityId,
    },
    data: {
      status: LOCATION_REVIEW_STATUS.RESOLVED,
    },
  });
}

export async function countPendingLocationReviews() {
  return prisma.locationReview.count({
    where: {
      status: LOCATION_REVIEW_STATUS.PENDING,
    },
  });
}

export async function getPendingLocationReviewEntityIds(
  entityType: LocationReviewEntityType,
  options?: { updatedSince?: Date; limit?: number },
) {
  const reviews = await prisma.locationReview.findMany({
    where: {
      entityType,
      status: LOCATION_REVIEW_STATUS.PENDING,
      ...(options?.updatedSince
        ? {
            updatedAt: {
              gte: options.updatedSince,
            },
          }
        : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: options?.limit,
    select: {
      entityId: true,
    },
  });

  return new Set(reviews.map((review) => review.entityId));
}
