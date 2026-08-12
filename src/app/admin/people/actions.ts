"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { createWorker, updateWorker, deleteWorker, setWorkerPin } from "@/lib/data";
import type { LeadRole, Team } from "@/lib/scheduler";

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function addWorkerAction(input: { name: string; team: Team; lead: LeadRole; quota: number }): Promise<{ pin: string }> {
  const pin = randomPin();
  const pinHash = await bcrypt.hash(pin, 10);
  await createWorker({ ...input, pinHash });
  revalidatePath("/admin/people");
  return { pin };
}

export async function setNameAction(id: string, name: string) {
  await updateWorker(id, { name });
  revalidatePath("/admin/people");
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  revalidatePath("/admin/availability");
  revalidatePath("/me");
}

export async function setLeadAction(id: string, lead: string) {
  await updateWorker(id, { lead: (lead || null) as LeadRole });
  revalidatePath("/admin/people");
}

export async function setQuotaAction(id: string, quota: number) {
  await updateWorker(id, { quota });
  revalidatePath("/admin/people");
}

export async function setExcludedAction(id: string, excluded: boolean) {
  await updateWorker(id, { excluded });
  revalidatePath("/admin/people");
}

export async function setSecondNightAction(id: string, locked: boolean) {
  await updateWorker(id, { night_cap_override: locked ? 2 : null });
  revalidatePath("/admin/people");
}

export async function removeWorkerAction(id: string) {
  await deleteWorker(id);
  revalidatePath("/admin/people");
}

export async function resetPinAction(id: string): Promise<{ pin: string }> {
  const pin = randomPin();
  const pinHash = await bcrypt.hash(pin, 10);
  await setWorkerPin(id, pinHash);
  revalidatePath("/admin/people");
  return { pin };
}
