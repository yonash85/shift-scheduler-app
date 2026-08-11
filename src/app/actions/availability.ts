"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getCurrentWeek, setAvailabilityCell } from "@/lib/data";
import { SHIFTS, type AvailStatus, type ShiftKey } from "@/lib/scheduler";

export async function setAvailabilityCellAction(workerId: string, day: string, shiftKey: ShiftKey, status: AvailStatus) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!session.isAdmin && session.workerId !== workerId) throw new Error("Not authorized");
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  await setAvailabilityCell(week.id, workerId, day, shiftKey, status);
  revalidatePath("/admin/availability");
  revalidatePath("/me/availability");
}

// Vacation: for each selected day, blocks every shift type that day (the whole
// day off), for this week only. Days not selected are left untouched.
export async function setVacationDaysAction(workerId: string, days: string[]) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!session.isAdmin && session.workerId !== workerId) throw new Error("Not authorized");
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  for (const day of days) {
    for (const shift of SHIFTS) {
      await setAvailabilityCell(week.id, workerId, day, shift.key, "cant");
    }
  }
  revalidatePath("/admin/availability");
  revalidatePath("/me/availability");
}
