"use client";

import { useLanguage } from "@/app/language-provider";
import { UploadPanel } from "@/app/upload-panel";

type UploadFilesPanelProps = {
  offices: Array<{
    id: string;
    name: string;
  }>;
  onOpenDetailsTab?: () => void;
  onOpenPropertiesTab?: () => void;
};

export function UploadFilesPanel({
  offices,
  onOpenDetailsTab,
  onOpenPropertiesTab,
}: UploadFilesPanelProps) {
  const { isEnglish } = useLanguage();

  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
          {isEnglish ? "Import file" : "Importar Arquivo"}
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
          {isEnglish ? "Upload operational spreadsheet" : "Enviar planilha operacional"}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          {isEnglish
            ? "This step receives the file and activates the operational base used in the rest of the flow. To review previous imports, use the History page."
            : "Esta etapa serve para receber o arquivo e ativar a base operacional que será usada no restante do fluxo. Para consultar importações anteriores, use a página Histórico."}
        </p>
      </section>

      <UploadPanel
        offices={offices}
        onOpenDetailsTab={onOpenDetailsTab}
        onReviewMissingBedrooms={onOpenPropertiesTab}
      />
    </div>
  );
}
