import type { OrlandoRegion } from "@prisma/client";

import { normalizeText } from "@/lib/upload/normalize";

type SuggestedClassification = {
  officeSlug: "orlando-office" | "kissimmee-office";
  region: OrlandoRegion;
};

const SUGGESTED_CLASSIFICATION_ENTRIES: Array<[string, SuggestedClassification]> = [
    ["Bella Vida", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Crystal Cove", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Eagle Pointe", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Fiesta Key", { officeSlug: "kissimmee-office", region: "EAST" }],
    ["Lake Berkley Resort", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Liberty Village", { officeSlug: "kissimmee-office", region: "EAST" }],
    ["Lucaya Village", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Regal Oaks", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Sonoma Resort", { officeSlug: "kissimmee-office", region: "EAST" }],
    ["Storey Lake", { officeSlug: "kissimmee-office", region: "EAST" }],
    ["Terra Verde Resort", { officeSlug: "kissimmee-office", region: "SOUTH" }],
    ["Veranda Palms", { officeSlug: "kissimmee-office", region: "EAST" }],
    ["Bridgewater Crossing", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Champions Gate", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Encore Resort at Reunion", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Hampton Lakes", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Paradiso Grande", { officeSlug: "orlando-office", region: "EAST" }],
    ["Regal Palms Resort & Spa at Highlands Reserve", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Reunion", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Solara Resort", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Solterra", { officeSlug: "orlando-office", region: "NORTH" }],
    ["The Enclaves at Festival", { officeSlug: "orlando-office", region: "NORTH" }],
    ["Encantada Resort", { officeSlug: "orlando-office", region: "WEST" }],
    ["Hidden Forest", { officeSlug: "orlando-office", region: "WEST" }],
    ["Magic Village Views", { officeSlug: "orlando-office", region: "WEST" }],
    ["Magic Village Yards", { officeSlug: "orlando-office", region: "WEST" }],
    ["Margaritaville Resort Orlando", { officeSlug: "orlando-office", region: "WEST" }],
    ["Paradise Palms", { officeSlug: "orlando-office", region: "WEST" }],
    ["Summerville Resort", { officeSlug: "orlando-office", region: "WEST" }],
    ["The Hub at Westside", { officeSlug: "orlando-office", region: "WEST" }],
    ["The Hub at Westside Reserve", { officeSlug: "orlando-office", region: "WEST" }],
    ["West Lucaya", { officeSlug: "orlando-office", region: "WEST" }],
    ["Windsor at Westside", { officeSlug: "orlando-office", region: "WEST" }],
    ["Windsor Cay", { officeSlug: "orlando-office", region: "WEST" }],
    ["Windsor Island Resort", { officeSlug: "orlando-office", region: "WEST" }],
    ["Windsor Palms Resort", { officeSlug: "orlando-office", region: "WEST" }],
];

const SUGGESTED_CLASSIFICATIONS = new Map<string, SuggestedClassification>(
  SUGGESTED_CLASSIFICATION_ENTRIES.map(([name, classification]) => [
    normalizeText(name),
    classification,
  ]),
);

export function getSuggestedCondominiumClassification(name: string | null | undefined) {
  if (!name) {
    return null;
  }

  return SUGGESTED_CLASSIFICATIONS.get(normalizeText(name)) ?? null;
}
