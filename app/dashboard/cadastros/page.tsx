import { CadastrosShell } from "@/app/cadastros-shell";
import { getDashboardSnapshot } from "@/lib/operations/queries";

export default async function DashboardCadastrosPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="mt-8">
      <CadastrosShell
        data={{
          offices: snapshot.offices,
          propertyManagers: snapshot.propertyManagers,
          condominiums: snapshot.condominiums,
          properties: snapshot.properties,
        }}
      />
    </div>
  );
}
