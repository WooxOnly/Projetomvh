ALTER TYPE "CheckinClassification" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "SpreadsheetUpload"
ADD COLUMN "totalCancelledCheckins" INTEGER NOT NULL DEFAULT 0;

UPDATE "Checkin"
SET "classification" = 'CHECKIN'::"CheckinClassification"
WHERE "classification" = 'OWNER'::"CheckinClassification"
   OR lower(btrim(coalesce("integratorName", ''))) IN ('own (owner staying)', 'owner');

ALTER TABLE "OperationAssignment"
DROP CONSTRAINT IF EXISTS "OperationAssignment_operationRunId_checkinId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "OperationAssignment_operationRunId_checkinId_propertyManagerId_key"
ON "OperationAssignment" ("operationRunId", "checkinId", "propertyManagerId");

UPDATE "SpreadsheetUpload" upload
SET
  "totalCheckins" = counts.checkin_count,
  "totalOwnerCheckins" = counts.owner_count,
  "totalBlockedCheckins" = counts.blocked_count,
  "totalCancelledCheckins" = counts.cancelled_count
FROM (
  SELECT
    "spreadsheetUploadId",
    COUNT(*) FILTER (WHERE "classification" = 'CHECKIN')::INTEGER AS checkin_count,
    COUNT(*) FILTER (WHERE "classification" = 'OWNER')::INTEGER AS owner_count,
    COUNT(*) FILTER (WHERE "classification" = 'BLOCKED')::INTEGER AS blocked_count,
    COUNT(*) FILTER (WHERE "classification" = 'CANCELLED')::INTEGER AS cancelled_count
  FROM "Checkin"
  GROUP BY "spreadsheetUploadId"
) counts
WHERE upload."id" = counts."spreadsheetUploadId";
