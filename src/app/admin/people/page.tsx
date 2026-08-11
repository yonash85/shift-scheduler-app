import { getWorkers } from "@/lib/data";
import { InlineSelect, InlineNumber, InlineCheckbox } from "@/components/InlineControl";
import { setLeadAction, setQuotaAction, setExcludedAction, setSecondNightAction } from "./actions";
import { ResetPinButton, RemoveWorkerButton } from "./RowActions";
import AddWorkerForm from "./AddWorkerForm";

export default async function PeoplePage() {
  const workers = await getWorkers();

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Add someone</h2>
        <p className="text-[12.5px] text-text-muted mb-3">Add a new team member to the worker pool.</p>
        <AddWorkerForm />
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Team roster</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Excluding someone removes them from schedule generation without deleting their data. &quot;Guarantee 2nd night&quot; only applies to Serbians —
          Israelis are always capped at 1 night/week.
        </p>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12.8px]">
            <thead>
              <tr className="bg-surface-2">
                {["Name", "Team", "Lead role", "Quota", "Guarantee 2nd night", "Excluded", "PIN", ""].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap">{w.name}{w.is_admin && <span className="ml-1.5 text-[10px] bg-accent-soft text-accent-strong rounded px-1.5 py-0.5">admin</span>}</td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <span className="text-[11px] bg-surface-3 rounded px-1.5 py-0.5">{w.team === "israeli" ? "Israeli" : "Serbian"}</span>
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <InlineSelect
                      id={w.id}
                      value={w.lead ?? ""}
                      options={[
                        { value: "", label: "None" },
                        { value: "primary", label: "Primary" },
                        { value: "backup", label: "Backup" },
                      ]}
                      action={setLeadAction}
                    />
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <InlineNumber id={w.id} value={w.quota} min={0} max={14} action={setQuotaAction} />
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    {w.team === "israeli" ? (
                      <span className="text-[11.5px] text-text-muted">n/a — always 1 night max</span>
                    ) : (
                      <InlineCheckbox id={w.id} checked={w.night_cap_override === 2} action={setSecondNightAction} />
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <InlineCheckbox id={w.id} checked={w.excluded} action={setExcludedAction} />
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <ResetPinButton workerId={w.id} name={w.name} />
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-border">
                    <RemoveWorkerButton workerId={w.id} name={w.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
