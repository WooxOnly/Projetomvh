import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, rgb } from "pdf-lib";

import {
  buildWhatsAppPayload,
  type RouteDirectoryManager,
  type RouteRunReport,
} from "@/lib/operations/route-report";

type PdfLanguage = "pt-BR" | "en-US";

type PdfColumn = {
  label: string;
  x: number;
  maxWidth: number;
  align?: "left" | "right";
};

let cachedRegularFontBytesPromise: Promise<Uint8Array> | null = null;
let cachedBoldFontBytesPromise: Promise<Uint8Array> | null = null;

function isEnglishLanguage(language: PdfLanguage) {
  return language === "en-US";
}

function formatDateOnly(value: Date | string, language: PdfLanguage) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function sanitizePdfText(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function safePdfText(text: string | null | undefined) {
  return sanitizePdfText(text ?? "").trim();
}

function fitTextToWidth(
  text: string,
  font: PDFFont,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
) {
  const normalized = safePdfText(text);
  let size = preferredSize;

  while (size > minSize && font.widthOfTextAtSize(normalized, size) > maxWidth) {
    size -= 0.2;
  }

  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return { text: normalized, size };
  }

  let shortened = normalized;
  while (shortened.length > 0) {
    const candidate = `${shortened.trimEnd()}...`;
    if (font.widthOfTextAtSize(candidate, minSize) <= maxWidth) {
      return { text: candidate, size: minSize };
    }
    shortened = shortened.slice(0, -1);
  }

  return { text: "...", size: minSize };
}

function cleanPropertyManagerName(name: string) {
  return safePdfText(name).replace(/^Responsible\s+/i, "").trim() || safePdfText(name);
}

async function loadPdfFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);

  if (!cachedRegularFontBytesPromise) {
    cachedRegularFontBytesPromise = readFile(
      path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"),
    );
  }

  if (!cachedBoldFontBytesPromise) {
    cachedBoldFontBytesPromise = cachedRegularFontBytesPromise;
  }

  const [regularFontBytes, boldFontBytes] = await Promise.all([
    cachedRegularFontBytesPromise,
    cachedBoldFontBytesPromise,
  ]);

  const regularFont = await pdf.embedFont(regularFontBytes, { subset: true });
  const boldFont = await pdf.embedFont(boldFontBytes, { subset: true });

  return { regularFont, boldFont };
}

function getPdfColumns(isEnglish: boolean, isSingleManagerPdf: boolean): PdfColumn[] {
  if (isSingleManagerPdf) {
    return [
      { label: isEnglish ? "Stop" : "Stop", x: 36, maxWidth: 34, align: "right" },
      { label: isEnglish ? "Resort" : "Condomínio", x: 82, maxWidth: 170 },
      { label: isEnglish ? "Address" : "Endereço", x: 258, maxWidth: 150 },
      { label: isEnglish ? "Guest" : "Hóspede", x: 414, maxWidth: 112 },
      { label: isEnglish ? "Nights" : "Dias", x: 532, maxWidth: 40, align: "right" },
      { label: isEnglish ? "Door" : "Porta", x: 586, maxWidth: 52 },
      { label: "BBQ", x: 646, maxWidth: 36 },
      { label: isEnglish ? "Integrator" : "Integrador", x: 692, maxWidth: 110 },
    ];
  }

  return [
    { label: isEnglish ? "Manager" : "Gerente", x: 36, maxWidth: 76 },
    { label: isEnglish ? "Resort" : "Condomínio", x: 118, maxWidth: 112 },
    { label: isEnglish ? "Address" : "Endereço", x: 236, maxWidth: 142 },
    { label: isEnglish ? "Guest" : "Hóspede", x: 384, maxWidth: 86 },
    { label: isEnglish ? "Nights" : "Dias", x: 478, maxWidth: 38, align: "right" },
    { label: isEnglish ? "Door" : "Porta", x: 532, maxWidth: 42 },
    { label: "BBQ", x: 580, maxWidth: 34 },
    { label: isEnglish ? "Integrator" : "Integrador", x: 620, maxWidth: 182 },
  ];
}

function getNotInformedLabel(isEnglish: boolean) {
  return isEnglish ? "Not informed" : "Não informado";
}

function getBooleanLabel(value: boolean | null, isEnglish: boolean) {
  if (value == null) {
    return "N/D";
  }

  return value ? (isEnglish ? "Yes" : "Sim") : isEnglish ? "No" : "Não";
}

function drawAlignedText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  text: string,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  color: ReturnType<typeof rgb>,
  align: "left" | "right" = "left",
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: align === "right" ? x + maxWidth - width : x,
    y,
    size,
    font,
    color,
  });
}

export function getWhatsAppExport(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
  propertyManagerId?: string,
) {
  const { filteredRun, filteredManagers } = filterRouteExportByPropertyManager(
    run,
    directoryManagers,
    propertyManagerId,
  );

  return buildWhatsAppPayload(filteredRun, filteredManagers);
}

export async function buildOperationPdf(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
  propertyManagerId?: string,
  language: PdfLanguage = "pt-BR",
) {
  const { filteredRun } = filterRouteExportByPropertyManager(run, directoryManagers, propertyManagerId);
  const isEnglish = isEnglishLanguage(language);
  const notInformed = getNotInformedLabel(isEnglish);
  const pdf = await PDFDocument.create();
  const { regularFont, boldFont } = await loadPdfFonts(pdf);
  const headers = getPdfColumns(isEnglish, true);

  const managerGroups = filteredRun.assignments
    .slice()
    .sort((left, right) => {
      return (
        left.propertyManager.name.localeCompare(right.propertyManager.name) ||
        left.routeOrder - right.routeOrder
      );
    })
    .reduce((groups, assignment) => {
      const managerName = cleanPropertyManagerName(assignment.propertyManager.name);
      const current = groups.get(managerName) ?? [];
      current.push(assignment);
      groups.set(managerName, current);
      return groups;
    }, new Map<string, typeof filteredRun.assignments>());

  const groupedByManager = Array.from(managerGroups.entries());
  const totalCondominiums = new Set(
    filteredRun.assignments
      .map((assignment) => safePdfText(assignment.checkin.condominiumName))
      .filter(Boolean),
  ).size;

  const createPage = () => {
    const page = pdf.addPage([842, 595]);
    page.drawRectangle({
      x: 24,
      y: 24,
      width: 794,
      height: 547,
      borderWidth: 1,
      borderColor: rgb(0.15, 0.75, 0.85),
      color: rgb(0.1, 0.13, 0.2),
    });
    return page;
  };

  const drawPageHeader = (page: ReturnType<PDFDocument["addPage"]>, pageNumber: number) => {
    const isFirstPage = pageNumber === 1;

    if (isFirstPage) {
      page.drawText(isEnglish ? "Daily operation - Reservations" : "Operação diária - Reservas", {
        x: 36,
        y: 544,
        size: 18,
        font: boldFont,
        color: rgb(0.33, 0.86, 0.95),
      });
    }

    const infoY = isFirstPage ? 520 : 542;
    page.drawText(`${isEnglish ? "Date" : "Data"}: ${formatDateOnly(filteredRun.operationDate, language)}`, {
      x: 36,
      y: infoY,
      size: 10,
      font: regularFont,
      color: rgb(0.88, 0.91, 0.96),
    });

    page.drawText(
      `${isEnglish ? "Total reservations" : "Total de reservas"}: ${filteredRun.assignments.length}`,
      {
        x: 580,
        y: infoY,
        size: 10,
        font: regularFont,
        color: rgb(0.88, 0.91, 0.96),
      },
    );
    page.drawText(
      `${isEnglish ? "Total resorts" : "Total de condomínios"}: ${totalCondominiums}`,
      {
        x: 580,
        y: infoY - 14,
        size: 10,
        font: regularFont,
        color: rgb(0.88, 0.91, 0.96),
      },
    );

    return isFirstPage ? 492 : 514;
  };

  const drawSectionHeader = (
    page: ReturnType<PDFDocument["addPage"]>,
    startY: number,
    managerName: string,
  ) => {
    page.drawText(`${isEnglish ? "Manager" : "Gerente"}: ${managerName}`, {
      x: 36,
      y: startY,
      size: 10,
      font: boldFont,
      color: rgb(0.88, 0.91, 0.96),
    });

    const tableTop = startY - 24;
    page.drawRectangle({
      x: 30,
      y: tableTop,
      width: 782,
      height: 22,
      borderWidth: 0.8,
      borderColor: rgb(0.15, 0.75, 0.85),
      color: rgb(0.12, 0.18, 0.28),
    });

    headers.forEach((header) => {
      const fitted = fitTextToWidth(header.label, boldFont, header.maxWidth, 8, 6.2);
      drawAlignedText(
        page,
        boldFont,
        fitted.text,
        fitted.size,
        header.x,
        tableTop + 7,
        header.maxWidth,
        rgb(0.9, 0.98, 1),
        header.align,
      );
    });

    return tableTop - 4;
  };

  let page = createPage();
  let pageNumber = 1;
  let nextY = drawPageHeader(page, pageNumber);

  groupedByManager.forEach(([managerName, assignments], groupIndex) => {
    if (nextY < 96) {
      page = createPage();
      pageNumber += 1;
      nextY = drawPageHeader(page, pageNumber);
    } else if (groupIndex > 0) {
      nextY -= 10;
    }

    nextY = drawSectionHeader(page, nextY, managerName);

    assignments.forEach((assignment, index) => {
      if (nextY < 66) {
        page = createPage();
        pageNumber += 1;
        nextY = drawPageHeader(page, pageNumber);
        nextY = drawSectionHeader(page, nextY, managerName);
      }

      const rowHeight = 18;
      page.drawRectangle({
        x: 30,
        y: nextY - rowHeight + 3,
        width: 782,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0.2, 0.26, 0.36),
        color: index % 2 === 0 ? rgb(0.11, 0.14, 0.2) : rgb(0.09, 0.12, 0.18),
      });

      const row = [
        { text: String(assignment.routeOrder), column: headers[0]! },
        { text: assignment.checkin.condominiumName ?? notInformed, column: headers[1]! },
        { text: assignment.checkin.address ?? notInformed, column: headers[2]! },
        { text: assignment.checkin.guestName ?? notInformed, column: headers[3]! },
        { text: String(assignment.checkin.numberOfNights ?? "N/D"), column: headers[4]! },
        { text: assignment.checkin.doorCode ?? notInformed, column: headers[5]! },
        { text: getBooleanLabel(assignment.checkin.hasBbqGrill, isEnglish), column: headers[6]! },
        { text: assignment.checkin.integratorName ?? notInformed, column: headers[7]! },
      ];

      row.forEach(({ text, column }, columnIndex) => {
        const preferredSize = columnIndex === 1 || columnIndex === 2 ? 7.2 : 7.1;
        const minSize = columnIndex === 1 || columnIndex === 2 ? 5.6 : 6;
        const fitted = fitTextToWidth(text, regularFont, column.maxWidth, preferredSize, minSize);

        drawAlignedText(
          page,
          regularFont,
          fitted.text,
          fitted.size,
          column.x,
          nextY - 9,
          column.maxWidth,
          rgb(0.92, 0.96, 1),
          column.align,
        );
      });

      nextY -= rowHeight;
    });
  });

  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((currentPage, index) => {
      currentPage.drawText(
        `${isEnglish ? "Page" : "Página"} ${index + 1} ${isEnglish ? "of" : "de"} ${pages.length}`,
        {
          x: 684,
          y: 34,
          size: 8,
          font: regularFont,
          color: rgb(0.88, 0.91, 0.96),
        },
      );
    });
  }

  return pdf.save();
}

function filterRouteExportByPropertyManager(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
  propertyManagerId?: string,
) {
  if (!propertyManagerId) {
    return {
      filteredRun: run,
      filteredManagers: directoryManagers,
    };
  }

  const filteredAssignments = run.assignments.filter(
    (assignment) => assignment.propertyManager.id === propertyManagerId,
  );

  if (filteredAssignments.length === 0) {
    throw new Error("Nenhuma rota encontrada para este gerente de propriedades.");
  }

  return {
    filteredRun: {
      ...run,
      totalAssignments: filteredAssignments.length,
      assignments: filteredAssignments,
    },
    filteredManagers: directoryManagers.filter((manager) => manager.id === propertyManagerId),
  };
}

