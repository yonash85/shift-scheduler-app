import { generateSchedule, validateAssignments, emptyAssignments, DAYS, Worker, Availability, Rules, ShiftKey } from "../src/lib/scheduler";

const SHIFT_KEYS: ShiftKey[] = ["morning", "mid", "evening", "bridge", "deepnight"];

let id = 1;
function mk(name: string, team: "israeli" | "serbian", lead: "primary" | "backup" | null = null, quota = 5, nightCap: number | null = null): Worker {
  return { id: "w" + id++, name, team, lead, quota, nightCap, excluded: false };
}

const workers: Worker[] = [
  mk("Neta", "israeli", "primary"),
  mk("Michael", "israeli", "primary"),
  mk("Yonatan", "israeli", "primary"),
  mk("Gal", "israeli", "primary"),
  mk("Yuval", "israeli"),
  mk("Sean", "israeli"),
  mk("Natan", "israeli"),
  mk("Katarina", "serbian", "primary"),
  mk("Veljko", "serbian", "primary"),
  mk("Branislav", "serbian", "primary"),
  mk("Marko G", "serbian", "primary", 6),
  mk("Petar", "serbian", null, 6),
  mk("Bojana", "serbian"),
  mk("Filip", "serbian", null, 6),
  mk("Stefan Cosic", "serbian"),
  mk("Danilo Knezevic", "serbian"),
  mk("Nesta", "serbian"),
  mk("Isidora", "serbian"),
  mk("Jovana", "serbian"),
  mk("Miroslav", "serbian"),
];
const byName = (n: string) => workers.find((w) => w.name === n)!;

const availability: Availability = {};
workers.forEach((w) => {
  availability[w.id] = {};
  DAYS.forEach((d) => {
    availability[w.id][d] = {};
    SHIFT_KEYS.forEach((sk) => (availability[w.id][d][sk] = "can"));
  });
});

const rules: Rules = {
  morningMin: 3, morningMax: 5,
  eveningWeekdayMin: 3, eveningWeekdayMax: 5,
  eveningWeekendMin: 4, eveningWeekendMax: 6,
  midMin: 1, bridgeMin: 1, deepnightMin: 2,
  defaultQuota: 5, maxSecondNightSerbians: 2,
  israeliWeekendSoft: true,
};

// Manually pre-place a few people, exactly like an admin using "+ add" before Generate.
const seed = emptyAssignments();
seed["0|morning"] = [byName("Neta").id]; // Sunday Morning: Neta (lead present)
seed["3|deepnight"] = [byName("Michael").id]; // Wednesday Deep Night: Michael (lead present)
seed["6|evening"] = [byName("Bojana").id, byName("Filip").id]; // Saturday Evening: Bojana, Filip

let seedPreservedFails = 0;
let critRuns = 0;
const RUNS = 60;
for (let i = 0; i < RUNS; i++) {
  const sched = generateSchedule(workers, availability, rules, seed);
  if (sched.warnings.some((w) => w.level === "crit")) critRuns++;

  // The seed must survive untouched in every single attempt's winner.
  if (!sched.assignments["0|morning"].includes(byName("Neta").id)) seedPreservedFails++;
  if (!sched.assignments["3|deepnight"].includes(byName("Michael").id)) seedPreservedFails++;
  if (!sched.assignments["6|evening"].includes(byName("Bojana").id)) seedPreservedFails++;
  if (!sched.assignments["6|evening"].includes(byName("Filip").id)) seedPreservedFails++;

  // Full independent hard-rule audit on the result, same as test-full-audit.ts.
  const findings = validateAssignments(workers, availability, rules, sched.assignments);
  const crits = findings.filter((f) => f.level === "crit");
  if (crits.length > 0) {
    console.log(`run ${i}: CRIT findings:`, crits.map((c) => c.msg));
  }
}

console.log(`Seed-preservation failures (must be 0): ${seedPreservedFails}`);
console.log(`Runs with crit warnings from generateSchedule itself (must be 0): ${critRuns}/${RUNS}`);

// Also sanity-check emptyAssignments() shape directly.
const blank = emptyAssignments();
const blankKeys = Object.keys(blank).length;
console.log(`emptyAssignments() key count (must be 35 = 7 days * 5 shifts): ${blankKeys}`);
console.log(`All values are empty arrays: ${Object.values(blank).every((v) => Array.isArray(v) && v.length === 0)}`);
