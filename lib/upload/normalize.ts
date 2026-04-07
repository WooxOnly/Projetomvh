export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value: unknown) {
  if (typeof value !== "string") {
    if (value == null) {
      return "";
    }

    return String(value).trim();
  }

  return value.trim();
}

export function normalizeOperationalAddress(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text
    .replace(/^\s*[^\s-]+-\s*(.+)$/u, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOptionalInt(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const digits = text.match(/\d+/)?.[0];

  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

export function parseOptionalFloat(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const normalized = text.replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  return Number.isNaN(parsed) ? null : parsed;
}

export function parseOptionalBoolean(value: unknown) {
  const text = cleanText(value).toLowerCase();

  if (!text) {
    return null;
  }

  if (["yes", "y", "true", "sim", "1"].includes(text)) {
    return true;
  }

  if (["no", "n", "false", "nao", "não", "0"].includes(text)) {
    return false;
  }

  return null;
}

export function parseOperationDate(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = cleanText(value);

  if (!text) {
    return fallback;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}
