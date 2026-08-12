"use client";

import { useState, useTransition } from "react";
import { updateWeekAction } from "./actions";

export default function WeekRow({
  week,
  isSelected,
  isCurrent,
}: {
  week: { id: string; label: string; starts_on: string };
  isSelected: boolean;
  isCurrent: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-surface-2"
        action={(formData: FormData) => {
          const label = String(formData.get("label") || "").trim();
          const startsOn = String(formData.get("starts_on") || "");
          if (!label || !startsOn) return;
          startTransition(async () => {
            await updateWeekAction(week.id, label, startsOn);
            setEditing(false);
          });
        }}
      >
        <input
          name="label"
          type="text"
          defaultValue={week.label}
          required
          className="border border-border rounded-md px-2 py-1 bg-surface text-text text-[12.5px] flex-1 min-w-[140px]"
        />
        <input
          name="starts_on"
          type="date"
          defaultValue={week.starts_on.slice(0, 10)}
          required
          className="border border-border rounded-md px-2 py-1 bg-surface text-text text-[12.5px]"
        />
        <button type="submit" disabled={pending} className="text-[11.5px] px-2.5 py-1 rounded-md bg-accent text-accent-ink font-bold disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] px-2.5 py-1 rounded-md border border-border text-text-muted hover:bg-surface-3">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className={`flex items-center justify-between px-2.5 py-2 rounded-md text-[12.5px] ${isSelected ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
      <a href={`/admin/history?week=${week.id}`} className={`flex-1 ${isSelected ? "text-accent-strong font-semibold" : "text-text"}`}>
        {week.label}
      </a>
      <span className="flex items-center gap-2">
        {isCurrent && <span className="text-[10px] uppercase tracking-wide bg-ok-soft text-ok px-1.5 py-0.5 rounded font-bold">Current</span>}
        <span className="text-text-muted">{new Date(week.starts_on).toLocaleDateString()}</span>
        <button type="button" onClick={() => setEditing(true)} className="text-text-muted hover:text-accent-strong" title="Edit label/date">
          ✎
        </button>
      </span>
    </div>
  );
}
