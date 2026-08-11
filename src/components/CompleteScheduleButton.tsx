"use client";

import { useTransition } from "react";
import { completeScheduleAction } from "@/app/admin/actions";

export default function CompleteScheduleButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => completeScheduleAction())}
      className="bg-accent text-accent-ink font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60"
    >
      {pending ? "Filling in…" : "Complete automatically"}
    </button>
  );
}
