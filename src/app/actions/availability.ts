"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getCurrentWeek, getWorkers, setAvailabilityCell, setAvailabilityCells } from "@/lib/data";
import { SHIFTS, type AvailStatus, type ShiftKey } from "@/lib/scheduler";
import { parseAvailabilityCsv } from "@/lib/csvImport";

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

// Undo: for each selected day, resets every shift type back to "can" — the exact reverse
// of setVacationDaysAction, so a vacation applied by mistake doesn't need clearing cell by cell.
export async function clearVacationDaysAction(workerId: string, days: string[]) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!session.isAdmin && session.workerId !== workerId) throw new Error("Not authorized");
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  for (const day of days) {
    for (const shift of SHIFTS) {
      await setAvailabilityCell(week.id, workerId, day, shift.key, "can");
    }
  }
  revalidatePath("/admin/availability");
  revalidatePath("/me/availability");
}

export interface CsvImportSummary {
  matched: { blockName: string; workerName: string }[];
  unmatched: string[];
  cellsUpdated: number;
}

/** Imports a per-person weekly availability CSV (the team's real planning-sheet export) —
 * matches each person's block to an existing worker by name and overwrites their availability
 * for this week. Doesn't touch anyone the sheet has no block for, and reports (rather than
 * guesses at) any block name that didn't match a worker. */
export async function importAvailabilityCsvAction(csvText: string): Promise<CsvImportSummary> {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Admin only");
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  const workers = await getWorkers();

  const { updates, matched, unmatched } = parseAvailabilityCsv(csvText, workers);
  await setAvailabilityCells(week.id, updates);
  revalidatePath("/admin/availability");
  revalidatePath("/me/availability");
  return { matched, unmatched, cellsUpdated: updates.length };
}
