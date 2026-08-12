"use server";

import { revalidatePath } from "next/cache";
import { createWeek, updateWeek } from "@/lib/data";
import { getSession } from "@/lib/session";

export async function createWeekAction(label: string, startsOn: string) {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Admin only");
  if (!label.trim()) throw new Error("Label is required");
  if (!startsOn) throw new Error("Start date is required");
  await createWeek(label.trim(), startsOn);
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  revalidatePath("/me");
}

/** Edits a week's label/date in place — same week, same schedule/availability data, just
 * corrected metadata. Doesn't touch which week is current. */
export async function updateWeekAction(weekId: string, label: string, startsOn: string) {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Admin only");
  if (!label.trim()) throw new Error("Label is required");
  if (!startsOn) throw new Error("Start date is required");
  await updateWeek(weekId, label.trim(), startsOn);
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  revalidatePath("/me");
}
