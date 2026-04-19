import { readFile } from "node:fs/promises";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

import {
  buildWhatsAppPayload,
  formatCheckinOperationalAddress,
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
  void readFile;

  const [regularFont, boldFont] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);

  return { regularFont, boldFont };
}

function getPdfColumns(isEnglish: boolean, isSingleManagerPdf: boolean): PdfColumn[] {
  if (isSingleManagerPdf) {
    return [
      { label: isEnglish ? "Stop" : "Stop", x: 36, maxWidth: 34, align: "right" },
      { label: isEnglish ? "Resort" : "Condomínio", x: 78, maxWidth: 150 },
      { label: isEnglish ? "Address" : "Endereço", x: 234, maxWidth: 148 },
      { label: isEnglish ? "Guest" : "Hóspede", x: 388, maxWidth: 98 },
      { label: isEnglish ? "Nights" : "Dias", x: 492, maxWidth: 34, align: "right" },
      { label: isEnglish ? "Door" : "Porta", x: 536, maxWidth: 44 },
      { label: "BBQ", x: 588, maxWidth: 30 },
      { label: isEnglish ? "Early" : "Early", x: 626, maxWidth: 40 },
      { label: isEnglish ? "Integrator" : "Integrador", x: 674, maxWidth: 128 },
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

const PDF_THEME = {
  pageBackground: rgb(1, 1, 1),
  pageBorder: rgb(0.82, 0.87, 0.92),
  accent: rgb(0.16, 0.39, 0.63),
  accentSoft: rgb(0.9, 0.94, 0.98),
  title: rgb(0.12, 0.25, 0.4),
  textPrimary: rgb(0.16, 0.2, 0.27),
  textSecondary: rgb(0.34, 0.4, 0.48),
  sectionLabel: rgb(0.17, 0.32, 0.5),
  tableHeaderBackground: rgb(0.93, 0.96, 0.99),
  tableHeaderBorder: rgb(0.75, 0.82, 0.89),
  tableHeaderText: rgb(0.18, 0.28, 0.39),
  rowBorder: rgb(0.86, 0.89, 0.93),
  rowOdd: rgb(1, 1, 1),
  rowEven: rgb(0.97, 0.98, 0.99),
  footerText: rgb(0.48, 0.54, 0.61),
};

function drawInfoCard(
  page: ReturnType<PDFDocument["addPage"]>,
  regularFont: PDFFont,
  boldFont: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height: 34,
    borderWidth: 0.8,
    borderColor: PDF_THEME.tableHeaderBorder,
    color: PDF_THEME.accentSoft,
  });

  page.drawText(label, {
    x: x + 10,
    y: y + 21,
    size: 7.5,
    font: regularFont,
    color: PDF_THEME.textSecondary,
  });

  page.drawText(value, {
    x: x + 10,
    y: y + 8,
    size: 10,
    font: boldFont,
    color: PDF_THEME.title,
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
      x: 0,
      y: 0,
      width: 842,
      height: 595,
      color: PDF_THEME.pageBackground,
    });
    page.drawRectangle({
      x: 24,
      y: 24,
      width: 794,
      height: 547,
      borderWidth: 1,
      borderColor: PDF_THEME.pageBorder,
      color: PDF_THEME.pageBackground,
    });
    return page;
  };

  const drawPageHeader = (page: ReturnType<PDFDocument["addPage"]>, pageNumber: number) => {
    const isFirstPage = pageNumber === 1;

    if (isFirstPage) {
      page.drawText("CHECK-INS", {
        x: 36,
        y: 544,
        size: 20,
        font: boldFont,
        color: PDF_THEME.title,
      });

      page.drawLine({
        start: { x: 36, y: 538 },
        end: { x: 806, y: 538 },
        thickness: 1.25,
        color: PDF_THEME.accent,
      });
    }

    const infoY = isFirstPage ? 492 : 542;
    page.drawText(`${isEnglish ? "Date" : "Data"}: ${formatDateOnly(filteredRun.operationDate, language)}`, {
      x: 36,
      y: infoY,
      size: 10,
      font: regularFont,
      color: PDF_THEME.textSecondary,
    });

    if (isFirstPage) {
      drawInfoCard(
        page,
        regularFont,
        boldFont,
        isEnglish ? "Reservations" : "Reservas",
        String(filteredRun.assignments.length),
        540,
        484,
        122,
      );
      drawInfoCard(
        page,
        regularFont,
        boldFont,
        isEnglish ? "Resorts" : "Condomínios",
        String(totalCondominiums),
        674,
        484,
        122,
      );
    } else {
      page.drawText(
        `${isEnglish ? "Total reservations" : "Total de reservas"}: ${filteredRun.assignments.length}`,
        {
          x: 580,
          y: infoY,
          size: 10,
          font: regularFont,
          color: PDF_THEME.textSecondary,
        },
      );
      page.drawText(
        `${isEnglish ? "Total resorts" : "Total de condomínios"}: ${totalCondominiums}`,
        {
          x: 580,
          y: infoY - 14,
          size: 10,
          font: regularFont,
          color: PDF_THEME.textSecondary,
        },
      );
    }

    return isFirstPage ? 456 : 514;
  };

  const drawSectionHeader = (
    page: ReturnType<PDFDocument["addPage"]>,
    startY: number,
    managerName: string,
  ) => {
    page.drawText(`${isEnglish ? "Manager" : "Gerente"}: ${managerName}`, {
      x: 36,
      y: startY,
      size: 10.5,
      font: boldFont,
      color: PDF_THEME.sectionLabel,
    });

    const tableTop = startY - 26;
    page.drawRectangle({
      x: 30,
      y: tableTop,
      width: 782,
      height: 24,
      borderWidth: 0.8,
      borderColor: PDF_THEME.tableHeaderBorder,
      color: PDF_THEME.tableHeaderBackground,
    });

    headers.forEach((header) => {
      const fitted = fitTextToWidth(header.label, boldFont, header.maxWidth, 8, 6.2);
      drawAlignedText(
        page,
        boldFont,
        fitted.text,
        fitted.size,
        header.x,
        tableTop + 8,
        header.maxWidth,
        PDF_THEME.tableHeaderText,
        header.align,
      );
    });

    return tableTop - 6;
  };

  let page = createPage();
  let pageNumber = 1;
  let nextY = drawPageHeader(page, pageNumber);

  groupedByManager.forEach(([managerName, assignments], groupIndex) => {
    if (nextY < 102) {
      page = createPage();
      pageNumber += 1;
      nextY = drawPageHeader(page, pageNumber);
    } else if (groupIndex > 0) {
      nextY -= 14;
    }

    nextY = drawSectionHeader(page, nextY, managerName);

    assignments.forEach((assignment, index) => {
      if (nextY < 72) {
        page = createPage();
        pageNumber += 1;
        nextY = drawPageHeader(page, pageNumber);
        nextY = drawSectionHeader(page, nextY, managerName);
      }

      const rowHeight = 20;
      page.drawRectangle({
        x: 30,
        y: nextY - rowHeight + 3,
        width: 782,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: PDF_THEME.rowBorder,
        color: index % 2 === 0 ? PDF_THEME.rowOdd : PDF_THEME.rowEven,
      });

      const row = [
        { text: String(assignment.routeOrder), column: headers[0]! },
        { text: assignment.checkin.condominiumName ?? notInformed, column: headers[1]! },
        { text: formatCheckinOperationalAddress(assignment.checkin) ?? notInformed, column: headers[2]! },
        { text: assignment.checkin.guestName ?? notInformed, column: headers[3]! },
        { text: String(assignment.checkin.numberOfNights ?? "N/D"), column: headers[4]! },
        { text: assignment.checkin.doorCode ?? notInformed, column: headers[5]! },
        { text: getBooleanLabel(assignment.checkin.hasBbqGrill, isEnglish), column: headers[6]! },
        { text: getBooleanLabel(assignment.checkin.hasEarlyCheckin, isEnglish), column: headers[7]! },
        { text: assignment.checkin.integratorName ?? notInformed, column: headers[8]! },
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
          nextY - 10,
          column.maxWidth,
          PDF_THEME.textPrimary,
          column.align,
        );
      });

      nextY -= rowHeight;
    });
  });

  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((currentPage, index) => {
      currentPage.drawLine({
        start: { x: 36, y: 46 },
        end: { x: 806, y: 46 },
        thickness: 0.8,
        color: PDF_THEME.pageBorder,
      });

      currentPage.drawText(
        `${isEnglish ? "Page" : "Página"} ${index + 1} ${isEnglish ? "of" : "de"} ${pages.length}`,
        {
          x: 684,
          y: 34,
          size: 8,
          font: regularFont,
          color: PDF_THEME.footerText,
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

