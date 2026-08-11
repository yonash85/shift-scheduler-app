import { DAYS, SHIFTS } from "@/lib/scheduler";

export interface ScheduleWorkerRef {
  id: string;
  name: string;
  lead: "primary" | "backup" | null;
}

export default function ScheduleTable({
  assignments,
  workers,
  meId,
}: {
  assignments: Record<string, string[]>;
  workers: ScheduleWorkerRef[];
  meId?: string;
}) {
  const byId = new Map(workers.map((w) => [w.id, w]));
  const isLead = (w: ScheduleWorkerRef) => w.lead === "primary" || w.lead === "backup";

  const cellBg: Record<string, string> = {
    morning: "bg-sh-morning-soft text-sh-morning",
    mid: "bg-sh-mid-soft text-sh-mid",
    evening: "bg-sh-evening-soft text-sh-evening",
    bridge: "bg-sh-bridge-soft text-sh-bridge",
    deepnight: "bg-sh-deepnight-soft text-sh-deepnight",
  };

  return (
    <div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-[12.5px] min-w-[880px]">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">Shift</th>
              {DAYS.map((d) => (
                <th key={d} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide min-w-[120px]">
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
                  const ids = assignments[`${d}|${s.key}`] || [];
                  if (s.weekendOnly && d !== 0 && d !== 6) {
                    return (
                      <td key={day} className="px-2.5 py-2 border-b border-border align-top text-text-muted italic text-[11.5px]">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={day} className="px-2.5 py-2 border-b border-border align-top">
                      {ids.length === 0 ? (
                        <span className="text-crit italic text-[11.5px]">unfilled</span>
                      ) : (
                        ids.map((id) => {
                          const w = byId.get(id);
                          return (
                            <div
                              key={id}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11.8px] my-0.5 mr-1 whitespace-nowrap ${cellBg[s.key]} ${
                                meId && id === meId ? "outline outline-2 outline-accent font-bold" : ""
                              }`}
                            >
                              {w && isLead(w) && <span className="text-[9.5px]">★</span>}
                              {w?.name ?? "?"}
                            </div>
                          );
                        })
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-text-muted mt-2">★ = Enterprise Lead (primary or backup) on that shift.</p>
    </div>
  );
}
