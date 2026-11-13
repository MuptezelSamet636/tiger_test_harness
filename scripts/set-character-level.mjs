// node scripts/set-character-level.mjs                 lists the characters
// node scripts/set-character-level.mjs <id> <level>    sets one's level
//   Sets a character's XP to the start of `level` (1..20, the level cap) on
//   the served build's level progression, read from the game packages like
//   the server does. Run from the repo root after `npm run build`, with the
//   server stopped (it keeps characters in memory and writes them back).
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";
import { tigerDatabaseUrlFor } from "./lib/tiger-database-url.mjs";

dotenv.config({ quiet: true });
const require = createRequire(import.meta.url);
const { levelCap, levelForXp, xpForLevel } = require(
  "../dist/investment/character-level.js"
);

const build = process.env.TIGER_GAME_BUILD?.trim();
if (!build) {
  console.error("TIGER_GAME_BUILD is not set (.env)");
  process.exit(1);
}
const url = tigerDatabaseUrlFor(process.cwd(), build.split(".")[0]);
const db = new DatabaseSync(url.slice("file:".length));
const CLASSES = ["Titan", "Hunter", "Warlock"];

function list() {
  const rows = db
    .prepare(
      "SELECT id, name, class_index, progression_xp FROM character WHERE deleted_at IS NULL ORDER BY id"
    )
    .all();
  for (const row of rows) {
    console.log(
      `${row.id}: ${row.name} (${CLASSES[row.class_index] ?? row.class_index}) ` +
        `level ${levelForXp(row.progression_xp)}, ${row.progression_xp} XP`
    );
  }
}

const [idArg, levelArg] = process.argv.slice(2);
if (idArg === undefined) {
  list();
  process.exit(0);
}
const id = Number(idArg);
const level = Number(levelArg);
const cap = levelCap();
if (!(Number.isInteger(id) && Number.isInteger(level) && level >= 1 && level <= cap)) {
  console.error(`usage: node scripts/set-character-level.mjs <id> <level 1..${cap}>`);
  process.exit(1);
}
const xp = xpForLevel(level);
const result = db
  .prepare(
    "UPDATE character SET progression_xp = ?, level = ? WHERE id = ? AND deleted_at IS NULL"
  )
  .run(xp, level, id);
if (result.changes !== 1) {
  console.error(`no character ${id}`);
  process.exit(1);
}
console.log(`character ${id} is now level ${level} (${xp} XP)`);
list();
