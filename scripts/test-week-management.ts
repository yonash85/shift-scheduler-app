import { createWeek, getAllWeeks, getCurrentWeek } from "../src/lib/data";
import { supabaseAdmin } from "../src/lib/supabase";

async function main() {
  const before = await getCurrentWeek();
  console.log("Current week before:", before?.label, before?.id);

  const created = await createWeek("TEST — delete me", "2099-01-01");
  console.log("Created week id:", created.id);

  const after = await getCurrentWeek();
  console.log("Current week after createWeek (should be the new test week):", after?.label, after?.id);
  console.log("Matches created id:", after?.id === created.id);

  const all = await getAllWeeks();
  console.log("getAllWeeks() includes test week:", all.some((w) => w.id === created.id));
  console.log("getAllWeeks() includes original week:", before ? all.some((w) => w.id === before.id) : "n/a (no prior week)");

  // Clean up: point current_week_id back at the original week, then delete the test week row.
  const db = supabaseAdmin();
  if (before) {
    await db.from("settings").update({ current_week_id: before.id }).eq("id", 1);
  }
  await db.from("weeks").delete().eq("id", created.id);

  const restored = await getCurrentWeek();
  console.log("Current week restored to original:", restored?.id === before?.id);
  const allAfterCleanup = await getAllWeeks();
  console.log("Test week removed from getAllWeeks():", !allAfterCleanup.some((w) => w.id === created.id));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
