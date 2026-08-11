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
 * different places — generateSchedule() below runs several and keeps the cleanest.
 * `seedAssignments`, if given, is applied first and never touched again — every step below
 * only fills what's still empty and counts the seed toward caps/quotas/night limits, so a
 * manually pre-placed person is treated exactly like one the algorithm placed itself. */
export function generateOnce(
  workers: Worker[],
  availability: Availability,
  rules: Rules,
  seedAssignments?: Record<string, string[]>
): ScheduleResult {
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
  // Initialized over every worker, not just the active pool — a seeded (manually pre-placed)
  // entry could in principle reference anyone, and this must never throw on a lookup.
  workers.forEach((w) => {
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

  // Locked entries (from seedAssignments) must never be moved once placed — Step D's
  // leadership swap and Step G's repair pass both remove-and-replace an existing occupant to
  // free up a slot, and need to know which occupants are off-limits for that.
  const locked = new Set<string>(); // `${wid}|${d}|${shiftKey}`
  if (seedAssignments) {
    for (const key of Object.keys(seedAssignments)) {
      const [dStr, sk] = key.split("|") as [string, ShiftKey];
      for (const wid of seedAssignments[key]) {
        put(wid, Number(dStr), sk);
        locked.add(`${wid}|${dStr}|${sk}`);
      }
    }
  }

  function canAssign(w: Worker, d: number, shiftKey: ShiftKey, opts: CanAssignOpts = {}): boolean {
    const av = getAvail(availability, w.id, DAYS[d], shiftKey);
    if (av === "cant") return false;
    const existing = dayShifts[`${w.id}|${d}`] || [];
    // No two shifts on the same day, ever — including Deep Night + Evening. Deep Night's
    // required rest runs until 16:00, exactly when Evening starts: zero gap, not a valid pairing.
    if (existing.length >= 1) return false;
    if (shiftKey === "morning") {
      const prev = dayShifts[`${w.id}|${d - 1}`] || [];
      if (prev.includes("bridge") || prev.includes("deepnight")) return false;
    }
    if (shiftKey === "deepnight") {
      // Evening ends at midnight, Deep Night starts at midnight — zero rest between them.
      const prev = dayShifts[`${w.id}|${d - 1}`] || [];
      if (prev.includes("evening")) return false;
    }
    if (shiftKey === "evening") {
      // Same check, other direction — Deep Night is usually assigned before Evening in the
      // pipeline, so this can't just rely on the deepnight-side check above running first.
      const next = dayShifts[`${w.id}|${d + 1}`] || [];
      if (next.includes("deepnight")) return false;
    }
    if (shiftKey === "mid" && DAYS[d] === "Saturday") {
      const fri = dayShifts[`${w.id}|${d - 1}`] || [];
      if (fri.includes("bridge") || fri.includes("deepnight")) return false;
    }
    if (shiftKey === "bridge" || shiftKey === "deepnight") {
      // Forward-looking mirror of the morning/Saturday-Mid checks above: Deep Night and
      // Bridge are usually assigned before Morning/Mid, but Step D's leadership patch can
      // place one of these AFTER the next day's Morning/Mid was already decided — so this
      // has to be checked in both directions, not just "does yesterday's night block today."
      const next = dayShifts[`${w.id}|${d + 1}`] || [];
      if (next.includes("morning")) return false;
      if (next.includes("mid") && DAYS[d + 1] === "Saturday") return false;
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
    // Soft preference: Israelis' Friday and Saturday count as one combined weekend slot —
    // avoid giving the same Israeli a shift on both. Checked in both directions (whichever
    // of the two days gets decided first) and for every shift type, including nights, since
    // nights are assigned earlier in the pipeline than the rest of the week.
    if (rules.israeliWeekendSoft && w.team === "israeli") {
      if (DAYS[d] === "Saturday" && (dayShifts[`${w.id}|5`] || []).length > 0) s += 150;
      if (DAYS[d] === "Friday" && (dayShifts[`${w.id}|6`] || []).length > 0) s += 150;
    }
    // Soft preference: Sunday & Monday Morning favors Israelis over Serbians
    if (shiftKey === "morning" && (DAYS[d] === "Sunday" || DAYS[d] === "Monday") && w.team === "israeli") {
      s -= 20;
    }
    // Spread Mornings specifically (not just total shift count) — otherwise someone can end
    // up with 4 Mornings and 1 Evening while another ends up with 1 Morning and 4 Evenings,
    // both "balanced" by total count but lopsided on this particular shift type. Exempt
    // Sun/Mon, same as the Israeli-favoring rule above — otherwise an Israeli who already
    // got Sunday Morning loses the Monday-Morning preference to any fresh Serbian at 0.
    if (shiftKey === "morning" && !(DAYS[d] === "Sunday" || DAYS[d] === "Monday")) {
      s += morningCounts[w.id] * 20;
    }
    // Soft preference: a night shift (Bridge or Deep Night) right before an Evening the next
    // day is allowed — both are well-rested by the time Evening starts — but avoid it unless
    // nothing else works. (Deep Night + same-day Evening is a hard block now, see canAssign.)
    if (shiftKey === "evening") {
      const prevDay = dayShifts[`${w.id}|${d - 1}`] || [];
      if (prevDay.includes("bridge") || prevDay.includes("deepnight")) s += 120;
    }
    if (shiftKey === "bridge" || shiftKey === "deepnight") {
      const nextDay = dayShifts[`${w.id}|${d + 1}`] || [];
      if (nextDay.includes("evening")) s += 120;
    }
    s += Math.random() * 3;
    return s;
  }

  // ---- Step A: Nights, phase 1 (one night each) ----
  // Leads get Deep Night first when possible, since Deep Night needs a lead and Bridge doesn't —
  // this is the scarce resource, so spend it deliberately rather than leaving it to chance.
  for (const w of shuffled(pool.filter(isLead)).concat(shuffled(pool.filter((w) => !isLead(w))))) {
    if (nightCounts[w.id] > 0) continue;
    let placed = false;
    const skOrder: ShiftKey[] = isLead(w) ? ["deepnight", "bridge"] : shuffled(["bridge", "deepnight"]);
    for (const sk of skOrder) {
      // Score-sorted, not just shuffled — this is what lets the Israeli Sun/Mon/Wed night
      // preference and the deepnight/evening same-day preference actually take effect here,
      // instead of the very first random day winning regardless of fit.
      const dayOrder = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => score(w, a, sk) - score(w, b, sk));
      for (const d of dayOrder) {
        if (canAssign(w, d, sk)) {
          put(w.id, d, sk);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    // No warning here if this fails — Step A3 below retries with the same escalation
    // the Morning guarantee uses, so this is an expected intermediate state, not a final one.
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
  // ---- Step A3: guarantee every pool worker has >=1 night (hard rule — may exceed the
  // day's slot count as a last resort, same escalation pattern as the Morning guarantee below).
  // Nobody should reach this blocked by their night *cap* — a first night is always within
  // cap (0+1 never exceeds a cap of at least 1) — so a miss is an availability/rest conflict.
  // Factored out because Step D (leadership patch) can also strip someone's only night away
  // when swapping in a lead, and needs the same fallback.
  function tryGuaranteeNight(w: Worker): boolean {
    const dayOrder = shuffled([0, 1, 2, 3, 4, 5, 6]);
    const skOrder: ShiftKey[] = isLead(w) ? ["deepnight", "bridge"] : shuffled(["bridge", "deepnight"]);
    for (const sk of skOrder) {
      for (const d of dayOrder) {
        if (canAssign(w, d, sk, { ignoreCap: true, ignoreQuota: true })) {
          put(w.id, d, sk);
          if (slotCount(d, sk) > cap[d][sk]) {
            warnings.push({ level: "ok", msg: `Added an extra ${SHIFT_BY_KEY[sk].label} slot on ${DAYS[d]} so ${w.name} meets the 1-night minimum.` });
          }
          if (counts[w.id] > quotaOf[w.id]) {
            warnings.push({ level: "warn", msg: `${w.name} was pushed to ${counts[w.id]}/${quotaOf[w.id]} shifts to satisfy the 1-night minimum — will try to rebalance.` });
          }
          return true;
        }
      }
    }
    return false;
  }
  for (const w of pool) {
    if (nightCounts[w.id] > 0) continue;
    if (!tryGuaranteeNight(w)) warnings.push({ level: "crit", msg: `Couldn't give ${w.name} any night shift — availability/rest rules block every day.` });
  }
  // ---- Step B: Weekend Mid (leads only) ----
  for (const d of [0, 6]) {
    if (cap[d].mid < 1) continue;
    const leads = pool
      .filter(isLead)
      .sort((a, b) => {
        const ap = a.lead === "primary" ? 0 : 1,
          bp = b.lead === "primary" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return score(a, d, "mid") - score(b, d, "mid");
      });
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
        // Sorted by score (not just shuffled) so this guarantee prefers a lead who doesn't
        // already have same-day Deep Night / prior-day Bridge, instead of grabbing whichever
        // lead happens to shuffle first — otherwise the soft-preference penalty in score()
        // never gets a say in these leadership-guarantee picks.
        const leads = pool
          .filter(isLead)
          .sort((a, b) => {
            const ap = a.lead === "primary" ? 0 : 1,
              bp = b.lead === "primary" ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return score(a, d, sk) - score(b, d, sk);
          });
        for (const w of leads) {
          if (canAssign(w, d, sk)) {
            put(w.id, d, sk);
            break;
          }
        }
      }
      let guard = 0;
      while (slotCount(d, sk) < cap[d][sk] && guard++ < 200) {
        // Morning-count spread is now handled inside score() itself (so it applies
        // consistently everywhere score() is used, not just this loop) — plain score sort here.
        const candidates = pool.filter((w) => canAssign(w, d, sk)).sort((a, b) => score(a, d, sk) - score(b, d, sk));
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
      // Sorted by score (not just pool order / first match) so this prefers a lead who
      // isn't already working Evening that day, instead of always grabbing the same first
      // eligible lead in roster order regardless of the same-day-pairing soft preference.
      let candidateLead = pool
        .filter((w) => isLead(w) && !ids.includes(w.id) && canAssign(w, d, "deepnight", { ignoreCap: true }) && nightCounts[w.id] + 1 <= nightCapFor(w))
        .sort((a, b) => score(a, d, "deepnight") - score(b, d, "deepnight"))[0];
      if (!candidateLead && secondNightSerbians.size < rules.maxSecondNightSerbians) {
        candidateLead = pool
          .filter((w) => isLead(w) && w.team !== "israeli" && !secondNightSerbians.has(w.id) && !ids.includes(w.id) && canAssign(w, d, "deepnight", { ignoreCap: true, ignoreNightCap: true }))
          .sort((a, b) => score(a, d, "deepnight") - score(b, d, "deepnight"))[0];
        if (candidateLead) secondNightSerbians.add(candidateLead.id);
      }
      // Never swap out a manually locked occupant — if every current occupant is locked,
      // there's genuinely nothing this step can do without breaking a manual placement.
      const removableIds = ids.filter((id) => !locked.has(`${id}|${d}|deepnight`));
      if (candidateLead && removableIds.length > 0) {
        // Prefer swapping out someone who has a spare night elsewhere, so this swap
        // doesn't strip away anyone's only night shift for the week.
        const outId = removableIds.find((id) => nightCounts[id] > 1) ?? removableIds[0];
        const dsKey = `${outId}|${d}`;
        dayShifts[dsKey] = dayShifts[dsKey].filter((sk) => sk !== "deepnight");
        counts[outId]--;
        nightCounts[outId]--;
        assignments[`${d}|deepnight`] = ids.filter((id) => id !== outId);
        put(candidateLead.id, d, "deepnight");
        warnings.push({ level: "ok", msg: `Swapped in a lead for ${DAYS[d]} Deep Night to satisfy leadership coverage.` });
        if (nightCounts[outId] === 0) {
          const outWorker = byId.get(outId)!;
          if (!tryGuaranteeNight(outWorker)) {
            warnings.push({ level: "crit", msg: `Couldn't give ${outWorker.name} a night shift after they were swapped out of ${DAYS[d]} Deep Night for leadership coverage.` });
          }
        }
      } else if (candidateLead && removableIds.length === 0) {
        warnings.push({ level: "crit", msg: `${DAYS[d]} Deep Night has no lead, but every current occupant is manually locked — remove one manually or add a lead yourself.` });
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
  // Picks the best-scoring option across the whole week, not just the first one found in
  // random day order — otherwise this ignores the soft preferences entirely (e.g. it would
  // happily reuse a Deep Night day for Evening just because it happened to be checked first).
  for (const w of shuffled(pool)) {
    let guard = 0;
    while (counts[w.id] < quotaOf[w.id] && guard++ < 30) {
      const options: { d: number; sk: ShiftKey }[] = [];
      for (let d = 0; d < 7; d++) {
        for (const sk of ["evening", "morning", "mid"] as ShiftKey[]) {
          if (sk === "mid" && cap[d].mid < 1) continue;
          if (canAssign(w, d, sk)) options.push({ d, sk });
        }
      }
      if (options.length === 0) break;
      options.sort((a, b) => score(w, a.d, a.sk) - score(w, b.d, b.sk));
      put(w.id, options[0].d, options[0].sk);
    }
  }
  // ---- Step G: repair — swap a slot from an over-served worker to an under-served one ----
  function canRemove(oid: string, d: number, sk: ShiftKey): boolean {
    if (locked.has(`${oid}|${d}|${sk}`)) return false;
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
        // Collect every valid swap across the whole week and take the best-scoring one,
        // rather than the first one found in random day order (same fix as Step F).
        const options: { d: number; sk: ShiftKey; oid: string }[] = [];
        for (let d = 0; d < 7; d++) {
          for (const sk of ["evening", "morning", "mid"] as ShiftKey[]) {
            if (sk === "mid" && cap[d].mid < 1) continue;
            if (!canAssign(w, d, sk, { ignoreCap: true })) continue;
            const occupants = assignments[`${d}|${sk}`].filter((id) => id !== w.id && counts[id] > counts[w.id]);
            for (const oid of occupants) {
              if (canRemove(oid, d, sk)) options.push({ d, sk, oid });
            }
          }
        }
        if (options.length === 0) break;
        options.sort((a, b) => score(w, a.d, a.sk) - score(w, b.d, b.sk));
        const best = options[0];
        removeAssignment(best.oid, best.d, best.sk);
        put(w.id, best.d, best.sk);
        anyProgress = true;
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
  // Surface the two soft preferences as visible notes — both so the admin can see exactly
  // where a trade-off happened, and so generateSchedule's best-of-N selection also counts
  // these against a candidate (scoreCandidate counts all "warn"s), not just hard-rule gaps.
  if (rules.israeliWeekendSoft) {
    for (const w of pool) {
      if (w.team !== "israeli") continue;
      if ((dayShifts[`${w.id}|5`] || []).length > 0 && (dayShifts[`${w.id}|6`] || []).length > 0) {
        warnings.push({ level: "warn", msg: `${w.name} is working both Friday and Saturday this week.` });
      }
    }
  }
  for (let d = 0; d < 6; d++) {
    const nightIds = [...assignments[`${d}|bridge`], ...assignments[`${d}|deepnight`]];
    const eveningIds = new Set(assignments[`${d + 1}|evening`]);
    for (const wid of nightIds) {
      if (eveningIds.has(wid)) {
        warnings.push({ level: "warn", msg: `${byId.get(wid)!.name}: night shift on ${DAYS[d]} then Evening on ${DAYS[d + 1]}.` });
      }
    }
  }

  if (!warnings.some((x) => x.level === "crit") && !warnings.some((x) => x.level === "warn")) {
    warnings.unshift({ level: "ok", msg: "All hard rules satisfied: coverage minimums, leadership, night limits, rest rules, quotas, and worker availability were all respected exactly." });
  } else if (!warnings.some((x) => x.level === "crit")) {
    warnings.unshift({ level: "ok", msg: "Coverage minimums, leadership, night limits, rest rules and availability were all respected — see the notes below for quota-related shortfalls." });
  }

  // Every worker, not just the active pool — a seeded entry could reference someone
  // otherwise excluded this week, and the summary table should still show their shifts.
  const perWorker: Record<string, PerWorkerRow> = {};
  workers.forEach((w) => {
    const row: PerWorkerRow = { morning: 0, mid: 0, evening: 0, bridge: 0, deepnight: 0, total: counts[w.id] ?? 0, night: nightCounts[w.id] ?? 0 };
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
  // Fine-grained tiebreak below hard-rule cleanliness: among equally-clean candidates,
  // prefer the one with the smallest gap between whoever got the most Mornings and
  // whoever got the fewest — score() already nudges toward this within a single run, this
  // just makes sure the best-of-N pick doesn't undo that by chance.
  const mornings = Object.values(res.perWorker).map((r) => r.morning);
  const morningSpread = mornings.length ? Math.max(...mornings) - Math.min(...mornings) : 0;
  return crit * 1000 + warn + morningSpread * 0.1;
}

/** Runs several candidate schedules and keeps the cleanest one (fewest broken rules / gaps).
 * `seedAssignments`, if given, is passed unchanged to every attempt — the locked entries stay
 * fixed, only the randomized fill-in around them varies between candidates. */
export function generateSchedule(
  workers: Worker[],
  availability: Availability,
  rules: Rules,
  seedAssignments?: Record<string, string[]>
): ScheduleResult {
  const ATTEMPTS = 60;
  let best: ScheduleResult | null = null;
  let bestScore = Infinity;
  let triedCount = 0;
  for (let i = 0; i < ATTEMPTS; i++) {
    const candidate = generateOnce(workers, availability, rules, seedAssignments);
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

/** An all-empty assignments map — the starting point for a blank/manual schedule, or for
 * clearing an existing one. Every day|shiftKey slot exists with an empty array, matching the
 * shape generateOnce produces, so the rest of the app (EditableScheduleTable, computePerWorker,
 * validateAssignments) doesn't need to special-case "no schedule yet" vs "empty schedule". */
export function emptyAssignments(): Record<string, string[]> {
  const assignments: Record<string, string[]> = {};
  DAYS.forEach((_, d) => SHIFTS.forEach((s) => (assignments[`${d}|${s.key}`] = [])));
  return assignments;
}

/** Recomputes per-worker shift counts from an assignments map — used after manual edits. */
export function computePerWorker(workers: Worker[], assignments: Record<string, string[]>): Record<string, PerWorkerRow> {
  const perWorker: Record<string, PerWorkerRow> = {};
  workers.forEach((w) => {
    perWorker[w.id] = { morning: 0, mid: 0, evening: 0, bridge: 0, deepnight: 0, total: 0, night: 0 };
  });
  for (let d = 0; d < 7; d++) {
    for (const s of SHIFTS) {
      const ids = assignments[`${d}|${s.key}`] || [];
      for (const wid of ids) {
        if (!perWorker[wid]) continue; // worker removed from roster since this schedule was generated
        perWorker[wid][s.key] += 1;
        perWorker[wid].total += 1;
        if (s.isNight) perWorker[wid].night += 1;
      }
    }
  }
  return perWorker;
}

/**
 * Checks an existing assignments map (as-is, post manual edits) against every hard/soft rule
 * and returns what it finds — doesn't build or change anything, just reports. Used so a manual
 * edit on the dashboard can be flagged rather than blocked: the admin keeps final say, but sees
 * exactly what they're overriding.
 */
export function validateAssignments(
  workers: Worker[],
  availability: Availability,
  rules: Rules,
  assignments: Record<string, string[]>
): Warning[] {
  const byId = new Map(workers.map((w) => [w.id, w]));
  const warnings: Warning[] = [];
  const dayShifts: Record<string, ShiftKey[]> = {};
  const nightCounts: Record<string, number> = {};

  for (let d = 0; d < 7; d++) {
    for (const s of SHIFTS) {
      const ids = assignments[`${d}|${s.key}`] || [];
      for (const wid of ids) {
        const key = `${wid}|${d}`;
        if (!dayShifts[key]) dayShifts[key] = [];
        dayShifts[key].push(s.key);
        if (s.isNight) nightCounts[wid] = (nightCounts[wid] || 0) + 1;
      }
    }
  }

  // Availability
  for (let d = 0; d < 7; d++) {
    for (const s of SHIFTS) {
      for (const wid of assignments[`${d}|${s.key}`] || []) {
        const w = byId.get(wid);
        if (!w) continue;
        if (getAvail(availability, wid, DAYS[d], s.key) === "cant") {
          warnings.push({ level: "crit", msg: `${w.name} is scheduled for ${DAYS[d]} ${s.label} despite being marked Can't that shift.` });
        }
      }
    }
  }

  // Same-day and adjacent-day rest conflicts
  for (const w of workers) {
    for (let d = 0; d < 7; d++) {
      const today = dayShifts[`${w.id}|${d}`] || [];
      if (today.length >= 2) {
        warnings.push({ level: "crit", msg: `${w.name} is double-booked on ${DAYS[d]}: ${today.join(" + ")}.` });
      }
      const prev = dayShifts[`${w.id}|${d - 1}`] || [];
      if (today.includes("morning") && (prev.includes("bridge") || prev.includes("deepnight"))) {
        warnings.push({ level: "crit", msg: `${w.name}: night shift on ${DAYS[d - 1]} then Morning on ${DAYS[d]} — no rest between them.` });
      }
      if (today.includes("deepnight") && prev.includes("evening")) {
        warnings.push({ level: "crit", msg: `${w.name}: Evening on ${DAYS[d - 1]} then Deep Night on ${DAYS[d]} — no rest between them.` });
      }
      if (today.includes("mid") && DAYS[d] === "Saturday" && (prev.includes("bridge") || prev.includes("deepnight"))) {
        warnings.push({ level: "crit", msg: `${w.name} worked a night shift Friday and is scheduled for Saturday Mid.` });
      }
    }
  }

  // Night caps
  for (const w of workers) {
    const nights = nightCounts[w.id] || 0;
    if (w.team === "israeli" && nights > 1) {
      warnings.push({ level: "crit", msg: `${w.name} (Israeli) has ${nights} night shifts this week — hard cap is 1.` });
    } else if (nights > 2) {
      warnings.push({ level: "crit", msg: `${w.name} has ${nights} night shifts this week — no one should exceed 2.` });
    }
  }
  const twoNightSerbians = workers.filter((w) => w.team !== "israeli" && (nightCounts[w.id] || 0) >= 2);
  if (twoNightSerbians.length > rules.maxSecondNightSerbians) {
    warnings.push({
      level: "warn",
      msg: `${twoNightSerbians.length} Serbians have a 2nd night this week (${twoNightSerbians.map((w) => w.name).join(", ")}) — rule allows ${rules.maxSecondNightSerbians}.`,
    });
  }

  // Leadership coverage
  for (let d = 0; d < 7; d++) {
    for (const s of SHIFTS) {
      if (!s.needsLead) continue;
      const ids = assignments[`${d}|${s.key}`] || [];
      if (ids.length === 0) continue; // empty-slot case is covered by the minimum-coverage check below
      const hasLead = ids.some((wid) => {
        const w = byId.get(wid);
        return !!w && (w.lead === "primary" || w.lead === "backup");
      });
      if (!hasLead) warnings.push({ level: "crit", msg: `${DAYS[d]} ${s.label} has no Enterprise Lead.` });
    }
  }

  // Minimum coverage
  for (let d = 0; d < 7; d++) {
    for (const s of SHIFTS) {
      if (s.weekendOnly && !WEEKEND.has(d)) continue;
      const min =
        s.key === "morning" ? rules.morningMin :
        s.key === "mid" ? rules.midMin :
        s.key === "evening" ? (WEEKEND.has(d) ? rules.eveningWeekendMin : rules.eveningWeekdayMin) :
        s.key === "bridge" ? rules.bridgeMin :
        rules.deepnightMin;
      const count = (assignments[`${d}|${s.key}`] || []).length;
      if (count < min) warnings.push({ level: "warn", msg: `${DAYS[d]} ${s.label}: ${count}/${min} minimum filled.` });
    }
  }

  if (!warnings.some((w) => w.level === "crit") && !warnings.some((w) => w.level === "warn")) {
    warnings.unshift({ level: "ok", msg: "No conflicts found." });
  }
  return warnings;
}
