"use client";

import { useTransition, useState } from "react";
import { DAYS, SHIFTS, type AvailStatus, type ShiftKey } from "@/lib/scheduler";
import { setAvailabilityCellAction, setVacationDaysAction, clearVacationDaysAction } from "@/app/actions/availability";

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
  const [vacationDays, setVacationDays] = useState<Set<string>>(new Set());

  function setCell(day: string, shiftKey: ShiftKey, status: AvailStatus) {
    setLocal((prev) => ({ ...prev, [day]: { ...prev[day], [shiftKey]: status } }));
    startTransition(() => setAvailabilityCellAction(workerId, day, shiftKey, status));
  }

  function toggleVacationDay(day: string) {
    setVacationDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function applyVacation() {
    if (vacationDays.size === 0) return;
    const days = [...vacationDays];
    setLocal((prev) => {
      const next = { ...prev };
      for (const day of days) {
        const dayStatuses: Partial<Record<ShiftKey, AvailStatus>> = { ...next[day] };
        SHIFTS.forEach((s) => (dayStatuses[s.key] = "cant"));
        next[day] = dayStatuses;
      }
      return next;
    });
    startTransition(() => setVacationDaysAction(workerId, days));
    setVacationDays(new Set());
  }

  function clearVacation() {
    if (vacationDays.size === 0) return;
    const days = [...vacationDays];
    setLocal((prev) => {
      const next = { ...prev };
      for (const day of days) {
        const dayStatuses: Partial<Record<ShiftKey, AvailStatus>> = { ...next[day] };
        SHIFTS.forEach((s) => (dayStatuses[s.key] = "can"));
        next[day] = dayStatuses;
      }
      return next;
    });
    startTransition(() => clearVacationDaysAction(workerId, days));
    setVacationDays(new Set());
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
        <span className="text-[11.5px] text-text-muted mr-1">🏖️ Vacation — pick days, then apply or remove (blocks/unblocks every shift that day):</span>
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleVacationDay(day)}
            className={`text-[11.5px] px-2.5 py-1 rounded-md border ${
              vacationDays.has(day) ? "bg-crit text-white border-crit" : "bg-surface text-text-muted border-border hover:bg-surface-2"
            }`}
          >
            {day.slice(0, 3)}
          </button>
        ))}
        <button
          type="button"
          disabled={pending || vacationDays.size === 0}
          onClick={applyVacation}
          className="text-[12px] px-3 py-1.5 rounded-md bg-crit-soft text-crit hover:bg-crit hover:text-white disabled:opacity-40"
        >
          Apply vacation
        </button>
        <button
          type="button"
          disabled={pending || vacationDays.size === 0}
          onClick={clearVacation}
          className="text-[12px] px-3 py-1.5 rounded-md bg-ok-soft text-ok hover:bg-ok hover:text-white disabled:opacity-40"
        >
          Remove vacation
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
