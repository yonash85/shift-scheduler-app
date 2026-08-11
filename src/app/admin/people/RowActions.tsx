"use client";

import { useState, useTransition } from "react";
import { resetPinAction, removeWorkerAction } from "./actions";

export function ResetPinButton({ workerId, name }: { workerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [pin, setPin] = useState<string | null>(null);

  if (pin) {
    return (
      <span className="text-[11.5px] bg-ok-soft text-ok rounded-md px-2 py-1">
        New PIN for {name}: <b className="font-mono">{pin}</b>
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => setPin((await resetPinAction(workerId)).pin))}
      className="text-[12px] px-2 py-1 rounded-md bg-surface-2 border border-border hover:bg-surface-3 disabled:opacity-60"
    >
      {pending ? "…" : "Reset PIN"}
    </button>
  );
}

export function RemoveWorkerButton({ workerId, name }: { workerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove ${name} completely? This deletes their availability and notes.`)) return;
        startTransition(() => removeWorkerAction(workerId));
      }}
      className="text-[12px] px-2 py-1 rounded-md bg-crit-soft text-crit hover:bg-crit hover:text-white disabled:opacity-60"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
