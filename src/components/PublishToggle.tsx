"use client";

import { useTransition } from "react";
import { publishAction, unpublishAction } from "@/app/admin/actions";

export default function PublishToggle({ published }: { published: boolean }) {
  const [pending, startTransition] = useTransition();

  if (published) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => unpublishAction())}
        className="bg-surface-2 text-text font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60 border border-border"
      >
        {pending ? "Hiding…" : "Hide from team"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => publishAction())}
      className="bg-ok-soft text-ok font-bold text-sm rounded-lg px-3.5 py-2 disabled:opacity-60 border border-ok"
    >
      {pending ? "Publishing…" : "Publish to team"}
    </button>
  );
}
