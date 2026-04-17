import "server-only";

import { CheckinClassification } from "@prisma/client";

import { getSuggestedCondominiumClassification } from "@/lib/condominium-classification";
import { listOffices } from "@/lib/offices";
import { prisma } from "@/lib/prisma";
import { getActiveSpreadsheetUploadId } from "@/lib/upload/active-upload";
import {
  attachUploadSequenceNumber,
  attachUploadSequenceNumbers,
  getSpreadsheetUploadSequenceMap,
} from "@/lib/upload/sequence";

async function getActiveUploadBase() {
  const activeUploadId = await getActiveSpreadsheetUploadId();

  if (!activeUploadId) {
    return null;
  }

  const activeUpload = await prisma.spreadsheetUpload.findUnique({
    where: { id: activeUploadId },
    select: { id: true },
  });

  return activeUpload?.id ?? null;
}

export async function getActiveUploadSummary() {
  const uploadId = await getActiveUploadBase();

  if (!uploadId) {
    return null;
  }

  const upload = await prisma.spreadsheetUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
      totalRows: true,
      totalCheckins: true,
      totalOwnerCheckins: true,
      totalBlockedCheckins: true,
      totalUniqueCondominiums: true,
      totalUniqueProperties: true,
      totalUniquePMs: true,
    },
  });

  const sequenceMap = await getSpreadsheetUploadSequenceMap();
  return attachUploadSequenceNumber(upload, sequenceMap);
}

type UploadHistoryFilter = {
  startDate?: Date | null;
  endDate?: Date | null;
};

export async function getUploadHistory(filter: UploadHistoryFilter = {}) {
  const whereClause =
    filter.startDate || filter.endDate
      ? {
          operationDate: {
            ...(filter.startDate ? { gte: filter.startDate } : {}),
            ...(filter.endDate ? { lte: filter.endDate } : {}),
          },
        }
      : undefined;

  const uploads = await prisma.spreadsheetUpload.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      id: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
      totalRows: true,
      totalCheckins: true,
      totalOwnerCheckins: true,
      totalBlockedCheckins: true,
      totalUniqueCondominiums: true,
      totalUniqueProperties: true,
      totalUniquePMs: true,
      checkins: {
        where: {
          OR: [{ propertyManagerId: { not: null } }, { propertyManagerName: { not: null } }],
        },
        select: {
          propertyManagerId: true,
          propertyManagerName: true,
        },
      },
    },
  });

  const sequenceMap = await getSpreadsheetUploadSequenceMap();
  return attachUploadSequenceNumbers(
    uploads.map((upload) => {
    const importedPropertyManagers = Array.from(
      new Map(
        upload.checkins
          .filter(
            (checkin) =>
              Boolean(checkin.propertyManagerId) ||
              Boolean(checkin.propertyManagerName?.trim()),
          )
          .map((checkin) => [
            `${checkin.propertyManagerId ?? "name"}:${(checkin.propertyManagerName ?? "").trim().toLowerCase()}`,
            {
              id: checkin.propertyManagerId,
              name: checkin.propertyManagerName?.trim() || "PM sem nome",
            },
          ]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name));

    return {
      id: upload.id,
      fileName: upload.fileName,
      operationDate: upload.operationDate,
      createdAt: upload.createdAt,
      totalRows: upload.totalRows,
      totalCheckins: upload.totalCheckins,
      totalOwnerCheckins: upload.totalOwnerCheckins,
      totalBlockedCheckins: upload.totalBlockedCheckins,
      totalUniqueCondominiums: upload.totalUniqueCondominiums,
      totalUniqueProperties: upload.totalUniqueProperties,
      totalUniquePMs: upload.totalUniquePMs,
      importedPropertyManagers,
    };
    }),
    sequenceMap,
  );
}

export async function getActiveUploadOfficeBreakdown() {
  const offices = await listOffices();
  const officeBySlug = new Map(offices.map((office) => [office.slug, office]));
  const activeUploadId = await getActiveUploadBase();

  if (!activeUploadId) {
    return null;
  }

  const activeUpload = await prisma.spreadsheetUpload.findUnique({
    where: { id: activeUploadId },
    select: {
      id: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
      totalCheckins: true,
      checkins: {
        where: {
          classification: CheckinClassification.CHECKIN,
        },
        select: {
          condominiumId: true,
          condominiumName: true,
          propertyId: true,
          propertyName: true,
          condominium: {
            select: {
              id: true,
              nameOriginal: true,
              region: true,
              officeId: true,
              office: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!activeUpload) {
    return null;
  }

  const condominiumMap = new Map<
    string,
    {
      condominiumId: string;
      condominiumName: string;
      officeId: string | null;
      officeName: string;
      officeSlug: string | null;
      region: string;
      houseCount: number;
      checkinCount: number;
      houseNames: string[];
    }
  >();

  for (const checkin of activeUpload.checkins) {
    const condominiumId = checkin.condominiumId ?? `unlinked:${checkin.condominiumName ?? "unknown"}`;
    const current = condominiumMap.get(condominiumId) ?? {
      condominiumId,
      condominiumName:
        checkin.condominium?.nameOriginal ?? checkin.condominiumName ?? "Unassigned condominium",
      officeId: null,
      officeName: "Sem escritorio definido",
      officeSlug: null,
      region: "UNASSIGNED",
      houseCount: 0,
      checkinCount: 0,
      houseNames: [],
    };

    const suggestedClassification = getSuggestedCondominiumClassification(
      checkin.condominium?.nameOriginal ?? checkin.condominiumName,
    );
    const suggestedOffice = suggestedClassification
      ? officeBySlug.get(suggestedClassification.officeSlug) ?? null
      : null;
    const resolvedOffice = checkin.condominium?.office ?? suggestedOffice;

    current.officeId = checkin.condominium?.officeId ?? suggestedOffice?.id ?? null;
    current.officeName = resolvedOffice?.name ?? "Sem escritorio definido";
    current.officeSlug = resolvedOffice?.slug ?? null;
    current.region =
      checkin.condominium?.region && checkin.condominium.region !== "UNASSIGNED"
        ? checkin.condominium.region
        : suggestedClassification?.region ?? "UNASSIGNED";

    current.checkinCount += 1;

    const houseLabel = checkin.propertyName ?? "House not identified";
    if (!current.houseNames.includes(houseLabel)) {
      current.houseNames.push(houseLabel);
      current.houseCount += 1;
    }

    condominiumMap.set(condominiumId, current);
  }

  const officeMap = new Map<
    string,
    {
      officeId: string | null;
      officeName: string;
      officeSlug: string | null;
      regions: Map<
        string,
        {
          region: string;
          condominiumCount: number;
          houseCount: number;
          condominiums: Array<{
            condominiumId: string;
            condominiumName: string;
            houseCount: number;
            checkinCount: number;
            houseNames: string[];
          }>;
        }
      >;
    }
  >();

  for (const condominium of condominiumMap.values()) {
    const officeKey = condominium.officeId ?? "unassigned";
    const office = officeMap.get(officeKey) ?? {
      officeId: condominium.officeId,
      officeName: condominium.officeName,
      officeSlug: condominium.officeSlug,
      regions: new Map(),
    };

    const region = office.regions.get(condominium.region) ?? {
      region: condominium.region,
      condominiumCount: 0,
      houseCount: 0,
      condominiums: [],
    };

    region.condominiumCount += 1;
    region.houseCount += condominium.houseCount;
    region.condominiums.push({
      condominiumId: condominium.condominiumId,
      condominiumName: condominium.condominiumName,
      houseCount: condominium.houseCount,
      checkinCount: condominium.checkinCount,
      houseNames: condominium.houseNames.sort((left, right) => left.localeCompare(right)),
    });

    office.regions.set(condominium.region, region);
    officeMap.set(officeKey, office);
  }

  const sequenceMap = await getSpreadsheetUploadSequenceMap();

  return {
    id: activeUpload.id,
    sequenceNumber: sequenceMap.get(activeUpload.id) ?? null,
    fileName: activeUpload.fileName,
    operationDate: activeUpload.operationDate,
    createdAt: activeUpload.createdAt,
    totalCheckins: activeUpload.totalCheckins,
    offices: Array.from(officeMap.values())
      .map((office) => ({
        officeId: office.officeId,
        officeName: office.officeName,
        officeSlug: office.officeSlug,
        regions: Array.from(office.regions.values())
          .map((region) => ({
            region: region.region,
            condominiumCount: region.condominiumCount,
            houseCount: region.houseCount,
            condominiums: region.condominiums.sort((left, right) =>
              left.condominiumName.localeCompare(right.condominiumName),
            ),
          }))
          .sort((left, right) => left.region.localeCompare(right.region)),
      }))
      .sort((left, right) => left.officeName.localeCompare(right.officeName)),
  };
}

async function getUploadReviewDataById(uploadId: string) {
  const upload = await prisma.spreadsheetUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
      totalRows: true,
      totalCheckins: true,
      totalOwnerCheckins: true,
      totalBlockedCheckins: true,
      checkins: {
        orderBy: [{ sourceRowNumber: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sourceRowNumber: true,
          classification: true,
          integratorName: true,
          condominiumName: true,
          propertyName: true,
          building: true,
          address: true,
          guestName: true,
        },
      },
    },
  });

  if (!upload) {
    return null;
  }

  const sequenceMap = await getSpreadsheetUploadSequenceMap();

  return attachUploadSequenceNumber(
    {
      ...upload,
      reviewItems: upload.checkins.map((checkin) => ({
        id: checkin.id,
        sourceRowNumber: checkin.sourceRowNumber,
        classification: checkin.classification,
        integratorName: checkin.integratorName,
        condominiumName: checkin.condominiumName,
        propertyName: checkin.propertyName,
        building: checkin.building,
        address: checkin.address,
        guestName: checkin.guestName,
      })),
    },
    sequenceMap,
  );
}

export async function getActiveUploadReviewData() {
  const uploadId = await getActiveUploadBase();

  if (!uploadId) {
    return null;
  }

  return getUploadReviewDataById(uploadId);
}

export async function getSpreadsheetUploadReviewData(uploadId: string) {
  return getUploadReviewDataById(uploadId);
}
