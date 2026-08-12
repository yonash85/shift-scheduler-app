import { getWorkers, updateWorker } from "../src/lib/data";

// current name -> new name. "Marko G" is already in the target format, left out.
const RENAMES: Record<string, string> = {
  Neta: "Neta Z",
  Michael: "Michael G",
  Yonatan: "Yonatan S",
  Gal: "Gal K",
  Yuval: "Yuval G",
  Sean: "Sean Z",
  Natan: "Natan G",
  Katarina: "Katarina F",
  Veljko: "Veljko R",
  Branislav: "Branislav C",
  Petar: "Petar S",
  Bojana: "Bojana V",
  Filip: "Filip S",
  "Stefan Cosic": "Stefan C",
  "Danilo Knezevic": "Danilo K",
  Isidora: "Isidora P",
  Jovana: "Jovana C",
  Miroslav: "Miroslav K",
  Nesta: "Nesta M",
};

async function main() {
  const workers = await getWorkers();
  let applied = 0;
  for (const w of workers) {
    const newName = RENAMES[w.name];
    if (!newName) {
      console.log(`SKIP (no mapping): ${w.name}`);
      continue;
    }
    await updateWorker(w.id, { name: newName });
    console.log(`${w.name} -> ${newName}`);
    applied++;
  }
  console.log(`\nApplied ${applied} renames.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
