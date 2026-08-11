"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm({ workers }: { workers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | undefined, formData: FormData) => {
      const result = await login(formData);
      return result ?? undefined;
    },
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-text-muted text-xs uppercase tracking-wide">Name</span>
        <select
          name="workerId"
          required
          className="border border-border rounded-lg px-3 py-2 bg-surface text-text text-sm focus:outline-2 focus:outline-accent"
        >
          <option value="">Select your name…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-text-muted text-xs uppercase tracking-wide">PIN</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          className="border border-border rounded-lg px-3 py-2 bg-surface text-text text-sm focus:outline-2 focus:outline-accent"
        />
      </label>
      {state?.error && <div className="text-sm text-crit bg-crit-soft rounded-lg px-3 py-2">{state.error}</div>}
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-accent-ink font-bold text-sm rounded-lg px-4 py-2.5 disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
