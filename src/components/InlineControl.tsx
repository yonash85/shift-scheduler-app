"use client";

import { useState, useTransition } from "react";

const inputCls =
  "border border-border rounded-md px-2 py-1 bg-surface text-text text-[12.8px] focus:outline-2 focus:outline-accent disabled:opacity-60";

// Note: `action` here must be the actual imported "use server" function reference,
// never an inline arrow defined in a Server Component (e.g. `(v) => doThing(id, v)`) —
// that closure isn't itself a Server Action and Next.js can't serialize it to the client.
// Extra arguments (like a row's id) are threaded through as a plain prop instead, and the
// client component calls action(id, value) itself so the reference stays unwrapped.

export function InlineSelect<TId extends string>({
  id,
  value,
  options,
  action,
  className,
}: {
  id: TId;
  value: string;
  options: { value: string; label: string }[];
  action: (id: TId, value: string) => Promise<void>;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      defaultValue={value}
      disabled={pending}
      onChange={(e) => startTransition(() => action(id, e.target.value))}
      className={`${inputCls} ${className ?? ""}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function InlineNumber<TId extends string>({
  id,
  value,
  action,
  min = 0,
  max = 20,
  className,
}: {
  id: TId;
  value: number;
  action: (id: TId, value: number) => Promise<void>;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(String(value));
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={local}
      disabled={pending}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseInt(local, 10);
        if (!Number.isNaN(n) && n !== value) startTransition(() => action(id, n));
      }}
      className={`${inputCls} w-16 ${className ?? ""}`}
    />
  );
}

export function InlineCheckbox<TId extends string>({
  id,
  checked,
  action,
}: {
  id: TId;
  checked: boolean;
  action: (id: TId, checked: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={pending}
      onChange={(e) => startTransition(() => action(id, e.target.checked))}
      className="w-4 h-4 accent-[var(--accent)]"
    />
  );
}

export function InlineButton({
  action,
  label,
  pendingLabel,
  className,
}: {
  action: () => Promise<void>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action())}
      className={className ?? "text-[12px] px-2.5 py-1.5 rounded-md bg-surface-2 border border-border hover:bg-surface-3 disabled:opacity-60"}
    >
      {pending ? pendingLabel ?? "…" : label}
    </button>
  );
}

export function InlineTextArea({
  value,
  action,
  placeholder,
}: {
  value: string;
  action: (value: string) => Promise<void>;
  placeholder?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(value);
  return (
    <textarea
      value={local}
      placeholder={placeholder}
      disabled={pending}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) startTransition(() => action(local));
      }}
      className="w-full min-h-[80px] border border-border rounded-lg px-3 py-2 bg-surface text-text text-sm focus:outline-2 focus:outline-accent disabled:opacity-60"
    />
  );
}
