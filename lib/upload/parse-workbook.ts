import * as XLSX from "xlsx";

import {
  cleanText,
  extractOperationalBuilding,
  formatOperationalAddress,
  normalizeText,
  normalizeOperationalAddress,
  parseOperationDate,
  parseOptionalBoolean,
  parseOptionalFloat,
  parseOptionalInt,
} from "./normalize.ts";

const COLUMN_ALIASES = {
  operationDate: [
    "operation date",
    "date",
    "check in date",
    "checkin date",
    "check-in",
    "arrival",
    "arrival date",
  ],
  condominium: ["condominium", "condo", "community", "building", "condominio", "resort"],
  condominiumAddress: [
    "condominium address",
    "condo address",
    "resort address",
    "community address",
  ],
  property: [
    "property",
    "property name",
    "house",
    "house name",
    "house #",
    "house number",
    "home",
    "villa",
    "unit",
  ],
  address: ["address", "property address", "house address", "location", "house #"],
  bedrooms: ["bedrooms", "bedroom", "beds", "quartos", "quarto"],
  propertyManager: ["pm", "property manager", "manager", "pm name"],
  responsible: ["responsible", "responsavel", "pm code", "responsible code"],
  phone: ["pm phone", "manager phone", "phone", "telefone"],
  email: ["pm email", "manager email", "email"],
  guest: ["guest", "guest description", "guest/description", "guest name", "description"],
  integrator: ["integrator", "integrator name", "channel", "source"],
  numberOfNights: ["# of nights", "nights", "number of nights", "stay nights"],
  doorCode: ["door code", "code", "lock code"],
  hasBbqGrill: ["has bbq grill", "bbq", "bbq grill"],
  hasEarlyCheckin: ["has early checkin", "early checkin", "early check-in"],
  city: ["city"],
  state: ["state"],
  zipCode: ["zip", "zipcode", "zip code", "postal code"],
  latitude: ["lat", "latitude"],
  longitude: ["lng", "lon", "longitude"],
} as const;

type ParsedRow = {
  sourceRowNumber: number;
  operationDate: Date;
  condominiumName: string;
  condominiumNormalized: string;
  condominiumAddress: string;
  propertyName: string;
  propertyNormalized: string;
  building: string;
  address: string;
  bedrooms: number | null;
  propertyManagerName: string;
  propertyManagerNormalized: string;
  responsibleReference: string;
  propertyManagerPhone: string;
  propertyManagerEmail: string;
  guestName: string;
  integratorName: string;
  numberOfNights: number | null;
  doorCode: string;
  hasBbqGrill: boolean | null;
  hasEarlyCheckin: boolean | null;
  city: string;
  state: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  rawRowJson: string;
};

export type SuspiciousUploadRow = {
  sourceRowNumber: number;
  summary: string;
  rawValues: string[];
};

function getNonEmptyCellEntries(row: Record<string, unknown>) {
  return Object.entries(row).flatMap(([key, value]) => {
    const text = cleanText(value);

    if (text) {
      return [`${key}: ${text}`];
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return [`${key}: ${String(value)}`];
    }

    return [];
  });
}

function normalizeHeader(value: string) {
  return normalizeText(value);
}

function findHeaderKey(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);

  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header))) ?? null;
}

function isNumberOfNightsSummaryRow(
  nonEmptyCells: string[],
  numberOfNights: number | null,
  values: {
    condominiumName: string;
    propertyIdentifier: string;
    guestName: string;
    doorCode: string;
    propertyManagerName: string;
    responsibleReference: string;
    rawOperationDate: string;
  },
) {
  return (
    nonEmptyCells.length === 1 &&
    numberOfNights != null &&
    !values.condominiumName &&
    !values.propertyIdentifier &&
    !values.guestName &&
    !values.doorCode &&
    !values.propertyManagerName &&
    !values.responsibleReference &&
    !values.rawOperationDate
  );
}

function looksLikePropertyManagerName(value: string) {
  if (!value.trim()) {
    return false;
  }

  const digitCount = (value.match(/\d/g) ?? []).length;
  const letterCount = (value.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;

  if (letterCount === 0) {
    return false;
  }

  if (digitCount > 0 && digitCount >= letterCount) {
    return false;
  }

  return true;
}

function ensureWorksheetRange(sheet: XLSX.WorkSheet) {
  const cellKeys = Object.keys(sheet).filter((key) => !key.startsWith("!"));

  if (cellKeys.length === 0) {
    return;
  }

  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;

  for (const key of cellKeys) {
    const cell = XLSX.utils.decode_cell(key);
    minRow = Math.min(minRow, cell.r);
    minCol = Math.min(minCol, cell.c);
    maxRow = Math.max(maxRow, cell.r);
    maxCol = Math.max(maxCol, cell.c);
  }

  const computedRef = XLSX.utils.encode_range({
    s: { r: minRow, c: minCol },
    e: { r: maxRow, c: maxCol },
  });

  const currentRef = sheet["!ref"];
  if (!currentRef) {
    sheet["!ref"] = computedRef;
    return;
  }

  try {
    const currentRange = XLSX.utils.decode_range(currentRef);
    const currentCellCount =
      (currentRange.e.r - currentRange.s.r + 1) * (currentRange.e.c - currentRange.s.c + 1);
    const computedCellCount =
      (maxRow - minRow + 1) * (maxCol - minCol + 1);

    if (computedCellCount > currentCellCount) {
      sheet["!ref"] = computedRef;
    }
  } catch {
    sheet["!ref"] = computedRef;
  }
}

export function parseWorkbook(buffer: Buffer, fallbackOperationDate: Date) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("O arquivo nao possui planilhas legiveis.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  ensureWorksheetRange(sheet);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const headers = Object.keys(rows[0] ?? {});

  const mapping = {
    operationDate: findHeaderKey(headers, COLUMN_ALIASES.operationDate),
    condominium: findHeaderKey(headers, COLUMN_ALIASES.condominium),
    condominiumAddress: findHeaderKey(headers, COLUMN_ALIASES.condominiumAddress),
    property: findHeaderKey(headers, COLUMN_ALIASES.property),
    address: findHeaderKey(headers, COLUMN_ALIASES.address),
    bedrooms: findHeaderKey(headers, COLUMN_ALIASES.bedrooms),
    propertyManager: findHeaderKey(headers, COLUMN_ALIASES.propertyManager),
    responsible: findHeaderKey(headers, COLUMN_ALIASES.responsible),
    phone: findHeaderKey(headers, COLUMN_ALIASES.phone),
    email: findHeaderKey(headers, COLUMN_ALIASES.email),
    guest: findHeaderKey(headers, COLUMN_ALIASES.guest),
    integrator: findHeaderKey(headers, COLUMN_ALIASES.integrator),
    numberOfNights: findHeaderKey(headers, COLUMN_ALIASES.numberOfNights),
    doorCode: findHeaderKey(headers, COLUMN_ALIASES.doorCode),
    hasBbqGrill: findHeaderKey(headers, COLUMN_ALIASES.hasBbqGrill),
    hasEarlyCheckin: findHeaderKey(headers, COLUMN_ALIASES.hasEarlyCheckin),
    city: findHeaderKey(headers, COLUMN_ALIASES.city),
    state: findHeaderKey(headers, COLUMN_ALIASES.state),
    zipCode: findHeaderKey(headers, COLUMN_ALIASES.zipCode),
    latitude: findHeaderKey(headers, COLUMN_ALIASES.latitude),
    longitude: findHeaderKey(headers, COLUMN_ALIASES.longitude),
  };

  const suspiciousRows: SuspiciousUploadRow[] = [];

  const parsedRows: ParsedRow[] = rows
    .map((row, index) => {
      const condominiumName = cleanText(mapping.condominium ? row[mapping.condominium] : "");
      const rawPropertyValue = mapping.property ? row[mapping.property] : "";
      const rawAddressValue = mapping.address ? row[mapping.address] : "";
      const operationalPropertyIdentifier =
        cleanText(rawPropertyValue) ||
        cleanText(rawAddressValue);
      const propertyManagerName = cleanText(
        mapping.propertyManager ? row[mapping.propertyManager] : "",
      );
      const responsibleReference = cleanText(
        mapping.responsible ? row[mapping.responsible] : "",
      );
      const fallbackManagerName =
        !propertyManagerName && looksLikePropertyManagerName(responsibleReference)
          ? responsibleReference
          : "";
      const normalizedPropertyManagerName = propertyManagerName || fallbackManagerName;
      const guestName = cleanText(mapping.guest ? row[mapping.guest] : "");
      const doorCode = cleanText(mapping.doorCode ? row[mapping.doorCode] : "");
      const rawOperationDate = cleanText(mapping.operationDate ? row[mapping.operationDate] : "");
      const numberOfNights = parseOptionalInt(
        mapping.numberOfNights ? row[mapping.numberOfNights] : "",
      );
      const nonEmptyCells = getNonEmptyCellEntries(row);
      const looksLikeSummaryRow = isNumberOfNightsSummaryRow(nonEmptyCells, numberOfNights, {
        condominiumName,
        propertyIdentifier: operationalPropertyIdentifier,
        guestName,
        doorCode,
        propertyManagerName: normalizedPropertyManagerName,
        responsibleReference,
        rawOperationDate,
      });
      const looksSuspicious =
        nonEmptyCells.length > 0 &&
        !looksLikeSummaryRow &&
        !condominiumName &&
        !operationalPropertyIdentifier &&
        !guestName &&
        !doorCode &&
        !normalizedPropertyManagerName &&
        !responsibleReference &&
        !rawOperationDate;

      if (looksSuspicious) {
        suspiciousRows.push({
          sourceRowNumber: index + 2,
          summary: nonEmptyCells.slice(0, 3).join(" | "),
          rawValues: nonEmptyCells,
        });
      }

      return {
        sourceRowNumber: index + 2,
        operationDate: parseOperationDate(
          mapping.operationDate ? row[mapping.operationDate] : "",
          fallbackOperationDate,
        ),
        condominiumName,
        condominiumNormalized: normalizeText(condominiumName),
        condominiumAddress: normalizeOperationalAddress(
          mapping.condominiumAddress ? row[mapping.condominiumAddress] : "",
        ),
        propertyName: operationalPropertyIdentifier || "Imovel sem identificador",
        propertyNormalized: normalizeText(operationalPropertyIdentifier || "Imovel sem identificador"),
        building: extractOperationalBuilding(cleanText(rawAddressValue) || cleanText(rawPropertyValue)),
        address:
          normalizeOperationalAddress(cleanText(rawAddressValue) || cleanText(rawPropertyValue)) ||
          formatOperationalAddress(cleanText(rawAddressValue), extractOperationalBuilding(cleanText(rawAddressValue))) ||
          formatOperationalAddress(cleanText(rawPropertyValue), extractOperationalBuilding(cleanText(rawPropertyValue))) ||
          "",
        bedrooms: parseOptionalInt(mapping.bedrooms ? row[mapping.bedrooms] : ""),
        propertyManagerName: normalizedPropertyManagerName,
        propertyManagerNormalized: normalizeText(normalizedPropertyManagerName),
        responsibleReference,
        propertyManagerPhone: cleanText(mapping.phone ? row[mapping.phone] : ""),
        propertyManagerEmail: cleanText(mapping.email ? row[mapping.email] : "").toLowerCase(),
        guestName,
        integratorName: cleanText(mapping.integrator ? row[mapping.integrator] : ""),
        numberOfNights,
        doorCode,
        hasBbqGrill: parseOptionalBoolean(
          mapping.hasBbqGrill ? row[mapping.hasBbqGrill] : "",
        ),
        hasEarlyCheckin: parseOptionalBoolean(
          mapping.hasEarlyCheckin ? row[mapping.hasEarlyCheckin] : "",
        ),
        city: cleanText(mapping.city ? row[mapping.city] : ""),
        state: cleanText(mapping.state ? row[mapping.state] : ""),
        zipCode: cleanText(mapping.zipCode ? row[mapping.zipCode] : ""),
        latitude: parseOptionalFloat(mapping.latitude ? row[mapping.latitude] : ""),
        longitude: parseOptionalFloat(mapping.longitude ? row[mapping.longitude] : ""),
        rawRowJson: JSON.stringify(row),
      };
    })
    .filter(
      (row) =>
        row.condominiumName ||
        row.propertyName !== "Imovel sem identificador" ||
        row.propertyManagerName ||
        row.responsibleReference ||
        row.guestName ||
        row.doorCode,
    );

  return {
    headers,
    rows: parsedRows,
    suspiciousRows,
  };
}
