CREATE TYPE "CheckinClassification" AS ENUM ('CHECKIN', 'OWNER', 'BLOCKED');

ALTER TABLE "SpreadsheetUpload"
ADD COLUMN "totalOwnerCheckins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalBlockedCheckins" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Checkin"
ADD COLUMN "sourceRowNumber" INTEGER,
ADD COLUMN "classification" "CheckinClassification" NOT NULL DEFAULT 'CHECKIN';

UPDATE "Checkin"
SET "classification" = CASE
  WHEN lower(btrim(coalesce("integratorName", ''))) = 'owner' THEN 'OWNER'::"CheckinClassification"
  WHEN lower(btrim(coalesce("integratorName", ''))) = 'blocked' THEN 'BLOCKED'::"CheckinClassification"
  ELSE 'CHECKIN'::"CheckinClassification"
END;

UPDATE "SpreadsheetUpload" su
SET
  "totalCheckins" = counts.checkin_count,
  "totalOwnerCheckins" = counts.owner_count,
  "totalBlockedCheckins" = counts.blocked_count
FROM (
  SELECT
    "spreadsheetUploadId",
    COUNT(*) FILTER (WHERE "classification" = 'CHECKIN')::INTEGER AS checkin_count,
    COUNT(*) FILTER (WHERE "classification" = 'OWNER')::INTEGER AS owner_count,
    COUNT(*) FILTER (WHERE "classification" = 'BLOCKED')::INTEGER AS blocked_count
  FROM "Checkin"
  GROUP BY "spreadsheetUploadId"
) AS counts
WHERE counts."spreadsheetUploadId" = su."id";
