import { DashboardShell } from "@/app/dashboard-shell";
import { getDashboardSnapshot } from "@/lib/operations/queries";

export default async function DashboardProcessPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="mt-8">
      <DashboardShell data={snapshot} />
    </div>
  );
}
