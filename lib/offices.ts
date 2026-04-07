import "server-only";

import type { OrlandoRegion } from "@/lib/orlando-region";

import {
  composeAddress,
  geocodeAddress,
  isWithinCentralFloridaServiceArea,
} from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";

type DefaultOffice = {
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  notes: string;
};

const DEFAULT_OFFICES: DefaultOffice[] = [
  {
    name: "Office 3",
    slug: "orlando-office",
    address: "2954 Mallory Circle Suite 104",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34747",
    notes: "Endereco de referencia encontrado nas paginas legais do site oficial da Master Vacation Homes.",
  },
  {
    name: "Office 1",
    slug: "kissimmee-office",
    address: "2801 N Poinciana Blvd",
    city: "Kissimmee",
    state: "FL",
    zipCode: "34746",
    notes: "Office location atual informado na pagina de contato oficial e confirmado no registro anual da empresa na Florida.",
  },
];

export const REGION_OPTIONS: Array<{ value: OrlandoRegion; label: string }> = [
  { value: "NORTH", label: "North" },
  { value: "SOUTH", label: "South" },
  { value: "EAST", label: "East" },
  { value: "WEST", label: "West" },
  { value: "UNASSIGNED", label: "Unassigned" },
];

export async function ensureDefaultOffices() {
  const existingOffices = await prisma.office.findMany({
    where: {
      slug: {
        in: DEFAULT_OFFICES.map((office) => office.slug),
      },
    },
    select: {
      slug: true,
    },
  });

  const existingSlugs = new Set<string>();
  for (const existingOffice of existingOffices) {
    existingSlugs.add(existingOffice.slug);
  }

  const missingOffices: DefaultOffice[] = [];
  for (const defaultOffice of DEFAULT_OFFICES) {
    if (!existingSlugs.has(defaultOffice.slug)) {
      missingOffices.push(defaultOffice);
    }
  }

  if (missingOffices.length === 0) {
    return;
  }

  await prisma.office.createMany({
    data: missingOffices,
  });
}

export async function listOffices() {
  await ensureDefaultOffices();

  const allOffices = await prisma.office.findMany({
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      lat: true,
      lng: true,
    },
  });

  const officesWithoutCoordinates = allOffices.filter(
    (office) => !isWithinCentralFloridaServiceArea(office),
  );

  for (const office of officesWithoutCoordinates) {
    const query = composeAddress([
      office.address,
      office.city,
      office.state,
      office.zipCode,
      "USA",
    ]);

    if (!query) {
      continue;
    }

    const point = await geocodeAddress(query, { restrictToServiceArea: true });

    if (!point) {
      continue;
    }

    await prisma.office.update({
      where: { id: office.id },
      data: {
        lat: point.lat,
        lng: point.lng,
      },
    });
  }

  return prisma.office.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      lat: true,
      lng: true,
      notes: true,
    },
  });
}

function getRequiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(`${label} e obrigatorio.`);
  }

  return text;
}

function getOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createOffice(input: Record<string, unknown>) {
  const name = getRequiredText(input.name, "Nome do office");
  const slug = getOptionalText(input.slug) ?? slugify(name);

  return prisma.office.create({
    data: {
      name,
      slug,
      address: getOptionalText(input.address),
      city: getOptionalText(input.city),
      state: getOptionalText(input.state),
      zipCode: getOptionalText(input.zipCode),
      notes: getOptionalText(input.notes),
    },
    select: {
      id: true,
    },
  });
}

export async function updateOffice(id: string, input: Record<string, unknown>) {
  const name = getRequiredText(input.name, "Nome do office");
  const slug = getOptionalText(input.slug) ?? slugify(name);

  return prisma.office.update({
    where: { id },
    data: {
      name,
      slug,
      address: getOptionalText(input.address) ?? null,
      city: getOptionalText(input.city) ?? null,
      state: getOptionalText(input.state) ?? null,
      zipCode: getOptionalText(input.zipCode) ?? null,
      notes: getOptionalText(input.notes) ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function deleteOffice(id: string) {
  await prisma.office.delete({
    where: { id },
  });
}
