"use client";

import { useRef, useState, useTransition } from "react";
import { addWorkerAction } from "./actions";

export default function AddWorkerForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ name: string; pin: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <form
        ref={formRef}
        className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 items-end"
        action={(formData: FormData) => {
          const name = String(formData.get("name") || "").trim();
          if (!name) return;
          const team = String(formData.get("team")) as "israeli" | "serbian";
          const lead = (String(formData.get("lead")) || "") as "" | "primary" | "backup";
          const quota = parseInt(String(formData.get("quota")), 10) || 5;
          startTransition(async () => {
            const res = await addWorkerAction({ name, team, lead: lead || null, quota });
            setResult({ name, pin: res.pin });
            formRef.current?.reset();
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Name
          <input name="name" type="text" placeholder="e.g. Dana" required className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Team
          <select name="team" defaultValue="israeli" className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]">
            <option value="israeli">Israeli</option>
            <option value="serbian">Serbian</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Lead role
          <select name="lead" defaultValue="" className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]">
            <option value="">None</option>
            <option value="primary">Primary lead</option>
            <option value="backup">Backup lead</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Weekly quota
          <input name="quota" type="number" min={0} max={14} defaultValue={5} className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]" />
        </label>
        <button type="submit" disabled={pending} className="bg-accent text-accent-ink font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60">
          {pending ? "Adding…" : "Add worker"}
        </button>
      </form>
      {result && (
        <div className="mt-3 text-[12.5px] bg-ok-soft text-ok rounded-md px-3 py-2">
          Added {result.name}. Their PIN is <b className="font-mono">{result.pin}</b> — share it with them (this is the only time it's shown).
        </div>
      )}
    </div>
  );
}
