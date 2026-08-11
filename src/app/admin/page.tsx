import { getCurrentWeek, getWorkers, getSchedule } from "@/lib/data";
import GenerateButton from "@/components/GenerateButton";
import ScheduleTable from "@/components/ScheduleTable";

const LEVEL_STYLE: Record<string, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  crit: "bg-crit-soft text-crit",
};
const LEVEL_LABEL: Record<string, string> = { ok: "OK", warn: "Note", crit: "Conflict" };

export default async function AdminDashboardPage() {
  const week = await getCurrentWeek();
  const workers = await getWorkers();
  const schedule = week ? await getSchedule(week.id) : null;
  const pool = workers.filter((w) => !w.excluded);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-text">Generate {week ? week.label : "next week"}&apos;s schedule</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              Runs the rule engine against current People, Availability and Rules — evaluates several candidates and keeps the cleanest one.
            </p>
          </div>
          <GenerateButton />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 mt-4">
          <Stat label="Active workers" value={pool.length} />
          <Stat label="Excluded / unavailable" value={workers.length - pool.length} />
          <Stat label="Total quota shifts" value={pool.reduce((s, w) => s + w.quota, 0)} />
          <Stat
            label="Last generated"
            value={schedule ? new Date(schedule.generated_at).toLocaleString() : "—"}
            small
          />
        </div>
      </div>

      {!schedule && (
        <div className="bg-surface border border-border rounded-xl p-5 text-[13px] text-text-muted">
          No schedule generated yet. Click &quot;Generate schedule&quot; once People, Availability and Rules look right.
        </div>
      )}

      {schedule && (
        <>
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text mb-0.5">Validation summary</h2>
            <p className="text-[12.5px] text-text-muted mb-3">What the engine checked while building this schedule.</p>
            <div className="flex flex-col gap-1.5">
              {schedule.warnings.map((w, i) => (
                <div key={i} className={`flex gap-2 items-start px-2.5 py-2 rounded-md text-[12.5px] ${LEVEL_STYLE[w.level]}`}>
                  <span className="font-bold uppercase text-[10px] tracking-wide shrink-0 pt-px">{LEVEL_LABEL[w.level]}</span>
                  <span>{w.msg}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text mb-3">Schedule — {week?.label}</h2>
            <ScheduleTable assignments={schedule.assignments} workers={pool} />
          </div>

          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text mb-3">Worker summary</h2>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-[12.8px]">
                <thead>
                  <tr className="bg-surface-2">
                    {["Worker", "Total", "Quota", "Morning", "Mid", "Evening", "Bridge", "Deep Night", "Nights"].map((h) => (
                      <th key={h} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pool.map((w) => {
                    const r = schedule.per_worker[w.id] ?? { morning: 0, mid: 0, evening: 0, bridge: 0, deepnight: 0, total: 0, night: 0 };
                    const mismatch = r.total !== w.quota;
                    return (
                      <tr key={w.id}>
                        <td className="px-2.5 py-1.5 border-b border-border">
                          {w.name}
                          {(w.lead === "primary" || w.lead === "backup") && <span className="text-[9.5px] ml-1">★</span>}
                        </td>
                        <td className={`px-2.5 py-1.5 border-b border-border tabular-nums ${mismatch ? "text-crit font-bold" : ""}`}>{r.total}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{w.quota}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.morning}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.mid}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.evening}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.bridge}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.deepnight}</td>
                        <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{r.night}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2.5">
      <div className={`font-bold tabular-nums ${small ? "text-[13px]" : "text-[20px]"}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
