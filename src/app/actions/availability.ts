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
