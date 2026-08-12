import { getAllWeeks, getCurrentWeek, getSchedule, getWorkers } from "@/lib/data";
import ScheduleTable from "@/components/ScheduleTable";
import NewWeekForm from "./NewWeekForm";
import WeekRow from "./WeekRow";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const [weeks, currentWeek, workers] = await Promise.all([getAllWeeks(), getCurrentWeek(), getWorkers()]);
  const selectedWeek = weeks.find((w) => w.id === weekParam) ?? currentWeek ?? weeks[0] ?? null;
  const schedule = selectedWeek ? await getSchedule(selectedWeek.id) : null;
  const pool = workers.filter((w) => !w.excluded);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text mb-0.5">Start a new week</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Creates a new week and makes it current — the Dashboard, Availability, People and Rules all switch to it. The
          week you&apos;re leaving stays saved here in history, untouched.
        </p>
        <NewWeekForm />
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text mb-3">Weeks</h2>
        {weeks.length === 0 && <p className="text-[12.5px] text-text-muted">No weeks yet.</p>}
        <div className="flex flex-col gap-1.5">
          {weeks.map((w) => (
            <WeekRow key={w.id} week={w} isSelected={w.id === selectedWeek?.id} isCurrent={w.id === currentWeek?.id} />
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text mb-1">Published schedule — {selectedWeek?.label ?? "—"}</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Exactly what the team saw for this week (read-only) — not your current draft, if you&apos;re mid-edit on the
          current week.
        </p>
        {!selectedWeek && <p className="text-[12.5px] text-text-muted">No weeks yet — start one above.</p>}
        {selectedWeek && !schedule && <p className="text-[12.5px] text-text-muted">No schedule was ever generated for this week.</p>}
        {selectedWeek && schedule && !schedule.published && (
          <p className="text-[12.5px] text-text-muted">This week&apos;s schedule was never published — nothing to show here.</p>
        )}
        {selectedWeek && schedule && schedule.published && <ScheduleTable assignments={schedule.assignments} workers={pool} />}
      </div>
    </div>
  );
}
