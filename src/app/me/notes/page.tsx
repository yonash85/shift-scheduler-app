import { getSession } from "@/lib/session";
import { getNote, getTeamNote } from "@/lib/data";
import { InlineTextArea } from "@/components/InlineControl";
import { saveMyNoteAction } from "./actions";

export default async function MyNotesPage() {
  const session = await getSession();
  const [note, teamNote] = await Promise.all([getNote(session!.workerId), getTeamNote()]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text">My notes</h2>
        <p className="text-[12.5px] text-text-muted mb-3">
          Anything you want the admin to know — e.g. &quot;on vacation the 20th&quot;, &quot;prefer evenings this month&quot;. Visible to admin.
        </p>
        <InlineTextArea value={note} action={saveMyNoteAction} />
      </div>
      {teamNote && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-1">Team announcement</h2>
          <p className="text-[13px] text-text-muted">{teamNote}</p>
        </div>
      )}
    </div>
  );
}
