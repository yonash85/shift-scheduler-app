"use server";

import { revalidatePath } from "next/cache";
import { saveTeamNote } from "@/lib/data";

export async function saveTeamNoteAction(note: string) {
  await saveTeamNote(note);
  revalidatePath("/admin/notes");
  revalidatePath("/me");
}
