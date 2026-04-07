import assert from "node:assert/strict";

import * as XLSX from "xlsx";

import { hashPassword, matchesStoredPassword, verifyPassword } from "../lib/auth/password.ts";
import { validateLoginInput } from "../lib/auth/validation.ts";
import { parseWorkbook } from "../lib/upload/parse-workbook.ts";
import {
  cleanText,
  normalizeText,
  parseOperationDate,
  parseOptionalBoolean,
  parseOptionalFloat,
  parseOptionalInt,
} from "../lib/upload/normalize.ts";

function testInvalidCredentials() {
  const result = validateLoginInput({
    email: "invalido",
    password: "123",
  });

  assert.equal(result.success, false);

  if (result.success) {
    throw new Error("Expected validation to fail.");
  }

  assert.equal(result.errors.email, "Informe um e-mail valido.");
  assert.equal(result.errors.password, undefined);
}

function testCredentialNormalization() {
  const result = validateLoginInput({
    email: "  USER@Example.COM ",
    password: "M.12a.93",
  });

  assert.equal(result.success, true);

  if (!result.success) {
    throw new Error("Expected validation to succeed.");
  }

  assert.equal(result.data.email, "user@example.com");
  assert.equal(result.data.password, "M.12a.93");
}

function testPasswordHashing() {
  const password = "M.12a.93";
  const hash = hashPassword(password);

  assert.match(hash, /^scrypt:/);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("Wrong123!", hash), false);
}

function testPasswordMatchingSupportsPlainTextAndLegacyHash() {
  assert.equal(matchesStoredPassword("M.12a.93", "M.12a.93"), true);
  assert.equal(matchesStoredPassword("Wrong123!", "M.12a.93"), false);

  const legacyHash = hashPassword("M.12a.93");
  assert.equal(matchesStoredPassword("M.12a.93", legacyHash), true);
}

function testUploadNormalizationHelpers() {
  assert.equal(cleanText("  Oak Village  "), "Oak Village");
  assert.equal(normalizeText("Condomínio Sol & Mar"), "condominio sol mar");
  assert.equal(normalizeText("Casa 14 / Bloco A"), "casa 14 bloco a");
  assert.equal(parseOptionalInt("4 quartos"), 4);
  assert.equal(parseOptionalInt("sem informacao"), null);
  assert.equal(parseOptionalFloat("28,5432"), 28.5432);
  assert.equal(parseOptionalBoolean("Yes"), true);
  assert.equal(parseOptionalBoolean("No"), false);

  const fallback = new Date("2026-03-31T00:00:00.000Z");
  assert.equal(parseOperationDate("", fallback).toISOString(), fallback.toISOString());
  assert.equal(
    parseOperationDate("2026-04-02", fallback).toISOString(),
    "2026-04-02T00:00:00.000Z",
  );
  assert.equal(
    parseOperationDate("not-a-date", fallback).toISOString(),
    fallback.toISOString(),
  );
}

function testWorkbookIgnoresNumberOfNightsSummaryRow() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet([
    {
      "Integrator name": "Airbnb",
      "House #": "Casa 10",
      Resort: "Bella Vida",
      "Guest/Description": "John Doe",
      Responsible: "",
      "Check-in": "2026-04-02",
      "# of nights": "4",
      "Door Code": "1234",
      "Has BBQ Grill": "",
      "Has Early Checkin": "",
    },
    {
      "Integrator name": "",
      "House #": "",
      Resort: "",
      "Guest/Description": "",
      Responsible: "",
      "Check-in": "",
      "# of nights": "932",
      "Door Code": "",
      "Has BBQ Grill": "",
      "Has Early Checkin": "",
    },
  ]);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fallback = new Date("2026-03-31T00:00:00.000Z");
  const parsed = parseWorkbook(buffer, fallback);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.propertyName, "Casa 10");
  assert.equal(parsed.suspiciousRows.length, 0);
}

function main() {
  testInvalidCredentials();
  testCredentialNormalization();
  testPasswordHashing();
  testPasswordMatchingSupportsPlainTextAndLegacyHash();
  testUploadNormalizationHelpers();
  testWorkbookIgnoresNumberOfNightsSummaryRow();
  console.log("Unit tests passed.");
}

main();
