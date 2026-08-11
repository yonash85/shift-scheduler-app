import { generateSchedule, DAYS, Worker, Availability, Rules, ShiftKey } from "../src/lib/scheduler";

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

let critRuns = 0, israeliViolations = 0, serbianOver2 = 0, over2Count = 0, mismatchMag = 0;
let zeroNightCount = 0, zeroMorningCount = 0, eveningThenDeepnightViolations = 0;
let sameDayDeepnightEvening = 0, nightThenEvening = 0, israeliFriSatDouble = 0;
let sunI = 0, sunS = 0, monI = 0, monS = 0;
let morningSpreadSum = 0, morningSpreadMax = 0;
const RUNS = 60;
for (let i = 0; i < RUNS; i++) {
  const sched = generateSchedule(workers, availability, rules);
  if (sched.warnings.some((w) => w.level === "crit")) critRuns++;
  let secondNighters = 0;
  const mornings: number[] = [];
  workers.forEach((w) => {
    const r = sched.perWorker[w.id];
    if (w.team === "israeli" && r.night > 1) israeliViolations++;
    if (w.team !== "israeli" && r.night > 2) serbianOver2++;
    if (w.team !== "israeli" && r.night === 2) secondNighters++;
    if (r.night === 0) zeroNightCount++;
    if (r.morning === 0) zeroMorningCount++;
    mismatchMag += Math.abs(r.total - w.quota);
    mornings.push(r.morning);
    if (w.team === "israeli") {
      const fri = sched.assignments["5|morning"].includes(w.id) || sched.assignments["5|evening"].includes(w.id) || sched.assignments["5|mid"].includes(w.id) || sched.assignments["5|bridge"].includes(w.id) || sched.assignments["5|deepnight"].includes(w.id);
      const sat = sched.assignments["6|morning"].includes(w.id) || sched.assignments["6|evening"].includes(w.id) || sched.assignments["6|mid"].includes(w.id) || sched.assignments["6|bridge"].includes(w.id) || sched.assignments["6|deepnight"].includes(w.id);
      if (fri && sat) israeliFriSatDouble++;
    }
  });
  const spread = Math.max(...mornings) - Math.min(...mornings);
  morningSpreadSum += spread;
  morningSpreadMax = Math.max(morningSpreadMax, spread);
  if (secondNighters > 2) over2Count++;
  for (let d = 0; d < 7; d++) {
    const eveningIds = new Set(sched.assignments[`${d}|evening`]);
    (sched.assignments[`${d}|deepnight`] || []).forEach((wid) => {
      if (eveningIds.has(wid)) sameDayDeepnightEvening++;
    });
    if (d < 6) {
      sched.assignments[`${d + 1}|deepnight`].forEach((wid) => {
        if (eveningIds.has(wid)) eveningThenDeepnightViolations++;
      });
      const nightIds = new Set([...sched.assignments[`${d}|bridge`], ...sched.assignments[`${d}|deepnight`]]);
      (sched.assignments[`${d + 1}|evening`] || []).forEach((wid) => {
        if (nightIds.has(wid)) nightThenEvening++;
      });
    }
  }
  sched.assignments["0|morning"].forEach((wid) => (workers.find((w) => w.id === wid)!.team === "israeli" ? sunI++ : sunS++));
  sched.assignments["1|morning"].forEach((wid) => (workers.find((w) => w.id === wid)!.team === "israeli" ? monI++ : monS++));
}

console.log(`runs with crit warnings: ${critRuns}/${RUNS}`);
console.log(`Israeli >1 night violations (must be 0): ${israeliViolations}`);
console.log(`Serbian >2 night violations (must be 0): ${serbianOver2}`);
console.log(`runs with >2 second-nighters (must be 0): ${over2Count}`);
console.log(`workers ending with ZERO nights across all runs (must be 0): ${zeroNightCount}`);
console.log(`workers ending with ZERO mornings across all runs (must be 0): ${zeroMorningCount}`);
console.log(`Evening(D) -> Deep Night(D+1) violations (must be 0): ${eveningThenDeepnightViolations}`);
console.log(`Same-day Deep Night+Evening instances (must be 0 — hard block now): ${sameDayDeepnightEvening} across ${RUNS} runs (${(sameDayDeepnightEvening / RUNS).toFixed(2)}/run)`);
console.log(`Night(Bridge/DeepNight)->next-day-Evening instances (allowed, should be RARE): ${nightThenEvening} across ${RUNS} runs (${(nightThenEvening / RUNS).toFixed(2)}/run)`);
console.log(`Israeli working BOTH Friday and Saturday (allowed, should be RARE): ${israeliFriSatDouble} across ${RUNS} runs (${(israeliFriSatDouble / RUNS).toFixed(2)}/run)`);
console.log(`avg quota mismatch magnitude: ${(mismatchMag / RUNS).toFixed(2)}`);
console.log(`Morning-count spread (max-min per run) — avg: ${(morningSpreadSum / RUNS).toFixed(2)}, worst single run: ${morningSpreadMax}`);
console.log(`Sunday morning Israeli/Serbian: ${sunI}/${sunS}`);
console.log(`Monday morning Israeli/Serbian: ${monI}/${monS}`);
