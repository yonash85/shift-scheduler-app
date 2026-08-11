"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getCurrentWeek, setAvailabilityCell } from "@/lib/data";
import type { AvailStatus, ShiftKey } from "@/lib/scheduler";

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

// Quick "weekend off" action: blocks only Morning + Evening on Friday & Saturday.
// Mid, Bridge and Deep Night are left untouched — those are separately staffed
// (tight night-shift math, dedicated Mid coverage) and shouldn't be casually
// self-blocked through a one-click shortcut.
export async function setFridaySaturdayVacationAction(workerId: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!session.isAdmin && session.workerId !== workerId) throw new Error("Not authorized");
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  const cells: [string, ShiftKey][] = [
    ["Friday", "morning"],
    ["Friday", "evening"],
    ["Saturday", "morning"],
    ["Saturday", "evening"],
  ];
  for (const [day, shiftKey] of cells) {
    await setAvailabilityCell(week.id, workerId, day, shiftKey, "cant");
  }
  revalidatePath("/admin/availability");
  revalidatePath("/me/availability");
}
