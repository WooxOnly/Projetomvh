"use client";

import type { ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";
import { ResourcePanel } from "@/app/resource-panel";

type CadastrosShellProps = {
  data: {
    offices: Array<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      notes: string | null;
    }>;
    propertyManagers: Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      isActive: boolean;
      officeId: string | null;
      notes: string | null;
      office: {
        id: string;
        name: string;
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
      } | null;
      _count: { properties: number };
    }>;
    condominiums: Array<{
      id: string;
      nameOriginal: string;
      nameNormalized: string;
      officeId: string | null;
      region: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      notes: string | null;
      office: {
        id: string;
        name: string;
        slug: string;
      } | null;
      _count: { properties: number };
    }>;
    properties: Array<{
      id: string;
      nameOriginal: string;
      nameNormalized: string;
      building: string | null;
      address: string | null;
      bedrooms: number | null;
      hasBbqGrill: boolean | null;
      notes: string | null;
      condominiumId: string | null;
      defaultPropertyManagerId: string | null;
      condominium: { id: string; nameOriginal: string } | null;
      defaultPropertyManager: { id: string; name: string } | null;
    }>;
  };
};

type CadastroTabKey = "offices" | "propertyManagers" | "condominiums" | "properties";

function TabGroup({
  items,
  activeTab,
  onSelect,
}: {
  items: Array<{
    key: CadastroTabKey;
    label: string;
    icon: "office" | "managers" | "route" | "home";
  }>;
  activeTab: CadastroTabKey;
  onSelect: (tab: CadastroTabKey) => void;
}) {
  return (
    <div className="mobile-tab-row md:flex md:flex-wrap md:gap-3 md:overflow-visible md:pb-0">
      {items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition ${
            activeTab === tab.key
              ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30"
              : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          }`}
        >
          <ButtonLabel icon={tab.icon}>{tab.label}</ButtonLabel>
        </button>
      ))}
    </div>
  );
}

export function CadastrosShell({ data }: CadastrosShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isEnglish } = useLanguage();
  const requestedTab = searchParams.get("tab");

  const tabs: Array<{
    key: CadastroTabKey;
    label: string;
    icon: "office" | "managers" | "route" | "home";
  }> = [
    { key: "offices", label: isEnglish ? "Offices" : "Escritórios", icon: "office" },
    {
      key: "propertyManagers",
      label: isEnglish ? "Property Managers" : "Gerentes de Propriedades",
      icon: "managers",
    },
    { key: "condominiums", label: isEnglish ? "Resorts" : "Condomínios", icon: "route" },
    { key: "properties", label: isEnglish ? "Houses" : "Casas", icon: "home" },
  ];

  const tabMeta: Record<CadastroTabKey, { title: string; description: string }> = {
    offices: {
      title: isEnglish ? "Offices" : "Escritórios",
      description: isEnglish
        ? "Maintain departure addresses and the base office information."
        : "Mantenha os endereços de saída e as informações-base dos escritórios.",
    },
    propertyManagers: {
      title: isEnglish ? "Property Managers" : "Gerentes de Propriedades",
      description: isEnglish
        ? "Manage the operational team in an area separate from the daily flow."
        : "Gerencie o time operacional em uma área separada do fluxo do dia.",
    },
    condominiums: {
      title: isEnglish ? "Resorts" : "Condomínios",
      description: isEnglish
        ? "Review resorts and the base organization more clearly."
        : "Revise os condomínios e a organização da base com mais clareza.",
    },
    properties: {
      title: isEnglish ? "Houses" : "Casas",
      description: isEnglish
        ? "Update homes, bedrooms, and complementary data without mixing them with the daily process."
        : "Atualize casas, quartos e dados complementares sem misturar com o processo diário.",
    },
  };

  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as CadastroTabKey)
    : "offices";

  function selectTab(tab: CadastroTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  let activePanel: ReactElement | null = null;

  switch (activeTab) {
    case "offices":
      activePanel = <ResourcePanel key="offices" kind="offices" data={data} />;
      break;
    case "propertyManagers":
      activePanel = <ResourcePanel key="propertyManagers" kind="propertyManagers" data={data} />;
      break;
    case "condominiums":
      activePanel = <ResourcePanel key="condominiums" kind="condominiums" data={data} />;
      break;
    case "properties":
      activePanel = <ResourcePanel key="properties" kind="properties" data={data} />;
      break;
  }

  const activeTabMeta = tabMeta[activeTab];

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 sm:p-5">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              {isEnglish ? "Records" : "Cadastros"}
            </p>
            <h2 className="mt-3 text-lg font-semibold text-white sm:text-xl">
              {isEnglish ? "System records" : "Base do sistema"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {isEnglish
                ? "Everything related to records stays here, separate from history and from the daily operational flow."
                : "Tudo que é cadastro fica aqui, separado do histórico e separado do fluxo operacional do dia."}
            </p>
          </div>

          <TabGroup items={tabs} activeTab={activeTab} onSelect={selectTab} />
        </div>
      </section>

      <section className="dashboard-panel-enter rounded-[1.5rem] border border-white/10 bg-slate-950/25 p-3 sm:p-4">
        <div className="mb-4 rounded-[1.25rem] border border-white/8 bg-slate-950/45 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {isEnglish ? "Record" : "Cadastro"}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{activeTabMeta.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            {activeTabMeta.description}
          </p>
        </div>
        {activePanel}
      </section>
    </div>
  );
}
