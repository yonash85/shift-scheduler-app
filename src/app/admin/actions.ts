"use server";

import { revalidatePath } from "next/cache";
import { generateSchedule, computePerWorker, validateAssignments, type ShiftKey } from "@/lib/scheduler";
import { getCurrentWeek, getWorkers, getAvailability, getRules, toEngineWorker, saveSchedule, getSchedule, setSchedulePublished } from "@/lib/data";
import { getSession } from "@/lib/session";

export async function generateAction() {
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week — create one first.");
  const workerRows = await getWorkers();
  const availability = await getAvailability(week.id, workerRows);
  const rules = await getRules();
  const workers = workerRows.map(toEngineWorker);

  const result = generateSchedule(workers, availability, rules);
  // Always saved hidden — a fresh generate is a draft to review, not something to push
  // straight to the team. Publish is a separate, explicit action below.
  await saveSchedule(week.id, result.assignments, result.warnings, result.perWorker, false);
  revalidatePath("/admin");
  revalidatePath("/me");
}

async function requireAdmin() {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Admin only");
}

export async function publishAction() {
  await requireAdmin();
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  await setSchedulePublished(week.id, true);
  revalidatePath("/admin");
  revalidatePath("/me");
}

export async function unpublishAction() {
  await requireAdmin();
  const week = await getCurrentWeek();
  if (!week) throw new Error("No active week");
  await setSchedulePublished(week.id, false);
  revalidatePath("/admin");
  revalidatePath("/me");
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

  // Any manual edit re-hides the schedule, same as a fresh generate — so a half-finished
  // edit is never visible to the team mid-change. Publish again once it's ready.
  await saveSchedule(week.id, assignments, warnings, perWorker, false);
  revalidatePath("/admin");
  revalidatePath("/me");
}

export async function addToSlotAction(day: number, shiftKey: ShiftKey, workerId: string) {
  await mutateSlot(day, shiftKey, (ids) => (ids.includes(workerId) ? ids : [...ids, workerId]));
}

export async function removeFromSlotAction(day: number, shiftKey: ShiftKey, workerId: string) {
  await mutateSlot(day, shiftKey, (ids) => ids.filter((id) => id !== workerId));
}
