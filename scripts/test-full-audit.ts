import { generateSchedule, validateAssignments, DAYS, Worker, Availability, Rules, ShiftKey } from "../src/lib/scheduler";

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

const RUNS = 100;
let totalCrit = 0;
let totalWarn = 0;
let runsWithCrit = 0;
let runsWithWarn = 0;
const critByPerson: Record<string, number> = {};
const critMessages: string[] = [];

for (let i = 0; i < RUNS; i++) {
  const sched = generateSchedule(workers, availability, rules);
  // Re-validate the final assignments from scratch, independent of whatever warnings
  // generateOnce itself produced — this is the same auditor the admin UI runs after a manual edit.
  const findings = validateAssignments(workers, availability, rules, sched.assignments);
  const crits = findings.filter((f) => f.level === "crit");
  const warns = findings.filter((f) => f.level === "warn");
  if (crits.length > 0) {
    runsWithCrit++;
    totalCrit += crits.length;
    crits.forEach((c) => {
      critMessages.push(`run ${i + 1}: ${c.msg}`);
      const person = workers.find((w) => c.msg.startsWith(w.name));
      if (person) critByPerson[person.name] = (critByPerson[person.name] || 0) + 1;
    });
  }
  if (warns.length > 0) {
    runsWithWarn++;
    totalWarn += warns.length;
  }
}

console.log(`=== Full per-person audit over ${RUNS} runs ===`);
console.log(`Runs with at least one CRIT (real rule violation): ${runsWithCrit}/${RUNS}`);
console.log(`Total CRIT findings: ${totalCrit}`);
console.log(`Runs with at least one WARN (coverage/quota shortfall, not a broken rule): ${runsWithWarn}/${RUNS}`);
console.log(`Total WARN findings: ${totalWarn}`);
console.log();
if (totalCrit > 0) {
  console.log("--- CRIT findings by person ---");
  Object.entries(critByPerson)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}`));
  console.log();
  console.log("--- First 40 CRIT messages ---");
  critMessages.slice(0, 40).forEach((m) => console.log("  " + m));
} else {
  console.log("No CRIT findings in any run — every hard rule held for every person, every run.");
}
