ALTER TABLE "Property"
ADD COLUMN "building" TEXT;

ALTER TABLE "Checkin"
ADD COLUMN "building" TEXT;

UPDATE "Property"
SET
  "building" = regexp_replace("address", '^\s*([^\s-]+)-\s*.+$', '\1'),
  "address" = regexp_replace("address", '^\s*[^\s-]+-\s*(.+)$', '\1')
WHERE
  "address" ~ '^\s*[^\s-]+-\s*.+$'
  AND ("building" IS NULL OR btrim("building") = '');

UPDATE "Checkin"
SET
  "building" = regexp_replace("address", '^\s*([^\s-]+)-\s*.+$', '\1'),
  "address" = regexp_replace("address", '^\s*[^\s-]+-\s*(.+)$', '\1')
WHERE
  "address" ~ '^\s*[^\s-]+-\s*.+$'
  AND ("building" IS NULL OR btrim("building") = '');
