// Weekly shift-scheduling engine — ported from the prototype (shift-scheduler.html),
// same algorithm and same rules, adapted to take explicit inputs instead of a global
// mutable `state` object so it can run server-side against data loaded from Postgres.

export type Team = "israeli" | "serbian";
export type LeadRole = "primary" | "backup" | null;
export type AvailStatus = "can" | "prefer_not" | "cant";
export type ShiftKey = "morning" | "mid" | "evening" | "bridge" | "deepnight";

export interface Worker {
  id: string;
  name: string;
  team: Team;
  lead: LeadRole;
  quota: number;
  nightCap: number | null; // 2 = admin-locked as a this-week 2nd-night Serbian
  excluded: boolean;
}

export interface Rules {
  morningMin: number;
  morningMax: number;
  eveningWeekdayMin: number;
  eveningWeekdayMax: number;
  eveningWeekendMin: number;
  eveningWeekendMax: number;
  midMin: number;
  bridgeMin: number;
  deepnightMin: number;
  defaultQuota: number;
  maxSecondNightSerbians: number;
  israeliWeekendSoft: boolean;
}

/** availability[workerId][day][shiftKey] */
export type Availability = Record<string, Record<string, Partial<Record<ShiftKey, AvailStatus>>>>;

export interface Warning {
  level: "ok" | "warn" | "crit";
  msg: string;
}
export interface PerWorkerRow {
  morning: number;
  mid: number;
  evening: number;
  bridge: number;
  deepnight: number;
  total: number;
  night: number;
}
export interface ScheduleResult {
  assignments: Record<string, string[]>; // `${dayIndex}|${shiftKey}` -> workerId[]
  warnings: Warning[];
  perWorker: Record<string, PerWorkerRow>;
  generatedAt: number;
}

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKEND = new Set([0, 6]);

interface ShiftDef {
  key: ShiftKey;
  label: string;
  time: string;
  isNight: boolean;
  needsLead: boolean;
  weekendOnly?: boolean;
}
export const SHIFTS: ShiftDef[] = [
  { key: "morning", label: "Morning", time: "08:00–16:00", isNight: false, needsLead: true },
  { key: "mid", label: "Mid", time: "14:00–22:00", isNight: false, needsLead: true, weekendOnly: true },
  { key: "evening", label: "Evening", time: "16:00–00:00", isNight: false, needsLead: true },
  { key: "bridge", label: "Bridge", time: "22:00–06:00", isNight: true, needsLead: false },
  { key: "deepnight", label: "Deep Night", time: "00:00–08:00", isNight: true, needsLead: true },
];
const SHIFT_BY_KEY: Record<ShiftKey, ShiftDef> = Object.fromEntries(SHIFTS.map((s) => [s.key, s])) as Record<
  ShiftKey,
  ShiftDef
>;

function getAvail(availability: Availability, wid: string, day: string, shiftKey: ShiftKey): AvailStatus {
  return availability[wid]?.[day]?.[shiftKey] ?? "can";
}
function activePool(workers: Worker[], availability: Availability): Worker[] {
  return workers.filter((w) => {
    if (w.excluded) return false;
    const allCant = DAYS.every((d) => SHIFTS.every((s) => getAvail(availability, w.id, d, s.key) === "cant"));
    return !allCant;
  });
}
function isLead(w: Worker): boolean {
  return w.lead === "primary" || w.lead === "backup";
}
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface CanAssignOpts {
  ignoreQuota?: boolean;
  ignoreCap?: boolean;
  capOverride?: number;
  ignoreNightCap?: boolean;
}

/** Builds one candidate schedule. Randomized tie-breaking means different calls land in
 * different places — generateSchedule() below runs several and keeps the cleanest. */
export function generateOnce(workers: Worker[], availability: Availability, rules: Rules): ScheduleResult {
  const pool = activePool(workers, availability);
  const warnings: Warning[] = [];
  if (pool.length === 0) {
    return {
      assignments: {},
      warnings: [{ level: "crit", msg: "No available workers in the pool — check People and Availability." }],
      perWorker: {},
      generatedAt: Date.now(),
    };
  }
  const byId = new Map(workers.map((w) => [w.id, w]));

  // Night caps (hard rule): Israelis get exactly one night, never more — no exceptions.
  // Serbians default to one night too, except up to `maxSecondNightSerbians` of them may take
  // a second night this week. Admin can lock a specific Serbian in via nightCap===2; the rest
  // of the allowance fills dynamically during generation, whichever Serbians actually need it.
  const secondNightSerbians = new Set(
    pool
      .filter((w) => w.team !== "israeli" && w.nightCap === 2)
      .map((w) => w.id)
      .slice(0, rules.maxSecondNightSerbians)
  );
  function nightCapFor(w: Worker): number {
    if (w.team === "israeli") return 1;
    return secondNightSerbians.has(w.id) ? 2 : 1;
  }

  // A worker's standing weekly quota can be impossible to hit if most of the week is marked
  // Can't (vacation, leave, etc.) — cap this week's effective target to what's actually reachable
  // so one person's time off doesn't get spread as an unfair shortfall onto everyone else.
  const quotaOf: Record<string, number> = {};
  pool.forEach((w) => {
    let feasibleDays = 0;
    for (let d = 0; d < 7; d++) {
      if (SHIFTS.some((s) => getAvail(availability, w.id, DAYS[d], s.key) !== "cant")) feasibleDays++;
    }
    const capped = Math.min(w.quota, feasibleDays);
    quotaOf[w.id] = capped;
    if (capped < w.quota) {
      warnings.push({
        level: "warn",
        msg: `${w.name}'s quota was capped to ${capped}/${w.quota} shifts this week — their availability only leaves ${feasibleDays} workable day(s). Adjust their standing quota in People if this is expected (e.g. vacation).`,
      });
    }
  });

  type Cap = { morning: number; mid: number; evening: number; bridge: number; deepnight: number };
  const cap: Cap[] = DAYS.map((_, di) => ({
    morning: rules.morningMin,
    mid: WEEKEND.has(di) ? rules.midMin : 0,
    evening: WEEKEND.has(di) ? rules.eveningWeekendMin : rules.eveningWeekdayMin,
    bridge: rules.bridgeMin,
    deepnight: rules.deepnightMin,
  }));
  const capMax: Cap[] = DAYS.map((_, di) => ({
    morning: rules.morningMax,
    mid: WEEKEND.has(di) ? rules.midMin : 0, // fixed headcount — no surplus
    evening: WEEKEND.has(di) ? rules.eveningWeekendMax : rules.eveningWeekdayMax,
    bridge: rules.bridgeMin, // fixed headcount — no surplus
    deepnight: rules.deepnightMin, // fixed headcount — no surplus
  }));
  const baseTotal = cap.reduce((s, d) => s + d.morning + d.mid + d.evening + d.bridge + d.deepnight, 0);
  const targetTotal = pool.reduce((s, w) => s + quotaOf[w.id], 0);

  if (targetTotal < baseTotal) {
    warnings.push({
      level: "crit",
      msg: `Worker quotas (${targetTotal} shifts total) can't cover minimum required coverage (${baseTotal} shifts). Add workers, raise quotas, or lower minimum coverage in Rules. Coverage will be prioritized over exact quotas below.`,
    });
  }
  // Extra shifts beyond the minimum get added in a fixed priority order (admin-defined).
  // Bridge/Deep Night/Mid are fixed headcounts, not surplus-eligible:
  // 1) Sat & Sun Evening up to max   2) Mon–Fri Evening up to max   3) Morning up to max every day
  // 4) anything left over → Sat/Sun Evening, uncapped
  let capTotal = baseTotal;
  if (targetTotal > baseTotal) {
    const queue: { d: number; shift: "evening" | "morning"; to: number }[] = [];
    for (const d of [0, 6]) queue.push({ d, shift: "evening", to: capMax[d].evening });
    for (let d = 1; d <= 5; d++) queue.push({ d, shift: "evening", to: capMax[d].evening });
    for (let d = 0; d < 7; d++) queue.push({ d, shift: "morning", to: capMax[d].morning });
    for (const step of queue) {
      if (capTotal >= targetTotal) break;
      const room = step.to - cap[step.d][step.shift];
      if (room <= 0) continue;
      const add = Math.min(room, targetTotal - capTotal);
      cap[step.d][step.shift] += add;
      capTotal += add;
    }
    // catch-all: keep piling any remainder onto Sat/Sun Evening, split evenly, with no ceiling
    let turn = 0;
    while (capTotal < targetTotal) {
      const d = [0, 6][turn % 2];
      turn++;
      cap[d].evening += 1;
      capTotal += 1;
    }
  }

  // ---- tracking state ----
  const dayShifts: Record<string, ShiftKey[]> = {}; // `${wid}|${d}` -> shiftKey[]
  const counts: Record<string, number> = {};
  const nightCounts: Record<string, number> = {};
  const morningCounts: Record<string, number> = {};
  pool.forEach((w) => {
    counts[w.id] = 0;
    nightCounts[w.id] = 0;
    morningCounts[w.id] = 0;
  });
  const assign = (wid: string, d: number, shiftKey: ShiftKey) => {
    const k = `${wid}|${d}`;
    if (!dayShifts[k]) dayShifts[k] = [];
    dayShifts[k].push(shiftKey);
    counts[wid]++;
    if (SHIFT_BY_KEY[shiftKey].isNight) nightCounts[wid]++;
    if (shiftKey === "morning") morningCounts[wid]++;
  };
  const assignments: Record<string, string[]> = {}; // `${d}|${shiftKey}` -> wid[]
  DAYS.forEach((_, d) => SHIFTS.forEach((s) => (assignments[`${d}|${s.key}`] = [])));
  const put = (wid: string, d: number, shiftKey: ShiftKey) => {
    assign(wid, d, shiftKey);
    assignments[`${d}|${shiftKey}`].push(wid);
  };
  const slotCount = (d: number, sk: ShiftKey) => assignments[`${d}|${sk}`].length;

  function canAssign(w: Worker, d: number, shiftKey: ShiftKey, opts: CanAssignOpts = {}): boolean {
    const av = getAvail(availability, w.id, DAYS[d], shiftKey);
    if (av === "cant") return false;
    const existing = dayShifts[`${w.id}|${d}`] || [];
    if (existing.length >= 2) return false;
    if (existing.length === 1) {
      const pairOk =
        (existing[0] === "deepnight" && shiftKey === "evening") || (existing[0] === "evening" && shiftKey === "deepnight");
      if (!pairOk) return false;
    }
    if (shiftKey === "morning") {
      const prev = dayShifts[`${w.id}|${d - 1}`] || [];
      if (prev.includes("bridge") || prev.includes("deepnight")) return false;
    }
    if (shiftKey === "mid" && DAYS[d] === "Saturday") {
      const fri = dayShifts[`${w.id}|${d - 1}`] || [];
      if (fri.includes("bridge") || fri.includes("deepnight")) return false;
    }
    if ((shiftKey === "bridge" || shiftKey === "deepnight") && !opts.ignoreNightCap) {
      if (nightCounts[w.id] + 1 > nightCapFor(w)) return false;
    }
    if (!opts.ignoreQuota && counts[w.id] >= quotaOf[w.id]) return false;
    if (!opts.ignoreCap && slotCount(d, shiftKey) >= (opts.capOverride ?? cap[d][shiftKey])) return false;
    return true;
  }

  function score(w: Worker, d: number, shiftKey: ShiftKey): number {
    // lower is preferred
    let s = 0;
    const av = getAvail(availability, w.id, DAYS[d], shiftKey);
    if (av === "prefer_not") s += 50;
    s += counts[w.id] * 4; // spread load
    s += (quotaOf[w.id] - counts[w.id]) * -3; // prioritize those with more remaining quota
    if (shiftKey !== "bridge" && shiftKey !== "deepnight" && rules.israeliWeekendSoft && w.team === "israeli" && DAYS[d] === "Saturday") {
      const fri = dayShifts[`${w.id}|5`] || [];
      if (fri.length > 0) s += 30;
    }
    // Soft preference: Sunday & Monday Morning favors Israelis over Serbians
    if (shiftKey === "morning" && (DAYS[d] === "Sunday" || DAYS[d] === "Monday") && w.team === "israeli") {
      s -= 20;
    }
    s += Math.random() * 3;
    return s;
  }

  // ---- Step A: Nights, phase 1 (one night each) ----
  // Leads get Deep Night first when possible, since Deep Night needs a lead and Bridge doesn't —
  // this is the scarce resource, so spend it deliberately rather than leaving it to chance.
  for (const w of shuffled(pool.filter(isLead)).concat(shuffled(pool.filter((w) => !isLead(w))))) {
    if (nightCounts[w.id] > 0) continue;
    const dayOrder = shuffled([0, 1, 2, 3, 4, 5, 6]);
    let placed = false;
    const skOrder: ShiftKey[] = isLead(w) ? ["deepnight", "bridge"] : shuffled(["bridge", "deepnight"]);
    for (const sk of skOrder) {
      for (const d of dayOrder) {
        if (canAssign(w, d, sk)) {
          put(w.id, d, sk);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed)
      warnings.push({
        level: "warn",
        msg: `Couldn't give ${w.name} a night shift this week (availability/rest conflicts) — night-shift requirement unmet for this worker.`,
      });
  }
  // ---- Step A2: Nights, phase 2 (fill remaining slots) ----
  for (const d of shuffled([0, 1, 2, 3, 4, 5, 6])) {
    for (const sk of ["bridge", "deepnight"] as ShiftKey[]) {
      let guard = 0;
      while (slotCount(d, sk) < cap[d][sk] && guard++ < 200) {
        const dayNeedsLead = sk === "deepnight" && !assignments[`${d}|deepnight`].some((wid) => isLead(byId.get(wid)!));
        let candidates = pool
          .filter((w) => canAssign(w, d, sk))
          .sort((a, b) => {
            if (dayNeedsLead) {
              const al = isLead(a) ? 0 : 1,
                bl = isLead(b) ? 0 : 1;
              if (al !== bl) return al - bl;
            }
            return score(a, d, sk) - score(b, d, sk);
          });
        if (candidates.length === 0 && secondNightSerbians.size < rules.maxSecondNightSerbians) {
          const promotable = pool
            .filter((w) => w.team !== "israeli" && !secondNightSerbians.has(w.id) && canAssign(w, d, sk, { ignoreNightCap: true }))
            .sort((a, b) => {
              if (dayNeedsLead) {
                const al = isLead(a) ? 0 : 1,
                  bl = isLead(b) ? 0 : 1;
                if (al !== bl) return al - bl;
              }
              return score(a, d, sk) - score(b, d, sk);
            });
          if (promotable.length > 0) {
            secondNightSerbians.add(promotable[0].id);
            candidates = [promotable[0]];
          }
        }
        if (candidates.length === 0) break;
        put(candidates[0].id, d, sk);
      }
      if (slotCount(d, sk) < cap[d][sk]) {
        warnings.push({
          level: "crit",
          msg: `${DAYS[d]} ${SHIFT_BY_KEY[sk].label}: only ${slotCount(d, sk)}/${cap[d][sk]} filled — no eligible workers left under current night limits/availability.`,
        });
      }
    }
  }
  // ---- Step B: Weekend Mid (leads only) ----
  for (const d of [0, 6]) {
    if (cap[d].mid < 1) continue;
    const leads = shuffled(pool.filter(isLead)).sort((a, b) => (a.lead === "primary" ? 0 : 1) - (b.lead === "primary" ? 0 : 1));
    let placed = false;
    for (const w of leads) {
      if (canAssign(w, d, "mid")) {
        put(w.id, d, "mid");
        placed = true;
        break;
      }
    }
    if (!placed) warnings.push({ level: "crit", msg: `No eligible lead could be assigned to ${DAYS[d]} Mid shift (leadership + rest-rule conflict).` });
  }
  // ---- Step C: Morning + Evening + (any surplus) Mid fill, day by day, with leadership guarantee ----
  for (let d = 0; d < 7; d++) {
    for (const sk of ["morning", "evening", "mid"] as ShiftKey[]) {
      if (cap[d][sk] <= 0) continue;
      const hasLead = assignments[`${d}|${sk}`].some((wid) => isLead(byId.get(wid)!));
      if (!hasLead) {
        const leads = shuffled(pool.filter(isLead)).sort((a, b) => (a.lead === "primary" ? 0 : 1) - (b.lead === "primary" ? 0 : 1));
        for (const w of leads) {
          if (canAssign(w, d, sk)) {
            put(w.id, d, sk);
            break;
          }
        }
      }
      let guard = 0;
      while (slotCount(d, sk) < cap[d][sk] && guard++ < 200) {
        const candidates = pool
          .filter((w) => canAssign(w, d, sk))
          .sort((a, b) => {
            if (sk === "morning" && !(DAYS[d] === "Sunday" || DAYS[d] === "Monday")) {
              const am = morningCounts[a.id] > 0 ? 1 : 0,
                bm = morningCounts[b.id] > 0 ? 1 : 0;
              if (am !== bm) return am - bm;
            }
            return score(a, d, sk) - score(b, d, sk);
          });
        if (candidates.length === 0) break;
        put(candidates[0].id, d, sk);
      }
      const stillNoLead = !assignments[`${d}|${sk}`].some((wid) => isLead(byId.get(wid)!));
      if (stillNoLead) warnings.push({ level: "crit", msg: `${DAYS[d]} ${SHIFT_BY_KEY[sk].label}: no Enterprise Lead could be placed (leadership coverage unmet).` });
      if (slotCount(d, sk) < cap[d][sk]) warnings.push({ level: "warn", msg: `${DAYS[d]} ${SHIFT_BY_KEY[sk].label}: only ${slotCount(d, sk)}/${cap[d][sk]} filled.` });
    }
  }
  // ---- Step D: Deep Night leadership patch (swap if needed) ----
  for (let d = 0; d < 7; d++) {
    const ids = assignments[`${d}|deepnight`];
    const hasLead = ids.some((wid) => isLead(byId.get(wid)!));
    if (!hasLead && ids.length > 0) {
      let candidateLead = pool.find(
        (w) => isLead(w) && !ids.includes(w.id) && canAssign(w, d, "deepnight", { ignoreCap: true }) && nightCounts[w.id] + 1 <= nightCapFor(w)
      );
      if (!candidateLead && secondNightSerbians.size < rules.maxSecondNightSerbians) {
        candidateLead = pool.find(
          (w) => isLead(w) && w.team !== "israeli" && !secondNightSerbians.has(w.id) && !ids.includes(w.id) && canAssign(w, d, "deepnight", { ignoreCap: true, ignoreNightCap: true })
        );
        if (candidateLead) secondNightSerbians.add(candidateLead.id);
      }
      if (candidateLead) {
        const outId = ids[0];
        const dsKey = `${outId}|${d}`;
        dayShifts[dsKey] = dayShifts[dsKey].filter((sk) => sk !== "deepnight");
        counts[outId]--;
        nightCounts[outId]--;
        assignments[`${d}|deepnight`] = ids.slice(1);
        put(candidateLead.id, d, "deepnight");
        warnings.push({ level: "ok", msg: `Swapped in a lead for ${DAYS[d]} Deep Night to satisfy leadership coverage.` });
      } else {
        warnings.push({ level: "crit", msg: `${DAYS[d]} Deep Night: no lead available to satisfy leadership coverage.` });
      }
    }
  }
  // ---- Step E: guarantee every pool worker has >=1 Morning (hard rule — may exceed quota/cap as last resort) ----
  for (const w of pool) {
    if (morningCounts[w.id] > 0) continue;
    let placed = false;
    for (const d of shuffled([0, 1, 2, 3, 4, 5, 6])) {
      if (canAssign(w, d, "morning", { ignoreCap: true, ignoreQuota: true })) {
        put(w.id, d, "morning");
        placed = true;
        if (slotCount(d, "morning") > cap[d].morning) warnings.push({ level: "ok", msg: `Added an extra Morning slot on ${DAYS[d]} so ${w.name} meets the 1-Morning minimum.` });
        if (counts[w.id] > quotaOf[w.id]) warnings.push({ level: "warn", msg: `${w.name} was pushed to ${counts[w.id]}/${quotaOf[w.id]} shifts to satisfy the 1-Morning minimum — will try to rebalance.` });
        break;
      }
    }
    if (!placed) warnings.push({ level: "crit", msg: `Couldn't give ${w.name} any Morning shift — availability/rest rules block every day.` });
  }
  // ---- Step F: balance remaining quota (fill anyone still under) ----
  for (const w of shuffled(pool)) {
    let guard = 0;
    while (counts[w.id] < quotaOf[w.id] && guard++ < 30) {
      let placedHere = false;
      const order = shuffled([0, 1, 2, 3, 4, 5, 6]);
      for (const d of order) {
        for (const sk of ["evening", "morning", "mid"] as ShiftKey[]) {
          if (sk === "mid" && cap[d].mid < 1) continue;
          if (canAssign(w, d, sk)) {
            put(w.id, d, sk);
            placedHere = true;
            break;
          }
        }
        if (placedHere) break;
      }
      if (!placedHere) break;
    }
  }
  // ---- Step G: repair — swap a slot from an over-served worker to an under-served one ----
  function canRemove(oid: string, d: number, sk: ShiftKey): boolean {
    const o = byId.get(oid)!;
    if (sk === "morning" && morningCounts[oid] <= 1) return false;
    if (SHIFT_BY_KEY[sk].needsLead && isLead(o)) {
      const others = assignments[`${d}|${sk}`].filter((id) => id !== oid);
      const stillHasLead = others.some((id) => isLead(byId.get(id)!));
      if (!stillHasLead) return false;
    }
    return true;
  }
  function removeAssignment(oid: string, d: number, sk: ShiftKey) {
    const key = `${oid}|${d}`;
    dayShifts[key] = (dayShifts[key] || []).filter((x) => x !== sk);
    counts[oid]--;
    if (sk === "morning") morningCounts[oid]--;
    assignments[`${d}|${sk}`] = assignments[`${d}|${sk}`].filter((id) => id !== oid);
  }
  let anyProgress = true,
    passGuard = 0;
  while (anyProgress && passGuard++ < 25) {
    anyProgress = false;
    for (const w of shuffled(pool).sort((a, b) => quotaOf[b.id] - counts[b.id] - (quotaOf[a.id] - counts[a.id]))) {
      let guard = 0;
      while (counts[w.id] < quotaOf[w.id] && guard++ < 40) {
        let swapped = false;
        const days = shuffled([0, 1, 2, 3, 4, 5, 6]);
        outer: for (const d of days) {
          for (const sk of ["evening", "morning", "mid"] as ShiftKey[]) {
            if (sk === "mid" && cap[d].mid < 1) continue;
            if (!canAssign(w, d, sk, { ignoreCap: true })) continue;
            const occupants = assignments[`${d}|${sk}`].filter((id) => id !== w.id && counts[id] > counts[w.id]);
            for (const oid of occupants) {
              if (canRemove(oid, d, sk)) {
                removeAssignment(oid, d, sk);
                put(w.id, d, sk);
                swapped = true;
                anyProgress = true;
                break outer;
              }
            }
          }
        }
        if (!swapped) break;
      }
    }
  }
  for (const w of pool) {
    if (counts[w.id] < quotaOf[w.id]) {
      warnings.push({ level: "warn", msg: `${w.name} ended with ${counts[w.id]}/${quotaOf[w.id]} shifts — no remaining eligible or swappable slot found this week.` });
    } else if (counts[w.id] > quotaOf[w.id]) {
      warnings.push({ level: "warn", msg: `${w.name} ended with ${counts[w.id]}/${quotaOf[w.id]} shifts (over quota) — kept the extra to satisfy the 1-Morning minimum without breaking another hard rule.` });
    }
  }

  if (!warnings.some((x) => x.level === "crit") && !warnings.some((x) => x.level === "warn")) {
    warnings.unshift({ level: "ok", msg: "All hard rules satisfied: coverage minimums, leadership, night limits, rest rules, quotas, and worker availability were all respected exactly." });
  } else if (!warnings.some((x) => x.level === "crit")) {
    warnings.unshift({ level: "ok", msg: "Coverage minimums, leadership, night limits, rest rules and availability were all respected — see the notes below for quota-related shortfalls." });
  }

  const perWorker: Record<string, PerWorkerRow> = {};
  pool.forEach((w) => {
    const row: PerWorkerRow = { morning: 0, mid: 0, evening: 0, bridge: 0, deepnight: 0, total: counts[w.id], night: nightCounts[w.id] };
    for (let d = 0; d < 7; d++) {
      (dayShifts[`${w.id}|${d}`] || []).forEach((sk) => (row[sk] += 1));
    }
    perWorker[w.id] = row;
  });

  return { assignments, warnings, perWorker, generatedAt: Date.now() };
}

function scoreCandidate(res: ScheduleResult): number {
  let crit = 0,
    warn = 0;
  res.warnings.forEach((w) => {
    if (w.level === "crit") crit++;
    else if (w.level === "warn") warn++;
  });
  return crit * 1000 + warn;
}

/** Runs several candidate schedules and keeps the cleanest one (fewest broken rules / gaps). */
export function generateSchedule(workers: Worker[], availability: Availability, rules: Rules): ScheduleResult {
  const ATTEMPTS = 15;
  let best: ScheduleResult | null = null;
  let bestScore = Infinity;
  let triedCount = 0;
  for (let i = 0; i < ATTEMPTS; i++) {
    const candidate = generateOnce(workers, availability, rules);
    triedCount++;
    const s = scoreCandidate(candidate);
    if (s < bestScore) {
      bestScore = s;
      best = candidate;
    }
    if (bestScore === 0) break;
  }
  best!.warnings.unshift({ level: "ok", msg: `Evaluated ${triedCount} candidate schedule${triedCount > 1 ? "s" : ""} and kept the cleanest one.` });
  return best!;
}
