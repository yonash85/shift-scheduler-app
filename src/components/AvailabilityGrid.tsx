"use client";

import { useTransition, useState } from "react";
import { DAYS, SHIFTS, type AvailStatus, type ShiftKey } from "@/lib/scheduler";
import { setAvailabilityCellAction, setFridaySaturdayVacationAction } from "@/app/actions/availability";

const OPTIONS: { value: AvailStatus; symbol: string }[] = [
  { value: "can", symbol: "✓" },
  { value: "prefer_not", symbol: "–" },
  { value: "cant", symbol: "✕" },
];
const ON_CLASS: Record<AvailStatus, string> = {
  can: "bg-ok-soft text-ok",
  prefer_not: "bg-warn-soft text-warn",
  cant: "bg-crit-soft text-crit",
};

export default function AvailabilityGrid({
  workerId,
  availability,
}: {
  workerId: string;
  availability: Record<string, Partial<Record<ShiftKey, AvailStatus>>>;
}) {
  const [local, setLocal] = useState(availability);
  const [pending, startTransition] = useTransition();

  function setCell(day: string, shiftKey: ShiftKey, status: AvailStatus) {
    setLocal((prev) => ({ ...prev, [day]: { ...prev[day], [shiftKey]: status } }));
    startTransition(() => setAvailabilityCellAction(workerId, day, shiftKey, status));
  }

  function takeVacation() {
    setLocal((prev) => ({
      ...prev,
      Friday: { ...prev.Friday, morning: "cant", evening: "cant" },
      Saturday: { ...prev.Saturday, morning: "cant", evening: "cant" },
    }));
    startTransition(() => setFridaySaturdayVacationAction(workerId));
  }

  return (
    <div>
      <div className="flex justify-end mb-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={takeVacation}
          className="text-[12px] px-3 py-1.5 rounded-md bg-crit-soft text-crit hover:bg-crit hover:text-white disabled:opacity-60"
          title="Blocks Morning + Evening on Friday & Saturday. Mid, Bridge and Deep Night are left as-is."
        >
          🏖️ Weekend off (Fri+Sat)
        </button>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-[12.8px]">
        <thead>
          <tr className="bg-surface-2">
            <th className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">Shift</th>
            {DAYS.map((d) => (
              <th key={d} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">
                {d.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHIFTS.map((s) => (
            <tr key={s.key}>
              <td className="px-2.5 py-2 border-b border-border whitespace-nowrap">
                <div className="flex flex-col gap-px">
                  <span>{s.label}</span>
                  <span className="text-[10.5px] text-text-muted font-normal">{s.time}</span>
                </div>
              </td>
              {DAYS.map((day) => {
                const current = local[day]?.[s.key] ?? "can";
                return (
                  <td key={day} className="px-2.5 py-2 border-b border-border">
                    <div className="inline-flex border border-border rounded-md overflow-hidden">
                      {OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCell(day, s.key, opt.value)}
                          className={`px-2 py-1 text-[11px] border-r border-border last:border-r-0 ${
                            current === opt.value ? ON_CLASS[opt.value] : "bg-surface text-text-muted"
                          }`}
                          title={opt.value}
                        >
                          {opt.symbol}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
