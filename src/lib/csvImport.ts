import type { AvailStatus, ShiftKey } from "./scheduler";
import { DAYS } from "./scheduler";

/** Minimal RFC4180 CSV parser — handles quoted fields with embedded commas/newlines and
 * "" escaping, which the real export (Google Sheets, multi-line notes cells) relies on.
 * A naive split(",")/split("\n") would shred this file. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const TIME_TO_SHIFT: Record<string, ShiftKey> = {
  "8:00-16:00": "morning",
  "14:00-22:00": "mid",
  "16:00-0:00": "evening",
  "0:00-8:00": "deepnight",
};

function normalizeStatus(raw: string): AvailStatus | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "can") return "can";
  if (s === "can't" || s === "cant" || s === "can’t") return "cant";
  if (s === "prefer not") return "prefer_not";
  return null;
}

export interface CsvImportUpdate {
  workerId: string;
  day: string;
  shiftKey: ShiftKey;
  status: AvailStatus;
}

export interface CsvImportResult {
  updates: CsvImportUpdate[];
  matched: { blockName: string; workerName: string }[];
  unmatched: string[];
}

/** Parses a per-person weekly availability export (each person: a name row, a day-of-week
 * header row right after it, then 4 rows for Morning/Mid/Evening/Deep Night with Sun-Sat
 * statuses) out of a much larger, messier sheet dump — everything else on the sheet
 * (notes, unrelated tables, a roster list) is ignored. Bridge has no row in this export, so
 * every Bridge cell is set to whatever that person's Deep Night status is for the same day. */
export function parseAvailabilityCsv(csvText: string, workers: { id: string; name: string }[]): CsvImportResult {
  const rows = parseCsvRows(csvText);
  const cell = (r: string[] | undefined, i: number) => (r?.[i] ?? "").trim();

  const keyToWorker = new Map<string, { id: string; name: string }>();
  for (const w of workers) {
    keyToWorker.set(w.name.trim().toLowerCase(), w);
    keyToWorker.set(w.name.trim().split(/\s+/)[0].toLowerCase(), w);
  }

  const updates: CsvImportUpdate[] = [];
  const matched: { blockName: string; workerName: string }[] = [];
  const unmatched: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (cell(r, 2).toLowerCase() !== "sunday" || cell(r, 3).toLowerCase() !== "monday") continue;

    const blockName = cell(rows[i - 1], 2);
    if (!blockName) continue;
    const worker = keyToWorker.get(blockName.toLowerCase());

    // The 4 shift-time rows immediately follow the day header, always in this order.
    const shiftRows = rows.slice(i + 1, i + 5);
    const byDayAndShift: Partial<Record<ShiftKey, (AvailStatus | null)[]>> = {};
    for (const sr of shiftRows) {
      const timeKey = cell(sr, 1).replace(/\s/g, "");
      const shiftKey = TIME_TO_SHIFT[timeKey];
      if (!shiftKey) continue;
      byDayAndShift[shiftKey] = DAYS.map((_, d) => normalizeStatus(cell(sr, 2 + d)));
    }

    if (!worker) {
      unmatched.push(blockName);
      i += 4;
      continue;
    }
    matched.push({ blockName, workerName: worker.name });

    for (const [shiftKey, statuses] of Object.entries(byDayAndShift) as [ShiftKey, (AvailStatus | null)[]][]) {
      statuses.forEach((status, d) => {
        if (status) updates.push({ workerId: worker.id, day: DAYS[d], shiftKey, status });
      });
    }
    // Bridge has no row of its own in this export — mirror Deep Night per the admin's call.
    const deepNight = byDayAndShift.deepnight;
    if (deepNight) {
      deepNight.forEach((status, d) => {
        if (status) updates.push({ workerId: worker.id, day: DAYS[d], shiftKey: "bridge", status });
      });
    }

    i += 4;
  }

  return { updates, matched, unmatched };
}
