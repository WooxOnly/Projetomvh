export const ORLANDO_REGIONS = ["NORTH", "SOUTH", "EAST", "WEST", "UNASSIGNED"] as const;

export type OrlandoRegion = (typeof ORLANDO_REGIONS)[number];
