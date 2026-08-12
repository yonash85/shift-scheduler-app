"use client";

import { useRef, useState, useTransition } from "react";
import { importAvailabilityCsvAction, type CsvImportSummary } from "@/app/actions/availability";

export default function CsvImportForm() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const text = await file.text();
        const result = await importAvailabilityCsvAction(text);
        setSummary(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="text-[12.5px]"
      />
      {pending && <p className="text-[12.5px] text-text-muted mt-2">Importing…</p>}
      {error && <p className="text-[12.5px] text-crit mt-2">{error}</p>}
      {summary && (
        <div className="mt-3 text-[12.5px] flex flex-col gap-1.5">
          <div className="bg-ok-soft text-ok rounded-md px-2.5 py-2">
            Updated {summary.cellsUpdated} cells across {summary.matched.length} people: {summary.matched.map((m) => m.workerName).join(", ")}.
          </div>
          {summary.unmatched.length > 0 && (
            <div className="bg-warn-soft text-warn rounded-md px-2.5 py-2">
              No matching worker found for: {summary.unmatched.join(", ")} — nothing was changed for them.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
