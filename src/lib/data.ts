import { supabaseAdmin } from "./supabase";
import type { Availability, Rules, ShiftKey, Team, LeadRole, Worker } from "./scheduler";
import { DAYS } from "./scheduler";

const SHIFT_KEYS: ShiftKey[] = ["morning", "mid", "evening", "bridge", "deepnight"];

export interface WorkerRow {
  id: string;
  name: string;
  team: Team;
  lead: LeadRole;
  quota: number;
  night_cap_override: number | null;
  excluded: boolean;
  is_admin: boolean;
}

export function toEngineWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    lead: row.lead,
    quota: row.quota,
    nightCap: row.night_cap_override,
    excluded: row.excluded,
  };
}

export async function getWorkers(): Promise<WorkerRow[]> {
  const { data, error } = await supabaseAdmin().from("workers").select("*").order("name");
  if (error) throw error;
  return data as WorkerRow[];
}

export async function getWorkerById(id: string): Promise<WorkerRow | null> {
  const { data, error } = await supabaseAdmin().from("workers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as WorkerRow | null;
}

export async function createWorker(input: {
  name: string;
  team: Team;
  lead: LeadRole;
  quota: number;
  pinHash: string;
}): Promise<WorkerRow> {
  const { data, error } = await supabaseAdmin()
    .from("workers")
    .insert({ name: input.name, team: input.team, lead: input.lead, quota: input.quota, pin_hash: input.pinHash })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkerRow;
}

export async function updateWorker(id: string, fields: Partial<Pick<WorkerRow, "lead" | "quota" | "excluded" | "night_cap_override">>): Promise<void> {
  const { error } = await supabaseAdmin().from("workers").update(fields).eq("id", id);
  if (error) throw error;
}

export async function setWorkerPin(id: string, pinHash: string): Promise<void> {
  const { error } = await supabaseAdmin().from("workers").update({ pin_hash: pinHash }).eq("id", id);
  if (error) throw error;
}

export async function deleteWorker(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("workers").delete().eq("id", id);
  if (error) throw error;
}

export async function getCurrentWeek(): Promise<{ id: string; label: string; starts_on: string } | null> {
  const { data: settings, error } = await supabaseAdmin().from("settings").select("current_week_id").eq("id", 1).single();
  if (error) throw error;
  if (!settings?.current_week_id) return null;
  const { data: week, error: werr } = await supabaseAdmin().from("weeks").select("*").eq("id", settings.current_week_id).single();
  if (werr) throw werr;
  return week;
}

/** Creates a new week and makes it the current one. */
export async function createWeek(label: string, startsOn: string): Promise<{ id: string }> {
  const db = supabaseAdmin();
  const { data: week, error } = await db.from("weeks").insert({ label, starts_on: startsOn }).select("id").single();
  if (error) throw error;
  await db.from("settings").update({ current_week_id: week.id }).eq("id", 1);
  return week;
}

export async function getRules(): Promise<Rules> {
  const { data, error } = await supabaseAdmin().from("settings").select("rules").eq("id", 1).single();
  if (error) throw error;
  return data.rules as Rules;
}

export async function saveRules(rules: Rules): Promise<void> {
  const { error } = await supabaseAdmin().from("settings").update({ rules }).eq("id", 1);
  if (error) throw error;
}

export async function getTeamNote(): Promise<string> {
  const { data, error } = await supabaseAdmin().from("settings").select("team_note").eq("id", 1).single();
  if (error) throw error;
  return data.team_note ?? "";
}

export async function saveTeamNote(note: string): Promise<void> {
  const { error } = await supabaseAdmin().from("settings").update({ team_note: note }).eq("id", 1);
  if (error) throw error;
}

/** Loads a week's availability into the engine's nested shape, defaulting missing cells to 'can'. */
export async function getAvailability(weekId: string, workers: WorkerRow[]): Promise<Availability> {
  const { data, error } = await supabaseAdmin().from("availability").select("*").eq("week_id", weekId);
  if (error) throw error;
  const availability: Availability = {};
  workers.forEach((w) => {
    availability[w.id] = {};
    DAYS.forEach((d) => {
      availability[w.id][d] = {};
      SHIFT_KEYS.forEach((sk) => (availability[w.id][d]![sk] = "can"));
    });
  });
  (data ?? []).forEach((row: { worker_id: string; day: string; shift_key: ShiftKey; status: "can" | "prefer_not" | "cant" }) => {
    if (!availability[row.worker_id]) return;
    if (!availability[row.worker_id][row.day]) availability[row.worker_id][row.day] = {};
    availability[row.worker_id][row.day]![row.shift_key] = row.status;
  });
  return availability;
}

export async function setAvailabilityCell(
  weekId: string,
  workerId: string,
  day: string,
  shiftKey: ShiftKey,
  status: "can" | "prefer_not" | "cant"
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("availability")
    .upsert({ week_id: weekId, worker_id: workerId, day, shift_key: shiftKey, status });
  if (error) throw error;
}

export async function getNote(workerId: string): Promise<string> {
  const { data, error } = await supabaseAdmin().from("notes").select("body").eq("worker_id", workerId).maybeSingle();
  if (error) throw error;
  return data?.body ?? "";
}

export async function saveNote(workerId: string, body: string): Promise<void> {
  const { error } = await supabaseAdmin().from("notes").upsert({ worker_id: workerId, body, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getAllNotes(): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin().from("notes").select("worker_id, body");
  if (error) throw error;
  const out: Record<string, string> = {};
  (data ?? []).forEach((r: { worker_id: string; body: string }) => (out[r.worker_id] = r.body));
  return out;
}

export interface ScheduleRow {
  week_id: string;
  assignments: Record<string, string[]>;
  warnings: { level: "ok" | "warn" | "crit"; msg: string }[];
  per_worker: Record<string, { morning: number; mid: number; evening: number; bridge: number; deepnight: number; total: number; night: number }>;
  generated_at: string;
  published: boolean;
}

export async function getSchedule(weekId: string): Promise<ScheduleRow | null> {
  const { data, error } = await supabaseAdmin().from("schedules").select("*").eq("week_id", weekId).maybeSingle();
  if (error) throw error;
  return data as ScheduleRow | null;
}

export async function saveSchedule(
  weekId: string,
  assignments: Record<string, string[]>,
  warnings: { level: "ok" | "warn" | "crit"; msg: string }[],
  perWorker: Record<string, unknown>,
  published: boolean
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("schedules")
    .upsert({ week_id: weekId, assignments, warnings, per_worker: perWorker, generated_at: new Date().toISOString(), published });
  if (error) throw error;
}

export async function setSchedulePublished(weekId: string, published: boolean): Promise<void> {
  const { error } = await supabaseAdmin().from("schedules").update({ published }).eq("week_id", weekId);
  if (error) throw error;
}
