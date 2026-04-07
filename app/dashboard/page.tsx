import { OverviewPanel } from "@/app/overview-panel";
import { requireSession } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/operations/queries";

export default async function DashboardPage() {
  const session = await requireSession();
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="mt-8">
      <OverviewPanel
        session={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        data={snapshot}
        detailsHref="/dashboard/process?tab=details"
        propertiesHref="/dashboard/cadastros?tab=properties"
      />
    </div>
  );
}
