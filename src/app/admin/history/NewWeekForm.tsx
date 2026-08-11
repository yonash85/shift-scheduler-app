"use client";

import { useRef, useTransition } from "react";
import { createWeekAction } from "./actions";

export default function NewWeekForm() {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 items-end"
      action={(formData: FormData) => {
        const label = String(formData.get("label") || "").trim();
        const startsOn = String(formData.get("starts_on") || "");
        if (!label || !startsOn) return;
        if (!confirm(`Start "${label}" and make it the current week? The Dashboard, Availability, People and Rules will all switch to it.`)) return;
        startTransition(async () => {
          await createWeekAction(label, startsOn);
          formRef.current?.reset();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Label
        <input name="label" type="text" placeholder="e.g. Week of Aug 23" required className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Starts on
        <input name="starts_on" type="date" required className="border border-border rounded-md px-2 py-1.5 bg-surface text-text text-[13px]" />
      </label>
      <button type="submit" disabled={pending} className="bg-accent text-accent-ink font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60">
        {pending ? "Starting…" : "Start this week"}
      </button>
    </form>
  );
}
