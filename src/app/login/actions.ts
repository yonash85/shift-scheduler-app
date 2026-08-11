"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { setSessionCookie } from "@/lib/session";

export async function login(formData: FormData): Promise<{ error: string } | void> {
  const workerId = String(formData.get("workerId") || "");
  const pin = String(formData.get("pin") || "");
  if (!workerId || !pin) {
    return { error: "Pick your name and enter your PIN." };
  }

  const { data: worker, error } = await supabaseAdmin()
    .from("workers")
    .select("id, pin_hash, is_admin, excluded")
    .eq("id", workerId)
    .maybeSingle();

  if (error || !worker) {
    return { error: "Couldn't find that account." };
  }
  if (worker.excluded) {
    return { error: "This account has been deactivated. Ask your admin." };
  }

  const ok = await bcrypt.compare(pin, worker.pin_hash);
  if (!ok) {
    return { error: "Wrong PIN." };
  }

  await setSessionCookie({ workerId: worker.id, isAdmin: worker.is_admin });
  redirect("/");
}
