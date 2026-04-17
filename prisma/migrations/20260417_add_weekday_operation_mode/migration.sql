ALTER TABLE "OperationRun"
ADD COLUMN IF NOT EXISTS "useSpreadsheetPmAssignments" BOOLEAN NOT NULL DEFAULT false;
