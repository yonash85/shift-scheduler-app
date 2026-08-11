"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { saveNote } from "@/lib/data";

export async function saveMyNoteAction(body: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  await saveNote(session.workerId, body);
  revalidatePath("/me/notes");
  revalidatePath("/admin/notes");
}
