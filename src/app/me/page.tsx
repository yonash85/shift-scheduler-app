import { getSession } from "@/lib/session";
import { getWorkerById, getWorkers, getCurrentWeek, getSchedule, getTeamNote } from "@/lib/data";
import ScheduleTable from "@/components/ScheduleTable";

export default async function MySchedulePage() {
  const session = await getSession();
  const me = await getWorkerById(session!.workerId);
  const week = await getCurrentWeek();
  const schedule = week ? await getSchedule(week.id) : null;
  const workers = await getWorkers();
  const teamNote = await getTeamNote();
  const pool = workers.filter((w) => !w.excluded);

  const myStats = schedule && me ? schedule.per_worker[me.id] : null;

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">
          Hi {me?.name} — here&apos;s {(week?.label ?? "the upcoming week").toLowerCase()}
        </h2>
        {teamNote && <div className="mt-2.5 px-2.5 py-2 rounded-md bg-ok-soft text-ok text-[12.5px]">{teamNote}</div>}
        {!schedule && <p className="text-[12.5px] text-text-muted mt-2">No schedule has been generated yet. Check back after the admin publishes it.</p>}
        {myStats && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 mt-3">
            <Stat label="Total shifts" value={myStats.total} />
            <Stat label="Morning" value={myStats.morning} />
            <Stat label="Evening" value={myStats.evening} />
            <Stat label="Night (Bridge+Deep)" value={myStats.night} />
          </div>
        )}
      </div>

      {schedule && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-1">Full team schedule</h2>
          <p className="text-[12.5px] text-text-muted mb-3">Your shifts are highlighted.</p>
          <ScheduleTable assignments={schedule.assignments} workers={pool} meId={me?.id} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2.5">
      <div className="font-bold tabular-nums text-[20px]">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
