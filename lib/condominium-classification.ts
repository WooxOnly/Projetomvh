import type { OrlandoRegion } from "@/lib/orlando-region";
import { normalizeText } from "@/lib/upload/normalize";

type SuggestedClassification = {
  officeSlug: "orlando-office" | "kissimmee-office";
  region: OrlandoRegion;
};

const SUGGESTED_CLASSIFICATION_ENTRIES: Array<[string, SuggestedClassification]> = [
  ["Bella Vida", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Compass Bay", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Crescent Lakes", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Crystal Cove", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Cumbrian Lakes", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Eagle Pointe", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Lake Berkley Resort", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Le Reve", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Liberty Village", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Lucaya Village", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Paradiso Grande", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Regal Oaks", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Seasons", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Sonoma Resort", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Storey Lake", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Terra Esmeralda", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Terra Verde Resort", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["The Villas at Seven Dwarfs Lane", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Venetian Bay Villages", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Veranda Palms", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Vista Cay", { officeSlug: "kissimmee-office", region: "EAST" }],
  ["Wilshire Oaks", { officeSlug: "kissimmee-office", region: "SOUTH" }],
  ["Bridgewater Crossing", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Champions Gate", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Emerald Island Resort", { officeSlug: "orlando-office", region: "WEST" }],
  ["Encantada Resort", { officeSlug: "orlando-office", region: "WEST" }],
  ["Encore Resort at Reunion", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Fiesta Key", { officeSlug: "orlando-office", region: "SOUTH" }],
  ["Hampton Lakes", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Hidden Forest", { officeSlug: "orlando-office", region: "WEST" }],
  ["Indian Creek", { officeSlug: "orlando-office", region: "WEST" }],
  ["Lindfields", { officeSlug: "orlando-office", region: "WEST" }],
  ["Magic Village Views", { officeSlug: "orlando-office", region: "WEST" }],
  ["Magic Village Yards", { officeSlug: "orlando-office", region: "WEST" }],
  ["Margaritaville Resort Orlando", { officeSlug: "orlando-office", region: "WEST" }],
  ["Paradise Palms", { officeSlug: "orlando-office", region: "WEST" }],
  ["Regal Palms Resort & Spa at Highlands Reserve", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Reunion", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Silver Creek", { officeSlug: "orlando-office", region: "WEST" }],
  ["Solara Resort", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Solterra", { officeSlug: "orlando-office", region: "NORTH" }],
  ["Summerville Resort", { officeSlug: "orlando-office", region: "WEST" }],
  ["The Enclaves at Festival", { officeSlug: "orlando-office", region: "NORTH" }],
  ["The Hub at Westside", { officeSlug: "orlando-office", region: "WEST" }],
  ["The Hub at Westside Reserve", { officeSlug: "orlando-office", region: "WEST" }],
  ["West Lucaya", { officeSlug: "orlando-office", region: "WEST" }],
  ["Windsor at Westside", { officeSlug: "orlando-office", region: "WEST" }],
  ["Windsor Cay", { officeSlug: "orlando-office", region: "WEST" }],
  ["Windsor Hills Resort", { officeSlug: "orlando-office", region: "WEST" }],
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
