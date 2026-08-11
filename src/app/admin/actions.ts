"use server";

import { revalidatePath } from "next/cache";
import { generateSchedule } from "@/lib/scheduler";
import { getCurrentWeek, getWorkers, getAvailability, getRules, toEngineWorker, saveSchedule } from "@/lib/data";

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
