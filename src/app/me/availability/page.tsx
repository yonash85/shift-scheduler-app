import { getSession } from "@/lib/session";
import { getWorkers, getCurrentWeek, getAvailability } from "@/lib/data";
import AvailabilityGrid from "@/components/AvailabilityGrid";

export default async function MyAvailabilityPage() {
  const session = await getSession();
  const workers = await getWorkers();
  const week = await getCurrentWeek();
  const availability = week ? await getAvailability(week.id, workers) : {};

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-text">Set your availability — {week?.label ?? "no active week"}</h2>
      <p className="text-[12.5px] text-text-muted mb-3">
        Mark each shift on each day: <b>Can</b> work, <b>Prefer not</b> (avoided unless needed), or <b>Can&apos;t</b> (never scheduled).
      </p>
      <AvailabilityGrid workerId={session!.workerId} availability={availability[session!.workerId] ?? {}} />
    </div>
  );
}
