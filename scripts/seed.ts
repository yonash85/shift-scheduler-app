// One-time seed: creates the 20-person roster with random 4-digit PINs and
// prints the plaintext list so the admin can hand them out. Run with:
//   npx tsx scripts/seed.ts
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY in the environment.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

type Team = "israeli" | "serbian";
type Lead = "primary" | "backup" | null;

interface Seed {
  name: string;
  team: Team;
  lead: Lead;
  quota: number;
  isAdmin?: boolean;
}

const roster: Seed[] = [
  { name: "Neta", team: "israeli", lead: "primary", quota: 5 },
  { name: "Michael", team: "israeli", lead: "primary", quota: 5 },
  { name: "Yonatan", team: "israeli", lead: "primary", quota: 5, isAdmin: true },
  { name: "Gal", team: "israeli", lead: "primary", quota: 5 },
  { name: "Yuval", team: "israeli", lead: null, quota: 5 },
  { name: "Sean", team: "israeli", lead: null, quota: 5 },
  { name: "Natan", team: "israeli", lead: null, quota: 5 },
  { name: "Katarina", team: "serbian", lead: "primary", quota: 5 },
  { name: "Veljko", team: "serbian", lead: "primary", quota: 5 },
  { name: "Branislav", team: "serbian", lead: "primary", quota: 5 },
  { name: "Marko G", team: "serbian", lead: "primary", quota: 6 },
  { name: "Petar", team: "serbian", lead: null, quota: 6 },
  { name: "Bojana", team: "serbian", lead: null, quota: 5 },
  { name: "Filip", team: "serbian", lead: null, quota: 6 },
  { name: "Stefan Cosic", team: "serbian", lead: null, quota: 5 },
  { name: "Danilo Knezevic", team: "serbian", lead: null, quota: 5 },
  { name: "Nesta", team: "serbian", lead: null, quota: 5 },
  { name: "Isidora", team: "serbian", lead: null, quota: 5 },
  { name: "Jovana", team: "serbian", lead: null, quota: 5 },
  { name: "Miroslav", team: "serbian", lead: null, quota: 5 },
];

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function main() {
  const { count } = await db.from("workers").select("*", { count: "exact", head: true });
  if (count && count > 0) {
    console.error(`workers table already has ${count} row(s) — refusing to double-seed. Delete existing rows first if you want to re-seed.`);
    process.exit(1);
  }

  const plaintext: { name: string; pin: string; admin: boolean }[] = [];
  for (const person of roster) {
    const pin = randomPin();
    const pin_hash = await bcrypt.hash(pin, 10);
    const { error } = await db.from("workers").insert({
      name: person.name,
      team: person.team,
      lead: person.lead,
      quota: person.quota,
      is_admin: !!person.isAdmin,
      pin_hash,
    });
    if (error) {
      console.error(`Failed inserting ${person.name}:`, error.message);
      process.exit(1);
    }
    plaintext.push({ name: person.name, pin, admin: !!person.isAdmin });
  }

  console.log(`\nSeeded ${plaintext.length} workers. PINs (distribute these, then this list is the only copy):\n`);
  plaintext.forEach((p) => console.log(`  ${p.name.padEnd(20)} ${p.pin}${p.admin ? "  (admin)" : ""}`));
  console.log("\nAdmin can reset anyone's PIN later from the People page.");
}

main();
