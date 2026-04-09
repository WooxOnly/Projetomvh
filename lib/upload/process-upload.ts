import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import { cleanupExpiredOperationalData } from "@/lib/operations/cleanup";
import {
  enrichCondominiumLocationData,
} from "@/lib/operations/route-geocoding";
import { mergeKnownCondominiumContext } from "@/lib/known-condominium-context";
import { setActiveSpreadsheetUpload } from "@/lib/upload/active-upload";
import { parseWorkbook, type SuspiciousUploadRow } from "@/lib/upload/parse-workbook";
import { formatOperationalAddress } from "@/lib/upload/normalize";
import { attachUploadSequenceNumber, getSpreadsheetUploadSequenceMap } from "@/lib/upload/sequence";

const TEMP_RETENTION_DAYS = 30;

type ProcessUploadInput = {
  bytes: Buffer;
  fileName: string;
  operationDate: Date;
  allowSuspiciousRows?: boolean;
};

type DuplicateUploadCheckin = {
  operationDate: string;
  condominiumName: string;
  propertyName: string;
  address: string;
  sourceRowNumbers: number[];
  totalOccurrences: number;
};

export class UploadReviewRequiredError extends Error {
  suspiciousRows: SuspiciousUploadRow[];

  constructor(suspiciousRows: SuspiciousUploadRow[]) {
    super("Encontramos linhas que precisam de revisao antes da importacao.");
    this.name = "UploadReviewRequiredError";
    this.suspiciousRows = suspiciousRows;
  }
}

function getUploadStorageDirectory() {
  if (process.env.UPLOAD_STORAGE_DIR?.trim()) {
    return process.env.UPLOAD_STORAGE_DIR.trim();
  }

  if (process.env.VERCEL) {
    return join(tmpdir(), "projetomvh", "uploads");
  }

  return join(process.cwd(), "storage", "uploads");
}

function shouldReplaceString(currentValue: string | null | undefined, incomingValue: string) {
  if (!incomingValue.trim()) {
    return false;
  }

  if (!currentValue?.trim()) {
    return true;
  }

  return currentValue.trim().toLowerCase() === incomingValue.trim().toLowerCase();
}

function shouldReplaceNumber(currentValue: number | null | undefined, incomingValue: number | null) {
  if (incomingValue == null) {
    return false;
  }

  if (currentValue == null) {
    return true;
  }

  return currentValue === incomingValue;
}

function shouldReplaceFloat(currentValue: number | null | undefined, incomingValue: number | null) {
  if (incomingValue == null) {
    return false;
  }

  if (currentValue == null) {
    return true;
  }

  return Math.abs(currentValue - incomingValue) < 0.000001;
}

function detectDuplicateCheckins(rows: ReturnType<typeof parseWorkbook>["rows"]) {
  const duplicates = new Map<
    string,
    {
      operationDate: string;
      condominiumName: string;
      propertyName: string;
      address: string;
      sourceRowNumbers: number[];
      totalOccurrences: number;
    }
  >();

  for (const row of rows) {
    const operationDateKey = row.operationDate.toISOString().slice(0, 10);
    const condominiumName = row.condominiumName.trim();
    const propertyName = row.propertyName.trim();
    const address = formatOperationalAddress(row.address, row.building).trim();
    const duplicateKey = [
      operationDateKey,
      row.condominiumNormalized,
      row.propertyNormalized,
      address.toLowerCase(),
    ].join("||");

    const current = duplicates.get(duplicateKey) ?? {
      operationDate: operationDateKey,
      condominiumName,
      propertyName,
      address,
      sourceRowNumbers: [],
      totalOccurrences: 0,
    };

    current.sourceRowNumbers.push(row.sourceRowNumber);
    current.totalOccurrences += 1;
    duplicates.set(duplicateKey, current);
  }

  return Array.from(duplicates.values())
    .filter((entry) => entry.totalOccurrences > 1)
    .sort(
      (left, right) =>
        left.operationDate.localeCompare(right.operationDate) ||
        left.condominiumName.localeCompare(right.condominiumName) ||
        left.propertyName.localeCompare(right.propertyName),
    )
    .map(
      (entry): DuplicateUploadCheckin => ({
        operationDate: entry.operationDate,
        condominiumName: entry.condominiumName,
        propertyName: entry.propertyName,
        address: entry.address,
        sourceRowNumbers: entry.sourceRowNumbers.sort((left, right) => left - right),
        totalOccurrences: entry.totalOccurrences,
      }),
    );
}

async function getOrCreateCondominium(row: ReturnType<typeof parseWorkbook>["rows"][number]) {
  if (!row.condominiumNormalized) {
    return null;
  }

  const resolvedCondominium = mergeKnownCondominiumContext({
    nameOriginal: row.condominiumName,
    address: row.condominiumAddress || null,
    city: row.city || null,
    state: row.state || null,
    zipCode: row.zipCode || null,
  });

  const existingCondominium = await prisma.condominium.findUnique({
    where: {
      nameNormalized: row.condominiumNormalized,
    },
    select: {
      id: true,
      officeId: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      lat: true,
      lng: true,
    },
  });

  const condominium = existingCondominium
    ? await prisma.condominium.update({
        where: {
          nameNormalized: row.condominiumNormalized,
        },
        data: {
          nameOriginal: resolvedCondominium.nameOriginal ?? row.condominiumName,
        },
        select: {
          id: true,
          officeId: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          lat: true,
          lng: true,
        },
      })
    : await prisma.condominium.create({
        data: {
          nameOriginal: resolvedCondominium.nameOriginal ?? row.condominiumName,
          nameNormalized: row.condominiumNormalized,
          address: resolvedCondominium.address || undefined,
          city: resolvedCondominium.city || undefined,
          state: resolvedCondominium.state || undefined,
          zipCode: resolvedCondominium.zipCode || undefined,
          lat: row.latitude ?? undefined,
          lng: row.longitude ?? undefined,
        },
        select: {
          id: true,
          officeId: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          lat: true,
          lng: true,
        },
      });

  const updates: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: number;
    lng?: number;
  } = {};

  if (!row.condominiumAddress && condominium.address && row.address && condominium.address === row.address) {
    updates.address = "";
  }
  if (shouldReplaceString(condominium.address, resolvedCondominium.address ?? "")) {
    updates.address = resolvedCondominium.address ?? "";
  }
  if (shouldReplaceString(condominium.city, resolvedCondominium.city ?? "")) {
    updates.city = resolvedCondominium.city ?? "";
  }
  if (shouldReplaceString(condominium.state, resolvedCondominium.state ?? "")) {
    updates.state = resolvedCondominium.state ?? "";
  }
  if (shouldReplaceString(condominium.zipCode, resolvedCondominium.zipCode ?? "")) {
    updates.zipCode = resolvedCondominium.zipCode ?? "";
  }
  if (shouldReplaceFloat(condominium.lat, row.latitude)) {
    updates.lat = row.latitude ?? undefined;
  }
  if (shouldReplaceFloat(condominium.lng, row.longitude)) {
    updates.lng = row.longitude ?? undefined;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.condominium.update({
      where: { id: condominium.id },
      data: {
        address: updates.address === "" ? null : updates.address,
        city: updates.city,
        state: updates.state,
        zipCode: updates.zipCode,
        lat: updates.lat,
        lng: updates.lng,
      },
    });
  }

  const needsAutomaticEnrichment =
    !condominium.address ||
    !condominium.city ||
    !condominium.state ||
    !condominium.zipCode ||
    !existingCondominium;

  if (needsAutomaticEnrichment) {
    await enrichCondominiumLocationData(condominium.id);
  }

  return {
    id: condominium.id,
    officeId: condominium.officeId ?? null,
    name: row.condominiumName,
    created: !existingCondominium,
  };
}

async function getOrCreatePropertyManager(row: ReturnType<typeof parseWorkbook>["rows"][number]) {
  if (!row.propertyManagerNormalized && !row.responsibleReference) {
    return null;
  }

  const propertyManager = row.propertyManagerNormalized
    ? await prisma.propertyManager.findFirst({
        where: {
          OR: [
            {
              name: {
                equals: row.propertyManagerName,
                mode: "insensitive",
              },
            },
            ...(row.responsibleReference ? [{ referenceCode: row.responsibleReference }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          phone: true,
          email: true,
        },
      })
    : await prisma.propertyManager.findFirst({
        where: {
          referenceCode: row.responsibleReference || undefined,
        },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          phone: true,
          email: true,
        },
      });

  if (propertyManager) {
    const desiredName = row.propertyManagerName || "";
    const updates: {
      name?: string;
      referenceCode?: string;
      phone?: string;
      email?: string;
    } = {};

    if (
      desiredName &&
      (shouldReplaceString(propertyManager.name, desiredName) ||
        propertyManager.name.trim().toLowerCase() ===
          `responsible ${row.responsibleReference ?? ""}`.trim().toLowerCase() ||
        propertyManager.name.trim() === row.responsibleReference)
    ) {
      updates.name = desiredName;
    }
    if (shouldReplaceString(propertyManager.referenceCode, row.responsibleReference)) {
      updates.referenceCode = row.responsibleReference;
    }
    if (shouldReplaceString(propertyManager.phone, row.propertyManagerPhone)) {
      updates.phone = row.propertyManagerPhone;
    }
    if (shouldReplaceString(propertyManager.email, row.propertyManagerEmail)) {
      updates.email = row.propertyManagerEmail;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.propertyManager.update({
        where: { id: propertyManager.id },
        data: updates,
      });
    }

    return {
      id: propertyManager.id,
      officeId: null,
      name: row.propertyManagerName || propertyManager.name,
      created: false,
    };
  }

  if (!row.propertyManagerName) {
    return null;
  }

  const created = await prisma.propertyManager.create({
    data: {
      name: row.propertyManagerName,
      referenceCode: row.responsibleReference || undefined,
      phone: row.propertyManagerPhone || undefined,
      email: row.propertyManagerEmail || undefined,
    },
    select: {
      id: true,
      officeId: true,
    },
  });

  return {
    id: created.id,
    officeId: created.officeId,
    name: row.propertyManagerName,
    created: true,
  };
}

async function getOrCreateProperty(
  row: ReturnType<typeof parseWorkbook>["rows"][number],
  condominiumId: string | undefined,
  propertyManagerId: string | undefined,
) {
  if (!row.propertyNormalized) {
    return null;
  }

  const property = await prisma.property.findFirst({
    where: {
      condominiumId: condominiumId ?? null,
      OR: [
        {
          nameNormalized: row.propertyNormalized,
        },
        ...(row.address
          ? [
              {
                address: {
                  equals: row.address,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      nameOriginal: true,
      nameNormalized: true,
      building: true,
      address: true,
      bedrooms: true,
      hasBbqGrill: true,
      defaultPropertyManagerId: true,
      lat: true,
      lng: true,
    },
  });

  if (property) {
    const updates: {
      nameOriginal?: string;
      nameNormalized?: string;
      building?: string;
      address?: string;
      bedrooms?: number;
      hasBbqGrill?: boolean;
      defaultPropertyManagerId?: string;
      lat?: number;
      lng?: number;
    } = {};

    if (row.propertyName && property.nameOriginal !== row.propertyName && property.address !== row.address) {
      updates.nameOriginal = row.propertyName;
      updates.nameNormalized = row.propertyNormalized;
    }
    if (shouldReplaceString(property.address, row.address)) {
      updates.address = row.address;
    }
    if (shouldReplaceString(property.building, row.building)) {
      updates.building = row.building;
    }
    if (shouldReplaceNumber(property.bedrooms, row.bedrooms)) {
      updates.bedrooms = row.bedrooms ?? undefined;
    }
    if (row.hasBbqGrill != null && property.hasBbqGrill == null) {
      updates.hasBbqGrill = row.hasBbqGrill;
    }
    if (!property.defaultPropertyManagerId && propertyManagerId) {
      updates.defaultPropertyManagerId = propertyManagerId;
    }
    if (shouldReplaceFloat(property.lat, row.latitude)) {
      updates.lat = row.latitude ?? undefined;
    }
    if (shouldReplaceFloat(property.lng, row.longitude)) {
      updates.lng = row.longitude ?? undefined;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.property.update({
        where: { id: property.id },
        data: updates,
      });
    }

    return property.id;
  }

  const created = await prisma.property.create({
    data: {
      nameOriginal: row.propertyName,
      nameNormalized: row.propertyNormalized,
      building: row.building || undefined,
      address: row.address || undefined,
      lat: row.latitude ?? undefined,
      lng: row.longitude ?? undefined,
      bedrooms: row.bedrooms ?? undefined,
      hasBbqGrill: row.hasBbqGrill ?? undefined,
      condominiumId,
      defaultPropertyManagerId: propertyManagerId ?? undefined,
    },
    select: {
      id: true,
    },
  });

  return created.id;
}

export async function processUpload(input: ProcessUploadInput) {
  await cleanupExpiredOperationalData();

  const parsed = parseWorkbook(input.bytes, input.operationDate);
  const duplicateCheckins = detectDuplicateCheckins(parsed.rows);

  if (parsed.suspiciousRows.length > 0 && !input.allowSuspiciousRows) {
    throw new UploadReviewRequiredError(parsed.suspiciousRows);
  }

  if (parsed.rows.length === 0) {
    throw new Error("Nao foi possivel encontrar linhas validas no arquivo.");
  }

  const storageDirectory = getUploadStorageDirectory();
  await mkdir(storageDirectory, { recursive: true });

  const sanitizedFileName = input.fileName.replace(/[^\w.-]+/g, "_");
  const storedFilePath = join(storageDirectory, `${randomUUID()}-${sanitizedFileName}`);
  await writeFile(storedFilePath, input.bytes);

  const expiresAt = new Date(input.operationDate);
  expiresAt.setDate(expiresAt.getDate() + TEMP_RETENTION_DAYS);

  const uniqueCondominiums = new Set<string>();
  const uniqueProperties = new Set<string>();
  const uniquePMs = new Set<string>();
  const missingBedrooms: string[] = [];
  const newPropertyManagersWithoutOffice = new Map<string, { id: string; name: string }>();
  const newCondominiumsWithoutOffice = new Map<string, { id: string; name: string }>();

  const upload = await prisma.spreadsheetUpload.create({
    data: {
      operationDate: input.operationDate,
      fileName: input.fileName,
      filePath: storedFilePath,
      totalRows: parsed.rows.length,
      expiresAt,
    },
  });

  const checkinsToCreate: Array<{
    spreadsheetUploadId: string;
    operationDate: Date;
    condominiumId?: string;
    condominiumName?: string;
    propertyId?: string;
    propertyName?: string;
    building?: string;
    address?: string;
    lat?: number;
    lng?: number;
    bedroomsSnapshot?: number;
    propertyManagerId?: string;
    propertyManagerName?: string;
    responsibleReference?: string;
    integratorName?: string;
    guestName?: string;
    numberOfNights?: number;
    doorCode?: string;
    hasBbqGrill?: boolean;
    hasEarlyCheckin?: boolean;
    rawDataJson: string;
    status: string;
    expiresAt: Date;
  }> = [];

  for (const row of parsed.rows) {
    const condominium = (await getOrCreateCondominium(row)) ?? undefined;
    const propertyManager = (await getOrCreatePropertyManager(row)) ?? undefined;
    const condominiumId = condominium?.id;
    const propertyManagerId = propertyManager?.id;
    const propertyId =
      (await getOrCreateProperty(row, condominiumId, propertyManagerId)) ?? undefined;

    if (condominium?.created && !condominium.officeId) {
      newCondominiumsWithoutOffice.set(condominium.id, {
        id: condominium.id,
        name: condominium.name,
      });
    }

    if (propertyManager?.created && !propertyManager.officeId) {
      newPropertyManagersWithoutOffice.set(propertyManager.id, {
        id: propertyManager.id,
        name: propertyManager.name,
      });
    }

    if (row.condominiumNormalized) {
      uniqueCondominiums.add(row.condominiumNormalized);
    }
    if (row.propertyNormalized) {
      uniqueProperties.add(`${condominiumId ?? "none"}:${row.propertyNormalized}`);
    }
    if (row.propertyManagerNormalized || row.responsibleReference) {
      uniquePMs.add(row.propertyManagerNormalized || row.responsibleReference);
    }
    if (row.propertyName && row.bedrooms == null) {
      missingBedrooms.push(row.propertyName);
    }

    checkinsToCreate.push({
      spreadsheetUploadId: upload.id,
      operationDate: row.operationDate,
      condominiumId,
      condominiumName: row.condominiumName || undefined,
      propertyId,
      propertyName: row.propertyName || undefined,
      building: row.building || undefined,
      address: row.address || undefined,
      lat: row.latitude ?? undefined,
      lng: row.longitude ?? undefined,
      bedroomsSnapshot: row.bedrooms ?? undefined,
      propertyManagerId,
      propertyManagerName: row.propertyManagerName || undefined,
      responsibleReference: row.responsibleReference || undefined,
      integratorName: row.integratorName || undefined,
      guestName: row.guestName || undefined,
      numberOfNights: row.numberOfNights ?? undefined,
      doorCode: row.doorCode || undefined,
      hasBbqGrill: row.hasBbqGrill ?? undefined,
      hasEarlyCheckin: row.hasEarlyCheckin ?? undefined,
      rawDataJson: row.rawRowJson,
      status: "pending",
      expiresAt,
    });
  }

  if (checkinsToCreate.length > 0) {
    await prisma.checkin.createMany({
      data: checkinsToCreate,
    });
  }

  const updatedUpload = await prisma.spreadsheetUpload.update({
    where: {
      id: upload.id,
    },
    data: {
      totalCheckins: checkinsToCreate.length,
      totalUniqueCondominiums: uniqueCondominiums.size,
      totalUniqueProperties: uniqueProperties.size,
      totalUniquePMs: uniquePMs.size,
    },
    select: {
      id: true,
      fileName: true,
      operationDate: true,
      totalRows: true,
      totalCheckins: true,
      totalUniqueCondominiums: true,
      totalUniqueProperties: true,
      totalUniquePMs: true,
      createdAt: true,
    },
  });

  await setActiveSpreadsheetUpload(updatedUpload.id);
  const sequenceMap = await getSpreadsheetUploadSequenceMap();

  return {
    upload: attachUploadSequenceNumber(updatedUpload, sequenceMap),
    missingBedrooms: Array.from(new Set(missingBedrooms)),
    duplicateCheckins,
    newPropertyManagersWithoutOffice: Array.from(newPropertyManagersWithoutOffice.values()),
    newCondominiumsWithoutOffice: Array.from(newCondominiumsWithoutOffice.values()),
  };
}
