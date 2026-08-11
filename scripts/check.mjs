import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: workers } = await db.from("workers").select("id,name");
const nameById = Object.fromEntries(workers.map((w) => [w.id, w.name]));
const { data: sched } = await db.from("schedules").select("assignments");
const a = sched[0].assignments;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

console.log("--- Same-day Deep Night + Evening (the one allowed double-shift) ---");
let count = 0;
for (let d = 0; d < 7; d++) {
  const eve = new Set(a[d + "|evening"] || []);
  (a[d + "|deepnight"] || []).forEach((id) => {
    if (eve.has(id)) {
      console.log(DAYS[d], ":", nameById[id]);
      count++;
    }
  });
}
console.log("total:", count);
