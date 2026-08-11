"use client";

import { useTransition } from "react";
import { generateAction } from "@/app/admin/actions";

export default function GenerateButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => generateAction())}
      className="bg-accent text-accent-ink font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60"
    >
      {pending ? "Thinking…" : "Generate schedule"}
    </button>
  );
}
