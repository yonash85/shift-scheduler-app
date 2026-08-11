"use client";

import { useState, useTransition } from "react";
import { DAYS, SHIFTS, type ShiftKey } from "@/lib/scheduler";
import { addToSlotAction, removeFromSlotAction } from "@/app/admin/actions";

export interface ScheduleWorkerRef {
  id: string;
  name: string;
  lead: "primary" | "backup" | null;
}

const CELL_CLASS: Record<ShiftKey, string> = {
  morning: "bg-sh-morning-soft text-sh-morning",
  mid: "bg-sh-mid-soft text-sh-mid",
  evening: "bg-sh-evening-soft text-sh-evening",
  bridge: "bg-sh-bridge-soft text-sh-bridge",
  deepnight: "bg-sh-deepnight-soft text-sh-deepnight",
};

export default function EditableScheduleTable({
  assignments,
  workers,
}: {
  assignments: Record<string, string[]>;
  workers: ScheduleWorkerRef[];
}) {
  const [local, setLocal] = useState(assignments);
  const [, startTransition] = useTransition();
  const [addingCell, setAddingCell] = useState<string | null>(null);
  const byId = new Map(workers.map((w) => [w.id, w]));
  const isLead = (w: ScheduleWorkerRef) => w.lead === "primary" || w.lead === "backup";

  function remove(day: number, sk: ShiftKey, workerId: string) {
    const key = `${day}|${sk}`;
    setLocal((prev) => ({ ...prev, [key]: (prev[key] || []).filter((id) => id !== workerId) }));
    startTransition(() => removeFromSlotAction(day, sk, workerId));
  }
  function add(day: number, sk: ShiftKey, workerId: string) {
    if (!workerId) return;
    const key = `${day}|${sk}`;
    setLocal((prev) => (prev[key]?.includes(workerId) ? prev : { ...prev, [key]: [...(prev[key] || []), workerId] }));
    startTransition(() => addToSlotAction(day, sk, workerId));
    setAddingCell(null);
  }

  return (
    <div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-[12.8px] min-w-[880px]">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">Shift</th>
              {DAYS.map((d) => (
                <th key={d} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide min-w-[130px]">
                  {d.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map((s) => (
              <tr key={s.key}>
                <td className="px-2.5 py-2 border-b border-border bg-surface-2 font-semibold whitespace-nowrap min-w-[140px] align-top">
                  <div className="flex flex-col gap-px">
                    <span>{s.label}</span>
                    <span className="text-[10.5px] font-normal text-text-muted">{s.time}</span>
                  </div>
                </td>
                {DAYS.map((day, d) => {
                  if (s.weekendOnly && d !== 0 && d !== 6) {
                    return (
                      <td key={day} className="px-2.5 py-2 border-b border-border align-top text-text-muted italic text-[11.5px]">
                        —
                      </td>
                    );
                  }
                  const key = `${d}|${s.key}`;
                  const ids = local[key] || [];
                  const cellId = key;
                  return (
                    <td key={day} className="px-2.5 py-2 border-b border-border align-top">
                      {ids.length === 0 && <span className="text-crit italic text-[11.5px] block mb-1">unfilled</span>}
                      {ids.map((id) => {
                        const w = byId.get(id);
                        return (
                          <div key={id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11.8px] my-0.5 mr-1 whitespace-nowrap ${CELL_CLASS[s.key]}`}>
                            {w && isLead(w) && <span className="text-[9.5px]">★</span>}
                            {w?.name ?? "?"}
                            <button
                              type="button"
                              onClick={() => remove(d, s.key, id)}
                              className="opacity-60 hover:opacity-100 leading-none"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      {addingCell === cellId ? (
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => add(d, s.key, e.target.value)}
                          onBlur={() => setAddingCell(null)}
                          className="block mt-1 text-[11px] border border-border rounded px-1 py-0.5 bg-surface w-full"
                        >
                          <option value="">Add…</option>
                          {workers
                            .filter((w) => !ids.includes(w.id))
                            .map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingCell(cellId)}
                          className="text-[11px] text-text-muted hover:text-accent-strong block mt-0.5"
                        >
                          + add
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-text-muted mt-2">★ = Enterprise Lead. Edits are flagged for conflicts, not blocked — check the validation summary above after editing.</p>
    </div>
  );
}
