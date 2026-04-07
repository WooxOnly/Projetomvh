import "server-only";

import type { OrlandoRegion } from "@/lib/orlando-region";

import { prisma } from "@/lib/prisma";
import { enrichCondominiumLocationData } from "@/lib/operations/route-geocoding";
import { normalizeText } from "@/lib/upload/normalize";

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

function getOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }

  return undefined;
}

function getOptionalInt(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

export async function listPropertyManagers() {
  return prisma.propertyManager.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      isActive: true,
      officeId: true,
      notes: true,
      office: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          lat: true,
          lng: true,
        },
      },
      _count: {
        select: {
          properties: true,
        },
      },
    },
  });
}

export async function createPropertyManager(input: Record<string, unknown>) {
  return prisma.propertyManager.create({
    data: {
      name: getRequiredText(input.name, "Nome do PM"),
      phone: getOptionalText(input.phone),
      email: getOptionalText(input.email)?.toLowerCase(),
      isActive: getOptionalBoolean(input.isActive) ?? true,
      officeId: getOptionalText(input.officeId),
      notes: getOptionalText(input.notes),
    },
    select: {
      id: true,
    },
  });
}

export async function updatePropertyManager(id: string, input: Record<string, unknown>) {
  return prisma.propertyManager.update({
    where: { id },
    data: {
      name: getRequiredText(input.name, "Nome do PM"),
      phone: getOptionalText(input.phone),
      email: getOptionalText(input.email)?.toLowerCase() ?? null,
      isActive: getOptionalBoolean(input.isActive) ?? true,
      officeId: getOptionalText(input.officeId) ?? null,
      notes: getOptionalText(input.notes) ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function deletePropertyManager(id: string) {
  await prisma.propertyManager.delete({
    where: { id },
  });
}

export async function listCondominiums() {
  return prisma.condominium.findMany({
    orderBy: {
      nameOriginal: "asc",
    },
    select: {
      id: true,
      nameOriginal: true,
      nameNormalized: true,
      officeId: true,
      region: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      notes: true,
      office: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      _count: {
        select: {
          properties: true,
        },
      },
    },
  });
}

export async function createCondominium(input: Record<string, unknown>) {
  const nameOriginal = getRequiredText(input.nameOriginal, "Nome do condominio");

  const condominium = await prisma.condominium.create({
    data: {
      nameOriginal,
      nameNormalized: normalizeText(nameOriginal),
      officeId: getOptionalText(input.officeId),
      region: (getOptionalText(input.region) as OrlandoRegion | undefined) ?? "UNASSIGNED",
      address: getOptionalText(input.address),
      city: getOptionalText(input.city),
      state: getOptionalText(input.state),
      zipCode: getOptionalText(input.zipCode),
      notes: getOptionalText(input.notes),
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });

  if (!condominium.address || !condominium.city || !condominium.state || !condominium.zipCode) {
    await enrichCondominiumLocationData(condominium.id);
  }

  return { id: condominium.id };
}

export async function updateCondominium(id: string, input: Record<string, unknown>) {
  const nameOriginal = getRequiredText(input.nameOriginal, "Nome do condominio");

  const condominium = await prisma.condominium.update({
    where: { id },
    data: {
      nameOriginal,
      nameNormalized: normalizeText(nameOriginal),
      officeId: getOptionalText(input.officeId) ?? null,
      region: (getOptionalText(input.region) as OrlandoRegion | undefined) ?? "UNASSIGNED",
      address: getOptionalText(input.address) ?? null,
      city: getOptionalText(input.city) ?? null,
      state: getOptionalText(input.state) ?? null,
      zipCode: getOptionalText(input.zipCode) ?? null,
      notes: getOptionalText(input.notes) ?? null,
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });

  if (!condominium.address || !condominium.city || !condominium.state || !condominium.zipCode) {
    await enrichCondominiumLocationData(condominium.id);
  }

  return { id: condominium.id };
}

export async function deleteCondominium(id: string) {
  await prisma.condominium.delete({
    where: { id },
  });
}

export async function updateCondominiumClassification(
  id: string,
  input: { officeId?: string; region?: string },
) {
  await prisma.condominium.update({
    where: { id },
    data: {
      officeId: input.officeId?.trim() ? input.officeId : null,
      region: (input.region?.trim() ? input.region : "UNASSIGNED") as OrlandoRegion,
    },
  });
}

export async function listProperties() {
  return prisma.property.findMany({
    orderBy: [{ condominium: { nameOriginal: "asc" } }, { nameOriginal: "asc" }],
    select: {
      id: true,
      nameOriginal: true,
      nameNormalized: true,
      address: true,
      bedrooms: true,
      hasBbqGrill: true,
      notes: true,
      condominiumId: true,
      defaultPropertyManagerId: true,
      condominium: {
        select: {
          id: true,
          nameOriginal: true,
        },
      },
      defaultPropertyManager: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function createProperty(input: Record<string, unknown>) {
  const nameOriginal = getRequiredText(input.nameOriginal, "Nome do imovel");

  return prisma.property.create({
    data: {
      nameOriginal,
      nameNormalized: normalizeText(nameOriginal),
      address: getOptionalText(input.address),
      bedrooms: getOptionalInt(input.bedrooms),
      hasBbqGrill: getOptionalBoolean(input.hasBbqGrill),
      notes: getOptionalText(input.notes),
      condominiumId: getOptionalText(input.condominiumId),
      defaultPropertyManagerId: getOptionalText(input.defaultPropertyManagerId),
    },
    select: {
      id: true,
    },
  });
}

export async function updateProperty(id: string, input: Record<string, unknown>) {
  const nameOriginal = getRequiredText(input.nameOriginal, "Nome do imovel");

  return prisma.property.update({
    where: { id },
    data: {
      nameOriginal,
      nameNormalized: normalizeText(nameOriginal),
      address: getOptionalText(input.address) ?? null,
      bedrooms: getOptionalInt(input.bedrooms) ?? null,
      hasBbqGrill: getOptionalBoolean(input.hasBbqGrill) ?? null,
      notes: getOptionalText(input.notes) ?? null,
      condominiumId: getOptionalText(input.condominiumId) ?? null,
      defaultPropertyManagerId: getOptionalText(input.defaultPropertyManagerId) ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function deleteProperty(id: string) {
  await prisma.property.delete({
    where: { id },
  });
}
