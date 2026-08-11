import { getWorkers, getTeamNote, getAllNotes } from "@/lib/data";
import { InlineTextArea } from "@/components/InlineControl";
import { saveTeamNoteAction } from "./actions";

export default async function AdminNotesPage() {
  const [workers, teamNote, notes] = await Promise.all([getWorkers(), getTeamNote(), getAllNotes()]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Team announcement</h2>
        <p className="text-[12.5px] text-text-muted mb-3">Shown to every worker on their dashboard.</p>
        <InlineTextArea value={teamNote} action={saveTeamNoteAction} />
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">Worker notes</h2>
        <p className="text-[12.5px] text-text-muted mb-3">Personal notes each worker leaves for you.</p>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12.8px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide w-40">Worker</th>
                <th className="text-left px-2.5 py-2 border-b border-border text-[11px] uppercase tracking-wide">Note</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap">{w.name}</td>
                  <td className="px-2.5 py-1.5 border-b border-border text-text-muted">{notes[w.id] || <span className="italic">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
