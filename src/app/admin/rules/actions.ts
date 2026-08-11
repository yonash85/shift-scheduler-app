"use server";

import { revalidatePath } from "next/cache";
import { getRules, saveRules } from "@/lib/data";
import type { Rules } from "@/lib/scheduler";

export async function setRuleAction(key: keyof Rules, value: number | boolean) {
  const rules = await getRules();
  const next: Rules = { ...rules, [key]: value };
  await saveRules(next);
  revalidatePath("/admin/rules");
  revalidatePath("/admin");
}
