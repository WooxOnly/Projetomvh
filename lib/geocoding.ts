import "server-only";

type GeocodePoint = {
  lat: number;
  lng: number;
  displayName: string;
  address: {
    road: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
  };
};

type GeocodeOptions = {
  restrictToServiceArea?: boolean;
  preferredPoint?: {
    lat: number;
    lng: number;
  } | null;
  maxDistanceFromPreferredMiles?: number;
  requiredLocality?: string | null;
  preferredTerms?: string[];
};

const CENTRAL_FLORIDA_SERVICE_AREA = {
  south: 27.95,
  north: 28.85,
  west: -81.85,
  east: -80.95,
};

function stripBuildingPrefix(value: string) {
  return value.replace(/^\s*[^\s-]+-\s*(.+)$/u, "$1").trim();
}

const geocodeCache = new Map<string, GeocodePoint | null>();
const geocodeCandidatesCache = new Map<string, GeocodePoint[]>();
let geocodeQueue = Promise.resolve();
let nextAvailableAt = 0;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
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

function normalizeTerm(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function buildSearchableText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeTerm(part))
    .filter(Boolean)
    .join(" ");
}

function resolveCityLike(value: {
  city?: string | null;
  town?: string | null;
  village?: string | null;
  hamlet?: string | null;
}) {
  return value.city ?? value.town ?? value.village ?? value.hamlet ?? null;
}

function buildUserAgent() {
  const contactEmail = process.env.GEOCODING_CONTACT_EMAIL?.trim();
  return contactEmail
    ? `projetomvh/1.0 (${contactEmail})`
    : "projetomvh/1.0 (local route geocoding)";
}

export function composeAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ? stripBuildingPrefix(part.trim()) : ""))
    .filter(Boolean)
    .join(", ");
}

export function isWithinCentralFloridaServiceArea(point: {
  lat: number | null | undefined;
  lng: number | null | undefined;
}) {
  if (point.lat == null || point.lng == null) {
    return false;
  }

  return (
    point.lat >= CENTRAL_FLORIDA_SERVICE_AREA.south &&
    point.lat <= CENTRAL_FLORIDA_SERVICE_AREA.north &&
    point.lng >= CENTRAL_FLORIDA_SERVICE_AREA.west &&
    point.lng <= CENTRAL_FLORIDA_SERVICE_AREA.east
  );
}

async function runWithRateLimit<T>(task: () => Promise<T>) {
  const run = geocodeQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextAvailableAt - now);

    if (waitMs > 0) {
      await wait(waitMs);
    }

    nextAvailableAt = Date.now() + 1100;
    return task();
  });

  geocodeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

export async function geocodeAddress(query: string, options: GeocodeOptions = {}) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return null;
  }

  const cacheKey = JSON.stringify({
    query: normalizedQuery,
    restrictToServiceArea: options.restrictToServiceArea ?? false,
    requiredLocality: normalizeTerm(options.requiredLocality),
    preferredTerms: options.preferredTerms?.map((term) => normalizeTerm(term)).filter(Boolean) ?? [],
    preferredPoint:
      options.preferredPoint != null
        ? {
            lat: Number(options.preferredPoint.lat.toFixed(4)),
            lng: Number(options.preferredPoint.lng.toFixed(4)),
          }
        : null,
    maxDistanceFromPreferredMiles: options.maxDistanceFromPreferredMiles ?? null,
  });

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }

  const contactEmail = process.env.GEOCODING_CONTACT_EMAIL?.trim();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");

  if (options.restrictToServiceArea) {
    url.searchParams.set(
      "viewbox",
      `${CENTRAL_FLORIDA_SERVICE_AREA.west},${CENTRAL_FLORIDA_SERVICE_AREA.north},${CENTRAL_FLORIDA_SERVICE_AREA.east},${CENTRAL_FLORIDA_SERVICE_AREA.south}`,
    );
    url.searchParams.set("bounded", "1");
  }

  if (contactEmail) {
    url.searchParams.set("email", contactEmail);
  }

  const result = await runWithRateLimit(async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": buildUserAgent(),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: {
        road?: string;
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        state?: string;
        postcode?: string;
      };
    }>;
    const preferredTerms = options.preferredTerms
      ?.map((term) => normalizeTerm(term))
      .filter(Boolean) ?? [];
    const requiredLocality = normalizeTerm(options.requiredLocality);
    const candidates = payload
      .map((entry) => {
        if (!entry?.lat || !entry?.lon) {
          return null;
        }

        const point = {
          lat: Number.parseFloat(entry.lat),
          lng: Number.parseFloat(entry.lon),
          displayName: entry.display_name ?? normalizedQuery,
          address: {
            road: entry.address?.road ?? null,
            city: resolveCityLike(entry.address ?? {}),
            state: entry.address?.state ?? null,
            postcode: entry.address?.postcode ?? null,
          },
        } satisfies GeocodePoint;

        if (options.restrictToServiceArea && !isWithinCentralFloridaServiceArea(point)) {
          return null;
        }

        const searchableText = buildSearchableText([
          point.displayName,
          point.address.road,
          point.address.city,
          point.address.state,
          point.address.postcode,
        ]);

        if (
          requiredLocality &&
          !searchableText.includes(requiredLocality) &&
          normalizeTerm(point.address.city) !== requiredLocality
        ) {
          return null;
        }

        const preferredTermScore = preferredTerms.reduce((score, term) => {
          return searchableText.includes(term) ? score + 1 : score;
        }, 0);

        const distanceFromPreferred =
          options.preferredPoint != null
            ? haversineDistanceMiles(options.preferredPoint, point)
            : null;

        return {
          point,
          preferredTermScore,
          distanceFromPreferred,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          point: GeocodePoint;
          preferredTermScore: number;
          distanceFromPreferred: number | null;
        } => candidate != null,
      )
      .sort((left, right) => {
        if (right.preferredTermScore !== left.preferredTermScore) {
          return right.preferredTermScore - left.preferredTermScore;
        }

        if (left.distanceFromPreferred != null && right.distanceFromPreferred != null) {
          return left.distanceFromPreferred - right.distanceFromPreferred;
        }

        if (left.distanceFromPreferred != null) {
          return -1;
        }

        if (right.distanceFromPreferred != null) {
          return 1;
        }

        return 0;
      });

    const first = candidates[0];

    if (!first) {
      return null;
    }

    if (
      options.preferredPoint &&
      options.maxDistanceFromPreferredMiles != null &&
      first.distanceFromPreferred != null &&
      first.distanceFromPreferred > options.maxDistanceFromPreferredMiles
    ) {
      return null;
    }

    return first.point;
  });

  geocodeCache.set(cacheKey, result);
  return result;
}

export async function geocodeAddressCandidates(
  query: string,
  options: GeocodeOptions = {},
) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [] satisfies GeocodePoint[];
  }

  const cacheKey = JSON.stringify({
    query: normalizedQuery,
    restrictToServiceArea: options.restrictToServiceArea ?? false,
    requiredLocality: normalizeTerm(options.requiredLocality),
    preferredTerms: options.preferredTerms?.map((term) => normalizeTerm(term)).filter(Boolean) ?? [],
    preferredPoint:
      options.preferredPoint != null
        ? {
            lat: Number(options.preferredPoint.lat.toFixed(4)),
            lng: Number(options.preferredPoint.lng.toFixed(4)),
          }
        : null,
    maxDistanceFromPreferredMiles: options.maxDistanceFromPreferredMiles ?? null,
    mode: "candidates",
  });

  if (geocodeCandidatesCache.has(cacheKey)) {
    return geocodeCandidatesCache.get(cacheKey) ?? [];
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");

  if (options.restrictToServiceArea) {
    url.searchParams.set(
      "viewbox",
      `${CENTRAL_FLORIDA_SERVICE_AREA.west},${CENTRAL_FLORIDA_SERVICE_AREA.north},${CENTRAL_FLORIDA_SERVICE_AREA.east},${CENTRAL_FLORIDA_SERVICE_AREA.south}`,
    );
    url.searchParams.set("bounded", "1");
  }

  const contactEmail = process.env.GEOCODING_CONTACT_EMAIL?.trim();
  if (contactEmail) {
    url.searchParams.set("email", contactEmail);
  }

  const candidates = await runWithRateLimit(async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": buildUserAgent(),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [] satisfies GeocodePoint[];
    }

    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: {
        road?: string;
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        state?: string;
        postcode?: string;
      };
    }>;
    const preferredTerms = options.preferredTerms
      ?.map((term) => normalizeTerm(term))
      .filter(Boolean) ?? [];
    const requiredLocality = normalizeTerm(options.requiredLocality);

    return payload
      .map((entry) => {
        if (!entry?.lat || !entry?.lon) {
          return null;
        }

        const point = {
          lat: Number.parseFloat(entry.lat),
          lng: Number.parseFloat(entry.lon),
          displayName: entry.display_name ?? normalizedQuery,
          address: {
            road: entry.address?.road ?? null,
            city: resolveCityLike(entry.address ?? {}),
            state: entry.address?.state ?? null,
            postcode: entry.address?.postcode ?? null,
          },
        } satisfies GeocodePoint;

        if (options.restrictToServiceArea && !isWithinCentralFloridaServiceArea(point)) {
          return null;
        }

        const searchableText = buildSearchableText([
          point.displayName,
          point.address.road,
          point.address.city,
          point.address.state,
          point.address.postcode,
        ]);

        if (
          requiredLocality &&
          !searchableText.includes(requiredLocality) &&
          normalizeTerm(point.address.city) !== requiredLocality
        ) {
          return null;
        }

        const preferredTermScore = preferredTerms.reduce((score, term) => {
          return searchableText.includes(term) ? score + 1 : score;
        }, 0);

        const distanceFromPreferred =
          options.preferredPoint != null
            ? haversineDistanceMiles(options.preferredPoint, point)
            : null;

        if (
          options.preferredPoint &&
          options.maxDistanceFromPreferredMiles != null &&
          distanceFromPreferred != null &&
          distanceFromPreferred > options.maxDistanceFromPreferredMiles
        ) {
          return null;
        }

        return {
          point,
          preferredTermScore,
          distanceFromPreferred,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          point: GeocodePoint;
          preferredTermScore: number;
          distanceFromPreferred: number | null;
        } => candidate != null,
      )
      .sort((left, right) => {
        if (right.preferredTermScore !== left.preferredTermScore) {
          return right.preferredTermScore - left.preferredTermScore;
        }

        if (left.distanceFromPreferred != null && right.distanceFromPreferred != null) {
          return left.distanceFromPreferred - right.distanceFromPreferred;
        }

        if (left.distanceFromPreferred != null) {
          return -1;
        }

        if (right.distanceFromPreferred != null) {
          return 1;
        }

        return 0;
      })
      .map((candidate) => candidate.point);
  });

  geocodeCandidatesCache.set(cacheKey, candidates);
  return candidates;
}
