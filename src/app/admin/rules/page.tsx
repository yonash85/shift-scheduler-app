import { getRules } from "@/lib/data";
import type { Rules } from "@/lib/scheduler";
import { InlineNumber, InlineCheckbox } from "@/components/InlineControl";
import { setRuleAction } from "./actions";

function NumField({ label, k, value, min = 0, max = 20 }: { label: string; k: keyof Rules; value: number; min?: number; max?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <InlineNumber id={k} value={value} min={min} max={max} action={setRuleAction} />
    </label>
  );
}

export default async function RulesPage() {
  const r = await getRules();

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Morning &amp; Evening coverage (surplus-eligible)</h2>
        <p className="text-[12.5px] text-text-muted mb-3">These drive the generator&apos;s surplus ladder.</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          <NumField label="Morning min / day" k="morningMin" value={r.morningMin} max={10} />
          <NumField label="Morning max (surplus)" k="morningMax" value={r.morningMax} max={10} />
          <NumField label="Evening min, weekday" k="eveningWeekdayMin" value={r.eveningWeekdayMin} max={10} />
          <NumField label="Evening max, weekday" k="eveningWeekdayMax" value={r.eveningWeekdayMax} max={10} />
          <NumField label="Evening min, Sun/Sat" k="eveningWeekendMin" value={r.eveningWeekendMin} max={10} />
          <NumField label="Evening max, Sun/Sat" k="eveningWeekendMax" value={r.eveningWeekendMax} max={12} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Fixed headcounts (not surplus-eligible)</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Mid, Bridge and Deep Night are exact required counts every day — changing these changes the exact number required, not a ceiling. Deep Night always
          includes a lead.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          <NumField label="Mid, Sun/Sat" k="midMin" value={r.midMin} max={5} />
          <NumField label="Bridge / day" k="bridgeMin" value={r.bridgeMin} max={5} />
          <NumField label="Deep Night / day" k="deepnightMin" value={r.deepnightMin} max={5} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Night limits (hard rule)</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Israelis always get exactly 1 night/week, no exceptions. Serbians default to 1 too — up to this many may take a 2nd, chosen automatically
          wherever it&apos;s needed to cover a slot. Lock a specific Serbian in for the 2nd slot from their row in People.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          <NumField label="Serbians allowed a 2nd night / week" k="maxSecondNightSerbians" value={r.maxSecondNightSerbians} max={13} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Quotas &amp; soft preferences</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 items-center mb-2">
          <NumField label="Default weekly quota" k="defaultQuota" value={r.defaultQuota} max={14} />
          <label className="flex items-center gap-1.5 text-[13px] text-text pt-4">
            <InlineCheckbox id="israeliWeekendSoft" checked={r.israeliWeekendSoft} action={setRuleAction} />
            Avoid Israeli Fri+Sat back-to-back (soft)
          </label>
        </div>
        <p className="text-[11.5px] text-text-muted">
          Per-person weekly quota is set on that person&apos;s row in People. Sunday &amp; Monday Morning also softly favors Israelis over Serbians — a
          preference, not a hard rule.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text mb-3">Fixed logic (reference)</h2>
        <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[12.5px]">
          <b>Leadership</b>
          <span>Morning, Mid, Evening and Deep Night each need ≥1 Enterprise Lead. Bridge doesn&apos;t.</span>
          <b>Night requirement</b>
          <span>Every worker gets exactly 1 night shift per week before any 2nd night is handed out.</span>
          <b>Morning requirement</b>
          <span>Every worker gets ≥1 Morning shift per week.</span>
          <b>Rest rules</b>
          <span>No overlapping/forbidden same-day shifts; Bridge+Deep Night same day forbidden; night → next-day Morning forbidden; Friday night → Saturday Mid forbidden.</span>
          <b>Availability</b>
          <span>Any shift marked &quot;Can&apos;t&quot; for a worker is never assigned to them, full stop.</span>
          <b>Surplus order</b>
          <span>Sat/Sun Evening (up to max) → Mon–Fri Evening (up to max) → Morning every day (up to max) → any leftover keeps stacking onto Sat/Sun Evening, uncapped.</span>
          <b>Best-of-many</b>
          <span>Each generate builds 15 candidate schedules and keeps the cleanest one.</span>
        </div>
      </div>
    </div>
  );
}
