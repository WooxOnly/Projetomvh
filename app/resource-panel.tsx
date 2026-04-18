"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";

type ResourcePanelProps = {
  kind: "offices" | "propertyManagers" | "condominiums" | "properties";
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

type FormState = Record<string, string | boolean | undefined>;

async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "The action failed.");
  }
}

function emptyForm(kind: ResourcePanelProps["kind"]): FormState {
  if (kind === "offices") {
    return {
      id: "",
      name: "",
      slug: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
    };
  }

  if (kind === "propertyManagers") {
    return {
      id: "",
      name: "",
      phone: "",
      email: "",
      isActive: true,
      officeId: "",
      notes: "",
    };
  }

  if (kind === "condominiums") {
    return {
      id: "",
      nameOriginal: "",
      officeId: "",
      region: "UNASSIGNED",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
    };
  }

    return {
      id: "",
      nameOriginal: "",
      building: "",
      address: "",
    bedrooms: "",
    hasBbqGrill: "",
    notes: "",
    condominiumId: "",
    defaultPropertyManagerId: "",
  };
}

export function ResourcePanel({ kind, data }: ResourcePanelProps) {
  const router = useRouter();
  const { isEnglish } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm(kind));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const compareText = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: "base" });

  const sortedOffices = useMemo(
    () => [...data.offices].sort((left, right) => compareText(left.name, right.name)),
    [data.offices],
  );
  const sortedPropertyManagers = useMemo(
    () => [...data.propertyManagers].sort((left, right) => compareText(left.name, right.name)),
    [data.propertyManagers],
  );
  const sortedCondominiums = useMemo(
    () =>
      [...data.condominiums].sort((left, right) =>
        compareText(left.nameOriginal, right.nameOriginal),
      ),
    [data.condominiums],
  );
  const sortedProperties = useMemo(
    () => [...data.properties].sort((left, right) => compareText(left.nameOriginal, right.nameOriginal)),
    [data.properties],
  );

  useEffect(() => {
    if (!message && !error) return;
    const timeout = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [message, error]);

  const config = useMemo(() => {
    if (kind === "offices") {
      return {
        title: isEnglish ? "Office record" : "Cadastro de escritório",
        button: isEnglish ? "Office" : "Escritório",
        route: "/api/offices",
      };
    }

    if (kind === "propertyManagers") {
      return {
        title: isEnglish ? "Property Manager record" : "Cadastro de gerente de propriedades",
        button: isEnglish ? "Property Manager" : "Gerente de propriedades",
        route: "/api/property-managers",
      };
    }

    if (kind === "condominiums") {
      return {
        title: isEnglish ? "Resort record" : "Cadastro de condomínio",
        button: isEnglish ? "Resort" : "Condomínio",
        route: "/api/condominiums",
      };
    }

    return {
      title: isEnglish ? "House record" : "Cadastro de casa",
      button: isEnglish ? "House" : "Casa",
      route: "/api/properties",
    };
  }, [isEnglish, kind]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    function matchesSearch(value: string) {
      return !term || value.toLowerCase().includes(term);
    }

    if (kind === "offices") {
      return sortedOffices.filter((office) =>
        matchesSearch(
          [
            office.name,
            office.slug,
            office.address,
            office.city,
            office.state,
            office.zipCode,
            office.notes,
          ]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }

    if (kind === "propertyManagers") {
      return sortedPropertyManagers.filter((manager) => {
        const matchesText = matchesSearch(
          [
            manager.name,
            manager.phone,
            manager.email,
            manager.notes,
            manager.office?.name,
            manager.office?.address,
          ]
            .filter(Boolean)
            .join(" "),
        );

        if (!matchesText) return false;
        if (filter === "active") return manager.isActive;
        if (filter === "inactive") return !manager.isActive;
        if (filter.startsWith("office:")) {
          return manager.officeId === filter.slice("office:".length);
        }

        return true;
      });
    }

    if (kind === "condominiums") {
      return sortedCondominiums.filter((condominium) =>
        matchesSearch(
          [
            condominium.nameOriginal,
            condominium.address,
            condominium.city,
            condominium.state,
            condominium.zipCode,
            condominium.notes,
          ]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }

    return sortedProperties.filter((property) => {
      const matchesText = matchesSearch(
        [
          property.nameOriginal,
          property.building,
          property.address,
          property.notes,
          property.condominium?.nameOriginal,
          property.defaultPropertyManager?.name,
          property.hasBbqGrill == null
            ? ""
            : property.hasBbqGrill
              ? isEnglish
                ? "bbq yes"
                : "bbq sim"
              : isEnglish
                ? "bbq no"
                : "bbq não",
        ]
          .filter(Boolean)
          .join(" "),
      );

      if (!matchesText) return false;
      if (filter === "missing-bedrooms") return property.bedrooms == null;
      if (filter === "with-bedrooms") return property.bedrooms != null;
      if (filter.startsWith("resort:")) {
        return property.condominiumId === filter.slice("resort:".length);
      }

      return true;
    });
  }, [
    filter,
    isEnglish,
    kind,
    search,
    sortedCondominiums,
    sortedOffices,
    sortedProperties,
    sortedPropertyManagers,
  ]);

  function handleAction(action: () => Promise<void>, successMessage: string) {
    startTransition(async () => {
      try {
        await action();
        setMessage(successMessage);
        setError("");
        setForm(emptyForm(kind));
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : isEnglish
              ? "The action failed."
              : "A operação falhou.",
        );
      }
    });
  }

  function renderFormFields() {
    if (kind === "offices") {
      return (
        <>
          <input
            value={String(form.name ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={isEnglish ? "Office name" : "Nome do escritório"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <input
            value={String(form.slug ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="Slug"
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <input
            value={String(form.address ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            placeholder={isEnglish ? "Office address" : "Endereço do escritório"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <input
              value={String(form.city ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              placeholder={isEnglish ? "City" : "Cidade"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={String(form.state ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
              placeholder={isEnglish ? "State" : "Estado"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={String(form.zipCode ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, zipCode: event.target.value }))}
              placeholder="ZIP"
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
          </div>
          <textarea
            value={String(form.notes ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={isEnglish ? "Notes" : "Observações"}
            className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
        </>
      );
    }

    if (kind === "propertyManagers") {
      return (
        <>
          <input
            value={String(form.name ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={isEnglish ? "Name" : "Nome"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              value={String(form.phone ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder={isEnglish ? "Phone" : "Telefone"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={String(form.email ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder={isEnglish ? "Email" : "E-mail"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
          </div>
          <select
            value={String(form.officeId ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, officeId: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">
              {isEnglish ? "No office defined" : "Sem escritório definido"}
            </option>
            {sortedOffices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
          <textarea
            value={String(form.notes ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={isEnglish ? "Notes" : "Observações"}
            className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            {isEnglish ? "Active property manager" : "Gerente de propriedades ativo"}
          </label>
        </>
      );
    }

    if (kind === "condominiums") {
      return (
        <>
          <input
            value={String(form.nameOriginal ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, nameOriginal: event.target.value }))}
            placeholder={isEnglish ? "Name" : "Nome"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <input
            value={String(form.address ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            placeholder={isEnglish ? "Address" : "Endereço"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <select
              value={String(form.officeId ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, officeId: event.target.value }))}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">
                {isEnglish ? "No office defined" : "Sem escritório definido"}
              </option>
              {sortedOffices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
            <select
              value={String(form.region ?? "UNASSIGNED")}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="UNASSIGNED">
                {isEnglish ? "Region not defined" : "Região não definida"}
              </option>
              <option value="NORTH">{isEnglish ? "North" : "Norte"}</option>
              <option value="SOUTH">{isEnglish ? "South" : "Sul"}</option>
              <option value="EAST">{isEnglish ? "East" : "Leste"}</option>
              <option value="WEST">{isEnglish ? "West" : "Oeste"}</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <input
              value={String(form.city ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              placeholder={isEnglish ? "City" : "Cidade"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={String(form.state ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
              placeholder={isEnglish ? "State" : "Estado"}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={String(form.zipCode ?? "")}
              onChange={(event) => setForm((current) => ({ ...current, zipCode: event.target.value }))}
              placeholder="ZIP"
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            />
          </div>
          <textarea
            value={String(form.notes ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={isEnglish ? "Notes" : "Observações"}
            className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
        </>
      );
    }

    return (
      <>
        <input
          value={String(form.nameOriginal ?? "")}
          onChange={(event) => setForm((current) => ({ ...current, nameOriginal: event.target.value }))}
          placeholder={isEnglish ? "House / identifier" : "Casa / identificador"}
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            value={String(form.building ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, building: event.target.value }))}
            placeholder={isEnglish ? "Building" : "Building"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <input
            value={String(form.address ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            placeholder={isEnglish ? "Address without building" : "Endereço sem o building"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <input
            value={String(form.bedrooms ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, bedrooms: event.target.value }))}
            placeholder={isEnglish ? "Bedrooms" : "Quartos"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          <select
            value={String(form.hasBbqGrill ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, hasBbqGrill: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">{isEnglish ? "BBQ not informed" : "BBQ não informado"}</option>
            <option value="true">{isEnglish ? "BBQ yes" : "BBQ sim"}</option>
            <option value="false">{isEnglish ? "BBQ no" : "BBQ não"}</option>
          </select>
          <select
            value={String(form.condominiumId ?? "")}
            onChange={(event) => setForm((current) => ({ ...current, condominiumId: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">{isEnglish ? "No resort" : "Sem condomínio"}</option>
            {sortedCondominiums.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameOriginal}
              </option>
            ))}
          </select>
          <select
            value={String(form.defaultPropertyManagerId ?? "")}
            onChange={(event) =>
              setForm((current) => ({ ...current, defaultPropertyManagerId: event.target.value }))
            }
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">
              {isEnglish ? "No default property manager" : "Sem gerente de propriedades padrão"}
            </option>
            {sortedPropertyManagers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={String(form.notes ?? "")}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          placeholder={isEnglish ? "Notes" : "Observações"}
          className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
        />
      </>
    );
  }

  function itemLabel(
    item:
      | ResourcePanelProps["data"]["offices"][number]
      | ResourcePanelProps["data"]["propertyManagers"][number]
      | ResourcePanelProps["data"]["condominiums"][number]
      | ResourcePanelProps["data"]["properties"][number],
  ) {
    if (kind === "offices") {
      const office = item as ResourcePanelProps["data"]["offices"][number];
      return `${office.name} | ${
        [office.address, office.city, office.state].filter(Boolean).join(" | ") ||
        (isEnglish ? "No address" : "Sem endereço")
      }`;
    }

    if (kind === "propertyManagers") {
      const manager = item as ResourcePanelProps["data"]["propertyManagers"][number];
      return `${manager.name} | ${
        manager.office?.name || (isEnglish ? "No office" : "Sem escritório")
      } | ${
        manager.office?.address ||
        (isEnglish ? "Office without address" : "Escritório sem endereço")
      } | ${isEnglish ? "Active" : "Ativo"}: ${
        manager.isActive ? (isEnglish ? "Yes" : "Sim") : isEnglish ? "No" : "Não"
      }`;
    }

    if (kind === "condominiums") {
      const condominium = item as ResourcePanelProps["data"]["condominiums"][number];
      return `${condominium.nameOriginal} | ${
        condominium.office?.name || (isEnglish ? "No office" : "Sem escritório")
      } | ${
        [condominium.address, condominium.city, condominium.state].filter(Boolean).join(" | ") ||
        (isEnglish ? "No address" : "Sem endereço")
      }`;
    }

    const property = item as ResourcePanelProps["data"]["properties"][number];
    return `${property.nameOriginal} | ${
      property.condominium?.nameOriginal || (isEnglish ? "No resort" : "Sem condomínio")
    } | ${isEnglish ? "Address" : "Endereço"}: ${[property.building, property.address].filter(Boolean).join("-") || "N/D"} | ${isEnglish ? "Bedrooms" : "Quartos"}: ${property.bedrooms ?? "N/D"} | BBQ: ${
      property.hasBbqGrill == null
        ? "N/D"
        : property.hasBbqGrill
          ? isEnglish
            ? "Yes"
            : "Sim"
          : isEnglish
            ? "No"
            : "Não"
    }`;
  }

  function itemToForm(
    item:
      | ResourcePanelProps["data"]["offices"][number]
      | ResourcePanelProps["data"]["propertyManagers"][number]
      | ResourcePanelProps["data"]["condominiums"][number]
      | ResourcePanelProps["data"]["properties"][number],
  ): FormState {
    if (kind === "offices") {
      const office = item as ResourcePanelProps["data"]["offices"][number];
      return {
        id: office.id,
        name: office.name,
        slug: office.slug,
        address: office.address ?? "",
        city: office.city ?? "",
        state: office.state ?? "",
        zipCode: office.zipCode ?? "",
        notes: office.notes ?? "",
      };
    }

    if (kind === "propertyManagers") {
      const manager = item as ResourcePanelProps["data"]["propertyManagers"][number];
      return {
        id: manager.id,
        name: manager.name,
        phone: manager.phone ?? "",
        email: manager.email ?? "",
        isActive: manager.isActive,
        officeId: manager.officeId ?? "",
        notes: manager.notes ?? "",
      };
    }

    if (kind === "condominiums") {
      const condominium = item as ResourcePanelProps["data"]["condominiums"][number];
      return {
        id: condominium.id,
        nameOriginal: condominium.nameOriginal,
        officeId: condominium.officeId ?? "",
        region: condominium.region,
        address: condominium.address ?? "",
        city: condominium.city ?? "",
        state: condominium.state ?? "",
        zipCode: condominium.zipCode ?? "",
        notes: condominium.notes ?? "",
      };
    }

    const property = item as ResourcePanelProps["data"]["properties"][number];
    return {
      id: property.id,
      nameOriginal: property.nameOriginal,
      building: property.building ?? "",
      address: property.address ?? "",
      bedrooms: property.bedrooms?.toString() ?? "",
      hasBbqGrill: property.hasBbqGrill == null ? "" : property.hasBbqGrill ? "true" : "false",
      notes: property.notes ?? "",
      condominiumId: property.condominiumId ?? "",
      defaultPropertyManagerId: property.defaultPropertyManagerId ?? "",
    };
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <form
        className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleAction(
            () =>
              sendJson(
                String(form.id) ? `${config.route}/${String(form.id)}` : config.route,
                String(form.id) ? "PATCH" : "POST",
                form,
              ),
            String(form.id)
              ? isEnglish
                ? `${config.button} updated successfully.`
                : `${config.button} atualizado com sucesso.`
              : isEnglish
                ? `${config.button} created successfully.`
                : `${config.button} criado com sucesso.`,
          );
        }}
      >
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{config.title}</p>
        <div className="mt-5 grid gap-4">{renderFormFields()}</div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950"
          >
            <ButtonLabel icon={String(form.id) ? "save" : "upload"}>
              {String(form.id)
                ? isEnglish
                  ? `Save ${config.button}`
                  : `Salvar ${config.button}`
                : isEnglish
                  ? `Create ${config.button}`
                  : `Criar ${config.button}`}
            </ButtonLabel>
          </button>
          {String(form.id) ? (
            <button
              type="button"
              className="min-h-11 rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
              onClick={() => setForm(emptyForm(kind))}
            >
              <ButtonLabel icon="cancel">{isEnglish ? "Cancel" : "Cancelar"}</ButtonLabel>
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-4 text-sm text-emerald-200">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
      </form>

      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
          {isEnglish ? "List" : "Lista"}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isEnglish ? "Search this list" : "Pesquisar nesta lista"}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
          />
          {kind === "propertyManagers" ? (
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">
                {isEnglish ? "All property managers" : "Todos os gerentes de propriedades"}
              </option>
              <option value="active">{isEnglish ? "Active only" : "Somente ativos"}</option>
              <option value="inactive">{isEnglish ? "Inactive only" : "Somente inativos"}</option>
              {sortedOffices.map((office) => (
                <option key={office.id} value={`office:${office.id}`}>
                  {office.name}
                </option>
              ))}
            </select>
          ) : null}
          {kind === "properties" ? (
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">{isEnglish ? "All houses" : "Todas as casas"}</option>
              <option value="missing-bedrooms">
                {isEnglish ? "Without bedrooms" : "Sem quartos"}
              </option>
              <option value="with-bedrooms">
                {isEnglish ? "With bedrooms" : "Com quartos"}
              </option>
              {sortedCondominiums.map((resort) => (
                <option key={resort.id} value={`resort:${resort.id}`}>
                  {resort.nameOriginal}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-0 sm:pr-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div key={item.id} className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white">{itemLabel(item as never)}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                    onClick={() => setForm(itemToForm(item as never))}
                  >
                    <ButtonLabel icon="edit">{isEnglish ? "Edit" : "Editar"}</ButtonLabel>
                  </button>
                  <button
                    type="button"
                    className="theme-danger-button min-h-11 rounded-xl px-3 py-2 text-sm"
                    onClick={() =>
                      handleAction(
                        () => sendJson(`${config.route}/${item.id}`, "DELETE"),
                        isEnglish
                          ? `${config.button} removed successfully.`
                          : `${config.button} removido com sucesso.`,
                      )
                    }
                  >
                    <ButtonLabel icon="delete">{isEnglish ? "Delete" : "Excluir"}</ButtonLabel>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-300">
              {isEnglish
                ? "No records found with the current filters."
                : "Nenhum registro encontrado com os filtros atuais."}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

