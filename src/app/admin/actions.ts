"use server";

import { revalidatePath } from "next/cache";
import { generateSchedule, computePerWorker, validateAssignments, type ShiftKey } from "@/lib/scheduler";
import { getCurrentWeek, getWorkers, getAvailability, getRules, toEngineWorker, saveSchedule, getSchedule } from "@/lib/data";
import { getSession } from "@/lib/session";

export async function generateAction() {
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week — create one first.");
  const workerRows = await getWorkers();
  const availability = await getAvailability(week.id, workerRows);
  const rules = await getRules();
  const workers = workerRows.map(toEngineWorker);

  const result = generateSchedule(workers, availability, rules);
  await saveSchedule(week.id, result.assignments, result.warnings, result.perWorker);
  revalidatePath("/admin");
  revalidatePath("/me");
}

async function requireAdmin() {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Admin only");
}

/** Shared by add/remove: reloads the schedule, applies a mutation to its assignments,
 * recomputes per-worker counts and re-validates the whole thing, then saves. */
async function mutateSlot(day: number, shiftKey: ShiftKey, mutate: (ids: string[]) => string[]) {
  await requireAdmin();
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  const schedule = await getSchedule(week.id);
  if (!schedule) throw new Error("No schedule generated yet this week");

  const workerRows = await getWorkers();
  const workers = workerRows.map(toEngineWorker);
  const availability = await getAvailability(week.id, workerRows);
  const rules = await getRules();

  const key = `${day}|${shiftKey}`;
  const assignments = { ...schedule.assignments, [key]: mutate(schedule.assignments[key] || []) };
  const perWorker = computePerWorker(workers, assignments);
  const warnings = validateAssignments(workers, availability, rules, assignments);

  await saveSchedule(week.id, assignments, warnings, perWorker);
  revalidatePath("/admin");
  revalidatePath("/me");
}

export async function addToSlotAction(day: number, shiftKey: ShiftKey, workerId: string) {
  await mutateSlot(day, shiftKey, (ids) => (ids.includes(workerId) ? ids : [...ids, workerId]));
}

export async function removeFromSlotAction(day: number, shiftKey: ShiftKey, workerId: string) {
  await mutateSlot(day, shiftKey, (ids) => ids.filter((id) => id !== workerId));
}
