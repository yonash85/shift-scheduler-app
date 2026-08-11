import Link from "next/link";
import { getWorkers, getCurrentWeek, getAvailability } from "@/lib/data";
import { DAYS, SHIFTS } from "@/lib/scheduler";
import AvailabilityGrid from "@/components/AvailabilityGrid";

function countFlags(av: Record<string, Partial<Record<string, string>>>) {
  let cant = 0,
    prefer = 0;
  DAYS.forEach((d) => SHIFTS.forEach((s) => {
    const v = av[d]?.[s.key] ?? "can";
    if (v === "cant") cant++;
    else if (v === "prefer_not") prefer++;
  }));
  return { cant, prefer };
}

export default async function AdminAvailabilityPage({ searchParams }: { searchParams: Promise<{ worker?: string }> }) {
  const [{ worker: selectedId }, workers, week] = await Promise.all([searchParams, getWorkers(), getCurrentWeek()]);
  const availability = week ? await getAvailability(week.id, workers) : {};
  const active = selectedId ?? workers[0]?.id;
  const activeWorker = workers.find((w) => w.id === active);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Team availability — {week?.label ?? "no active week"}</h2>
        <p className="text-[12.5px] text-text-muted mb-3">Pick someone to view or edit their per-shift availability.</p>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12.8px]">
            <thead>
              <tr className="bg-surface-2">
                {["Worker", "Can't", "Prefer not", ""].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const f = countFlags(availability[w.id] ?? {});
                return (
                  <tr key={w.id}>
                    <td className="px-2.5 py-1.5 border-b border-border">
                      {w.name}
                      {w.excluded && <span className="ml-1.5 text-[10px] bg-surface-3 rounded px-1.5 py-0.5">excluded</span>}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{f.cant}/35</td>
                    <td className="px-2.5 py-1.5 border-b border-border tabular-nums">{f.prefer}/35</td>
                    <td className="px-2.5 py-1.5 border-b border-border">
                      <Link
                        href={`/admin/availability?worker=${w.id}`}
                        className={`text-[12px] px-2.5 py-1 rounded-md border border-border ${w.id === active ? "bg-accent-soft text-accent-strong font-semibold" : "bg-surface-2 hover:bg-surface-3"}`}
                      >
                        {w.id === active ? "Viewing" : "View / edit"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeWorker && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-1">{activeWorker.name}&apos;s availability</h2>
          <p className="text-[12.5px] text-text-muted mb-3">Green = Can, amber = Prefer not, red = Can&apos;t. Editable here as admin.</p>
          <AvailabilityGrid workerId={activeWorker.id} availability={availability[activeWorker.id] ?? {}} />
        </div>
      )}
    </div>
  );
}
