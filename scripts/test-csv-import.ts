import fs from "fs";
import { getWorkers } from "../src/lib/data";
import { parseAvailabilityCsv } from "../src/lib/csvImport";

async function main() {
  const csvText = fs.readFileSync("C:/Users/YonatanSchweitzer/Downloads/All Shifts - Availability (1).csv", "utf-8");
  const workers = await getWorkers();
  const result = parseAvailabilityCsv(csvText, workers);

  console.log(`Matched blocks (${result.matched.length}):`);
  result.matched.forEach((m) => console.log(`  "${m.blockName}" -> ${m.workerName}`));
  console.log(`\nUnmatched blocks (${result.unmatched.length}):`, result.unmatched);
  console.log(`\nTotal cell updates: ${result.updates.length}`);

  const byWorkerId: Record<string, typeof result.updates> = {};
  result.updates.forEach((u) => {
    (byWorkerId[u.workerId] ??= []).push(u);
  });

  const spotCheck = ["Neta", "Yonatan", "Marko", "Nesta", "Filip", "Stefan"];
  for (const nameFrag of spotCheck) {
    const w = workers.find((w) => w.name.toLowerCase().startsWith(nameFrag.toLowerCase()));
    if (!w) continue;
    const ups = byWorkerId[w.id] || [];
    console.log(`\n--- ${w.name} (${ups.length} cells) ---`);
    const bySk: Record<string, Record<string, string>> = {};
    ups.forEach((u) => {
      (bySk[u.shiftKey] ??= {})[u.day] = u.status;
    });
    for (const sk of ["morning", "mid", "evening", "bridge", "deepnight"]) {
      const row = bySk[sk];
      if (!row) continue;
      console.log(`  ${sk}: ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => row[d] ?? "-").join(", ")}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
