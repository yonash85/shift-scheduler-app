"use client";

import { useTransition } from "react";
import { clearScheduleAction } from "@/app/admin/actions";

export default function ClearScheduleButton({ hasSchedule }: { hasSchedule: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (hasSchedule && !confirm("Clear the whole schedule back to blank? This can't be undone (you'd have to Generate or place people again).")) return;
        startTransition(() => clearScheduleAction());
      }}
      className="bg-surface-2 text-text font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60 border border-border"
    >
      {pending ? "Clearing…" : hasSchedule ? "Clear schedule" : "Start manual schedule"}
    </button>
  );
}
