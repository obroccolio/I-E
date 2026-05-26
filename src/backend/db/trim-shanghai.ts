import db from "./connection.ts";

const all = db.prepare("SELECT id FROM jobs WHERE location = '上海' ORDER BY RANDOM()").all() as any[];
const toKeep = all.slice(0, 100);
const keepIds = new Set(toKeep.map((r: any) => r.id));

const toDelete = all.filter((r: any) => !keepIds.has(r.id));
if (toDelete.length > 0) {
  const ids = toDelete.map((r: any) => r.id);
  db.prepare(`DELETE FROM jobs WHERE id IN (${ids.join(",")})`).run();
}

const sh = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE location = '上海'").get() as any;
const total = db.prepare("SELECT COUNT(*) as c FROM jobs").get() as any;

console.log(`Kept 100 random Shanghai jobs out of ${all.length}`);
console.log(`Total jobs now: ${total.c}`);
console.log(`Shanghai jobs: ${sh.c}`);

const byLoc = db.prepare("SELECT location, COUNT(*) as c FROM jobs GROUP BY location ORDER BY c DESC LIMIT 10").all() as any[];
console.log("\nTop locations:");
for (const r of byLoc) console.log(`  ${r.location}: ${r.c}`);
