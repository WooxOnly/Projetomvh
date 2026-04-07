import { HistoryPanel } from "@/app/history-panel";
import { getActiveUploadSummary, getUploadHistory } from "@/lib/upload/queries";

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateRange(value: string | string[] | undefined, fallback: Date) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default async function DashboardHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const today = new Date();
  const defaultEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const defaultStartDate = new Date(defaultEndDate);
  defaultStartDate.setDate(defaultStartDate.getDate() - 6);

  const startDate = parseDateRange(resolvedSearchParams.startDate, defaultStartDate);
  const endDate = parseDateRange(resolvedSearchParams.endDate, defaultEndDate);
  const normalizedEndDate = new Date(endDate);
  normalizedEndDate.setHours(23, 59, 59, 999);

  const [activeUpload, uploadHistory] = await Promise.all([
    getActiveUploadSummary(),
    getUploadHistory({
      startDate,
      endDate: normalizedEndDate,
    }),
  ]);

  return (
    <div className="mt-8">
      <HistoryPanel
        data={{
          activeUpload: activeUpload
            ? {
                id: activeUpload.id,
                sequenceNumber: activeUpload.sequenceNumber,
                fileName: activeUpload.fileName,
              }
            : null,
          uploadHistory,
        }}
        filters={{
          startDate: formatInputDate(startDate),
          endDate: formatInputDate(endDate),
        }}
      />
    </div>
  );
}
