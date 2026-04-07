import { normalizeText } from "@/lib/upload/normalize";

type KnownCondominiumContext = {
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

const KNOWN_CONDOMINIUM_CONTEXT: Record<string, KnownCondominiumContext> = {
  [normalizeText("Lucaya Village")]: {
    address: "3040 Polynesian Isles Boulevard",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
  [normalizeText("West Lucaya")]: {
    address: "3241 Wish Avenue",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34747",
  },
  [normalizeText("The Hub at Westside")]: {
    address: "3205 Tranquil Trail",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34747",
  },
  [normalizeText("The Hub at Westside Reserve")]: {
    address: "3213 Sustainable Way",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34747",
  },
  [normalizeText("Compass Bay")]: {
    address: "Compass Bay Drive",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
  [normalizeText("Cumbrian Lakes")]: {
    address: "Cumbrian Lakes Drive",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
  [normalizeText("Seasons")]: {
    address: "Seasons Boulevard",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
  [normalizeText("Wilshire Oaks")]: {
    address: "Chadwick Circle",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
  [normalizeText("Terra Esmeralda")]: {
    address: "Terra Esmeralda Drive",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
  },
};

export function getKnownCondominiumContext(name: string | null | undefined) {
  if (!name) {
    return null;
  }

  return KNOWN_CONDOMINIUM_CONTEXT[normalizeText(name)] ?? null;
}

export function mergeKnownCondominiumContext<T extends {
  nameOriginal?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}>(value: T): T {
  const known = getKnownCondominiumContext(value.nameOriginal);

  if (!known) {
    return value;
  }

  return {
    ...value,
    address: value.address || known.address,
    city: value.city || known.city,
    state: value.state || known.state,
    zipCode: value.zipCode || known.zipCode,
  };
}
